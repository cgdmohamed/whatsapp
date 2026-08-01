import { Injectable } from '@nestjs/common';

import { SettingsService } from '../settings/settings.service';
import type { AuthUser } from '../auth/auth.types';
import type { ConversationRow } from '../../db/schema';
import { ConversationsDao } from './conversations.dao';
import {
  assertCanSend,
  assertConversationAccess,
  assertConversationFound,
  canViewConversation,
  canSendToConversation,
  isPrivileged,
} from './inbox.permissions';

@Injectable()
export class InboxAccessService {
  constructor(
    private readonly conversationsDao: ConversationsDao,
    private readonly settingsService: SettingsService,
  ) {}

  async canViewUnassigned(role: AuthUser['role']): Promise<boolean> {
    if (isPrivileged(role)) {
      return true;
    }
    const settings = await this.settingsService.getAll();
    return settings.agentsCanViewUnassignedConversations;
  }

  async getAccessibleConversation(conversationId: string, actor: AuthUser): Promise<ConversationRow> {
    const conversation = assertConversationFound(await this.conversationsDao.findById(conversationId));
    const canViewUnassigned = await this.canViewUnassigned(actor.role);
    assertConversationAccess(actor.role, conversation, actor.id, canViewUnassigned);
    return conversation;
  }

  async assertSendPermission(conversation: ConversationRow, actor: AuthUser): Promise<void> {
    assertCanSend(actor.role, conversation, actor.id);
  }

  async canSend(conversation: ConversationRow, actor: AuthUser): Promise<boolean> {
    return canSendToConversation(actor.role, conversation, actor.id);
  }

  async canView(conversation: ConversationRow, actor: AuthUser): Promise<boolean> {
    const canViewUnassigned = await this.canViewUnassigned(actor.role);
    return canViewConversation(actor.role, conversation, actor.id, canViewUnassigned);
  }
}
