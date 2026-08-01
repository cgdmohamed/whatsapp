import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type {
  CampaignPerformanceQuery,
  CampaignPerformanceRow,
  ContactBreakdownDto,
  ContactReportQuery,
  ContactReportRow,
  DashboardQuery,
  DashboardSummaryDto,
  DashboardTrendsDto,
  FailureAnalysisDto,
  FailureAnalysisQuery,
  InboxPerformanceQuery,
  InboxPerformanceRow,
  OptInStatus,
  TrendGranularity,
  TrendPoint,
} from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import {
  campaignRecipients,
  campaigns,
  contactListMembers,
  contactTags,
  contacts,
  conversationAssignments,
  conversations,
  internalNotes,
  messages,
  optInRecords,
  suppressionEntries,
  users,
  type ContactRow,
} from '../../db/schema';

export interface DateRange {
  from?: Date;
  to?: Date;
}

export function resolveRange(from?: string, to?: string): DateRange {
  const range: DateRange = {};
  if (from) {
    const parsed = new Date(from);
    if (!Number.isNaN(parsed.getTime())) {
      range.from = parsed;
    }
  }
  if (to) {
    const parsed = new Date(to);
    if (!Number.isNaN(parsed.getTime())) {
      parsed.setUTCHours(23, 59, 59, 999);
      range.to = parsed;
    }
  }
  return range;
}

export function defaultRange(range: DateRange): Required<DateRange> {
  const now = new Date();
  const from = range.from ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const to = range.to ?? now;
  return { from, to };
}

function rangeConditions(column: AnyPgColumn, range: DateRange): SQL[] {
  const conditions: SQL[] = [];
  if (range.from) {
    conditions.push(gte(column, range.from));
  }
  if (range.to) {
    conditions.push(lte(column, range.to));
  }
  return conditions;
}

function isNotNullSql(column: AnyPgColumn): SQL {
  return sql`${column} is not null`;
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Math.min(1, numerator / denominator);
}

function bucketKey(date: Date, granularity: TrendGranularity): string {
  if (granularity === 'month') {
    return date.toISOString().slice(0, 7);
  }
  if (granularity === 'week') {
    const mondayOffset = (date.getUTCDay() + 6) % 7;
    const monday = new Date(date);
    monday.setUTCDate(monday.getUTCDate() - mondayOffset);
    return monday.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function bucketRange(granularity: TrendGranularity, range: Required<DateRange>): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const cursor = new Date(range.from);
  const end = new Date(range.to);
  while (cursor.getTime() <= end.getTime()) {
    const key = bucketKey(cursor, granularity);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

function toCountMap(rows: Array<{ bucket: Date; count: number }>): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.bucket.toISOString().slice(0, 10), row.count);
  }
  return map;
}

export interface CampaignAggregates {
  campaignId: string;
  total: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  optedOut: number;
}

export interface CampaignRecipientExportRow {
  id: string;
  phoneE164: string;
  status: string;
  eligibilityReason: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  attemptCount: number;
  queuedAt: Date | null;
  sendAttemptedAt: Date | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  repliedAt: Date | null;
  failedAt: Date | null;
  optedOutAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class ReportsDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  private async countMessages(range: DateRange, direction: 'INBOUND' | 'OUTBOUND'): Promise<number> {
    const rows = await this.db
      .select({ value: count() })
      .from(messages)
      .where(and(eq(messages.direction, direction), ...rangeConditions(messages.createdAt, range)));
    return rows[0]?.value ?? 0;
  }

  async dashboardSummary(query: DashboardQuery): Promise<DashboardSummaryDto> {
    const range = resolveRange(query.from, query.to);
    const fullRange = defaultRange(range);

    const [
      contactsTotal,
      newContacts,
      conversationsTotal,
      openConversations,
      unreadConversations,
      messagesSent,
      messagesReceived,
      campaignsRun,
      recipientsSent,
      recipientsDelivered,
      recipientsRead,
      recipientsReplied,
      recipientsFailed,
      optedOut,
    ] = await Promise.all([
      this.db.select({ value: count() }).from(contacts).where(isNull(contacts.archivedAt)),
      this.db
        .select({ value: count() })
        .from(contacts)
        .where(and(isNull(contacts.archivedAt), ...rangeConditions(contacts.createdAt, range))),
      this.db
        .select({ value: count() })
        .from(conversations)
        .where(and(...rangeConditions(conversations.createdAt, range))),
      this.db
        .select({ value: count() })
        .from(conversations)
        .where(and(ne(conversations.status, 'CLOSED'), isNull(conversations.closedAt))),
      this.db
        .select({ value: count() })
        .from(conversations)
        .where(and(ne(conversations.status, 'CLOSED'), isNull(conversations.closedAt), sql`${conversations.unreadCount} > 0`)),
      this.countMessages(range, 'OUTBOUND'),
      this.countMessages(range, 'INBOUND'),
      this.db
        .select({ value: count() })
        .from(campaigns)
        .where(and(isNull(campaigns.archivedAt), ...rangeConditions(campaigns.startedAt, range))),
      this.db
        .select({ value: count() })
        .from(campaignRecipients)
        .where(and(...rangeConditions(campaignRecipients.sentAt, range))),
      this.db
        .select({ value: count() })
        .from(campaignRecipients)
        .where(and(...rangeConditions(campaignRecipients.deliveredAt, range))),
      this.db
        .select({ value: count() })
        .from(campaignRecipients)
        .where(and(...rangeConditions(campaignRecipients.readAt, range))),
      this.db
        .select({ value: count() })
        .from(campaignRecipients)
        .where(and(...rangeConditions(campaignRecipients.repliedAt, range))),
      this.db
        .select({ value: count() })
        .from(campaignRecipients)
        .where(and(...rangeConditions(campaignRecipients.failedAt, range))),
      this.db.select({ value: count() }).from(suppressionEntries).where(and(...rangeConditions(suppressionEntries.createdAt, range))),
    ]);

    const sent = recipientsSent[0]?.value ?? 0;
    const delivered = recipientsDelivered[0]?.value ?? 0;
    const read = recipientsRead[0]?.value ?? 0;
    const replied = recipientsReplied[0]?.value ?? 0;
    const failed = recipientsFailed[0]?.value ?? 0;

    return {
      from: fullRange.from.toISOString(),
      to: fullRange.to.toISOString(),
      generatedAt: new Date().toISOString(),
      totals: {
        contacts: contactsTotal[0]?.value ?? 0,
        newContacts: newContacts[0]?.value ?? 0,
        conversations: conversationsTotal[0]?.value ?? 0,
        openConversations: openConversations[0]?.value ?? 0,
        unreadConversations: unreadConversations[0]?.value ?? 0,
        messagesSent,
        messagesReceived,
        campaignsRun: campaignsRun[0]?.value ?? 0,
        recipientsDelivered: delivered,
        failedSends: failed,
        optedOut: optedOut[0]?.value ?? 0,
      },
      rates: {
        deliveryRate: rate(delivered, sent),
        readRate: rate(read, delivered),
        replyRate: rate(replied, delivered),
        failureRate: rate(failed, sent),
      },
    };
  }

  async dashboardTrends(query: DashboardQuery): Promise<DashboardTrendsDto> {
    const range = resolveRange(query.from, query.to);
    const fullRange = defaultRange(range);
    const granularity = query.granularity;
    const keys = bucketRange(granularity, fullRange);
    const bucketCondition = (column: AnyPgColumn): SQL[] => [
      gte(column, fullRange.from),
      lte(column, fullRange.to),
    ];

    const [outbound, inbound, conversationsOpened, contactsAdded] = await Promise.all([
      this.db
        .select({ bucket: sql<Date>`date_trunc(${granularity}, ${messages.createdAt})`, count: count() })
        .from(messages)
        .where(and(eq(messages.direction, 'OUTBOUND'), ...bucketCondition(messages.createdAt)))
        .groupBy((cols) => [cols.bucket]),
      this.db
        .select({ bucket: sql<Date>`date_trunc(${granularity}, ${messages.createdAt})`, count: count() })
        .from(messages)
        .where(and(eq(messages.direction, 'INBOUND'), ...bucketCondition(messages.createdAt)))
        .groupBy((cols) => [cols.bucket]),
      this.db
        .select({ bucket: sql<Date>`date_trunc(${granularity}, ${conversations.createdAt})`, count: count() })
        .from(conversations)
        .where(and(...bucketCondition(conversations.createdAt)))
        .groupBy((cols) => [cols.bucket]),
      this.db
        .select({ bucket: sql<Date>`date_trunc(${granularity}, ${contacts.createdAt})`, count: count() })
        .from(contacts)
        .where(and(isNull(contacts.archivedAt), ...bucketCondition(contacts.createdAt)))
        .groupBy((cols) => [cols.bucket]),
    ]);

    const sentMap = toCountMap(outbound);
    const receivedMap = toCountMap(inbound);
    const openedMap = toCountMap(conversationsOpened);
    const addedMap = toCountMap(contactsAdded);

    const points: TrendPoint[] = keys.map((key) => ({
      bucket: key,
      messagesSent: sentMap.get(key) ?? 0,
      messagesReceived: receivedMap.get(key) ?? 0,
      conversationsOpened: openedMap.get(key) ?? 0,
      contactsAdded: addedMap.get(key) ?? 0,
    }));

    return {
      from: fullRange.from.toISOString(),
      to: fullRange.to.toISOString(),
      granularity,
      points,
    };
  }

  private async campaignRows(
    query: CampaignPerformanceQuery,
  ): Promise<Array<{ id: string; name: string; status: string; audienceType: string; createdAt: Date; startedAt: Date | null; completedAt: Date | null }>> {
    const conditions: SQL[] = [isNull(campaigns.archivedAt)];
    if (query.search) {
      const term = `%${query.search}%`;
      const search = or(ilike(campaigns.name, term), ilike(campaigns.description, term));
      if (search) {
        conditions.push(search);
      }
    }
    if (query.status) {
      conditions.push(eq(campaigns.status, query.status));
    }
    const range = resolveRange(query.from, query.to);
    conditions.push(...rangeConditions(campaigns.createdAt, range));

    const rows = await this.db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        audienceType: campaigns.audienceType,
        createdAt: campaigns.createdAt,
        startedAt: campaigns.startedAt,
        completedAt: campaigns.completedAt,
      })
      .from(campaigns)
      .where(and(...conditions));
    return rows;
  }

  async campaignPerformance(query: CampaignPerformanceQuery, all = false): Promise<{ items: CampaignPerformanceRow[]; total: number }> {
    const rows = await this.campaignRows(query);
    if (rows.length === 0) {
      return { items: [], total: 0 };
    }
    const ids = rows.map((row) => row.id);
    const aggregates = await this.aggregateRecipients(ids);
    const byCampaign = new Map<string, CampaignAggregates>();
    for (const aggregate of aggregates) {
      byCampaign.set(aggregate.campaignId, aggregate);
    }

    const items = rows.map((row): CampaignPerformanceRow => {
      const agg = byCampaign.get(row.id);
      const total = agg?.total ?? 0;
      const sent = agg?.sent ?? 0;
      const delivered = agg?.delivered ?? 0;
      const read = agg?.read ?? 0;
      const replied = agg?.replied ?? 0;
      const failed = agg?.failed ?? 0;
      const optedOut = agg?.optedOut ?? 0;
      return {
        id: row.id,
        name: row.name,
        status: row.status as CampaignPerformanceRow['status'],
        audienceType: row.audienceType as CampaignPerformanceRow['audienceType'],
        createdAt: row.createdAt.toISOString(),
        startedAt: row.startedAt ? row.startedAt.toISOString() : null,
        completedAt: row.completedAt ? row.completedAt.toISOString() : null,
        totalRecipients: total,
        sentRecipients: sent,
        deliveredRecipients: delivered,
        readRecipients: read,
        repliedRecipients: replied,
        failedRecipients: failed,
        optedOutRecipients: optedOut,
        deliveryRate: rate(delivered, sent),
        readRate: rate(read, delivered),
        replyRate: rate(replied, delivered),
        failureRate: rate(failed, sent),
      };
    });

    items.sort((a, b) => {
      const left = this.sortValue(a, query.sortBy);
      const right = this.sortValue(b, query.sortBy);
      const result = left < right ? -1 : left > right ? 1 : 0;
      return query.sortOrder === 'asc' ? result : -result;
    });

    const total = items.length;
    const pageItems = all ? items : items.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
    return { items: pageItems, total };
  }

  private sortValue(row: CampaignPerformanceRow, sortBy: string): number | string {
    switch (sortBy) {
      case 'name':
        return row.name;
      case 'status':
        return row.status;
      case 'totalRecipients':
        return row.totalRecipients;
      case 'deliveryRate':
        return row.deliveryRate;
      case 'readRate':
        return row.readRate;
      default:
        return row.createdAt;
    }
  }

  async aggregateRecipients(ids: string[]): Promise<CampaignAggregates[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.db
      .select({
        campaignId: campaignRecipients.campaignId,
        total: count(),
        sent: count(campaignRecipients.sentAt),
        delivered: count(campaignRecipients.deliveredAt),
        read: count(campaignRecipients.readAt),
        replied: count(campaignRecipients.repliedAt),
        failed: count(campaignRecipients.failedAt),
        optedOut: count(campaignRecipients.optedOutAt),
      })
      .from(campaignRecipients)
      .where(inArray(campaignRecipients.campaignId, ids))
      .groupBy(campaignRecipients.campaignId);
    return rows.map((row) => ({
      campaignId: row.campaignId,
      total: row.total,
      sent: row.sent,
      delivered: row.delivered,
      read: row.read,
      replied: row.replied,
      failed: row.failed,
      optedOut: row.optedOut,
    }));
  }

  async recipientsPage(campaignId: string, limit: number, offset: number): Promise<CampaignRecipientExportRow[]> {
    const rows = await this.db
      .select({
        id: campaignRecipients.id,
        phoneE164: campaignRecipients.phoneE164,
        status: campaignRecipients.status,
        eligibilityReason: campaignRecipients.eligibilityReason,
        failureCode: campaignRecipients.failureCode,
        failureMessage: campaignRecipients.failureMessage,
        attemptCount: campaignRecipients.attemptCount,
        queuedAt: campaignRecipients.queuedAt,
        sendAttemptedAt: campaignRecipients.sendAttemptedAt,
        sentAt: campaignRecipients.sentAt,
        deliveredAt: campaignRecipients.deliveredAt,
        readAt: campaignRecipients.readAt,
        repliedAt: campaignRecipients.repliedAt,
        failedAt: campaignRecipients.failedAt,
        optedOutAt: campaignRecipients.optedOutAt,
        createdAt: campaignRecipients.createdAt,
      })
      .from(campaignRecipients)
      .where(eq(campaignRecipients.campaignId, campaignId))
      .orderBy(campaignRecipients.createdAt)
      .limit(limit)
      .offset(offset);
    return rows;
  }

  async recipientsCount(campaignId: string): Promise<number> {
    const rows = await this.db
      .select({ value: count() })
      .from(campaignRecipients)
      .where(eq(campaignRecipients.campaignId, campaignId));
    return rows[0]?.value ?? 0;
  }

  async failureAnalysis(query: FailureAnalysisQuery): Promise<FailureAnalysisDto> {
    const range = resolveRange(query.from, query.to);
    const fullRange = defaultRange(range);
    const rangeFilter = rangeConditions;
    const codeFilter = query.code;

    const recipientFailures = await this.db
      .select({
        code: campaignRecipients.failureCode,
        message: sql<string>`max(${campaignRecipients.failureMessage})`,
        count: count(),
        last: sql<Date>`max(${campaignRecipients.failedAt})`,
      })
      .from(campaignRecipients)
      .where(
        and(
          isNotNullSql(campaignRecipients.failedAt),
          isNotNullSql(campaignRecipients.failureCode),
          ...rangeFilter(campaignRecipients.failedAt, range),
          ...(codeFilter ? [eq(campaignRecipients.failureCode, codeFilter)] : []),
        ),
      )
      .groupBy(campaignRecipients.failureCode);

    const messageFailures = await this.db
      .select({
        code: messages.errorCode,
        message: sql<string>`max(${messages.errorMessage})`,
        count: count(),
        last: sql<Date>`max(${messages.failedAt})`,
      })
      .from(messages)
      .where(
        and(
          eq(messages.direction, 'OUTBOUND'),
          isNotNullSql(messages.failedAt),
          isNotNullSql(messages.errorCode),
          ...rangeFilter(messages.failedAt, range),
          ...(codeFilter ? [eq(messages.errorCode, codeFilter)] : []),
        ),
      )
      .groupBy(messages.errorCode);

    const buckets = new Map<string, { code: string; message: string; count: number; last: Date | null }>();
    for (const row of recipientFailures) {
      if (!row.code) {
        continue;
      }
      buckets.set(row.code, {
        code: row.code,
        message: row.message ?? '',
        count: row.count,
        last: row.last ?? null,
      });
    }
    for (const row of messageFailures) {
      if (!row.code) {
        continue;
      }
      const existing = buckets.get(row.code);
      if (existing) {
        existing.count += row.count;
        if (row.last && (!existing.last || row.last.getTime() > existing.last.getTime())) {
          existing.last = row.last;
        }
        if (!existing.message && row.message) {
          existing.message = row.message;
        }
      } else {
        buckets.set(row.code, {
          code: row.code,
          message: row.message ?? '',
          count: row.count,
          last: row.last ?? null,
        });
      }
    }

    const bucketList = [...buckets.values()].sort((a, b) => b.count - a.count);
    const totalFailures = bucketList.reduce((sum, bucket) => sum + bucket.count, 0);

    const recent = await this.recentFailures(range, query.limit);

    return {
      from: fullRange.from.toISOString(),
      to: fullRange.to.toISOString(),
      generatedAt: new Date().toISOString(),
      totalFailures,
      buckets: bucketList.map((bucket) => ({
        code: bucket.code,
        message: bucket.message,
        count: bucket.count,
        lastOccurredAt: bucket.last ? bucket.last.toISOString() : null,
      })),
      recentFailures: recent,
    };
  }

  private async recentFailures(range: DateRange, limit: number): Promise<FailureAnalysisDto['recentFailures']> {
    const limitPerSource = Math.ceil(limit / 2) + 1;
    const recipientRows = await this.db
      .select({
        id: campaignRecipients.id,
        campaignName: campaigns.name,
        phoneE164: campaignRecipients.phoneE164,
        code: campaignRecipients.failureCode,
        message: campaignRecipients.failureMessage,
        failedAt: campaignRecipients.failedAt,
      })
      .from(campaignRecipients)
      .leftJoin(campaigns, eq(campaignRecipients.campaignId, campaigns.id))
      .where(and(isNotNullSql(campaignRecipients.failedAt), ...rangeConditions(campaignRecipients.failedAt, range)))
      .orderBy(desc(campaignRecipients.failedAt))
      .limit(limitPerSource);

    const messageRows = await this.db
      .select({
        id: messages.id,
        campaignName: campaigns.name,
        phoneE164: contacts.phoneE164,
        code: messages.errorCode,
        message: messages.errorMessage,
        failedAt: messages.failedAt,
      })
      .from(messages)
      .leftJoin(campaigns, eq(messages.campaignId, campaigns.id))
      .leftJoin(contacts, eq(messages.contactId, contacts.id))
      .where(and(eq(messages.direction, 'OUTBOUND'), isNotNullSql(messages.failedAt), ...rangeConditions(messages.failedAt, range)))
      .orderBy(desc(messages.failedAt))
      .limit(limitPerSource);

    const combined: FailureAnalysisDto['recentFailures'] = [];
    for (const row of recipientRows) {
      if (row.failedAt) {
        combined.push({
          id: row.id,
          campaignName: row.campaignName ?? null,
          phoneE164: row.phoneE164 ?? null,
          code: row.code ?? null,
          message: row.message ?? null,
          failedAt: row.failedAt.toISOString(),
        });
      }
    }
    for (const row of messageRows) {
      if (row.failedAt) {
        combined.push({
          id: row.id,
          campaignName: row.campaignName ?? null,
          phoneE164: row.phoneE164 ?? null,
          code: row.code ?? null,
          message: row.message ?? null,
          failedAt: row.failedAt.toISOString(),
        });
      }
    }
    combined.sort((a, b) => (a.failedAt < b.failedAt ? 1 : -1));
    return combined.slice(0, limit);
  }

  async inboxPerformance(query: InboxPerformanceQuery, all = false): Promise<{ items: InboxPerformanceRow[]; total: number }> {
    const range = resolveRange(query.from, query.to);
    const userCondition = query.userId ? [eq(users.id, query.userId)] : [];

    const agentRows = await this.db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(and(isNull(users.archivedAt), ...userCondition));

    if (agentRows.length === 0) {
      return { items: [], total: 0 };
    }
    const userIds = agentRows.map((row) => row.id);

    const [assigned, closed, sentMessages, notes, receivedMessages] = await Promise.all([
      this.db
        .select({ userId: conversationAssignments.toUserId, count: count() })
        .from(conversationAssignments)
        .where(and(inArray(conversationAssignments.toUserId, userIds), ...rangeConditions(conversationAssignments.createdAt, range)))
        .groupBy(conversationAssignments.toUserId),
      this.db
        .select({ userId: conversations.assignedUserId, count: count() })
        .from(conversations)
        .where(
          and(
            inArray(conversations.assignedUserId, userIds),
            isNotNullSql(conversations.closedAt),
            ...rangeConditions(conversations.closedAt, range),
          ),
        )
        .groupBy(conversations.assignedUserId),
      this.db
        .select({ userId: messages.sentByUserId, count: count() })
        .from(messages)
        .where(
          and(
            eq(messages.direction, 'OUTBOUND'),
            inArray(messages.sentByUserId, userIds),
            ...rangeConditions(messages.createdAt, range),
          ),
        )
        .groupBy(messages.sentByUserId),
      this.db
        .select({ userId: internalNotes.userId, count: count() })
        .from(internalNotes)
        .where(and(inArray(internalNotes.userId, userIds), ...rangeConditions(internalNotes.createdAt, range)))
        .groupBy(internalNotes.userId),
      this.db
        .select({ userId: conversations.assignedUserId, count: count() })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(
          and(
            eq(messages.direction, 'INBOUND'),
            inArray(conversations.assignedUserId, userIds),
            ...rangeConditions(messages.createdAt, range),
          ),
        )
        .groupBy(conversations.assignedUserId),
    ]);

    const toMap = (rows: Array<{ userId: string | null; count: number }>): Map<string, number> => {
      const map = new Map<string, number>();
      for (const row of rows) {
        if (row.userId) {
          map.set(row.userId, row.count);
        }
      }
      return map;
    };

    const assignedMap = toMap(assigned);
    const closedMap = toMap(closed);
    const sentMap = toMap(sentMessages);
    const notesMap = toMap(notes);
    const receivedMap = toMap(receivedMessages);

    const [firstResponseAvg, handleAvg] = await Promise.all([
      this.firstResponseAverages(userIds, range),
      this.handleTimeAverages(userIds, range),
    ]);

    const items = agentRows.map((agent): InboxPerformanceRow => ({
      userId: agent.id,
      name: agent.name,
      email: agent.email,
      conversationsAssigned: assignedMap.get(agent.id) ?? 0,
      conversationsClosed: closedMap.get(agent.id) ?? 0,
      messagesSent: sentMap.get(agent.id) ?? 0,
      messagesReceived: receivedMap.get(agent.id) ?? 0,
      notesCreated: notesMap.get(agent.id) ?? 0,
      avgFirstResponseMinutes: firstResponseAvg.get(agent.id) ?? null,
      avgHandleMinutes: handleAvg.get(agent.id) ?? null,
    }));

    items.sort((a, b) => {
      const left = this.agentSortValue(a, query.sortBy);
      const right = this.agentSortValue(b, query.sortBy);
      const result = left < right ? -1 : left > right ? 1 : 0;
      return query.sortOrder === 'asc' ? result : -result;
    });

    const total = items.length;
    const pageItems = all ? items : items.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
    return { items: pageItems, total };
  }

  private agentSortValue(row: InboxPerformanceRow, sortBy: string): number | string {
    switch (sortBy) {
      case 'name':
        return row.name;
      case 'conversationsClosed':
        return row.conversationsClosed;
      case 'messagesSent':
        return row.messagesSent;
      case 'avgFirstResponseMinutes':
        return row.avgFirstResponseMinutes ?? Number.MAX_SAFE_INTEGER;
      case 'avgHandleMinutes':
        return row.avgHandleMinutes ?? Number.MAX_SAFE_INTEGER;
      default:
        return row.conversationsAssigned;
    }
  }

  private async firstResponseAverages(userIds: string[], range: DateRange): Promise<Map<string, number>> {
    const assignments = await this.db
      .select({
        userId: conversationAssignments.toUserId,
        conversationId: conversationAssignments.conversationId,
        assignedAt: conversationAssignments.createdAt,
        conversationCreatedAt: conversations.createdAt,
      })
      .from(conversationAssignments)
      .innerJoin(conversations, eq(conversationAssignments.conversationId, conversations.id))
      .where(
        and(
          inArray(conversationAssignments.toUserId, userIds),
          ...rangeConditions(conversationAssignments.createdAt, range),
        ),
      );

    if (assignments.length === 0) {
      return new Map();
    }
    const conversationIds = [...new Set(assignments.map((row) => row.conversationId))];

    const replies = await this.db
      .select({
        userId: messages.sentByUserId,
        conversationId: messages.conversationId,
        firstReplyAt: sql<Date>`min(${messages.createdAt})`,
      })
      .from(messages)
      .where(
        and(
          eq(messages.direction, 'OUTBOUND'),
          inArray(messages.sentByUserId, userIds),
          inArray(messages.conversationId, conversationIds),
        ),
      )
      .groupBy(messages.sentByUserId, messages.conversationId);

    const replyKey = (userId: string, conversationId: string | null): string => `${userId}:${conversationId}`;
    const replyMap = new Map<string, Date>();
    for (const row of replies) {
      if (row.userId && row.firstReplyAt) {
        replyMap.set(replyKey(row.userId, row.conversationId), row.firstReplyAt);
      }
    }

    const totals = new Map<string, { sum: number; count: number }>();
    for (const assignment of assignments) {
      const firstReply = replyMap.get(replyKey(assignment.userId, assignment.conversationId));
      if (!firstReply) {
        continue;
      }
      const baseline = assignment.assignedAt ?? assignment.conversationCreatedAt;
      if (firstReply.getTime() < baseline.getTime()) {
        continue;
      }
      const minutes = (firstReply.getTime() - baseline.getTime()) / 60000;
      const current = totals.get(assignment.userId) ?? { sum: 0, count: 0 };
      current.sum += minutes;
      current.count += 1;
      totals.set(assignment.userId, current);
    }

    const result = new Map<string, number>();
    for (const [userId, value] of totals) {
      result.set(userId, value.sum / value.count);
    }
    return result;
  }

  private async handleTimeAverages(userIds: string[], range: DateRange): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        userId: conversations.assignedUserId,
        assignedAt: conversations.assignedAt,
        closedAt: conversations.closedAt,
      })
      .from(conversations)
      .where(
        and(
          inArray(conversations.assignedUserId, userIds),
          isNotNullSql(conversations.assignedAt),
          isNotNullSql(conversations.closedAt),
          ...rangeConditions(conversations.closedAt, range),
        ),
      );

    const totals = new Map<string, { sum: number; count: number }>();
    for (const row of rows) {
      if (row.userId && row.assignedAt && row.closedAt) {
        const minutes = (row.closedAt.getTime() - row.assignedAt.getTime()) / 60000;
        if (minutes < 0) {
          continue;
        }
        const current = totals.get(row.userId) ?? { sum: 0, count: 0 };
        current.sum += minutes;
        current.count += 1;
        totals.set(row.userId, current);
      }
    }

    const result = new Map<string, number>();
    for (const [userId, value] of totals) {
      result.set(userId, value.sum / value.count);
    }
    return result;
  }

  private buildContactConditions(query: ContactReportQuery): { conditions: SQL[]; range: DateRange } {
    const conditions: SQL[] = [isNull(contacts.archivedAt)];
    if (query.search) {
      const term = `%${query.search}%`;
      const search = or(
        ilike(contacts.displayName, term),
        ilike(contacts.firstName, term),
        ilike(contacts.lastName, term),
        ilike(contacts.phoneE164, term),
        ilike(contacts.email, term),
        ilike(contacts.company, term),
      );
      if (search) {
        conditions.push(search);
      }
    }
    if (query.status) {
      conditions.push(eq(contacts.status, query.status));
    }
    if (query.country) {
      conditions.push(eq(contacts.phoneCountry, query.country));
    }
    if (query.language) {
      conditions.push(eq(contacts.language, query.language));
    }
    if (query.source) {
      conditions.push(ilike(contacts.source, `%${query.source}%`));
    }
    if (query.tagId) {
      conditions.push(
        exists(
          this.db
            .select({ one: sql`1` })
            .from(contactTags)
            .where(and(eq(contactTags.contactId, contacts.id), eq(contactTags.tagId, query.tagId))),
        ),
      );
    }
    if (query.listId) {
      conditions.push(
        exists(
          this.db
            .select({ one: sql`1` })
            .from(contactListMembers)
            .where(and(eq(contactListMembers.contactId, contacts.id), eq(contactListMembers.contactListId, query.listId))),
        ),
      );
    }
    const range = resolveRange(query.from, query.to);
    return { conditions, range };
  }

  async contactReport(query: ContactReportQuery, all = false): Promise<{ items: ContactReportRow[]; total: number }> {
    const { conditions, range } = this.buildContactConditions(query);

    const idRows = await this.db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(...conditions));

    const allIds = idRows.map((row) => row.id);
    if (allIds.length === 0) {
      return { items: [], total: 0 };
    }

    const [consentRows, suppressionRows] = await Promise.all([
      this.db.select().from(optInRecords).where(inArray(optInRecords.contactId, allIds)),
      this.db
        .select()
        .from(suppressionEntries)
        .where(and(inArray(suppressionEntries.contactId, allIds), isNull(suppressionEntries.removedAt))),
    ]);

    const optInByContact = new Map<string, OptInStatus>();
    const latestTimestamps = new Map<string, Date>();
    const latestCreatedAt = new Map<string, Date>();
    for (const record of consentRows) {
      const currentTimestamp = latestTimestamps.get(record.contactId);
      const isNewer =
        currentTimestamp === undefined ||
        record.obtainedAt.getTime() > currentTimestamp.getTime() ||
        (record.obtainedAt.getTime() === currentTimestamp.getTime() &&
          record.createdAt.getTime() > (latestCreatedAt.get(record.contactId)?.getTime() ?? 0));
      if (isNewer) {
        optInByContact.set(record.contactId, record.status);
        latestTimestamps.set(record.contactId, record.obtainedAt);
        latestCreatedAt.set(record.contactId, record.createdAt);
      }
    }
    const suppressedIds = new Set(suppressionRows.map((row) => row.contactId));

    const filteredIds = allIds.filter((id) => {
      const optIn = optInByContact.get(id) ?? 'UNKNOWN';
      if (query.optInStatus && optIn !== query.optInStatus) {
        return false;
      }
      if (query.suppressed === 'yes' && !suppressedIds.has(id)) {
        return false;
      }
      if (query.suppressed === 'no' && suppressedIds.has(id)) {
        return false;
      }
      return true;
    });

    const [messageCounts, recipientCounts] = await Promise.all([
      this.db
        .select({ contactId: messages.contactId, direction: messages.direction, count: count() })
        .from(messages)
        .where(and(inArray(messages.contactId, filteredIds), ...rangeConditions(messages.createdAt, range)))
        .groupBy(messages.contactId, messages.direction),
      this.db
        .select({ contactId: campaignRecipients.contactId, count: count() })
        .from(campaignRecipients)
        .where(
          and(
            inArray(campaignRecipients.contactId, filteredIds),
            isNotNullSql(campaignRecipients.deliveredAt),
            ...rangeConditions(campaignRecipients.deliveredAt, range),
          ),
        )
        .groupBy(campaignRecipients.contactId),
    ]);

    const inboundByContact = new Map<string, number>();
    const outboundByContact = new Map<string, number>();
    for (const row of messageCounts) {
      if (!row.contactId) {
        continue;
      }
      const target = row.direction === 'INBOUND' ? inboundByContact : outboundByContact;
      target.set(row.contactId, row.count);
    }
    const deliveriesByContact = new Map<string, number>();
    for (const row of recipientCounts) {
      if (row.contactId) {
        deliveriesByContact.set(row.contactId, row.count);
      }
    }

    const activity = new Map<string, { inbound: number; outbound: number; deliveries: number }>();
    for (const id of filteredIds) {
      activity.set(id, {
        inbound: inboundByContact.get(id) ?? 0,
        outbound: outboundByContact.get(id) ?? 0,
        deliveries: deliveriesByContact.get(id) ?? 0,
      });
    }

    filteredIds.sort((a, b) => {
      const left = this.contactSortValue(activity, a, query.sortBy);
      const right = this.contactSortValue(activity, b, query.sortBy);
      const result = left < right ? -1 : left > right ? 1 : 0;
      return query.sortOrder === 'asc' ? result : -result;
    });

    const total = filteredIds.length;
    const pageIds = all ? filteredIds : filteredIds.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
    if (pageIds.length === 0) {
      return { items: [], total };
    }

    const contactRows = await this.db
      .select()
      .from(contacts)
      .where(inArray(contacts.id, pageIds));
    const byId = new Map<string, ContactRow>();
    for (const row of contactRows) {
      byId.set(row.id, row);
    }

    const items = pageIds.map((id): ContactReportRow => {
      const row = byId.get(id);
      const counts = activity.get(id);
      return {
        id,
        phoneE164: row?.phoneE164 ?? '',
        displayName: row?.displayName ?? null,
        firstName: row?.firstName ?? null,
        lastName: row?.lastName ?? null,
        email: row?.email ?? null,
        company: row?.company ?? null,
        language: row?.language ?? null,
        phoneCountry: row?.phoneCountry ?? null,
        status: (row?.status ?? 'ACTIVE') as ContactReportRow['status'],
        source: row?.source ?? null,
        optInStatus: optInByContact.get(id) ?? 'UNKNOWN',
        suppressed: suppressedIds.has(id),
        messagesInbound: counts?.inbound ?? 0,
        messagesOutbound: counts?.outbound ?? 0,
        campaignDeliveries: counts?.deliveries ?? 0,
        lastInboundMessageAt: row?.lastInboundMessageAt ? row.lastInboundMessageAt.toISOString() : null,
        lastOutboundMessageAt: row?.lastOutboundMessageAt ? row.lastOutboundMessageAt.toISOString() : null,
        createdAt: row?.createdAt ? row.createdAt.toISOString() : new Date(0).toISOString(),
      };
    });

    return { items, total };
  }

  private contactSortValue(
    activity: Map<string, { inbound: number; outbound: number; deliveries: number }>,
    id: string,
    sortBy: string,
  ): number | string {
    const counts = activity.get(id);
    switch (sortBy) {
      case 'messagesInbound':
        return counts?.inbound ?? 0;
      case 'messagesOutbound':
        return counts?.outbound ?? 0;
      case 'campaignDeliveries':
        return counts?.deliveries ?? 0;
      default:
        return '';
    }
  }

  async contactBreakdown(): Promise<ContactBreakdownDto> {
    const [totalContacts, byStatus, byCountry, byLanguage, bySource, consentRows, suppressionRows] = await Promise.all([
      this.db.select({ value: count() }).from(contacts).where(isNull(contacts.archivedAt)),
      this.db
        .select({ key: contacts.status, value: count() })
        .from(contacts)
        .where(isNull(contacts.archivedAt))
        .groupBy(contacts.status),
      this.db
        .select({ key: contacts.phoneCountry, value: count() })
        .from(contacts)
        .where(isNull(contacts.archivedAt))
        .groupBy(contacts.phoneCountry),
      this.db
        .select({ key: contacts.language, value: count() })
        .from(contacts)
        .where(isNull(contacts.archivedAt))
        .groupBy(contacts.language),
      this.db
        .select({ key: contacts.source, value: count() })
        .from(contacts)
        .where(isNull(contacts.archivedAt))
        .groupBy(contacts.source),
      this.db.select().from(optInRecords),
      this.db
        .select({ contactId: suppressionEntries.contactId })
        .from(suppressionEntries)
        .where(isNull(suppressionEntries.removedAt)),
    ]);

    const asRecord = (rows: Array<{ key: string | null; value: number }>): Record<string, number> => {
      const record: Record<string, number> = {};
      for (const row of rows) {
        if (row.key) {
          record[row.key] = row.value;
        }
      }
      return record;
    };

    const latestOptIn = new Map<string, OptInStatus>();
    const latestOptInTimes = new Map<string, Date>();
    for (const record of consentRows) {
      const currentTimestamp = latestOptInTimes.get(record.contactId);
      if (currentTimestamp === undefined || record.obtainedAt.getTime() > currentTimestamp.getTime()) {
        latestOptIn.set(record.contactId, record.status);
        latestOptInTimes.set(record.contactId, record.obtainedAt);
      }
    }
    let optedIn = 0;
    let optedOut = 0;
    for (const status of latestOptIn.values()) {
      if (status === 'OPTED_IN') {
        optedIn += 1;
      } else if (status === 'OPTED_OUT') {
        optedOut += 1;
      }
    }

    return {
      totalContacts: totalContacts[0]?.value ?? 0,
      byStatus: asRecord(byStatus),
      byCountry: asRecord(byCountry),
      byLanguage: asRecord(byLanguage),
      bySource: asRecord(bySource),
      suppressed: suppressionRows.length,
      notSuppressed: Math.max(0, (totalContacts[0]?.value ?? 0) - suppressionRows.length),
      optedIn,
      optedOut,
      unknownConsent: Math.max(0, (totalContacts[0]?.value ?? 0) - optedIn - optedOut),
    };
  }
}
