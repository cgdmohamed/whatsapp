import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, gt, ilike, inArray, isNotNull, isNull, lte, not, or, sql, type SQL } from 'drizzle-orm';
import type { ConversationQuery } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import {
  contacts,
  conversations,
  messages,
  users,
  type ContactRow,
  type ConversationRow,
  type NewConversation,
} from '../../db/schema';

const SORT_COLUMNS = {
  lastMessageAt: conversations.lastMessageAt,
  createdAt: conversations.createdAt,
  updatedAt: conversations.updatedAt,
  unreadCount: conversations.unreadCount,
} as const;

export interface ConversationAccessFilter {
  isAdmin: boolean;
  userId: string;
  canViewUnassigned: boolean;
}

export interface ConversationListRow {
  conversation: ConversationRow;
  contact: ContactRow;
  assigneeName: string | null;
  lastMessagePreview: string | null;
}

export interface ConversationListResult {
  items: ConversationListRow[];
  total: number;
}

function buildConditions(query: ConversationQuery, access: ConversationAccessFilter): SQL[] {
  const conditions: SQL[] = [];
  if (query.search) {
    const term = `%${query.search}%`;
    const search = or(
      ilike(contacts.displayName, term),
      ilike(contacts.firstName, term),
      ilike(contacts.lastName, term),
      ilike(contacts.phoneE164, term),
      ilike(contacts.email, term),
    );
    if (search) {
      conditions.push(search);
    }
  }
  if (query.status) {
    conditions.push(eq(conversations.status, query.status));
  }
  if (query.priority) {
    conditions.push(eq(conversations.priority, query.priority));
  }
  if (query.assignedUserId) {
    conditions.push(eq(conversations.assignedUserId, query.assignedUserId));
  }
  if (query.unassigned === 'yes') {
    conditions.push(isNull(conversations.assignedUserId));
  } else if (query.unassigned === 'no') {
    conditions.push(not(isNull(conversations.assignedUserId)));
  }
  if (query.unread === 'yes') {
    conditions.push(gt(conversations.unreadCount, 0));
  } else if (query.unread === 'no') {
    conditions.push(eq(conversations.unreadCount, 0));
  }
  if (query.dateFrom) {
    const from = new Date(query.dateFrom);
    if (!Number.isNaN(from.getTime())) {
      conditions.push(gte(conversations.lastMessageAt, from));
    }
  }
  if (query.dateTo) {
    const to = new Date(query.dateTo);
    if (!Number.isNaN(to.getTime())) {
      const end = new Date(to);
      end.setUTCHours(23, 59, 59, 999);
      conditions.push(lte(conversations.lastMessageAt, end));
    }
  }
  if (!access.isAdmin) {
    const assignedToMe = eq(conversations.assignedUserId, access.userId);
    if (access.canViewUnassigned) {
      conditions.push(or(assignedToMe, isNull(conversations.assignedUserId))!);
    } else {
      conditions.push(assignedToMe);
    }
  }
  return conditions;
}

@Injectable()
export class ConversationsDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  findById(id: string): Promise<ConversationRow | undefined> {
    return this.db.query.conversations.findFirst({ where: eq(conversations.id, id) });
  }

  async findForInbound(contactId: string): Promise<ConversationRow | undefined> {
    const rows = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.contactId, contactId))
      .orderBy(desc(conversations.lastMessageAt), desc(conversations.createdAt))
      .limit(1);
    return rows[0];
  }

  insert(values: NewConversation): Promise<ConversationRow> {
    return this.db.insert(conversations).values(values).returning().then((rows) => rows[0]!);
  }

  async update(id: string, patch: Partial<ConversationRow>): Promise<ConversationRow | undefined> {
    const rows = await this.db.update(conversations).set(patch).where(eq(conversations.id, id)).returning();
    return rows[0];
  }

  async list(query: ConversationQuery, access: ConversationAccessFilter): Promise<ConversationListResult> {
    const conditions = buildConditions(query, access);
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const orderColumn = SORT_COLUMNS[query.sortBy] ?? conversations.lastMessageAt;
    const orderFn = query.sortOrder === 'asc' ? asc : desc;

    const rows = await this.db
      .select({
        conversation: conversations,
        contact: contacts,
        assigneeName: users.name,
        lastMessagePreview: messages.textContent,
      })
      .from(conversations)
      .innerJoin(contacts, eq(conversations.contactId, contacts.id))
      .leftJoin(users, eq(conversations.assignedUserId, users.id))
      .leftJoin(messages, eq(conversations.lastMessageId, messages.id))
      .where(where)
      .orderBy(orderFn(orderColumn))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const totalRows = await this.db.select({ value: count() }).from(conversations).where(where);

    return {
      items: rows.map((row) => ({
        conversation: row.conversation,
        contact: row.contact,
        assigneeName: row.assigneeName ?? null,
        lastMessagePreview: row.lastMessagePreview ?? null,
      })),
      total: totalRows[0]?.value ?? 0,
    };
  }

  async setUnread(id: string, unreadCount: number): Promise<void> {
    await this.db.update(conversations).set({ unreadCount }).where(eq(conversations.id, id));
  }

  async resetUnread(id: string): Promise<void> {
    await this.db.update(conversations).set({ unreadCount: 0 }).where(eq(conversations.id, id));
  }

  async incrementUnread(id: string): Promise<void> {
    await this.db
      .update(conversations)
      .set({ unreadCount: sql`${conversations.unreadCount} + 1` as never })
      .where(eq(conversations.id, id));
  }

  async assign(id: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .update(conversations)
      .set({ assignedUserId: userId, assignedAt: new Date() })
      .where(and(eq(conversations.id, id), isNull(conversations.assignedUserId)))
      .returning({ id: conversations.id });
    return rows.length > 0;
  }

  async reassign(id: string, fromUserId: string, toUserId: string): Promise<boolean> {
    const rows = await this.db
      .update(conversations)
      .set({ assignedUserId: toUserId, assignedAt: new Date() })
      .where(and(eq(conversations.id, id), eq(conversations.assignedUserId, fromUserId)))
      .returning({ id: conversations.id });
    return rows.length > 0;
  }

  async unassign(id: string): Promise<boolean> {
    const rows = await this.db
      .update(conversations)
      .set({ assignedUserId: null, assignedAt: null })
      .where(eq(conversations.id, id))
      .returning({ id: conversations.id });
    return rows.length > 0;
  }

  async recentCampaigns(contactId: string, limit = 5): Promise<
    Array<{ campaignId: string; campaignName: string; status: string; sentAt: Date | null }>
  > {
    const rows = await this.db
      .select({
        campaignId: messages.campaignId,
        campaignName: messages.templateName,
        status: messages.status,
        sentAt: messages.sentAt,
      })
      .from(messages)
      .where(and(eq(messages.contactId, contactId), eq(messages.direction, 'OUTBOUND'), isNotNull(messages.campaignId)))
      .orderBy(desc(messages.createdAt))
      .limit(limit);
    return rows.map((row) => ({
      campaignId: row.campaignId as string,
      campaignName: row.campaignName ?? 'Campaign',
      status: row.status,
      sentAt: row.sentAt,
    }));
  }

  async listByIds(ids: string[]): Promise<ConversationRow[]> {
    if (ids.length === 0) {
      return [];
    }
    return this.db.select().from(conversations).where(inArray(conversations.id, ids));
  }
}
