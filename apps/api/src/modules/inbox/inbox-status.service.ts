import { Injectable } from '@nestjs/common';
import type { NormalizedStatusUpdate } from '@wa/shared';

import { MessagesDao } from './messages.dao';
import { ConversationsDao } from './conversations.dao';
import { InboxRealtimeService } from './inbox.realtime.service';
import { toMessageDto } from './inbox.mapper';

@Injectable()
export class InboxStatusService {
  constructor(
    private readonly messagesDao: MessagesDao,
    private readonly conversationsDao: ConversationsDao,
    private readonly realtime: InboxRealtimeService,
  ) {}

  async applyStatusUpdate(status: NormalizedStatusUpdate, webhookEventId: string): Promise<void> {
    const eventTimestamp = new Date(Number(status.timestamp) * 1000);
    const safeDate = Number.isNaN(eventTimestamp.getTime()) ? new Date() : eventTimestamp;
    const errorCode = status.error ? String(status.error.code ?? '') || null : null;
    const errorMessage = status.error ? [status.error.title, status.error.message].filter(Boolean).join(': ') || null : null;

    const messageRow = await this.messagesDao.findByMetaMessageId(status.waMessageId);
    if (!messageRow) {
      return;
    }

    await this.messagesDao.insertStatusEvent({
      messageId: messageRow.id,
      campaignRecipientId: messageRow.campaignRecipientId,
      metaMessageId: status.waMessageId,
      status: status.status,
      errorCode,
      errorMessage,
      eventTimestamp: safeDate,
      rawEventReference: webhookEventId,
    } as never);

    const { updated, messageRow: updatedRow } = await this.messagesDao.applyStatusUpdate(
      status.waMessageId,
      status.status,
      errorCode,
      errorMessage,
      safeDate,
    );

    const current = updatedRow ?? messageRow;

    if (messageRow.direction === 'OUTBOUND' && messageRow.conversationId) {
      if (['SENT', 'DELIVERED', 'READ'].includes(status.status)) {
        await this.conversationsDao.update(messageRow.conversationId, {
          lastOutboundMessageAt: safeDate,
          lastMessageAt: safeDate,
        });
      }
    }

    if (updated || ['FAILED'].includes(status.status)) {
      const conversation = messageRow.conversationId
        ? await this.conversationsDao.findById(messageRow.conversationId)
        : undefined;
      this.realtime.emitToConversation(
        {
          type: status.status === 'read' ? 'read' : 'status',
          conversationId: messageRow.conversationId ?? '',
          payload: { message: toMessageDto(current) },
          at: new Date().toISOString(),
        },
        { assignedUserId: conversation?.assignedUserId ?? null },
      );
    }
  }
}
