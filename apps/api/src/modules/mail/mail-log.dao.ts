import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { EmailLogStatus } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { emailLogs, type EmailLogRow, type NewEmailLog } from '../../db/schema';

export interface EmailLogQuery {
  status?: EmailLogStatus;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class MailLogDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  findByIdempotencyKey(key: string): Promise<EmailLogRow | undefined> {
    return this.db.query.emailLogs.findFirst({ where: eq(emailLogs.idempotencyKey, key) });
  }

  async insert(input: NewEmailLog): Promise<EmailLogRow> {
    const [row] = await this.db.insert(emailLogs).values(input).returning();
    return row!;
  }

  async updateStatus(
    id: string,
    patch: { status?: EmailLogStatus; providerMessageId?: string | null; sentAt?: Date | null; failedAt?: Date | null; failureCode?: string | null; failureMessage?: string | null; attemptCount?: number },
  ): Promise<void> {
    await this.db.update(emailLogs).set(patch).where(eq(emailLogs.id, id));
  }

  async markProcessing(id: string, attemptCount: number): Promise<void> {
    await this.db.update(emailLogs).set({ status: 'PROCESSING', attemptCount }).where(eq(emailLogs.id, id));
  }

  async list(query: EmailLogQuery): Promise<{ items: EmailLogRow[]; total: number }> {
    const conditions: SQL[] = [];
    if (query.status) {
      conditions.push(eq(emailLogs.status, query.status));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = query.pageSize ?? 50;
    const offset = ((query.page ?? 1) - 1) * limit;
    const items = await this.db.select().from(emailLogs).where(where).orderBy(desc(emailLogs.createdAt)).limit(limit).offset(offset);
    const [totalRow] = await this.db.select({ value: count() }).from(emailLogs).where(where);
    return { items, total: totalRow?.value ?? 0 };
  }

  async listFailed(limit = 50): Promise<EmailLogRow[]> {
    return this.db
      .select()
      .from(emailLogs)
      .where(eq(emailLogs.status, 'FAILED'))
      .orderBy(desc(emailLogs.failedAt))
      .limit(limit);
  }

  async findById(id: string): Promise<EmailLogRow | undefined> {
    return this.db.query.emailLogs.findFirst({ where: eq(emailLogs.id, id) });
  }

  async countSince(templateKey: string, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(emailLogs)
      .where(and(eq(emailLogs.templateKey, templateKey), sql`${emailLogs.createdAt} >= ${since}`));
    return row?.value ?? 0;
  }

  async countSentBetween(from: Date, to: Date): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(emailLogs)
      .where(and(eq(emailLogs.status, 'SENT'), sql`${emailLogs.sentAt} >= ${from}`, sql`${emailLogs.sentAt} < ${to}`));
    return row?.value ?? 0;
  }

  async failedCountSince(since: Date): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(emailLogs)
      .where(and(eq(emailLogs.status, 'FAILED'), sql`${emailLogs.failedAt} >= ${since}`));
    return row?.value ?? 0;
  }

  async lastByTemplate(templateKey: string): Promise<EmailLogRow | undefined> {
    return this.db.query.emailLogs.findFirst({
      where: eq(emailLogs.templateKey, templateKey),
      orderBy: desc(emailLogs.createdAt),
    });
  }

  async lastEvent(): Promise<EmailLogRow | undefined> {
    return this.db.query.emailLogs.findFirst({ orderBy: desc(emailLogs.createdAt) });
  }

  async countByStatusIn(ids: string[]): Promise<Map<EmailLogStatus, number>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ status: emailLogs.status, value: count() })
      .from(emailLogs)
      .where(inArray(emailLogs.id, ids))
      .groupBy(emailLogs.status);
    return new Map(rows.map((row) => [row.status, row.value]));
  }

  async findUnsentByIds(ids: string[]): Promise<EmailLogRow[]> {
    if (ids.length === 0) return [];
    return this.db.select().from(emailLogs).where(inArray(emailLogs.id, ids));
  }
}
