import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, asc, eq, gte, inArray } from 'drizzle-orm';
import type { MessageDto } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import {
  conversations,
  messageStatusEvents,
  messages,
  campaignRecipients,
  type ConversationRow,
  type MessageRow,
  type MessageStatusEventRow,
  type NewConversation,
  type NewMessage,
  type NewMessageStatusEvent,
} from '../../db/schema';

export function toMessageDto(row: MessageRow): MessageDto {
  return {
    id: row.id,
    contactId: row.contactId ?? null,
    conversationId: row.conversationId ?? null,
    campaignId: row.campaignId ?? null,
    campaignRecipientId: row.campaignRecipientId ?? null,
    whatsappPhoneNumberId: row.whatsappPhoneNumberId ?? null,
    direction: row.direction,
    type: row.type,
    status: row.status,
    metaMessageId: row.metaMessageId ?? null,
    replyToMetaMessageId: row.replyToMetaMessageId ?? null,
    textContent: row.textContent ?? null,
    templateName: row.templateName ?? null,
    templateLanguage: row.templateLanguage ?? null,
    templateParameters: (row.templateParameters as string[] | null) ?? null,
    mediaId: row.mediaId ?? null,
    mediaUrl: row.mediaUrl ?? null,
    errorCode: row.errorCode ?? null,
    errorMessage: row.errorMessage ?? null,
    sentByUserId: row.sentByUserId ?? null,
    isTest: row.isTest,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    failedAt: row.failedAt ? row.failedAt.toISOString() : null,
  };
}

// Status precedence model: higher index = more progressed. Out-of-order events never downgrade.
export const STATUS_PRECEDENCE: Record<string, number> = {
  PENDING: 0,
  QUEUED: 1,
  SENDING: 2,
  SENT: 3,
  DELIVERED: 4,
  READ: 5,
  REPLIED: 6,
  FAILED: 7,
  CANCELLED: 8,
  OPTED_OUT: 9,
};

const META_TO_ROW_STATUS: Record<string, MessageRow['status']> = {
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
};

@Injectable()
export class MessagesDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  findByMetaMessageId(metaMessageId: string): Promise<MessageRow | undefined> {
    return this.db.query.messages.findFirst({ where: eq(messages.metaMessageId, metaMessageId) });
  }

  async insert(values: NewMessage): Promise<MessageRow> {
    const [row] = await this.db.insert(messages).values(values).returning();
    return row!;
  }

  async insertStatusEvent(values: NewMessageStatusEvent): Promise<MessageStatusEventRow> {
    const [row] = await this.db.insert(messageStatusEvents).values(values).returning();
    return row!;
  }

  async applyStatusUpdate(
    metaMessageId: string,
    metaStatus: string,
    errorCode: string | null,
    errorMessage: string | null,
    eventTimestamp: Date,
  ): Promise<{ messageRow: MessageRow | undefined; updated: boolean }> {
    const rowStatus = META_TO_ROW_STATUS[metaStatus];
    if (!rowStatus) {
      return { messageRow: await this.findByMetaMessageId(metaMessageId), updated: false };
    }

    const existing = await this.findByMetaMessageId(metaMessageId);
    if (!existing) {
      return { messageRow: undefined, updated: false };
    }

    const incomingPrecedence = STATUS_PRECEDENCE[rowStatus] ?? 0;
    const currentPrecedence = STATUS_PRECEDENCE[existing.status] ?? 0;
    if (incomingPrecedence < currentPrecedence) {
      // Out-of-order event: never downgrade. Still record the event for auditing.
      return { messageRow: existing, updated: false };
    }

    const patch: Partial<MessageRow> = { status: rowStatus };
    if (rowStatus === 'SENT') {
      patch.sentAt = existing.sentAt ?? eventTimestamp;
    } else if (rowStatus === 'DELIVERED') {
      patch.deliveredAt = existing.deliveredAt ?? eventTimestamp;
    } else if (rowStatus === 'READ') {
      patch.readAt = existing.readAt ?? eventTimestamp;
    } else if (rowStatus === 'FAILED') {
      patch.failedAt = existing.failedAt ?? eventTimestamp;
      patch.errorCode = errorCode;
      patch.errorMessage = errorMessage;
    }

    const rows = await this.db
      .update(messages)
      .set(patch)
      .where(and(eq(messages.id, existing.id)))
      .returning();
    return { messageRow: rows[0], updated: rows.length > 0 };
  }

  async findRecentOutboundForContact(
    contactId: string,
    withinMs: number,
    limit = 20,
  ): Promise<MessageRow[]> {
    const since = new Date(Date.now() - withinMs);
    return this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.contactId, contactId),
          eq(messages.direction, 'OUTBOUND'),
          gte(messages.createdAt, since),
          inArray(messages.status, ['SENT', 'DELIVERED', 'READ', 'REPLIED']),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(limit);
  }

  async findLatestCampaignOutboundForContact(contactId: string, campaignId: string): Promise<MessageRow | undefined> {
    const rows = await this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.contactId, contactId),
          eq(messages.campaignId, campaignId),
          eq(messages.direction, 'OUTBOUND'),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(1);
    return rows[0];
  }

  async insertConversation(values: NewConversation): Promise<ConversationRow> {
    const [row] = await this.db.insert(conversations).values(values).returning();
    return row!;
  }

  async findOpenConversationForContact(contactId: string): Promise<ConversationRow | undefined> {
    return this.db.query.conversations.findFirst({
      where: and(eq(conversations.contactId, contactId), eq(conversations.status, 'OPEN')),
      orderBy: desc(conversations.updatedAt),
    });
  }

  async touchConversation(id: string, lastMessageAt: Date): Promise<void> {
    await this.db.update(conversations).set({ lastMessageAt }).where(eq(conversations.id, id));
  }

  async aggregateCampaignMetrics(campaignId: string): Promise<{
    queued: number;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    failed: number;
    optedOut: number;
  }> {
    const statusCounts = await this.db
      .select({ status: campaignRecipients.status, value: count() })
      .from(campaignRecipients)
      .where(eq(campaignRecipients.campaignId, campaignId))
      .groupBy(campaignRecipients.status);
    const map = new Map(statusCounts.map((row) => [row.status, row.value]));
    return {
      queued: map.get('QUEUED') ?? 0,
      sent: map.get('SENT') ?? map.get('SENDING') ?? 0,
      delivered: map.get('DELIVERED') ?? 0,
      read: map.get('READ') ?? 0,
      replied: map.get('REPLIED') ?? 0,
      failed: map.get('FAILED') ?? 0,
      optedOut: map.get('OPTED_OUT') ?? 0,
    };
  }

  listMessagesForConversation(conversationId: string): Promise<MessageRow[]> {
    return this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));
  }
}