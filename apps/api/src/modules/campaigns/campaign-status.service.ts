import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type {
  CampaignRecipientStatus,
  NormalizedInboundMessage,
  NormalizedStatusUpdate,
} from '@wa/shared';
import { OptInStatus, OPT_OUT_KEYWORDS, OPT_OUT_QUICK_REPLY_PAYLOAD } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { AuditService } from '../../common/audit/audit.module';
import { AUDIT_ACTIONS } from '@wa/shared';
import { contacts, messages, optInRecords, suppressionEntries } from '../../db/schema';
import { CampaignRecipientsDao } from './campaign-recipients.dao';
import { MessagesDao } from './messages.dao';

// How long after a campaign message we attribute a reply to that campaign recipient.
const REPLY_ATTRIBUTION_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CampaignStatusService {
  private readonly logger = new Logger(CampaignStatusService.name);

  constructor(
    @Inject(DATABASE) private readonly db: DrizzleDB,
    private readonly messagesDao: MessagesDao,
    private readonly recipientsDao: CampaignRecipientsDao,
    private readonly auditService: AuditService,
  ) {}

  async applyStatusUpdate(status: NormalizedStatusUpdate, webhookEventId: string): Promise<void> {
    const eventTimestamp = new Date(Number(status.timestamp) * 1000);
    const safeDate = Number.isNaN(eventTimestamp.getTime()) ? new Date() : eventTimestamp;

    // Persist a status event row keyed to the message (if known) — audit every event.
    const messageRow = await this.messagesDao.findByMetaMessageId(status.waMessageId);
    const errorCode = status.error ? String(status.error.code ?? '') || null : null;
    const errorMessage = status.error ? [status.error.title, status.error.message].filter(Boolean).join(': ') || null : null;

    if (messageRow) {
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

      const { updated } = await this.messagesDao.applyStatusUpdate(
        status.waMessageId,
        status.status,
        errorCode,
        errorMessage,
        safeDate,
      );

      // Mirror the message status onto the campaign recipient using the precedence model.
      if (updated && messageRow.campaignRecipientId) {
        await this.applyRecipientStatus(messageRow.campaignRecipientId, status.status, safeDate);
      }
    }
  }

  private async applyRecipientStatus(recipientId: string, metaStatus: string, timestamp: Date): Promise<void> {
    const recipient = await this.recipientsDao.findById(recipientId);
    if (!recipient) {
      return;
    }
    const mapping: Record<string, { status: CampaignRecipientStatus; col: 'sentAt' | 'deliveredAt' | 'readAt' | 'failedAt' }> = {
      sent: { status: 'SENT', col: 'sentAt' },
      delivered: { status: 'DELIVERED', col: 'deliveredAt' },
      read: { status: 'READ', col: 'readAt' },
      failed: { status: 'FAILED', col: 'failedAt' },
    };
    const entry = mapping[metaStatus];
    if (!entry) {
      return;
    }
    const precedence: Record<string, number> = { PENDING: 0, QUEUED: 1, SENDING: 2, SENT: 3, DELIVERED: 4, READ: 5, REPLIED: 6, FAILED: 7 };
    const incoming = precedence[entry.status] ?? 0;
    const current = precedence[recipient.status] ?? 0;
    if (incoming < current) {
      return; // never downgrade (out-of-order safety)
    }
    await this.recipientsDao.setStatus(recipientId, entry.status, { [entry.col]: timestamp });
  }

  async handleInboundMessage(message: NormalizedInboundMessage, webhookEventId: string): Promise<void> {
    const phone = message.from;
    // Locate the contact by phone (E.164).
    const [contact] = await this.db
      .select()
      .from(contacts)
      .where(eq(contacts.phoneE164, phone))
      .limit(1);
    if (!contact) {
      this.logger.debug(`Inbound message from unknown contact ${phone}; not attributed.`);
      return;
    }

    const text = this.extractText(message);
    const isOptOut = this.isOptOut(text, message);

    // Persist the inbound message (conversation grouping best-effort).
    let conversationId: string | null = null;
    const openConversation = await this.messagesDao.findOpenConversationForContact(contact.id);
    if (openConversation) {
      conversationId = openConversation.id;
      await this.messagesDao.touchConversation(openConversation.id, new Date());
    } else {
      const created = await this.messagesDao.insertConversation({
        contactId: contact.id,
        whatsappPhoneNumberId: message.waPhoneNumberId,
        status: 'OPEN',
        lastMessageAt: new Date(),
      } as never);
      conversationId = created.id;
    }

    await this.messagesDao.insert({
      contactId: contact.id,
      conversationId,
      campaignId: null,
      campaignRecipientId: null,
      whatsappPhoneNumberId: message.waPhoneNumberId,
      direction: 'INBOUND',
      type: message.type,
      status: 'RECEIVED',
      metaMessageId: message.waMessageId,
      textContent: text,
      isTest: false,
    } as never);

    if (isOptOut) {
      await this.processOptOut(contact.id, phone, text, webhookEventId);
      return;
    }

    // Reply attribution: link to the most relevant recent campaign recipient.
    await this.attributeReply(contact.id, message);
  }

  private extractText(message: NormalizedInboundMessage): string | null {
    if (message.type === 'TEXT') {
      return message.body ?? null;
    }
    if (message.type === 'INTERACTIVE_BUTTON') {
      return message.buttonText ?? null;
    }
    if (message.type === 'INTERACTIVE_LIST') {
      return message.listTitle ?? message.listItemId ?? null;
    }
    return null;
  }

  private isOptOut(text: string | null, message: NormalizedInboundMessage): boolean {
    if (!text) {
      return false;
    }
    const normalized = text.trim().toUpperCase().replace(/\s+/g, ' ');
    if ((OPT_OUT_KEYWORDS as readonly string[]).some((keyword) => normalized === keyword.toUpperCase())) {
      return true;
    }
    // Interactive quick-reply payload (e.g. button id "OPT_OUT").
    if (message.type === 'INTERACTIVE_BUTTON' && message.buttonId?.toUpperCase() === OPT_OUT_QUICK_REPLY_PAYLOAD) {
      return true;
    }
    return false;
  }

  private async processOptOut(contactId: string, phone: string, text: string | null, webhookEventId: string): Promise<void> {
    const now = new Date();
    // Add a suppression entry (idempotent-ish: insert one per opt-out event).
    await this.db.insert(suppressionEntries).values({
      contactId,
      phoneE164: phone,
      reason: 'OPTED_OUT',
      source: `whatsapp-optout:${webhookEventId}`,
    } as never);
    await this.db.insert(optInRecords).values({
      contactId,
      status: 'OPTED_OUT' as OptInStatus,
      source: 'whatsapp-optout',
      obtainedAt: now,
    } as never);

    // Stop unsent campaign messages for this contact and mark relevant recipients OPTED_OUT.
    const activeRecipients = await this.recipientsDao.listByStatusForContact(contactId, ['PENDING', 'QUEUED', 'SENDING']);
    for (const recipient of activeRecipients) {
      await this.recipientsDao.setStatus(recipient.id, 'OPTED_OUT', { optedOutAt: now });
    }

    await this.auditService.record({
      action: AUDIT_ACTIONS.CAMPAIGN_RECIPIENT_OPT_OUT,
      entityType: 'contact',
      entityId: contactId,
      metadata: { phone, source: 'whatsapp-inbound', text: text ? text.slice(0, 120) : null, stoppedRecipients: activeRecipients.length },
    });
    this.logger.log(`Processed opt-out for contact ${contactId}; stopped ${activeRecipients.length} campaign recipients.`);
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