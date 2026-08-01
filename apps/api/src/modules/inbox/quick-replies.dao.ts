import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike, isNull, or, type SQL } from 'drizzle-orm';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { quickReplies, type NewQuickReply, type QuickReplyRow } from '../../db/schema';
import type { QuickReplyQuery } from '@wa/shared';

export interface QuickReplyListResult {
  items: QuickReplyRow[];
  total: number;
}

function buildConditions(query: QuickReplyQuery, userId: string): SQL[] {
  const conditions: SQL[] = [];
  if (query.visibility === 'PERSONAL') {
    conditions.push(and(eq(quickReplies.visibility, 'PERSONAL'), eq(quickReplies.createdByUserId, userId))!);
  } else if (query.visibility === 'TEAM') {
    conditions.push(eq(quickReplies.visibility, 'TEAM'));
  } else {
    conditions.push(or(eq(quickReplies.visibility, 'TEAM'), and(eq(quickReplies.visibility, 'PERSONAL'), eq(quickReplies.createdByUserId, userId)))!);
  }
  if (query.language) {
    conditions.push(eq(quickReplies.language, query.language));
  }
  if (query.category) {
    conditions.push(ilike(quickReplies.category, `%${query.category}%`));
  }
  if (query.search) {
    const term = `%${query.search}%`;
    conditions.push(or(ilike(quickReplies.title, term), ilike(quickReplies.content, term))!);
  }
  if (query.includeArchived !== 'yes') {
    conditions.push(isNull(quickReplies.archivedAt));
  }
  return conditions;
}

@Injectable()
export class QuickRepliesDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  insert(values: NewQuickReply): Promise<QuickReplyRow> {
    return this.db.insert(quickReplies).values(values).returning().then((rows) => rows[0]!);
  }

  findById(id: string): Promise<QuickReplyRow | undefined> {
    return this.db.query.quickReplies.findFirst({ where: eq(quickReplies.id, id) });
  }

  async update(id: string, patch: Partial<QuickReplyRow>): Promise<QuickReplyRow | undefined> {
    const rows = await this.db.update(quickReplies).set(patch).where(eq(quickReplies.id, id)).returning();
    return rows[0];
  }

  async archive(id: string): Promise<QuickReplyRow | undefined> {
    const rows = await this.db
      .update(quickReplies)
      .set({ archivedAt: new Date() })
      .where(and(eq(quickReplies.id, id), isNull(quickReplies.archivedAt)))
      .returning();
    return rows[0];
  }

  async list(query: QuickReplyQuery, userId: string): Promise<QuickReplyListResult> {
    const conditions = buildConditions(query, userId);
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await this.db
      .select()
      .from(quickReplies)
      .where(where)
      .orderBy(desc(quickReplies.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const totalRows = await this.db.select({ value: count() }).from(quickReplies).where(where);
    return { items: rows, total: totalRows[0]?.value ?? 0 };
  }
}
