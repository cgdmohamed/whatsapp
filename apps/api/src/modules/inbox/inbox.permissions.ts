import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { ERROR_CODES } from '../../common/errors';
import type { Role } from '@wa/shared';
import type { ConversationRow } from '../../db/schema';

export function isPrivileged(role: Role): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}

export function canAssign(role: Role): boolean {
  return isPrivileged(role);
}

export function canManageTeamResources(role: Role): boolean {
  return isPrivileged(role);
}

export function canManageNotes(role: Role): boolean {
  return isPrivileged(role);
}

export function canEditQuickReplies(role: Role): boolean {
  return isPrivileged(role);
}

export function canRetryMessages(role: Role): boolean {
  return isPrivileged(role);
}

export function canViewUnassignedConversations(role: Role, setting: boolean): boolean {
  return isPrivileged(role) || setting;
}

export function canViewConversation(role: Role, conversation: ConversationRow, viewerUserId: string, canViewUnassigned: boolean): boolean {
  if (isPrivileged(role)) {
    return true;
  }
  if (conversation.assignedUserId === viewerUserId) {
    return true;
  }
  return canViewUnassigned && conversation.assignedUserId === null;
}

export function canSendToConversation(role: Role, conversation: ConversationRow, actorUserId: string): boolean {
  if (isPrivileged(role)) {
    return true;
  }
  return conversation.assignedUserId === actorUserId;
}

export function assertConversationFound(conversation: ConversationRow | undefined): ConversationRow {
  if (!conversation) {
    throw new NotFoundException(ERROR_CODES.INBOX_NOT_FOUND);
  }
  return conversation;
}

export function assertConversationAccess(
  role: Role,
  conversation: ConversationRow,
  viewerUserId: string,
  canViewUnassigned: boolean,
): void {
  if (!canViewConversation(role, conversation, viewerUserId, canViewUnassigned)) {
    throw new ForbiddenException(ERROR_CODES.INBOX_ACCESS_DENIED);
  }
}

export function assertCanSend(role: Role, conversation: ConversationRow, actorUserId: string): void {
  if (!canSendToConversation(role, conversation, actorUserId)) {
    throw new ForbiddenException(ERROR_CODES.INBOX_ACCESS_DENIED);
  }
}
