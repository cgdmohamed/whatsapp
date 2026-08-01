import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import {
  conversationAssignments,
  users,
  type ConversationAssignmentRow,
  type NewConversationAssignment,
} from '../../db/schema';

const fromUser = alias(users, 'from_user');
const toUser = alias(users, 'to_user');
const assignedByUser = alias(users, 'assigned_by_user');

export interface AssignmentWithNames extends ConversationAssignmentRow {
  fromUserName: string | null;
  toUserName: string | null;
  assignedByName: string | null;
}

@Injectable()
export class AssignmentsDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  insert(values: NewConversationAssignment): Promise<ConversationAssignmentRow> {
    return this.db.insert(conversationAssignments).values(values).returning().then((rows) => rows[0]!);
  }

  async listForConversation(conversationId: string): Promise<AssignmentWithNames[]> {
    const rows = await this.db
      .select({
        assignment: conversationAssignments,
        fromName: fromUser.name,
        toName: toUser.name,
        assignedByName: assignedByUser.name,
      })
      .from(conversationAssignments)
      .leftJoin(fromUser, eq(conversationAssignments.fromUserId, fromUser.id))
      .leftJoin(toUser, eq(conversationAssignments.toUserId, toUser.id))
      .leftJoin(assignedByUser, eq(conversationAssignments.assignedByUserId, assignedByUser.id))
      .where(eq(conversationAssignments.conversationId, conversationId))
      .orderBy(desc(conversationAssignments.createdAt));
    return rows.map((row) => ({
      ...row.assignment,
      fromUserName: row.fromName ?? null,
      toUserName: row.toName ?? null,
      assignedByName: row.assignedByName ?? null,
    }));
  }
}
