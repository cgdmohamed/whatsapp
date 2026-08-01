import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import type { ReplyInput } from '@wa/shared';
import { AUDIT_ACTIONS } from '@wa/shared';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { ERROR_CODES } from '../../common/errors';
import { INBOX_SEND_QUEUE } from '../../common/queue/queue.module';
import { AuditService } from '../../common/audit/audit.module';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { MessageTemplatesDao } from '../whatsapp/templates/message-templates.dao';
import { ContactsDao } from '../contacts/contacts.dao';
import { MetaApiError } from '../whatsapp/meta-api/meta-api.errors';
import type { AuthUser } from '../auth/auth.types';
import type { ConversationRow, MediaFileRow, MessageRow } from '../../db/schema';
import { ConversationsDao } from './conversations.dao';
import { MessagesDao } from './messages.dao';
import { MediaFilesDao } from './media-files.dao';
import { InboxMediaStorage } from './inbox.media.storage';
import { InboxRealtimeService } from './inbox.realtime.service';
import { InboxAccessService } from './inbox-access.service';
import { toConversationSummary, toMessageDto } from './inbox.mapper';
import { assertConversationFound } from './inbox.permissions';

export interface InboxSendJobData {
  messageId: string;
}

@Injectable()
export class InboxSendService {
  private readonly logger = new Logger(InboxSendService.name);

  constructor(
    @Inject(INBOX_SEND_QUEUE) private readonly sendQueue: Queue,
    private readonly conversationsDao: ConversationsDao,
    private readonly messagesDao: MessagesDao,
    private readonly mediaFilesDao: MediaFilesDao,
    private readonly mediaStorage: InboxMediaStorage,
    private readonly contactsDao: ContactsDao,
    private readonly templatesDao: MessageTemplatesDao,
    private readonly whatsappService: WhatsAppService,
    private readonly realtime: InboxRealtimeService,
    private readonly accessService: InboxAccessService,
    private readonly auditService: AuditService,
  ) {}

  async sendReply(actor: AuthUser, conversationId: string, input: ReplyInput): Promise<MessageRow> {
    const conversation = assertConversationFound(await this.conversationsDao.findById(conversationId));
    await this.accessService.assertSendPermission(conversation, actor);

    if (conversation.status === 'CLOSED') {
      throw new ForbiddenException(ERROR_CODES.INBOX_CONVERSATION_CLOSED);
    }
    if (input.type !== 'TEMPLATE') {
      this.assertServiceWindowOpen(conversation);
    }
    await this.assertContactSendable(conversation.contactId);

    let message: MessageRow;
    if (input.type === 'TEMPLATE') {
      const template = await this.templatesDao.findById(input.templateId);
      if (!template || template.status !== 'APPROVED' || template.blockedAt) {
        throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
      }
      message = await this.messagesDao.insert({
        contactId: conversation.contactId,
        conversationId: conversation.id,
        campaignId: null,
        campaignRecipientId: null,
        whatsappPhoneNumberId: conversation.whatsappPhoneNumberId,
        direction: 'OUTBOUND',
        type: 'template',
        status: 'PENDING',
        templateName: template.name,
        templateLanguage: input.language ?? template.language,
        templateParameters: input.parameters ?? null,
        sentByUserId: actor.id,
        isTest: false,
      } as never);
    } else {
      let mediaFile: MediaFileRow | null = null;
      let textContent: string | null = null;
      if (input.type === 'IMAGE') {
        mediaFile = await this.requireOutboundMedia(conversation.id, input.mediaFileId);
        textContent = input.caption ?? null;
      } else if (input.type === 'DOCUMENT') {
        mediaFile = await this.requireOutboundMedia(conversation.id, input.mediaFileId);
        textContent = input.caption ?? null;
      } else {
        textContent = input.textContent;
      }
      message = await this.messagesDao.insert({
        contactId: conversation.contactId,
        conversationId: conversation.id,
        campaignId: null,
        campaignRecipientId: null,
        whatsappPhoneNumberId: conversation.whatsappPhoneNumberId,
        direction: 'OUTBOUND',
        type: input.type === 'IMAGE' ? 'image' : input.type === 'DOCUMENT' ? 'document' : 'text',
        status: 'PENDING',
        textContent,
        sentByUserId: actor.id,
        isTest: false,
      } as never);
      if (mediaFile) {
        await this.mediaFilesDao.update(mediaFile.id, { messageId: message.id });
      }
    }

    await this.sendQueue.add(
      'send',
      { messageId: message.id },
      {
        jobId: `inbox-send-${message.id}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 2000 },
      },
    );

    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.INBOX_MESSAGE_SEND,
      entityType: 'message',
      entityId: message.id,
      metadata: { conversationId, type: message.type, inputType: input.type },
    });

    return message;
  }

  async retryFailed(actor: AuthUser, messageId: string): Promise<MessageRow> {
    const message = await this.messagesDao.findById(messageId);
    if (!message || !message.conversationId) {
      throw new NotFoundException(ERROR_CODES.INBOX_NOT_FOUND);
    }
    const conversation = assertConversationFound(await this.conversationsDao.findById(message.conversationId));
    await this.accessService.assertSendPermission(conversation, actor);
    if (message.direction !== 'OUTBOUND' || message.status !== 'FAILED') {
      throw new BadRequestException(ERROR_CODES.INBOX_MESSAGE_NOT_RETRYABLE);
    }
    await this.assertContactSendable(conversation.contactId);

    const updated = await this.messagesDao.update(message.id, {
      status: 'PENDING',
      errorCode: null,
      errorMessage: null,
      failedAt: null,
    });
    await this.sendQueue.add(
      'send',
      { messageId: message.id },
      {
        jobId: `inbox-send-${message.id}-retry-${Date.now()}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 2000 },
      },
    );
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.INBOX_MESSAGE_RETRY,
      entityType: 'message',
      entityId: message.id,
      metadata: { conversationId: conversation.id },
    });
    return updated ?? message;
  }

  async processSendJob(job: Job<InboxSendJobData>): Promise<void> {
    const { messageId } = job.data;
    const message = await this.messagesDao.findById(messageId);
    if (!message || message.status !== 'PENDING') {
      return; // idempotent skip
    }
    const conversation = message.conversationId ? await this.conversationsDao.findById(message.conversationId) : undefined;
    const metaPhoneNumberId = conversation?.whatsappPhoneNumberId ?? message.whatsappPhoneNumberId ?? '';
    const contact = message.contactId ? await this.contactsDao.findById(message.contactId) : undefined;
    if (!contact) {
      return;
    }

    const client = await this.whatsappService.buildClient();
    try {
      if (message.type === 'template') {
        if (!message.templateName) {
          throw new Error('TEMPLATE_NAME_MISSING');
        }
        const response = await client.sendTemplateMessage({
          to: contact.phoneE164,
          templateName: message.templateName,
          languageCode: message.templateLanguage ?? 'ar',
          components: this.buildTemplateComponents(message),
          phoneNumberId: metaPhoneNumberId,
        });
        await this.onSent(message, conversation, response.messages[0]?.id ?? null);
        return;
      }

      if (message.type === 'image' || message.type === 'document') {
        const mediaFile = message.id ? await this.mediaFilesDao.findByMessageId(message.id) : undefined;
        if (!mediaFile || mediaFile.status !== 'STORED' || !mediaFile.storedFilename) {
          await this.markFailed(message, 'MEDIA_NOT_READY', 'Attached media is not ready to send');
          return;
        }
        const bytes = this.mediaStorage.read(mediaFile.storedFilename);
        const uploaded = await client.uploadMedia({
          phoneNumberId: metaPhoneNumberId,
          file: bytes,
          mimeType: mediaFile.contentType ?? 'application/octet-stream',
          filename: mediaFile.originalFilename ?? `file-${mediaFile.id}`,
        });
        const response =
          message.type === 'image'
            ? await client.sendImageMessage({
                to: contact.phoneE164,
                mediaId: uploaded.id,
                caption: message.textContent ?? undefined,
                phoneNumberId: metaPhoneNumberId,
              })
            : await client.sendDocumentMessage({
                to: contact.phoneE164,
                mediaId: uploaded.id,
                caption: message.textContent ?? undefined,
                filename: mediaFile.originalFilename ?? undefined,
                phoneNumberId: metaPhoneNumberId,
              });
        await this.mediaFilesDao.markSent(mediaFile.id);
        await this.onSent(message, conversation, response.messages[0]?.id ?? null);
        return;
      }

      const response = await client.sendTextMessage({
        to: contact.phoneE164,
        body: message.textContent ?? '',
        phoneNumberId: metaPhoneNumberId,
      });
      await this.onSent(message, conversation, response.messages[0]?.id ?? null);
    } catch (error) {
      if (error instanceof MetaApiError) {
        if (error.normalized.is_transient && job.attemptsMade < (job.opts.attempts ?? 1) - 1) {
          throw error; // let BullMQ retry; message stays PENDING
        }
        await this.markFailed(message, String(error.normalized.error_code ?? 'UNKNOWN'), [
          error.normalized.title,
          error.normalized.message,
        ].filter(Boolean).join(': '));
        return;
      }
      if (job.attemptsMade < (job.opts.attempts ?? 1) - 1) {
        throw error;
      }
      await this.markFailed(message, 'SEND_FAILED', error instanceof Error ? error.message : String(error));
    }
  }

  private buildTemplateComponents(message: MessageRow): Record<string, unknown>[] {
    const parameters = (message.templateParameters as string[] | null) ?? [];
    if (parameters.length === 0) {
      return [];
    }
    return [
      {
        type: 'body',
        parameters: parameters.map((value) => ({ type: 'text', text: value })),
      },
    ];
  }

  private async onSent(message: MessageRow, conversation: ConversationRow | undefined, metaMessageId: string | null): Promise<void> {
    const now = new Date();
    await this.messagesDao.update(message.id, {
      status: 'SENT',
      metaMessageId,
      sentAt: now,
      errorCode: null,
      errorMessage: null,
    });
    if (conversation) {
      await this.conversationsDao.update(conversation.id, {
        lastMessageId: message.id,
        lastMessageAt: now,
        lastOutboundMessageAt: now,
      });
    }
    const updated = (await this.messagesDao.findById(message.id)) ?? message;
    this.realtime.emitToConversation(
      {
        type: 'message',
        conversationId: message.conversationId ?? '',
        payload: { message: toMessageDto(updated), mediaFile: null },
        at: now.toISOString(),
      },
      { assignedUserId: conversation?.assignedUserId ?? null },
    );
    if (conversation) {
      const contact = message.contactId ? await this.contactsDao.findById(message.contactId) : undefined;
      if (contact) {
        this.realtime.emitToConversation(
          {
            type: 'conversation',
            conversationId: conversation.id,
            payload: {
              conversation: toConversationSummary(conversation, {
                id: contact.id,
                phoneE164: contact.phoneE164,
                firstName: contact.firstName,
                lastName: contact.lastName,
                displayName: contact.displayName,
                language: contact.language,
                status: contact.status,
                suppressed: false,
                optInStatus: 'UNKNOWN',
              }, null, null),
            },
            at: now.toISOString(),
          },
          { assignedUserId: conversation.assignedUserId },
        );
      }
    }
  }

  private async markFailed(message: MessageRow, errorCode: string, errorMessage: string): Promise<void> {
    await this.messagesDao.update(message.id, { status: 'FAILED', errorCode, errorMessage, failedAt: new Date() });
    const updated = (await this.messagesDao.findById(message.id)) ?? message;
    const conversation = message.conversationId ? await this.conversationsDao.findById(message.conversationId) : undefined;
    this.realtime.emitToConversation(
      {
        type: 'status',
        conversationId: message.conversationId ?? '',
        payload: { message: toMessageDto(updated) },
        at: new Date().toISOString(),
      },
      { assignedUserId: conversation?.assignedUserId ?? null },
    );
    this.logger.warn(`Inbox send failed for message ${message.id}: ${errorCode} ${errorMessage}`);
  }

  private async requireOutboundMedia(conversationId: string, mediaFileId: string): Promise<MediaFileRow> {
    const mediaFile = await this.mediaFilesDao.findById(mediaFileId);
    if (!mediaFile || mediaFile.conversationId !== conversationId || mediaFile.direction !== 'OUTBOUND' || mediaFile.status !== 'STORED') {
      throw new BadRequestException(ERROR_CODES.INBOX_MEDIA_NOT_READY);
    }
    return mediaFile;
  }

  private async assertContactSendable(contactId: string): Promise<void> {
    const [suppressed, consent] = await Promise.all([
      this.contactsDao.hasActiveSuppression(contactId),
      this.contactsDao.latestConsent(contactId),
    ]);
    if (suppressed || consent?.status === 'OPTED_OUT') {
      throw new ForbiddenException(ERROR_CODES.INBOX_CONTACT_SUPPRESSED);
    }
  }

  private assertServiceWindowOpen(conversation: ConversationRow): void {
    if (!conversation.serviceWindowExpiresAt || Date.now() > conversation.serviceWindowExpiresAt.getTime()) {
      throw new ForbiddenException(ERROR_CODES.INBOX_SERVICE_WINDOW_CLOSED);
    }
  }
}
