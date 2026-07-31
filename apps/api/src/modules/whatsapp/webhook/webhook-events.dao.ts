import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike, sql, type SQL } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import type { WebhookEventsQuery } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../../common/database/database.module';
import { webhookEvents, type NewWebhookEvent, type WebhookEventRow } from '../../../db/schema';

const UNIQUE_VIOLATION_CODE = '23505';

@Injectable()
export class WebhookEventsDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  /**
   * Inserts a webhook event. Returns undefined when an event with the same
   * deduplication key already exists (unique constraint violation).
   */
  async insertUnique(entry: NewWebhookEvent): Promise<WebhookEventRow | undefined> {
    try {
      const [row] = await this.db.insert(webhookEvents).values(entry).returning();
      return row;
    } catch (error) {
      if (error instanceof DatabaseError && error.code === UNIQUE_VIOLATION_CODE) {
        return undefined;
      }
      throw error;
    }
  }

  findByDedupKey(deduplicationKey: string): Promise<WebhookEventRow | undefined> {
    return this.db.query.webhookEvents.findFirst({
      where: eq(webhookEvents.deduplicationKey, deduplicationKey),
    });
  }

  findById(id: string): Promise<WebhookEventRow | undefined> {
    return this.db.query.webhookEvents.findFirst({ where: eq(webhookEvents.id, id) });
  }

  async markQueued(id: string): Promise<void> {
    await this.db
      .update(webhookEvents)
      .set({ processingStatus: 'QUEUED' })
      .where(eq(webhookEvents.id, id));
  }

  async markProcessing(id: string): Promise<void> {
    await this.db
      .update(webhookEvents)
      .set({ processingStatus: 'PROCESSING' })
      .where(eq(webhookEvents.id, id));
  }

  async markProcessed(id: string, eventType?: string): Promise<void> {
    await this.db
      .update(webhookEvents)
      .set({
        processingStatus: 'PROCESSED',
        processedAt: new Date(),
        eventType: eventType ?? webhookEvents.eventType,
      })
      .where(eq(webhookEvents.id, id));
  }

  async markIgnored(id: string, reason: string): Promise<void> {
    await this.db
      .update(webhookEvents)
      .set({ processingStatus: 'IGNORED', processedAt: new Date(), failureReason: reason })
      .where(eq(webhookEvents.id, id));
  }

  async markFailed(id: string, reason: string): Promise<void> {
    await this.db
      .update(webhookEvents)
      .set({ processingStatus: 'FAILED', failedAt: new Date(), failureReason: reason })
      .where(eq(webhookEvents.id, id));
  }

  async incrementAttempts(id: string): Promise<void> {
    await this.db
      .update(webhookEvents)
      .set({ processingAttempts: sql`${webhookEvents.processingAttempts} + 1` })
      .where(eq(webhookEvents.id, id));
  }

  async list(query: WebhookEventsQuery): Promise<{ items: WebhookEventRow[]; total: number }> {
    const { page, pageSize, eventType, status } = query;

    const conditions: SQL[] = [];
    if (eventType) {
      conditions.push(ilike(webhookEvents.eventType, `%${eventType}%`));
    }
    if (status) {
      conditions.push(eq(webhookEvents.processingStatus, status));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const items = await this.db
      .select()
      .from(webhookEvents)
      .where(where)
      .orderBy(desc(webhookEvents.receivedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [totalRow] = await this.db.select({ value: count() }).from(webhookEvents).where(where);

    return { items, total: totalRow?.value ?? 0 };
  }
}
