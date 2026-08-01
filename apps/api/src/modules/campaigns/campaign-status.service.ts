import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type {
  CampaignRecipientStatus,
  NormalizedInboundMessage,
  NormalizedStatusUpdate,
} from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { contacts, messages } from '../../db/schema';
import { CampaignRecipientsDao } from './campaign-recipients.dao';
import { MessagesDao } from '../inbox/messages.dao';

// How long after a campaign message we attribute a reply to that campaign recipient.
const REPLY_ATTRIBUTION_WINDOW_MS = 24 * 60 * 60 * 1000;

const META_TO_RECIPIENT_STATUS: Record<string, CampaignRecipientStatus> = {
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
};

const RECIPIENT_STATUS_COLUMNS: Partial<Record<CampaignRecipientStatus, 'sentAt' | 'deliveredAt' | 'readAt' | 'failedAt'>> = {
  SENT: 'sentAt',
  DELIVERED: 'deliveredAt',
  READ: 'readAt',
  FAILED: 'failedAt',
};

const RECIPIENT_PRECEDENCE: Record<string, number> = {
  PENDING: 0,
  QUEUED: 1,
  SENDING: 2,
  SENT: 3,
  DELIVERED: 4,
  READ: 5,
  REPLIED: 6,
  FAILED: 7,
  OPTED_OUT: 8,
  CANCELLED: 9,
};

/**
 * Campaign-side reconciliation of webhook events. The generic conversation/message
 * store, status-event persistence and opt-out handling live in the inbox pipeline;
 * this service only performs campaign-specific side effects: mirroring delivery
 * statuses onto campaign recipients and attributing inbound replies.
 */
@Injectable()
export class CampaignStatusService {
  private readonly logger = new Logger(CampaignStatusService.name);

  constructor(
    @Inject(DATABASE) private readonly db: DrizzleDB,
    private readonly messagesDao: MessagesDao,
    private readonly recipientsDao: CampaignRecipientsDao,
  ) {}

  async applyStatusUpdate(status: NormalizedStatusUpdate): Promise<void> {
    const messageRow = await this.messagesDao.findByMetaMessageId(status.waMessageId);
    if (!messageRow || !messageRow.campaignRecipientId) {
      return;
    }
    const targetStatus = META_TO_RECIPIENT_STATUS[status.status];
    if (!targetStatus) {
      return;
    }
    const eventTimestamp = new Date(Number(status.timestamp) * 1000);
    const safeDate = Number.isNaN(eventTimestamp.getTime()) ? new Date() : eventTimestamp;
    await this.applyRecipientStatus(messageRow.campaignRecipientId, targetStatus, messageRow.status, safeDate);
  }

  private async applyRecipientStatus(
    recipientId: string,
    targetStatus: CampaignRecipientStatus,
    currentMessageStatus: string,
    timestamp: Date,
  ): Promise<void> {
    const recipient = await this.recipientsDao.findById(recipientId);
    if (!recipient) {
      return;
    }
    const column = RECIPIENT_STATUS_COLUMNS[targetStatus];
    if (!column) {
      return;
    }
    const incoming = RECIPIENT_PRECEDENCE[targetStatus] ?? 0;
    if (incoming < (RECIPIENT_PRECEDENCE[currentMessageStatus] ?? 0)) {
      return; // the message already progressed past this status (out-of-order safety)
    }
    if (incoming < (RECIPIENT_PRECEDENCE[recipient.status] ?? 0)) {
      return; // the recipient already progressed past this status
    }
    await this.recipientsDao.setStatus(recipientId, targetStatus, { [column]: timestamp });
  }

  async handleInboundMessage(message: NormalizedInboundMessage): Promise<void> {
    const phone = message.from;
    const [contact] = await this.db
      .select()
      .from(contacts)
      .where(eq(contacts.phoneE164, phone))
      .limit(1);
    if (!contact) {
      this.logger.debug(`Inbound message from unknown contact ${phone}; not attributed.`);
      return;
    }

    await this.attributeReply(contact.id, message);
  }

  private async attributeReply(contactId: string, message: NormalizedInboundMessage): Promise<void> {
    const recentMessages = await this.messagesDao.findRecentOutboundForContact(contactId, REPLY_ATTRIBUTION_WINDOW_MS, 20);
    if (recentMessages.length === 0) {
      return;
    }
    // Reliable attribution: the single most-recent outbound campaign message within the window,
    // provided it is unambiguous (only one distinct campaign). If multiple distinct campaigns
    // sent to the contact recently, do not attribute.
    const campaignMessages = recentMessages.filter((row) => row.campaignId !== null && row.campaignRecipientId !== null);
    const distinctCampaigns = new Set(campaignMessages.map((row) => row.campaignId));
    if (distinctCampaigns.size !== 1) {
      return; // ambiguous — do not attribute
    }
    const target = campaignMessages[0];
    if (!target) {
      return;
    }

    const now = new Date();
    await this.recipientsDao.setStatus(target.campaignRecipientId!, 'REPLIED', { repliedAt: now });
    await this.messagesDao.insertStatusEvent({
      messageId: target.id,
      campaignRecipientId: target.campaignRecipientId,
      metaMessageId: message.waMessageId,
      status: 'replied',
      eventTimestamp: now,
      rawEventReference: `inbound:${message.waMessageId}`,
    } as never);
    await this.db
      .update(messages)
      .set({ replyToMetaMessageId: target.metaMessageId })
      .where(eq(messages.id, target.id));
  }
}
