import type {
  AssignmentHistoryDto,
  ConversationDetailDto,
  ConversationSummaryDto,
  InternalNoteDto,
  MediaFileDto,
  MessageDto,
  QuickReplyDto,
} from '@wa/shared';

import type {
  ConversationAssignmentRow,
  ConversationRow,
  InternalNoteRow,
  MediaFileRow,
  MessageRow,
  QuickReplyRow,
} from '../../db/schema';

export function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

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
    sentAt: iso(row.sentAt),
    deliveredAt: iso(row.deliveredAt),
    readAt: iso(row.readAt),
    failedAt: iso(row.failedAt),
  };
}

export function toMediaFileDto(row: MediaFileRow): MediaFileDto {
  return {
    id: row.id,
    messageId: row.messageId ?? null,
    conversationId: row.conversationId ?? null,
    direction: row.direction,
    source: row.source,
    metaMediaId: row.metaMediaId ?? null,
    originalFilename: row.originalFilename ?? null,
    storedFilename: row.storedFilename ?? null,
    contentType: row.contentType ?? null,
    sizeBytes: row.sizeBytes ?? null,
    sha256: row.sha256 ?? null,
    status: row.status,
    errorMessage: row.errorMessage ?? null,
    uploadedByUserId: row.uploadedByUserId ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toQuickReplyDto(row: QuickReplyRow): QuickReplyDto {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    language: row.language,
    category: row.category ?? null,
    visibility: row.visibility,
    createdByUserId: row.createdByUserId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: iso(row.archivedAt),
  };
}

export function toInternalNoteDto(row: InternalNoteRow & { userName?: string }): InternalNoteDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    userId: row.userId,
    userName: row.userName ?? 'Unknown',
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: iso(row.deletedAt),
  };
}

export function toAssignmentHistoryDto(row: ConversationAssignmentRow & {
  fromUserName?: string | null;
  toUserName?: string | null;
  assignedByName?: string | null;
}): AssignmentHistoryDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    fromUserId: row.fromUserId ?? null,
    toUserId: row.toUserId,
    assignedByUserId: row.assignedByUserId ?? null,
    reason: row.reason ?? null,
    createdAt: row.createdAt.toISOString(),
    fromUserName: row.fromUserName ?? null,
    toUserName: row.toUserName ?? null,
    assignedByName: row.assignedByName ?? null,
  };
}

export interface ConversationContactView {
  id: string;
  phoneE164: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  language: string | null;
  status: string;
  suppressed: boolean;
  optInStatus: string;
}

export function toConversationSummary(
  conversation: ConversationRow,
  contact: ConversationContactView,
  assigneeName: string | null,
  lastMessagePreview: string | null,
): ConversationSummaryDto {
  return {
    id: conversation.id,
    contactId: conversation.contactId,
    whatsappPhoneNumberId: conversation.whatsappPhoneNumberId ?? null,
    status: conversation.status,
    priority: conversation.priority,
    assignedUserId: conversation.assignedUserId ?? null,
    assignedUserName: assigneeName,
    lastMessageId: conversation.lastMessageId ?? null,
    lastMessageAt: iso(conversation.lastMessageAt),
    lastInboundMessageAt: iso(conversation.lastInboundMessageAt),
    lastOutboundMessageAt: iso(conversation.lastOutboundMessageAt),
    unreadCount: conversation.unreadCount,
    serviceWindowExpiresAt: iso(conversation.serviceWindowExpiresAt),
    closedAt: iso(conversation.closedAt),
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    contact: {
      id: contact.id,
      phoneE164: contact.phoneE164,
      firstName: contact.firstName,
      lastName: contact.lastName,
      displayName: contact.displayName,
      language: contact.language as ConversationSummaryDto['contact']['language'],
      status: contact.status as ConversationSummaryDto['contact']['status'],
      suppressed: contact.suppressed,
      optInStatus: contact.optInStatus as ConversationSummaryDto['contact']['optInStatus'],
    },
    lastMessagePreview,
  };
}

export function toConversationDetail(
  summary: ConversationSummaryDto,
  extra: {
    assignedUser: ConversationDetailDto['assignedUser'];
    tags: ConversationDetailDto['tags'];
    lists: ConversationDetailDto['lists'];
    consent: ConversationDetailDto['consent'];
    suppression: ConversationDetailDto['suppression'];
    recentCampaigns: ConversationDetailDto['recentCampaigns'];
    assignmentHistory: AssignmentHistoryDto[];
    internalNotes: InternalNoteDto[];
  },
): ConversationDetailDto {
  return {
    ...summary,
    assignedUser: extra.assignedUser,
    tags: extra.tags,
    lists: extra.lists,
    consent: extra.consent,
    suppression: extra.suppression,
    recentCampaigns: extra.recentCampaigns,
    assignmentHistory: extra.assignmentHistory,
    internalNotes: extra.internalNotes,
  };
}
