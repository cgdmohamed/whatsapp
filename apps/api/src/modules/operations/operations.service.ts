import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, count, desc, inArray, isNull, sql } from 'drizzle-orm';
import Redis from 'ioredis';
import type {
  QueueOperationInput,
  QueueOperationResultDto,
  QueueStatusDto,
  SystemStatusDto,
  WebhookProcessingStatus,
} from '@wa/shared';

import { AuditService } from '../../common/audit/audit.module';
import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { QueueManager } from '../../common/queue/queue.module';
import {
  CAMPAIGN_METRICS_QUEUE_NAME,
  CAMPAIGN_RECIPIENT_BUILDER_QUEUE_NAME,
  CAMPAIGN_SCHEDULER_QUEUE_NAME,
  EXPORTS_QUEUE_NAME,
  IMPORTS_QUEUE_NAME,
  INBOX_MEDIA_QUEUE_NAME,
  INBOX_QUEUE_NAME,
  INBOX_SEND_QUEUE_NAME,
  TEMPLATE_SYNC_QUEUE_NAME,
  WHATSAPP_MESSAGE_SEND_QUEUE_NAME,
  WHATSAPP_STATUS_RECONCILIATION_QUEUE_NAME,
  WHATSAPP_WEBHOOK_QUEUE_NAME,
} from '../../common/queue/queue.module';
import { REDIS } from '../../common/redis/redis.module';
import { AUDIT_ACTIONS } from '@wa/shared';
import { conversations, webhookEvents, whatsappAccounts, whatsappPhoneNumbers } from '../../db/schema';
import type { AuthUser } from '../auth/auth.types';

const QUEUE_NAMES = [
  WHATSAPP_WEBHOOK_QUEUE_NAME,
  IMPORTS_QUEUE_NAME,
  TEMPLATE_SYNC_QUEUE_NAME,
  CAMPAIGN_SCHEDULER_QUEUE_NAME,
  CAMPAIGN_RECIPIENT_BUILDER_QUEUE_NAME,
  WHATSAPP_MESSAGE_SEND_QUEUE_NAME,
  CAMPAIGN_METRICS_QUEUE_NAME,
  WHATSAPP_STATUS_RECONCILIATION_QUEUE_NAME,
  INBOX_QUEUE_NAME,
  INBOX_SEND_QUEUE_NAME,
  INBOX_MEDIA_QUEUE_NAME,
  EXPORTS_QUEUE_NAME,
] as const;

const PENDING_WEBHOOK_STATUSES: WebhookProcessingStatus[] = ['RECEIVED', 'QUEUED', 'PROCESSING'];

@Injectable()
export class OperationsService {
  constructor(
    @Inject(DATABASE) private readonly db: DrizzleDB,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly queueManager: QueueManager,
    private readonly auditService: AuditService,
  ) {}

  async status(): Promise<SystemStatusDto> {
    const dbResult = await this.checkDatabase();
    const redisResult = await this.checkRedis();
    const [queues, webhookCounts, oldestPending, whatsapp, inbox] = await Promise.all([
      this.queueStatuses(),
      this.db
        .select({ status: webhookEvents.processingStatus, count: count() })
        .from(webhookEvents)
        .groupBy(webhookEvents.processingStatus),
      this.db
        .select({ oldest: sql<Date>`min(${webhookEvents.receivedAt})` })
        .from(webhookEvents)
        .where(inArray(webhookEvents.processingStatus, PENDING_WEBHOOK_STATUSES)),
      this.whatsappStatus(),
      this.inboxStatus(),
    ]);

    const webhookCountMap = new Map<string, number>();
    for (const row of webhookCounts) {
      webhookCountMap.set(row.status, row.count);
    }
    const oldestReceivedAt = oldestPending[0]?.oldest;
    const oldestPendingSeconds =
      oldestReceivedAt && !Number.isNaN(oldestReceivedAt.getTime())
        ? Math.max(0, (Date.now() - oldestReceivedAt.getTime()) / 1000)
        : null;

    return {
      generatedAt: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
      version: process.env.npm_package_version ?? '0.1.0',
      database: dbResult,
      redis: redisResult,
      queues,
      webhooks: {
        received: webhookCountMap.get('RECEIVED') ?? 0,
        queued: webhookCountMap.get('QUEUED') ?? 0,
        processing: webhookCountMap.get('PROCESSING') ?? 0,
        processed: webhookCountMap.get('PROCESSED') ?? 0,
        failed: webhookCountMap.get('FAILED') ?? 0,
        ignored: webhookCountMap.get('IGNORED') ?? 0,
        oldestPendingSeconds,
      },
      whatsapp,
      inbox,
    };
  }

  private async checkDatabase(): Promise<{ up: boolean; latencyMs: number | null }> {
    const started = Date.now();
    try {
      await this.db.execute(sql`select 1`);
      return { up: true, latencyMs: Date.now() - started };
    } catch {
      return { up: false, latencyMs: null };
    }
  }

  private async checkRedis(): Promise<{ up: boolean; latencyMs: number | null }> {
    const started = Date.now();
    try {
      await this.redis.ping();
      return { up: true, latencyMs: Date.now() - started };
    } catch {
      return { up: false, latencyMs: null };
    }
  }

  private async queueStatuses(): Promise<QueueStatusDto[]> {
    return Promise.all(
      QUEUE_NAMES.map(async (name): Promise<QueueStatusDto> => {
        const queue = this.queueManager.getQueueByName(name);
        if (!queue) {
          return { name, waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0, paused: false, workers: 0 };
        }
        const [counts, workers] = await Promise.all([queue.getJobCounts(), queue.getWorkers()]);
        return {
          name,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          delayed: counts.delayed ?? 0,
          failed: counts.failed ?? 0,
          completed: counts.completed ?? 0,
          paused: (counts.paused ?? 0) > 0,
          workers: workers.length,
        };
      }),
    );
  }

  private async whatsappStatus(): Promise<SystemStatusDto['whatsapp']> {
    const accounts = await this.db
      .select({
        status: whatsappAccounts.status,
        lastConnectionTestAt: whatsappAccounts.lastConnectionTestAt,
        lastConnectionError: whatsappAccounts.lastConnectionError,
        templatesLastSyncedAt: whatsappAccounts.templatesLastSyncedAt,
      })
      .from(whatsappAccounts)
      .orderBy(desc(whatsappAccounts.updatedAt))
      .limit(1);

    const phoneRows = await this.db.select({ value: count() }).from(whatsappPhoneNumbers);
    const account = accounts[0];
    return {
      accountStatus: account?.status ?? null,
      lastConnectionTestAt: account?.lastConnectionTestAt ? account.lastConnectionTestAt.toISOString() : null,
      lastConnectionError: account?.lastConnectionError ?? null,
      templatesLastSyncedAt: account?.templatesLastSyncedAt ? account.templatesLastSyncedAt.toISOString() : null,
      phoneNumbers: phoneRows[0]?.value ?? 0,
    };
  }

  private async inboxStatus(): Promise<SystemStatusDto['inbox']> {
    const [openRows, unreadRows, unassignedRows] = await Promise.all([
      this.db.select({ value: count() }).from(conversations).where(isNull(conversations.closedAt)),
      this.db
        .select({ value: count() })
        .from(conversations)
        .where(and(isNull(conversations.closedAt), sql`${conversations.unreadCount} > 0`)),
      this.db
        .select({ value: count() })
        .from(conversations)
        .where(and(isNull(conversations.closedAt), isNull(conversations.assignedUserId))),
    ]);
    return {
      openConversations: openRows[0]?.value ?? 0,
      unreadConversations: unreadRows[0]?.value ?? 0,
      unassignedConversations: unassignedRows[0]?.value ?? 0,
    };
  }

  async retryFailed(user: AuthUser, input: QueueOperationInput): Promise<QueueOperationResultDto> {
    const queue = this.queueManager.getQueueByName(input.queue);
    if (!queue) {
      throw new BadRequestException('QUEUE_NOT_FOUND');
    }
    const failedJobs = await queue.getFailed(0, 4999);
    const target = input.jobIds?.length ? failedJobs.filter((job) => input.jobIds!.includes(job.id ?? '')) : failedJobs;

    const errors: string[] = [];
    let retried = 0;
    for (const job of target) {
      try {
        await job.retry();
        retried += 1;
      } catch (error) {
        errors.push(`${job.id ?? '?'}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    await this.auditService.record({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.OPERATIONS_RETRY,
      entityType: 'queue',
      entityId: input.queue,
      metadata: { queue: input.queue, retried, failed: errors.length },
    });

    return { queue: input.queue, retried, errors };
  }

  async drainFailed(user: AuthUser, input: QueueOperationInput): Promise<QueueOperationResultDto> {
    const queue = this.queueManager.getQueueByName(input.queue);
    if (!queue) {
      throw new BadRequestException('QUEUE_NOT_FOUND');
    }
    const failedJobs = await queue.getFailed(0, 4999);
    const target = input.jobIds?.length ? failedJobs.filter((job) => input.jobIds!.includes(job.id ?? '')) : failedJobs;

    const errors: string[] = [];
    let removed = 0;
    for (const job of target) {
      try {
        await job.remove();
        removed += 1;
      } catch (error) {
        errors.push(`${job.id ?? '?'}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    await this.auditService.record({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.OPERATIONS_DRAIN,
      entityType: 'queue',
      entityId: input.queue,
      metadata: { queue: input.queue, removed, failed: errors.length },
    });

    return { queue: input.queue, removed, errors };
  }
}
