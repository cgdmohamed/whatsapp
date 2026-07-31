import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike, isNull, not, or, type SQL } from 'drizzle-orm';
import type { ContactListQuery, ContactListDto } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { contactListMembers, contactLists, type ContactListRow } from '../../db/schema';
import { toListSummary } from './contacts.mapper';

export interface ContactListResult {
  items: ContactListDto[];
  total: number;
}

@Injectable()
export class ContactListsDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  async list(query: ContactListQuery): Promise<ContactListResult> {
    const conditions: SQL[] = [isNull(contactLists.archivedAt)];
    if (query.search) {
      const term = `%${query.search}%`;
      conditions.push(or(ilike(contactLists.name, term), ilike(contactLists.description, term))!);
    }
    if (query.type) {
      conditions.push(eq(contactLists.type, query.type));
    }
    const where = and(...conditions);

    const rows = await this.db
      .select()
      .from(contactLists)
      .where(where)
      .orderBy(desc(contactLists.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const [totalRow] = await this.db.select({ value: count() }).from(contactLists).where(where);

    const items = rows.map(toListDto);
    return { items, total: totalRow?.value ?? 0 };
  }

  findById(id: string): Promise<ContactListRow | undefined> {
    return this.db.query.contactLists.findFirst({ where: eq(contactLists.id, id) });
  }

  findActiveById(id: string): Promise<ContactListRow | undefined> {
    return this.db.query.contactLists.findFirst({ where: and(eq(contactLists.id, id), isNull(contactLists.archivedAt)) });
  }

  findActiveByIds(ids: string[]): Promise<ContactListRow[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.db
      .select()
      .from(contactLists)
      .where(and(...ids.map((id) => eq(contactLists.id, id)), isNull(contactLists.archivedAt)));
  }

  async nameExists(name: string, excludeId?: string): Promise<boolean> {
    const conditions: SQL[] = [eq(contactLists.name, name)];
    if (excludeId) {
      conditions.push(not(eq(contactLists.id, excludeId)));
    }
    const [row] = await this.db.select({ value: count() }).from(contactLists).where(and(...conditions));
    return (row?.value ?? 0) > 0;
  }

  findByName(name: string): Promise<ContactListRow | undefined> {
    return this.db.query.contactLists.findFirst({ where: and(eq(contactLists.name, name), isNull(contactLists.archivedAt)) });
  }

  insert(values: { name: string; description?: string | null; type: 'STATIC' | 'FILTERED'; createdByUserId?: string | null }): Promise<ContactListRow[]> {
    return this.db.insert(contactLists).values(values).returning();
  }

  update(id: string, values: Partial<ContactListRow>): Promise<ContactListRow[]> {
    return this.db.update(contactLists).set(values).where(eq(contactLists.id, id)).returning();
  }

  async memberIds(listId: string): Promise<string[]> {
    const rows = await this.db
      .select({ contactId: contactListMembers.contactId })
      .from(contactListMembers)
      .where(eq(contactListMembers.contactListId, listId));
    return rows.map((row) => row.contactId);
  }

  async addMembers(listId: string, contactIds: string[], addedByUserId: string | null): Promise<void> {
    if (contactIds.length === 0) {
      return;
    }
    const existing = await this.memberIds(listId);
    const existingSet = new Set(existing);
    const toInsert = contactIds
      .filter((contactId) => !existingSet.has(contactId))
      .map((contactId) => ({ contactListId: listId, contactId, addedByUserId }));
    if (toInsert.length > 0) {
      await this.db.insert(contactListMembers).values(toInsert).onConflictDoNothing();
    }
  }

  async removeMembers(listId: string, contactIds: string[]): Promise<void> {
    if (contactIds.length === 0) {
      return;
    }
    await this.db
      .delete(contactListMembers)
      .where(and(eq(contactListMembers.contactListId, listId), ...contactIds.map((id) => eq(contactListMembers.contactId, id))));
  }

  async refreshCount(listId: string): Promise<void> {
    const [row] = await this.db
      .select({ value: count() })
      .from(contactListMembers)
      .where(eq(contactListMembers.contactListId, listId));
    await this.db
      .update(contactLists)
      .set({ activeContactCount: row?.value ?? 0 })
      .where(eq(contactLists.id, listId));
  }
}

function toListDto(row: ContactListRow): ContactListDto {
  return {
    ...toListSummary(row),
    description: row.description,
    activeContactCount: row.activeContactCount,
    createdByUserId: row.createdByUserId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
  };
}
