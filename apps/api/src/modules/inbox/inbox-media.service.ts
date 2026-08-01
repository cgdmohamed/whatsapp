import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MediaFileDto } from '@wa/shared';
import { AUDIT_ACTIONS } from '@wa/shared';
import type { Readable } from 'node:stream';

import { ERROR_CODES } from '../../common/errors';
import { AuditService } from '../../common/audit/audit.module';
import { SettingsService } from '../settings/settings.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import type { AuthUser } from '../auth/auth.types';
import { MediaFilesDao } from './media-files.dao';
import { InboxMediaStorage } from './inbox.media.storage';
import { InboxRealtimeService } from './inbox.realtime.service';
import { InboxAccessService } from './inbox-access.service';
import { toMediaFileDto } from './inbox.mapper';
import { fileMatchesDeclaredMime, isSupportedMime, sha256Hex } from './inbox.media.types';

export interface IncomingUpload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface MediaDownloadResult {
  stream: Readable;
  contentType: string;
  filename: string;
  sizeBytes: number;
}

const SIGNED_URL_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class InboxMediaService {
  private readonly logger = new Logger(InboxMediaService.name);

  constructor(
    private readonly mediaFilesDao: MediaFilesDao,
    private readonly storage: InboxMediaStorage,
    private readonly whatsappService: WhatsAppService,
    private readonly realtime: InboxRealtimeService,
    private readonly settingsService: SettingsService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly accessService: InboxAccessService,
  ) {}

  async upload(actor: AuthUser, conversationId: string, file: IncomingUpload): Promise<MediaFileDto> {
    await this.accessService.getAccessibleConversation(conversationId, actor);
    const normalized = file.mimetype.split(';')[0]!.trim().toLowerCase();
    if (!isSupportedMime(normalized)) {
      throw new BadRequestException(ERROR_CODES.INBOX_MEDIA_TYPE_UNSUPPORTED);
    }
    const maxBytes = (await this.readMaxSizeMb()) * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException(ERROR_CODES.INBOX_MEDIA_TOO_LARGE);
    }
    if (!fileMatchesDeclaredMime(normalized, file.buffer)) {
      throw new BadRequestException(ERROR_CODES.INBOX_MEDIA_TYPE_UNSUPPORTED);
    }

    const storedFilename = `${randomUUID()}.${this.extensionFor(normalized)}`;
    this.storage.save(storedFilename, file.buffer);

    const row = await this.mediaFilesDao.insert({
      conversationId,
      messageId: null,
      direction: 'OUTBOUND',
      source: 'OUTBOUND_UPLOAD',
      originalFilename: file.originalname?.slice(0, 255) ?? null,
      storedFilename,
      contentType: normalized,
      sizeBytes: file.size,
      sha256: sha256Hex(file.buffer),
      status: 'STORED',
      uploadedByUserId: actor.id,
    } as never);

    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.INBOX_MEDIA_UPLOAD,
      entityType: 'media_file',
      entityId: row.id,
      metadata: { conversationId, contentType: normalized, sizeBytes: file.size },
    });

    return toMediaFileDto(row);
  }

  async processDownload(mediaFileId: string): Promise<MediaFileDto | null> {
    const mediaFile = await this.mediaFilesDao.findById(mediaFileId);
    if (!mediaFile || mediaFile.status !== 'PENDING' || !mediaFile.metaMediaId || !mediaFile.conversationId) {
      return null;
    }
    try {
      const media = await this.whatsappService.getMedia(mediaFile.metaMediaId);
      const downloaded = await this.whatsappService.downloadMedia(media.url);
      const maxBytes = (await this.readMaxSizeMb()) * 1024 * 1024;
      if (downloaded.size > maxBytes) {
        throw new Error('MEDIA_TOO_LARGE');
      }
      const declaredMime = mediaFile.contentType ?? downloaded.mimeType ?? null;
      if (declaredMime && !fileMatchesDeclaredMime(declaredMime, downloaded.data)) {
        throw new Error('MEDIA_TYPE_MISMATCH');
      }
      const storedFilename = `${randomUUID()}.${this.extensionFor(declaredMime ?? downloaded.mimeType ?? 'application/octet-stream')}`;
      this.storage.save(storedFilename, downloaded.data);

      const stored = await this.mediaFilesDao.markStored(
        mediaFile.id,
        storedFilename,
        declaredMime ?? downloaded.mimeType ?? 'application/octet-stream',
        downloaded.size,
        sha256Hex(downloaded.data),
      );
      const updated = stored ?? mediaFile;

      this.realtime.emitToConversation(
        {
          type: 'message',
          conversationId: mediaFile.conversationId,
          payload: { mediaFile: toMediaFileDto(updated) },
          at: new Date().toISOString(),
        },
        { assignedUserId: null },
      );
      return toMediaFileDto(updated);
    } catch (error) {
      this.logger.warn(`Media download failed for ${mediaFileId}: ${error instanceof Error ? error.message : String(error)}`);
      await this.mediaFilesDao.markFailed(mediaFileId, error instanceof Error ? error.message.slice(0, 500) : 'DOWNLOAD_FAILED');
      return toMediaFileDto((await this.mediaFilesDao.findById(mediaFileId)) ?? mediaFile);
    }
  }

  async getForStream(actor: AuthUser, mediaFileId: string): Promise<MediaDownloadResult> {
    const mediaFile = await this.mediaFilesDao.findById(mediaFileId);
    if (!mediaFile || !mediaFile.storedFilename) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    if (!this.storage.exists(mediaFile.storedFilename)) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    if (mediaFile.conversationId && !(await this.canAccessConversation(actor, mediaFile.conversationId))) {
      throw new ForbiddenException(ERROR_CODES.INBOX_ACCESS_DENIED);
    }
    return this.resultFor(mediaFile);
  }

  async getForSignedStream(mediaFileId: string, expires: number, token: string): Promise<MediaDownloadResult> {
    if (!this.verifySignedToken(mediaFileId, expires, token)) {
      throw new ForbiddenException(ERROR_CODES.INBOX_MEDIA_SIGNATURE_INVALID);
    }
    const mediaFile = await this.mediaFilesDao.findById(mediaFileId);
    if (!mediaFile || !mediaFile.storedFilename || !this.storage.exists(mediaFile.storedFilename)) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    return this.resultFor(mediaFile);
  }

  private resultFor(mediaFile: import('../../db/schema').MediaFileRow): MediaDownloadResult {
    return {
      stream: this.storage.stream(mediaFile.storedFilename!),
      contentType: mediaFile.contentType ?? 'application/octet-stream',
      filename: mediaFile.originalFilename ?? mediaFile.storedFilename!,
      sizeBytes: mediaFile.sizeBytes ?? 0,
    };
  }

  createSignedUrl(mediaFileId: string): { url: string; expiresAt: string } {
    const expires = Date.now() + SIGNED_URL_TTL_MS;
    const signature = this.sign(`${mediaFileId}.${expires}`);
    return {
      url: `/api/inbox/media/${mediaFileId}/stream?expires=${expires}&token=${signature}`,
      expiresAt: new Date(expires).toISOString(),
    };
  }

  verifySignedToken(mediaFileId: string, expires: number, token: string): boolean {
    if (!Number.isFinite(expires) || expires < Date.now()) {
      return false;
    }
    const expected = this.sign(`${mediaFileId}.${expires}`);
    const left = Buffer.from(expected);
    const right = Buffer.from(token);
    if (left.length !== right.length) {
      return false;
    }
    return timingSafeEqual(left, right);
  }

  private sign(payload: string): string {
    const secret = this.configService.get<string>('INBOX_MEDIA_SIGNING_SECRET') ?? this.configService.getOrThrow<string>('ACCESS_TOKEN_SECRET');
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  private async readMaxSizeMb(): Promise<number> {
    const settings = await this.settingsService.getAll();
    return Number.isFinite(settings.maxInboxMediaSizeMb) && settings.maxInboxMediaSizeMb > 0 ? settings.maxInboxMediaSizeMb : 16;
  }

  private extensionFor(mimeType: string): string {
    const normalized = mimeType.split(';')[0]!.trim().toLowerCase();
    if (normalized === 'application/octet-stream') {
      return 'bin';
    }
    const entry = ALLOWED_EXTENSIONS[normalized];
    return entry ?? 'bin';
  }

  private async canAccessConversation(actor: AuthUser, conversationId: string): Promise<boolean> {
    const conversation = await this.accessService.getAccessibleConversation(conversationId, actor);
    return Boolean(conversation);
  }
}

const ALLOWED_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/csv': 'csv',
};
