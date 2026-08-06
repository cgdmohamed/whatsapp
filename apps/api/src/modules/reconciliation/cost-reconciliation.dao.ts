import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, type SQL } from 'drizzle-orm';
import type { CostReconciliationJobDto, CostReconciliationQuery } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import {
  costReconciliationJobs,
  messageCosts,
  messages,
  type CostReconciliationJobRow,
  type MessageCostRow,
  type MessageRow,
  type NewCostReconciliationJob,
} from '../../db/schema';

export function toCostReconciliationJobDto(row: CostReconciliationJobRow): CostReconciliationJobDto {
  return {
    id: row.id,
    sourceType: row.sourceType,
    originalFilename: row.originalFilename ?? null,
    periodStart: row.periodStart ? row.periodStart.toISOString() : null,
    periodEnd: row.periodEnd ? row.periodEnd.toISOString() : null,
    currency: row.currency ?? null,
    status: row.status,
    totalRows: row.totalRows,
    matchedRows: row.matchedRows,
    unmatchedRows: row.unmatchedRows,
    adjustedRows: row.adjustedRows,
    createdByUserId: row.createdByUserId,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface CostReconciliationListResult {
  items: CostReconciliationJobDto[];
  total: number;
}

@Injectable()
export class CostReconciliationDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  async insert(values: NewCostReconciliationJob): Promise<CostReconciliationJobRow> {
    const [row] = await this.db.insert(costReconciliationJobs).values(values).returning();
    if (!row) {
      throw new Error('RECONCILIATION_JOB_CREATE_FAILED');
    }
    return row;
  }

  async findById(id: string): Promise<CostReconciliationJobRow | null> {
    const [row] = await this.db.select().from(costReconciliationJobs).where(eq(costReconciliationJobs.id, id));
    return row ?? null;
  }

  async update(id: string, values: Partial<NewCostReconciliationJob>): Promise<CostReconciliationJobRow | null> {
    const [row] = await this.db
      .update(costReconciliationJobs)
      .set(values)
      .where(eq(costReconciliationJobs.id, id))
      .returning();
    return row ?? null;
  }

  async list(query: CostReconciliationQuery): Promise<CostReconciliationListResult> {
    const conditions: SQL[] = [];
    if (query.status) {
      conditions.push(eq(costReconciliationJobs.status, query.status));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalRow] = await Promise.all([
      this.db
        .select()
        .from(costReconciliationJobs)
        .where(where)
        .orderBy(desc(costReconciliationJobs.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ value: count() }).from(costReconciliationJobs).where(where),
    ]);
    return { items: rows.map(toCostReconciliationJobDto), total: totalRow[0]?.value ?? 0 };
  }

  async findMessagesByMetaIds(metaMessageIds: string[]): Promise<Map<string, MessageRow>> {
    const map = new Map<string, MessageRow>();
    if (metaMessageIds.length === 0) {
      return map;
    }
    const rows = await this.db
      .select()
      .from(messages)
      .where(inArray(messages.metaMessageId, metaMessageIds));
    for (const row of rows) {
      if (row.metaMessageId) {
        map.set(row.metaMessageId, row);
      }
    }
    return map;
  }

  async findCostsByMessageIds(messageIds: string[]): Promise<Map<string, MessageCostRow>> {
    const map = new Map<string, MessageCostRow>();
    if (messageIds.length === 0) {
      return map;
    }
    const rows = await this.db
      .select()
      .from(messageCosts)
      .where(inArray(messageCosts.messageId, messageIds));
    for (const row of rows) {
      if (row.messageId) {
        map.set(row.messageId, row);
      }
    }
    return map;
  }
}
