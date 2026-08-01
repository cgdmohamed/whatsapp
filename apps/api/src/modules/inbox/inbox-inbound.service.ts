import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { NormalizedInboundMessage } from '@wa/shared';
import { OptInStatus, OPT_OUT_KEYWORDS, OPT_OUT_QUICK_REPLY_PAYLOAD, AUDIT_ACTIONS } from '@wa/shared';

import { INBOX_MEDIA_QUEUE } from '../../common/queue/queue.module';
import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { AuditService } from '../../common/audit/audit.module';
import { SettingsService } from '../settings/settings.service';
import { ContactsDao } from '../contacts/contacts.dao';
import { CampaignRecipientsDao } from '../campaigns/campaign-recipients.dao';
import { optInRecords, suppressionEntries, type ContactRow, type ConversationRow, type MessageRow } from '../../db/schema';
import { ConversationsDao } from './conversations.dao';
import { MediaFilesDao } from './media-files.dao';
import { MessagesDao } from './messages.dao';
import { InboxRealtimeService } from './inbox.realtime.service';
import { toConversationSummary, toMediaFileDto, toMessageDto } from './inbox.mapper';

export interface InboundMessageResult {
  message: MessageRow;
  conversation: ConversationRow;
  contact: ContactRow;
  isOptOut: boolean;
}

@Injectable()
export class InboxInboundService {
  private readonly logger = new Logger(InboxInboundService.name);

  constructor(
    @Inject(INBOX_MEDIA_QUEUE) private readonly mediaQueue: Queue,
    @Inject(DATABASE) private readonly db: DrizzleDB,
    private readonly conversationsDao: ConversationsDao,
    private readonly messagesDao: MessagesDao,
    private readonly mediaFilesDao: MediaFilesDao,
    private readonly contactsDao: ContactsDao,
    private readonly recipientsDao: CampaignRecipientsDao,
    private readonly realtime: InboxRealtimeService,
    private readonly settingsService: SettingsService,
    private readonly auditService: AuditService,
  ) {}

  async handleInboundMessage(message: NormalizedInboundMessage, webhookEventId: string): Promise<InboundMessageResult> {
    const now = new Date();
    const phone = message.from;

    const contact = await this.findOrCreateContact(phone);
    let conversation = await this.conversationsDao.findForInbound(contact.id);
    if (!conversation) {
      conversation = await this.conversationsDao.insert({
        contactId: contact.id,
        whatsappPhoneNumberId: message.waPhoneNumberId,
        status: 'NEW',
        lastMessageAt: now,
        lastInboundMessageAt: now,
        unreadCount: 0,
        serviceWindowExpiresAt: null,
      } as never);
    }

    const wasClosed = conversation.status === 'CLOSED';
    const messageRow = await this.messagesDao.insert({
      contactId: contact.id,
      conversationId: conversation.id,
      campaignId: null,
      campaignRecipientId: null,
      whatsappPhoneNumberId: message.waPhoneNumberId,
      direction: 'INBOUND',
      type: message.type,
      status: 'RECEIVED',
      metaMessageId: message.waMessageId,
      textContent: this.extractText(message),
      mediaId: this.extractMediaId(message),
      mediaUrl: null,
      isTest: false,
    } as never);

    const serviceWindowHours = await this.readServiceWindowHours();
    const serviceWindowExpiresAt = new Date(now.getTime() + serviceWindowHours * 60 * 60 * 1000);

    await this.conversationsDao.update(conversation.id, {
      lastMessageId: messageRow.id,
      lastMessageAt: now,
      lastInboundMessageAt: now,
      status: 'OPEN',
      closedAt: wasClosed ? null : conversation.closedAt,
      serviceWindowExpiresAt,
    });
    await this.conversationsDao.incrementUnread(conversation.id);

    await this.contactsDao.update(contact.id, { lastInboundMessageAt: now });

    const media = await this.handleInboundMedia(message, messageRow, conversation.id);

    const isOptOut = this.isOptOut(this.extractText(message), message);
    if (isOptOut) {
      await this.handleOptOut(contact, phone, this.extractText(message), webhookEventId);
    }

    const refreshedConversation = (await this.conversationsDao.findById(conversation.id)) ?? conversation;
    this.realtime.emitToConversation(
      {
        type: 'message',
        conversationId: conversation.id,
        payload: { message: toMessageDto(messageRow), mediaFile: media ? toMediaFileDto(media) : null },
        at: now.toISOString(),
      },
      { assignedUserId: conversation.assignedUserId },
    );
    this.realtime.emitToConversation(
      {
        type: 'conversation',
        conversationId: conversation.id,
        payload: {
          conversation: toConversationSummary(refreshedConversation, this.contactView(contact), null, this.extractText(message)),
        },
        at: now.toISOString(),
      },
      { assignedUserId: conversation.assignedUserId },
    );

    return { message: messageRow, conversation: refreshedConversation, contact, isOptOut };
  }

  private async findOrCreateContact(phone: string): Promise<ContactRow> {
    const existing = await this.contactsDao.findByPhone(phone);
    if (existing) {
      return existing;
    }
    const [created] = await this.contactsDao.insert({
      phoneE164: phone,
      status: 'ACTIVE',
      firstName: null,
      lastName: null,
      displayName: null,
    } as never);
    return created!;
  }

  private async handleInboundMedia(
    message: NormalizedInboundMessage,
    messageRow: MessageRow,
    conversationId: string,
  ): Promise<import('../../db/schema').MediaFileRow | null> {
    const mediaId = this.extractMediaId(message);
    if (!mediaId) {
      return null;
    }
    const mimeType = this.extractMimeType(message);
    const mediaFile = await this.mediaFilesDao.insert({
      messageId: messageRow.id,
      conversationId,
      direction: 'INBOUND',
      source: 'INBOUND_META',
      metaMediaId: mediaId,
      originalFilename: message.type === 'DOCUMENT' ? message.filename : null,
      contentType: mimeType,
      status: 'PENDING',
    } as never);
    await this.mediaQueue.add(
      'download',
      { mediaFileId: mediaFile.id },
      {
        jobId: `inbox-media-${mediaFile.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 1000 },
      },
    );
    return mediaFile;
  }

  private async handleOptOut(contact: ContactRow, phone: string, text: string | null, webhookEventId: string): Promise<void> {
    const now = new Date();
    await this.db.insert(suppressionEntries).values({
      contactId: contact.id,
      phoneE164: phone,
      reason: 'OPTED_OUT',
      source: `whatsapp-inbox:${webhookEventId}`,
    } as never);
    await this.db.insert(optInRecords).values({
      contactId: contact.id,
      status: 'OPTED_OUT' as OptInStatus,
      source: 'whatsapp-inbox',
      obtainedAt: now,
    } as never);

    const activeRecipients = await this.recipientsDao.listByStatusForContact(contact.id, ['PENDING', 'QUEUED', 'SENDING']);
    for (const recipient of activeRecipients) {
      await this.recipientsDao.setStatus(recipient.id, 'OPTED_OUT', { optedOutAt: now });
    }
    await this.auditService.record({
      action: AUDIT_ACTIONS.INBOX_OPT_OUT,
      entityType: 'contact',
      entityId: contact.id,
      metadata: { phone, text: text ? text.slice(0, 120) : null, stoppedRecipients: activeRecipients.length, webhookEventId },
    });
    this.logger.log(`Processed opt-out for contact ${contact.id}; stopped ${activeRecipients.length} campaign recipients.`);
  }

  private async readServiceWindowHours(): Promise<number> {
    const settings = await this.settingsService.getAll();
    const hours = settings.serviceWindowHours;
    return Number.isFinite(hours) && hours > 0 ? hours : 24;
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
    if (message.type === 'IMAGE' || message.type === 'DOCUMENT') {
      return message.caption ?? null;
    }
    return null;
  }

  private extractMediaId(message: NormalizedInboundMessage): string | null {
    if (message.type === 'IMAGE' || message.type === 'DOCUMENT') {
      return message.mediaId ?? null;
    }
    return null;
  }

  private extractMimeType(message: NormalizedInboundMessage): string | null {
    if (message.type === 'IMAGE' || message.type === 'DOCUMENT') {
      return message.mimeType ?? null;
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
    if (message.type === 'INTERACTIVE_BUTTON' && message.buttonId?.toUpperCase() === OPT_OUT_QUICK_REPLY_PAYLOAD) {
      return true;
    }
    return false;
  }

  private contactView(contact: ContactRow): import('./inbox.mapper').ConversationContactView {
    return {
      id: contact.id,
      phoneE164: contact.phoneE164,
      firstName: contact.firstName ?? null,
      lastName: contact.lastName ?? null,
      displayName: contact.displayName ?? null,
      language: contact.language ?? null,
      status: contact.status,
      suppressed: false,
      optInStatus: 'UNKNOWN',
    };
  }
}
