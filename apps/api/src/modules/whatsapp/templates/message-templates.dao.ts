import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, or, type SQL } from 'drizzle-orm';
import type { MessageTemplateQuery, MessageTemplateDto, TemplateStatus } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../../common/database/database.module';
import { messageTemplates, whatsappAccounts, type MessageTemplateRow, type NewMessageTemplate } from '../../../db/schema';

export interface MessageTemplateListResult {
  items: MessageTemplateDto[];
  total: number;
}

export interface MessageTemplateUpsertResult {
  row: MessageTemplateRow;
  inserted: boolean;
  changed: boolean;
}

export interface BlockedTemplate {
  id: string;
  name: string;
  status: TemplateStatus;
}

export function toMessageTemplateDto(row: MessageTemplateRow): MessageTemplateDto {
  return {
    id: row.id,
    metaTemplateId: row.metaTemplateId,
    name: row.name,
    language: row.language,
    category: row.category,
    status: row.status,
    qualityScore: row.qualityScore ?? null,
    rejectionReason: row.rejectionReason ?? null,
    components: row.components,
    blockedAt: row.blockedAt ? row.blockedAt.toISOString() : null,
    metaUpdatedAt: row.metaUpdatedAt ? row.metaUpdatedAt.toISOString() : null,
    lastSyncedAt: row.lastSyncedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class MessageTemplatesDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  async list(
    accountId: string,
    query: MessageTemplateQuery,
    options: { approvedOnly?: boolean } = {},
  ): Promise<MessageTemplateListResult> {
    const conditions: SQL[] = [eq(messageTemplates.whatsappAccountId, accountId)];
    if (options.approvedOnly) {
      conditions.push(eq(messageTemplates.status, 'APPROVED'));
    }
    if (query.search) {
      const term = `%${query.search}%`;
      conditions.push(
        or(
          ilike(messageTemplates.name, term),
          ilike(messageTemplates.language, term),
          ilike(messageTemplates.rejectionReason, term),
        )!,
      );
    }
    if (query.category) {
      conditions.push(eq(messageTemplates.category, query.category));
    }
    if (query.status) {
      conditions.push(eq(messageTemplates.status, query.status));
    }
    if (query.language) {
      conditions.push(eq(messageTemplates.language, query.language));
    }

    const where = and(...conditions);
    const orderColumn =
      query.sortBy === 'name'
        ? messageTemplates.name
        : query.sortBy === 'status'
          ? messageTemplates.status
          : query.sortBy === 'category'
            ? messageTemplates.category
            : query.sortBy === 'lastSyncedAt'
              ? messageTemplates.lastSyncedAt
              : messageTemplates.updatedAt;
    const order = query.sortOrder === 'asc' ? asc(orderColumn) : desc(orderColumn);

    const rows = await this.db
      .select()
      .from(messageTemplates)
      .where(where)
      .orderBy(order)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const [totalRow] = await this.db.select({ value: count() }).from(messageTemplates).where(where);

    return { items: rows.map(toMessageTemplateDto), total: totalRow?.value ?? 0 };
  }

  findById(id: string): Promise<MessageTemplateRow | undefined> {
    return this.db.query.messageTemplates.findFirst({ where: eq(messageTemplates.id, id) });
  }

  findByName(name: string, language?: string): Promise<MessageTemplateRow | undefined> {
    return this.db.query.messageTemplates.findFirst({
      where: language
        ? and(eq(messageTemplates.name, name), eq(messageTemplates.language, language))
        : eq(messageTemplates.name, name),
    });
  }

  findByMetaTemplateId(accountId: string, metaTemplateId: string): Promise<MessageTemplateRow | undefined> {
    return this.db.query.messageTemplates.findFirst({
      where: and(
        eq(messageTemplates.whatsappAccountId, accountId),
        eq(messageTemplates.metaTemplateId, metaTemplateId),
      ),
    });
  }

  async findByMetaTemplateIds(accountId: string, metaTemplateIds: string[]): Promise<MessageTemplateRow[]> {
    if (metaTemplateIds.length === 0) {
      return [];
    }
    return this.db
      .select()
      .from(messageTemplates)
      .where(
        and(
          eq(messageTemplates.whatsappAccountId, accountId),
          inArray(messageTemplates.metaTemplateId, metaTemplateIds),
        ),
      );
  }

  async upsert(
    accountId: string,
    metaTemplateId: string,
    values: Omit<NewMessageTemplate, 'id' | 'whatsappAccountId' | 'metaTemplateId' | 'createdAt' | 'updatedAt'>,
  ): Promise<MessageTemplateUpsertResult> {
    const existing = await this.findByMetaTemplateId(accountId, metaTemplateId);
    if (existing) {
      const changed =
        existing.status !== values.status ||
        existing.category !== values.category ||
        existing.language !== values.language ||
        existing.name !== values.name ||
        existing.qualityScore !== values.qualityScore ||
        existing.rejectionReason !== values.rejectionReason ||
        existing.blockedAt?.getTime() !== values.blockedAt?.getTime();
      if (!changed) {
        await this.db
          .update(messageTemplates)
          .set({ lastSyncedAt: values.lastSyncedAt })
          .where(eq(messageTemplates.id, existing.id));
        return { row: { ...existing, lastSyncedAt: values.lastSyncedAt }, inserted: false, changed: false };
      }
      const updated = await this.db
        .update(messageTemplates)
        .set({ ...values, id: existing.id, whatsappAccountId: accountId, metaTemplateId })
        .where(eq(messageTemplates.id, existing.id))
        .returning();
      const row = updated[0]!;
      return { row, inserted: false, changed: true };
    }

    const inserted = await this.db
      .insert(messageTemplates)
      .values({ ...values, whatsappAccountId: accountId, metaTemplateId })
      .returning();
    const row = inserted[0]!;
    return { row, inserted: true, changed: true };
  }

  setBlockedAt(id: string, blockedAt: Date | null): Promise<void> {
    return this.db.update(messageTemplates).set({ blockedAt }).where(eq(messageTemplates.id, id)).then(() => undefined);
  }

  recordSync(accountId: string, syncedAt: Date): Promise<void> {
    return this.db
      .update(whatsappAccounts)
      .set({ templatesLastSyncedAt: syncedAt })
      .where(eq(whatsappAccounts.id, accountId))
      .then(() => undefined);
  }

  async syncSummary(accountId: string): Promise<{
    total: number;
    approvedCount: number;
    blockedCount: number;
    blockedTemplates: BlockedTemplate[];
  }> {
    const [totalRow] = await this.db
      .select({ value: count() })
      .from(messageTemplates)
      .where(eq(messageTemplates.whatsappAccountId, accountId));
    const total = totalRow?.value ?? 0;

    const [approvedRow] = await this.db
      .select({ value: count() })
      .from(messageTemplates)
      .where(and(eq(messageTemplates.whatsappAccountId, accountId), eq(messageTemplates.status, 'APPROVED')));
    const approvedCount = approvedRow?.value ?? 0;

    const blockedRows = await this.db
      .select({ id: messageTemplates.id, name: messageTemplates.name, status: messageTemplates.status })
      .from(messageTemplates)
      .where(
        and(
          eq(messageTemplates.whatsappAccountId, accountId),
          isNotNull(messageTemplates.blockedAt),
        ),
      )
      .orderBy(desc(messageTemplates.blockedAt));

    return {
      total,
      approvedCount,
      blockedCount: blockedRows.length,
      blockedTemplates: blockedRows,
    };
  }
}
