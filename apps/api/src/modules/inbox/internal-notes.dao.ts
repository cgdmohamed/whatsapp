import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { internalNotes, users, type InternalNoteRow, type NewInternalNote } from '../../db/schema';

const noteUser = alias(users, 'note_user');

export interface InternalNoteWithUser extends InternalNoteRow {
  userName: string;
}

@Injectable()
export class InternalNotesDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  insert(values: NewInternalNote): Promise<InternalNoteRow> {
    return this.db.insert(internalNotes).values(values).returning().then((rows) => rows[0]!);
  }

  findById(id: string): Promise<InternalNoteRow | undefined> {
    return this.db.query.internalNotes.findFirst({ where: eq(internalNotes.id, id) });
  }

  async update(id: string, content: string): Promise<InternalNoteRow | undefined> {
    const rows = await this.db
      .update(internalNotes)
      .set({ content, updatedAt: new Date() })
      .where(eq(internalNotes.id, id))
      .returning();
    return rows[0];
  }

  async softDelete(id: string): Promise<InternalNoteRow | undefined> {
    const rows = await this.db
      .update(internalNotes)
      .set({ deletedAt: new Date() })
      .where(and(eq(internalNotes.id, id), isNull(internalNotes.deletedAt)))
      .returning();
    return rows[0];
  }

  async listForConversation(conversationId: string): Promise<InternalNoteWithUser[]> {
    const rows = await this.db
      .select({ note: internalNotes, userName: noteUser.name })
      .from(internalNotes)
      .innerJoin(noteUser, eq(internalNotes.userId, noteUser.id))
      .where(and(eq(internalNotes.conversationId, conversationId), isNull(internalNotes.deletedAt)))
      .orderBy(desc(internalNotes.createdAt));
    return rows.map((row) => ({ ...row.note, userName: row.userName }));
  }
}
