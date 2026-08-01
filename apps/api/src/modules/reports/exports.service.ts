import { BadRequestException, Inject, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Response } from 'express';
import { AUDIT_ACTIONS, type CreateExportInput, type ExportJobDto, type ExportQuery, type PaginatedExports } from '@wa/shared';

import { AuditService } from '../../common/audit/audit.module';
import { EXPORTS_QUEUE } from '../../common/queue/queue.module';
import type { AuthUser } from '../auth/auth.types';
import { ExportsDao, toExportJobDto } from './exports-dao';

const DOWNLOAD_URL_PREFIX = '/api/reports/exports';

@Injectable()
export class ExportsService {
  constructor(
    private readonly exportsDao: ExportsDao,
    private readonly auditService: AuditService,
    @Inject(EXPORTS_QUEUE) private readonly exportsQueue: Queue,
    private readonly configService: ConfigService,
  ) {}

  async create(user: AuthUser, input: CreateExportInput): Promise<ExportJobDto> {
    const filters = input.filters ?? null;
    if (input.type === 'campaign-recipients' && typeof filters?.campaignId !== 'string') {
      throw new BadRequestException('EXPORT_REQUIRES_CAMPAIGN');
    }

    const row = await this.exportsDao.insert({
      type: input.type,
      filters,
      status: 'PENDING',
      createdByUserId: user.id,
    });

    await this.exportsQueue.add(
      'export',
      { exportJobId: row.id },
      {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    );

    await this.auditService.record({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.EXPORT_CREATE,
      entityType: 'export_job',
      entityId: row.id,
      metadata: { type: input.type },
    });

    return toExportJobDto(row, null);
  }

  async list(user: AuthUser, query: ExportQuery): Promise<PaginatedExports> {
    const isAdmin = user.role === 'ADMIN';
    const { items, total } = await this.exportsDao.list(query, user.id, isAdmin);
    const totalPages = Math.ceil(total / query.pageSize);
    return {
      items: items.map((row) => toExportJobDto(row, row.status === 'COMPLETED' ? `${DOWNLOAD_URL_PREFIX}/${row.id}/download` : null)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages,
    };
  }

  async get(user: AuthUser, id: string): Promise<ExportJobDto> {
    const row = await this.exportsDao.findById(id);
    if (!row) {
      throw new NotFoundException('EXPORT_NOT_FOUND');
    }
    this.assertAccess(user, row.createdByUserId);
    return toExportJobDto(row, row.status === 'COMPLETED' ? `${DOWNLOAD_URL_PREFIX}/${row.id}/download` : null);
  }

  async download(user: AuthUser, id: string, res: Response): Promise<StreamableFile> {
    const row = await this.exportsDao.findById(id);
    if (!row) {
      throw new NotFoundException('EXPORT_NOT_FOUND');
    }
    this.assertAccess(user, row.createdByUserId);
    if (row.status !== 'COMPLETED' || !row.fileName) {
      throw new BadRequestException('EXPORT_NOT_READY');
    }

    const exportsDir = this.configService.get<string>('EXPORTS_DIR') ?? './exports';
    const filePath = join(exportsDir, row.fileName);
    if (!existsSync(filePath)) {
      throw new NotFoundException('EXPORT_FILE_MISSING');
    }

    await this.exportsDao.incrementDownload(id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${row.fileName}"`);
    return new StreamableFile(createReadStream(filePath));
  }

  private assertAccess(user: AuthUser, ownerId: string): void {
    if (user.role !== 'ADMIN' && user.id !== ownerId) {
      throw new NotFoundException('EXPORT_NOT_FOUND');
    }
  }
}
