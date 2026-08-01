import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Worker } from 'bullmq';
import { AUDIT_ACTIONS, type CampaignPerformanceQuery, type ContactReportQuery, type ExportJobType } from '@wa/shared';

import { EXPORTS_QUEUE_NAME } from '../../common/queue/queue.module';
import { AuditService } from '../../common/audit/audit.module';
import type { ExportJobRow } from '../../db/schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { csvRow } from './csv';
import { ExportsDao } from './exports-dao';
import { ReportsDao } from './reports-dao';

interface ExportJobData {
  exportJobId: string;
}

@Injectable()
export class ExportsProcessor implements OnModuleDestroy {
  private readonly logger = new Logger(ExportsProcessor.name);
  private readonly worker: Worker;
  private readonly exportsDir: string;

  constructor(
    configService: ConfigService,
    private readonly exportsDao: ExportsDao,
    private readonly reportsDao: ReportsDao,
    private readonly auditLogsService: AuditLogsService,
    private readonly auditService: AuditService,
  ) {
    this.exportsDir = configService.get<string>('EXPORTS_DIR') ?? './exports';
    const connection = { url: configService.getOrThrow<string>('REDIS_URL') };
    this.worker = new Worker(
      EXPORTS_QUEUE_NAME,
      async (job) => {
        const data = job.data as ExportJobData;
        await this.process(data.exportJobId);
      },
      { connection, concurrency: 1 },
    );
    this.worker.on('failed', (job, error) =>
      this.logger.warn(`Export job ${job?.id ?? '?'} failed: ${error.message}`),
    );
    this.worker.on('error', (error) => this.logger.warn(`Exports worker error: ${error.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }

  private async process(exportJobId: string): Promise<void> {
    const exportJob = await this.exportsDao.findById(exportJobId);
    if (!exportJob) {
      return;
    }
    await this.exportsDao.markStarted(exportJob.id);
    try {
      const { fileName, totalRows } = await this.generate(exportJob);
      await this.exportsDao.markCompleted(exportJob.id, fileName, totalRows);
      this.logger.log(`Export ${exportJob.id} (${exportJob.type}) completed with ${totalRows} rows.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.exportsDao.markFailed(exportJob.id, message);
      this.logger.warn(`Export ${exportJob.id} (${exportJob.type}) failed: ${message}`);
      await this.auditService.record({
        action: AUDIT_ACTIONS.EXPORT_FAILED,
        entityType: 'export_job',
        entityId: exportJob.id,
        metadata: { type: exportJob.type, error: message },
      });
    }
  }

  private async generate(exportJob: ExportJobRow): Promise<{ fileName: string; totalRows: number }> {
    await mkdir(this.exportsDir, { recursive: true });
    const fileName = `${exportJob.type}-${exportJob.id}.csv`;
    const filePath = join(this.exportsDir, fileName);

    const stream = createWriteStream(filePath, { flags: 'w' });
    try {
      await this.writeHeaders(stream, exportJob.type);
      let totalRows = 0;
      for await (const row of this.rows(exportJob)) {
        await this.writeRow(stream, row);
        totalRows += 1;
      }
      await this.close(stream);
      return { fileName, totalRows };
    } catch (error) {
      await this.close(stream);
      throw error;
    }
  }

  private writeHeaders(stream: WriteStream, type: ExportJobType): Promise<void> {
    const headers = this.headers(type);
    return this.writeChunk(stream, csvRow(headers) + '\n');
  }

  private headers(type: ExportJobType): string[] {
    switch (type) {
      case 'contacts':
        return [
          'phone',
          'display_name',
          'first_name',
          'last_name',
          'email',
          'company',
          'language',
          'country',
          'status',
          'source',
          'opt_in_status',
          'suppressed',
          'messages_inbound',
          'messages_outbound',
          'campaign_deliveries',
          'last_inbound_at',
          'last_outbound_at',
          'created_at',
        ];
      case 'campaign-recipients':
        return [
          'phone',
          'status',
          'eligibility_reason',
          'failure_code',
          'failure_message',
          'attempt_count',
          'queued_at',
          'send_attempted_at',
          'sent_at',
          'delivered_at',
          'read_at',
          'replied_at',
          'failed_at',
          'opted_out_at',
          'created_at',
        ];
      case 'campaign-performance':
        return [
          'id',
          'name',
          'status',
          'audience_type',
          'created_at',
          'started_at',
          'completed_at',
          'total_recipients',
          'sent_recipients',
          'delivered_recipients',
          'read_recipients',
          'replied_recipients',
          'failed_recipients',
          'opted_out_recipients',
          'delivery_rate',
          'read_rate',
          'reply_rate',
          'failure_rate',
        ];
      case 'inbox-performance':
        return [
          'user_id',
          'name',
          'email',
          'conversations_assigned',
          'conversations_closed',
          'messages_sent',
          'messages_received',
          'notes_created',
          'avg_first_response_minutes',
          'avg_handle_minutes',
        ];
      case 'failure-analysis':
        return ['code', 'message', 'count', 'last_occurred_at'];
      case 'audit-log':
        return [
          'id',
          'created_at',
          'actor_user_id',
          'actor_name',
          'action',
          'entity_type',
          'entity_id',
          'ip_address',
          'user_agent',
        ];
    }
  }

  private async *rows(exportJob: ExportJobRow): AsyncGenerator<unknown[]> {
    const filters = (exportJob.filters ?? {}) as Record<string, unknown>;
    switch (exportJob.type) {
      case 'contacts':
        yield* this.contactRows(filters);
        return;
      case 'campaign-recipients':
        yield* this.recipientRows(filters);
        return;
      case 'campaign-performance':
        yield* this.campaignPerformanceRows(filters);
        return;
      case 'inbox-performance':
        yield* this.inboxPerformanceRows(filters);
        return;
      case 'failure-analysis':
        yield* this.failureAnalysisRows(filters);
        return;
      case 'audit-log':
        yield* this.auditRows(filters);
        return;
    }
  }

  private async *contactRows(filters: Record<string, unknown>): AsyncGenerator<unknown[]> {
    const query = {
      page: 1,
      pageSize: 100,
      from: typeof filters.from === 'string' ? filters.from : undefined,
      to: typeof filters.to === 'string' ? filters.to : undefined,
      search: typeof filters.search === 'string' ? filters.search : undefined,
      status: typeof filters.status === 'string' ? filters.status : undefined,
      country: typeof filters.country === 'string' ? filters.country : undefined,
      language: typeof filters.language === 'string' ? filters.language : undefined,
      source: typeof filters.source === 'string' ? filters.source : undefined,
      tagId: typeof filters.tagId === 'string' ? filters.tagId : undefined,
      listId: typeof filters.listId === 'string' ? filters.listId : undefined,
      optInStatus: typeof filters.optInStatus === 'string' ? filters.optInStatus : undefined,
      suppressed: typeof filters.suppressed === 'string' ? filters.suppressed : undefined,
    } as ContactReportQuery;

    const { items } = await this.reportsDao.contactReport(query, true);
    for (const row of items) {
      yield [
        row.phoneE164,
        row.displayName,
        row.firstName,
        row.lastName,
        row.email,
        row.company,
        row.language,
        row.phoneCountry,
        row.status,
        row.source,
        row.optInStatus,
        row.suppressed ? 'yes' : 'no',
        row.messagesInbound,
        row.messagesOutbound,
        row.campaignDeliveries,
        row.lastInboundMessageAt,
        row.lastOutboundMessageAt,
        row.createdAt,
      ];
    }
  }

  private async *recipientRows(filters: Record<string, unknown>): AsyncGenerator<unknown[]> {
    const campaignId = typeof filters.campaignId === 'string' ? filters.campaignId : null;
    if (!campaignId) {
      return;
    }
    const pageSize = 1000;
    let offset = 0;
    let page = await this.reportsDao.recipientsPage(campaignId, pageSize, offset);
    while (page.length > 0) {
      for (const row of page) {
        yield [
          row.phoneE164,
          row.status,
          row.eligibilityReason,
          row.failureCode,
          row.failureMessage,
          row.attemptCount,
          row.queuedAt,
          row.sendAttemptedAt,
          row.sentAt,
          row.deliveredAt,
          row.readAt,
          row.repliedAt,
          row.failedAt,
          row.optedOutAt,
          row.createdAt,
        ];
      }
      offset += page.length;
      page = await this.reportsDao.recipientsPage(campaignId, pageSize, offset);
    }
  }

  private async *campaignPerformanceRows(filters: Record<string, unknown>): AsyncGenerator<unknown[]> {
    const { items } = await this.reportsDao.campaignPerformance(
      {
        page: 1,
        pageSize: 100,
        from: typeof filters.from === 'string' ? filters.from : undefined,
        to: typeof filters.to === 'string' ? filters.to : undefined,
        search: typeof filters.search === 'string' ? filters.search : undefined,
        status: typeof filters.status === 'string' ? (filters.status as CampaignPerformanceQuery['status']) : undefined,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      },
      true,
    );
    for (const row of items) {
      yield [
        row.id,
        row.name,
        row.status,
        row.audienceType,
        row.createdAt,
        row.startedAt,
        row.completedAt,
        row.totalRecipients,
        row.sentRecipients,
        row.deliveredRecipients,
        row.readRecipients,
        row.repliedRecipients,
        row.failedRecipients,
        row.optedOutRecipients,
        row.deliveryRate,
        row.readRate,
        row.replyRate,
        row.failureRate,
      ];
    }
  }

  private async *inboxPerformanceRows(filters: Record<string, unknown>): AsyncGenerator<unknown[]> {
    const { items } = await this.reportsDao.inboxPerformance(
      {
        page: 1,
        pageSize: 100,
        from: typeof filters.from === 'string' ? filters.from : undefined,
        to: typeof filters.to === 'string' ? filters.to : undefined,
        sortBy: 'conversationsAssigned',
        sortOrder: 'desc',
      },
      true,
    );
    for (const row of items) {
      yield [
        row.userId,
        row.name,
        row.email,
        row.conversationsAssigned,
        row.conversationsClosed,
        row.messagesSent,
        row.messagesReceived,
        row.notesCreated,
        row.avgFirstResponseMinutes,
        row.avgHandleMinutes,
      ];
    }
  }

  private async *failureAnalysisRows(filters: Record<string, unknown>): AsyncGenerator<unknown[]> {
    const result = await this.reportsDao.failureAnalysis({
      from: typeof filters.from === 'string' ? filters.from : undefined,
      to: typeof filters.to === 'string' ? filters.to : undefined,
      code: typeof filters.code === 'string' ? filters.code : undefined,
      limit: 50,
    });
    for (const bucket of result.buckets) {
      yield [bucket.code, bucket.message, bucket.count, bucket.lastOccurredAt];
    }
  }

  private async *auditRows(filters: Record<string, unknown>): AsyncGenerator<unknown[]> {
    const rows = await this.auditLogsService.exportAll({
      page: 1,
      pageSize: 100,
      from: typeof filters.from === 'string' ? filters.from : undefined,
      to: typeof filters.to === 'string' ? filters.to : undefined,
      action: typeof filters.action === 'string' ? filters.action : undefined,
      search: typeof filters.search === 'string' ? filters.search : undefined,
    });
    for (const row of rows) {
      yield [
        row.id,
        row.createdAt,
        row.actorUserId,
        row.actorName,
        row.action,
        row.entityType,
        row.entityId,
        row.ipAddress,
        row.userAgent,
      ];
    }
  }

  private async writeRow(stream: WriteStream, row: unknown[]): Promise<void> {
    await this.writeChunk(stream, csvRow(row) + '\n');
  }

  private writeChunk(stream: WriteStream, chunk: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ok = stream.write(chunk, (error) => {
        if (error) {
          reject(error);
        }
      });
      if (ok) {
        resolve();
      } else {
        stream.once('drain', resolve);
      }
    });
  }

  private close(stream: WriteStream): Promise<void> {
    return new Promise((resolve, reject) => {
      if (stream.writableFinished) {
        resolve();
        return;
      }
      stream.end(() => resolve());
      stream.once('error', reject);
    });
  }
}
