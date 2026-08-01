import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AssignConversationInput,
  ClaimConversationInput,
  ConversationDetailDto,
  ConversationPriorityInput,
  ConversationQuery,
  ConversationStatusInput,
  ConversationSummaryDto,
  ConversationTagsInput,
  CreateInternalNoteInput,
  CreateQuickReplyInput,
  InternalNoteDto,
  PaginatedConversationMessages,
  PaginatedConversations,
  PaginatedQuickReplies,
  QuickReplyDto,
  UpdateInternalNoteInput,
  UpdateQuickReplyInput,
} from '@wa/shared';
import { AUDIT_ACTIONS } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { AuditService } from '../../common/audit/audit.module';
import { ERROR_CODES } from '../../common/errors';
import { ContactsDao } from '../contacts/contacts.dao';
import { TagsDao } from '../contacts/tags.dao';
import { UsersDao } from '../users/users.dao';
import { contactTags } from '../../db/schema';
import type { AuthUser } from '../auth/auth.types';
import type { ContactRow, ConversationRow, UserRow } from '../../db/schema';
import { ConversationsDao } from './conversations.dao';
import { AssignmentsDao } from './assignments.dao';
import { InternalNotesDao } from './internal-notes.dao';
import { QuickRepliesDao } from './quick-replies.dao';
import { MessagesDao } from './messages.dao';
import { InboxAccessService } from './inbox-access.service';
import { InboxRealtimeService } from './inbox.realtime.service';
import {
  assertConversationFound,
  canAssign,
  canEditQuickReplies,
  canManageNotes,
} from './inbox.permissions';
import {
  toAssignmentHistoryDto,
  toConversationDetail,
  toConversationSummary,
  toInternalNoteDto,
  toMediaFileDto,
  toMessageDto,
  toQuickReplyDto,
} from './inbox.mapper';
import { toTagSummary, toListSummary, toSuppressionEntryDto } from '../contacts/contacts.mapper';

@Injectable()
export class InboxService {
  constructor(
    @Inject(DATABASE) private readonly db: DrizzleDB,
    private readonly conversationsDao: ConversationsDao,
    private readonly assignmentsDao: AssignmentsDao,
    private readonly internalNotesDao: InternalNotesDao,
    private readonly quickRepliesDao: QuickRepliesDao,
    private readonly messagesDao: MessagesDao,
    private readonly contactsDao: ContactsDao,
    private readonly tagsDao: TagsDao,
    private readonly usersDao: UsersDao,
    private readonly accessService: InboxAccessService,
    private readonly realtime: InboxRealtimeService,
    private readonly auditService: AuditService,
  ) {}

  async listConversations(query: ConversationQuery, actor: AuthUser): Promise<PaginatedConversations> {
    const canViewUnassigned = await this.accessService.canViewUnassigned(actor.role);
    const { items, total } = await this.conversationsDao.list(query, {
      isAdmin: ['ADMIN', 'MANAGER'].includes(actor.role),
      userId: actor.id,
      canViewUnassigned,
    });
    const summaries: ConversationSummaryDto[] = [];
    for (const row of items) {
      const enriched = await this.enrichContact(row.contact);
      summaries.push(
        toConversationSummary(row.conversation, this.contactView(enriched), row.assigneeName, row.lastMessagePreview),
      );
    }
    const totalPages = Math.ceil(total / query.pageSize);
    return { items: summaries, total, page: query.page, pageSize: query.pageSize, totalPages };
  }

  async getDetail(conversationId: string, actor: AuthUser): Promise<ConversationDetailDto> {
    const conversation = await this.accessService.getAccessibleConversation(conversationId, actor);
    const contact = assertContact(await this.contactsDao.findById(conversation.contactId));
    const enriched = await this.enrichContact(contact);

    const [lists, consentHistory, suppression, recentCampaigns, assignmentHistoryRows, internalNotes, assignedUser] =
      await Promise.all([
        this.contactsDao.listsForContact(contact.id),
        this.contactsDao.consentHistory(contact.id),
        this.contactsDao.suppressionEntriesForContact(contact.id),
        this.conversationsDao.recentCampaigns(contact.id, 5),
        this.assignmentsDao.listForConversation(conversation.id),
        this.internalNotesDao.listForConversation(conversation.id),
        conversation.assignedUserId ? this.usersDao.findById(conversation.assignedUserId) : Promise.resolve(undefined),
      ]);

    const latestConsent = consentHistory[0];
    const summary = toConversationSummary(conversation, this.contactView(enriched), assignedUser?.name ?? null, null);
    return toConversationDetail(summary, {
      assignedUser: assignedUser
        ? { id: assignedUser.id, name: assignedUser.name, email: assignedUser.email, role: assignedUser.role }
        : null,
      tags: enriched.tags.map(toTagSummary),
      lists: lists.map(toListSummary),
      consent: latestConsent
        ? {
            status: latestConsent.status,
            source: latestConsent.source ?? null,
            obtainedAt: latestConsent.obtainedAt.toISOString(),
            expiresAt: latestConsent.expiresAt ? latestConsent.expiresAt.toISOString() : null,
          }
        : null,
      suppression: suppression.map(toSuppressionEntryDto),
      recentCampaigns: recentCampaigns.map((row) => ({
        id: row.campaignId,
        name: row.campaignName,
        status: row.status as ConversationDetailDto['recentCampaigns'][number]['status'],
        sentAt: row.sentAt ? row.sentAt.toISOString() : null,
      })),
      assignmentHistory: assignmentHistoryRows.map((row) => toAssignmentHistoryDto(row)),
      internalNotes: internalNotes.map((row) => toInternalNoteDto(row)),
    });
  }

  async getMessages(
    conversationId: string,
    query: import('@wa/shared').ConversationMessagesQuery,
    actor: AuthUser,
  ): Promise<PaginatedConversationMessages> {
    await this.accessService.getAccessibleConversation(conversationId, actor);
    const { rows, total } = await this.messagesDao.listForConversationPaginated(conversationId, query.page, query.pageSize);
    const items = rows.map((row) => ({
      ...toMessageDto(row.message),
      mediaFile: row.mediaFile ? toMediaFileDto(row.mediaFile) : null,
    }));
    const totalPages = Math.ceil(total / query.pageSize);
    return { items, total, page: query.page, pageSize: query.pageSize, totalPages };
  }

  async assign(conversationId: string, input: AssignConversationInput, actor: AuthUser): Promise<ConversationSummaryDto> {
    if (!canAssign(actor.role)) {
      throw new ForbiddenException(ERROR_CODES.FORBIDDEN);
    }
    const conversation = await this.accessService.getAccessibleConversation(conversationId, actor);
    const target = await this.requireActiveUser(input.userId);
    const previous = conversation.assignedUserId;

    if (previous === target.id) {
      return this.summaryOf(conversation);
    }
    const changed = previous ? await this.conversationsDao.reassign(conversation.id, previous, target.id) : await this.conversationsDao.assign(conversation.id, target.id);
    if (!changed) {
      throw new BadRequestException(ERROR_CODES.INBOX_ASSIGNMENT_CONFLICT);
    }
    await this.assignmentsDao.insert({
      conversationId: conversation.id,
      fromUserId: previous,
      toUserId: target.id,
      assignedByUserId: actor.id,
      reason: input.reason ?? null,
    } as never);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.INBOX_CONVERSATION_ASSIGN,
      entityType: 'conversation',
      entityId: conversation.id,
      metadata: { fromUserId: previous, toUserId: target.id, reason: input.reason ?? null },
    });
    const updated = assertConversationFound(await this.conversationsDao.findById(conversation.id));
    this.emitConversationUpdate(updated);
    return this.summaryOf(updated);
  }

  async claim(conversationId: string, input: ClaimConversationInput, actor: AuthUser): Promise<ConversationSummaryDto> {
    const conversation = await this.accessService.getAccessibleConversation(conversationId, actor);
    if (conversation.assignedUserId && conversation.assignedUserId !== actor.id) {
      throw new BadRequestException(ERROR_CODES.INBOX_ALREADY_ASSIGNED);
    }
    if (conversation.assignedUserId === actor.id) {
      return this.summaryOf(conversation);
    }
    const changed = await this.conversationsDao.assign(conversation.id, actor.id);
    if (!changed) {
      throw new BadRequestException(ERROR_CODES.INBOX_ASSIGNMENT_CONFLICT);
    }
    await this.assignmentsDao.insert({
      conversationId: conversation.id,
      fromUserId: null,
      toUserId: actor.id,
      assignedByUserId: actor.id,
      reason: input.reason ?? null,
    } as never);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.INBOX_CONVERSATION_CLAIM,
      entityType: 'conversation',
      entityId: conversation.id,
      metadata: { reason: input.reason ?? null },
    });
    const updated = assertConversationFound(await this.conversationsDao.findById(conversation.id));
    this.emitConversationUpdate(updated);
    return this.summaryOf(updated);
  }

  async setStatus(conversationId: string, input: ConversationStatusInput, actor: AuthUser): Promise<ConversationSummaryDto> {
    const conversation = await this.accessService.getAccessibleConversation(conversationId, actor);
    const patch: Partial<ConversationRow> = { status: input.status };
    if (input.status === 'CLOSED') {
      patch.closedAt = new Date();
    } else if (conversation.status === 'CLOSED') {
      patch.closedAt = null;
    }
    const updated = assertConversationFound(await this.conversationsDao.update(conversation.id, patch));
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.INBOX_CONVERSATION_STATUS_CHANGE,
      entityType: 'conversation',
      entityId: conversation.id,
      metadata: { from: conversation.status, to: input.status },
    });
    this.emitConversationUpdate(updated);
    return this.summaryOf(updated);
  }

  async setPriority(conversationId: string, input: ConversationPriorityInput, actor: AuthUser): Promise<ConversationSummaryDto> {
    const conversation = await this.accessService.getAccessibleConversation(conversationId, actor);
    const updated = assertConversationFound(
      await this.conversationsDao.update(conversation.id, { priority: input.priority }),
    );
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.INBOX_CONVERSATION_PRIORITY_CHANGE,
      entityType: 'conversation',
      entityId: conversation.id,
      metadata: { from: conversation.priority, to: input.priority },
    });
    this.emitConversationUpdate(updated);
    return this.summaryOf(updated);
  }

  async markRead(conversationId: string, actor: AuthUser): Promise<ConversationSummaryDto> {
    const conversation = await this.accessService.getAccessibleConversation(conversationId, actor);
    await this.conversationsDao.resetUnread(conversation.id);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.INBOX_CONVERSATION_MARK_READ,
      entityType: 'conversation',
      entityId: conversation.id,
    });
    const updated = assertConversationFound(await this.conversationsDao.findById(conversation.id));
    this.realtime.emitToConversation(
      {
        type: 'read',
        conversationId: conversation.id,
        payload: { conversationId: conversation.id },
        at: new Date().toISOString(),
      },
      { assignedUserId: conversation.assignedUserId },
    );
    return this.summaryOf(updated);
  }

  async markUnread(conversationId: string, actor: AuthUser): Promise<ConversationSummaryDto> {
    const conversation = await this.accessService.getAccessibleConversation(conversationId, actor);
    await this.conversationsDao.setUnread(conversation.id, 1);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.INBOX_CONVERSATION_MARK_UNREAD,
      entityType: 'conversation',
      entityId: conversation.id,
    });
    const updated = assertConversationFound(await this.conversationsDao.findById(conversation.id));
    this.emitConversationUpdate(updated);
    return this.summaryOf(updated);
  }

  async close(conversationId: string, actor: AuthUser): Promise<ConversationSummaryDto> {
    return this.setStatus(conversationId, { status: 'CLOSED' }, actor);
  }

  async reopen(conversationId: string, actor: AuthUser): Promise<ConversationSummaryDto> {
    return this.setStatus(conversationId, { status: 'OPEN' }, actor);
  }

  async updateTags(conversationId: string, input: ConversationTagsInput, actor: AuthUser): Promise<ConversationDetailDto> {
    const conversation = await this.accessService.getAccessibleConversation(conversationId, actor);
    const tags = await this.tagsDao.findActiveByIds(input.tagIds);
    if (tags.length !== input.tagIds.length) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    for (const tag of tags) {
      await this.db
        .insert(contactTags)
        .values({ contactId: conversation.contactId, tagId: tag.id } as never)
        .onConflictDoNothing();
    }
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.INBOX_CONVERSATION_TAGS_ADD,
      entityType: 'conversation',
      entityId: conversation.id,
      metadata: { tagIds: input.tagIds },
    });
    return this.getDetail(conversationId, actor);
  }

  async createNote(conversationId: string, input: CreateInternalNoteInput, actor: AuthUser): Promise<InternalNoteDto> {
    const conversation = await this.accessService.getAccessibleConversation(conversationId, actor);
    const row = await this.internalNotesDao.insert({
      conversationId: conversation.id,
      userId: actor.id,
      content: input.content,
    } as never);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.INBOX_NOTE_CREATE,
      entityType: 'conversation',
      entityId: conversation.id,
    });
    this.realtime.emitToConversation(
      {
        type: 'note',
        conversationId: conversation.id,
        payload: { note: toInternalNoteDto({ ...row, userName: actor.name }) },
        at: new Date().toISOString(),
      },
      { assignedUserId: conversation.assignedUserId },
    );
    return toInternalNoteDto({ ...row, userName: actor.name });
  }

  async updateNote(conversationId: string, noteId: string, input: UpdateInternalNoteInput, actor: AuthUser): Promise<InternalNoteDto> {
    const conversation = await this.accessService.getAccessibleConversation(conversationId, actor);
    const note = assertNote(await this.internalNotesDao.findById(noteId));
    if (note.conversationId !== conversationId) {
      throw new NotFoundException(ERROR_CODES.INBOX_NOT_FOUND);
    }
    if (note.userId !== actor.id && !canManageNotes(actor.role)) {
      throw new ForbiddenException(ERROR_CODES.INBOX_NOTE_NOT_EDITABLE);
    }
    const updated = assertNote(await this.internalNotesDao.update(note.id, input.content));
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.INBOX_NOTE_UPDATE,
      entityType: 'conversation',
      entityId: conversation.id,
    });
    return toInternalNoteDto({ ...updated, userName: actor.name });
  }

  async deleteNote(conversationId: string, noteId: string, actor: AuthUser): Promise<{ id: string }> {
    const conversation = await this.accessService.getAccessibleConversation(conversationId, actor);
    const note = assertNote(await this.internalNotesDao.findById(noteId));
    if (note.conversationId !== conversationId) {
      throw new NotFoundException(ERROR_CODES.INBOX_NOT_FOUND);
    }
    if (note.userId !== actor.id && !canManageNotes(actor.role)) {
      throw new ForbiddenException(ERROR_CODES.INBOX_NOTE_NOT_EDITABLE);
    }
    await this.internalNotesDao.softDelete(note.id);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.INBOX_NOTE_DELETE,
      entityType: 'conversation',
      entityId: conversation.id,
    });
    return { id: note.id };
  }

  // ---------- Quick replies ----------

  async listQuickReplies(query: import('@wa/shared').QuickReplyQuery, actor: AuthUser): Promise<PaginatedQuickReplies> {
    const { items, total } = await this.quickRepliesDao.list(query, actor.id);
    const totalPages = Math.ceil(total / query.pageSize);
    return { items: items.map(toQuickReplyDto), total, page: query.page, pageSize: query.pageSize, totalPages };
  }

  async createQuickReply(input: CreateQuickReplyInput, actor: AuthUser): Promise<QuickReplyDto> {
    const row = await this.quickRepliesDao.insert({
      title: input.title,
      content: input.content,
      language: input.language,
      category: input.category ?? null,
      visibility: input.visibility,
      createdByUserId: actor.id,
    } as never);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.INBOX_QUICK_REPLY_CREATE,
      entityType: 'quick_reply',
      entityId: row.id,
    });
    return toQuickReplyDto(row);
  }

  async updateQuickReply(quickReplyId: string, input: UpdateQuickReplyInput, actor: AuthUser): Promise<QuickReplyDto> {
    const row = assertQuickReply(await this.quickRepliesDao.findById(quickReplyId));
    if (row.createdByUserId !== actor.id && !canEditQuickReplies(actor.role)) {
      throw new ForbiddenException(ERROR_CODES.INBOX_QUICK_REPLY_NOT_EDITABLE);
    }
    if (row.visibility === 'TEAM' && input.visibility === 'PERSONAL' && row.createdByUserId !== actor.id && !canEditQuickReplies(actor.role)) {
      throw new ForbiddenException(ERROR_CODES.INBOX_QUICK_REPLY_NOT_EDITABLE);
    }
    const patch: Partial<import('../../db/schema').QuickReplyRow> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.content !== undefined) patch.content = input.content;
    if (input.language !== undefined) patch.language = input.language;
    if (input.category !== undefined) patch.category = input.category;
    if (input.visibility !== undefined) patch.visibility = input.visibility;
    const updated = assertQuickReply(await this.quickRepliesDao.update(quickReplyId, patch));
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.INBOX_QUICK_REPLY_UPDATE,
      entityType: 'quick_reply',
      entityId: quickReplyId,
    });
    return toQuickReplyDto(updated);
  }

  async archiveQuickReply(quickReplyId: string, actor: AuthUser): Promise<QuickReplyDto> {
    const row = assertQuickReply(await this.quickRepliesDao.findById(quickReplyId));
    if (row.createdByUserId !== actor.id && !canEditQuickReplies(actor.role)) {
      throw new ForbiddenException(ERROR_CODES.INBOX_QUICK_REPLY_NOT_EDITABLE);
    }
    const updated = assertQuickReply(await this.quickRepliesDao.archive(quickReplyId));
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.INBOX_QUICK_REPLY_ARCHIVE,
      entityType: 'quick_reply',
      entityId: quickReplyId,
    });
    return toQuickReplyDto(updated);
  }

  async assignableUsers(): Promise<Array<{ id: string; name: string; email: string; role: string }>> {
    const rows = await this.usersDao.listActive();
    return rows.map((row) => ({ id: row.id, name: row.name, email: row.email, role: row.role }));
  }

  // ---------- Helpers ----------

  private async requireActiveUser(userId: string): Promise<UserRow> {
    const user = await this.usersDao.findById(userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new NotFoundException(ERROR_CODES.INBOX_NOT_FOUND);
    }
    return user;
  }

  private async enrichContact(contact: ContactRow): Promise<import('../contacts/contacts.mapper').EnrichedContact> {
    const [enriched] = await this.contactsDao.enrich([contact]);
    return enriched ?? { contact, tags: [], optInStatus: 'UNKNOWN', suppressed: false };
  }

  private contactView(enriched: import('../contacts/contacts.mapper').EnrichedContact): import('./inbox.mapper').ConversationContactView {
    return {
      id: enriched.contact.id,
      phoneE164: enriched.contact.phoneE164,
      firstName: enriched.contact.firstName ?? null,
      lastName: enriched.contact.lastName ?? null,
      displayName: enriched.contact.displayName ?? null,
      language: enriched.contact.language ?? null,
      status: enriched.contact.status,
      suppressed: enriched.suppressed,
      optInStatus: enriched.optInStatus,
    };
  }

  private async summaryOf(conversation: ConversationRow): Promise<ConversationSummaryDto> {
    const contact = assertContact(await this.contactsDao.findById(conversation.contactId));
    const enriched = await this.enrichContact(contact);
    const assignee = conversation.assignedUserId ? await this.usersDao.findById(conversation.assignedUserId) : undefined;
    return toConversationSummary(conversation, this.contactView(enriched), assignee?.name ?? null, null);
  }

  private emitConversationUpdate(conversation: ConversationRow): void {
    void this.summaryOf(conversation).then((summary) => {
      this.realtime.emitToConversation(
        {
          type: 'conversation',
          conversationId: conversation.id,
          payload: { conversation: summary },
          at: new Date().toISOString(),
        },
        { assignedUserId: conversation.assignedUserId },
      );
    });
  }
}

function assertContact(contact: ContactRow | undefined): ContactRow {
  if (!contact) {
    throw new NotFoundException(ERROR_CODES.INBOX_NOT_FOUND);
  }
  return contact;
}

function assertNote(note: import('../../db/schema').InternalNoteRow | undefined): import('../../db/schema').InternalNoteRow {
  if (!note) {
    throw new NotFoundException(ERROR_CODES.INBOX_NOT_FOUND);
  }
  return note;
}

function assertQuickReply(row: import('../../db/schema').QuickReplyRow | undefined): import('../../db/schema').QuickReplyRow {
  if (!row) {
    throw new NotFoundException(ERROR_CODES.INBOX_NOT_FOUND);
  }
  return row;
}
