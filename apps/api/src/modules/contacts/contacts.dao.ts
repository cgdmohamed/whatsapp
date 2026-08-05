import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, exists, gte, ilike, inArray, isNull, lte, not, or, sql, type SQL } from 'drizzle-orm';
import type { ContactQuery } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import {
  contactListMembers,
  contactLists,
  contactTags,
  contacts,
  importJobs,
  importRows,
  optInRecords,
  suppressionEntries,
  tags,
  type ContactRow,
  type OptInRecordRow,
  type SuppressionEntryRow,
  type TagRow,
} from '../../db/schema';
import type { EnrichedContact } from './contacts.mapper';

const SORT_COLUMNS = {
  createdAt: contacts.createdAt,
  updatedAt: contacts.updatedAt,
  displayName: contacts.displayName,
  phoneE164: contacts.phoneE164,
  lastInboundMessageAt: contacts.lastInboundMessageAt,
  lastOutboundMessageAt: contacts.lastOutboundMessageAt,
} as const;

export interface ContactListResult {
  items: EnrichedContact[];
  total: number;
}

function buildConditions(db: DrizzleDB, query: ContactQuery): SQL[] {
  const conditions: SQL[] = [];
  if (query.ids) {
    const idList = query.ids
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (idList.length > 0) {
      conditions.push(inArray(contacts.id, idList));
    }
  }
  if (query.search) {
    const term = `%${query.search}%`;
    const searchCondition = or(
      ilike(contacts.displayName, term),
      ilike(contacts.firstName, term),
      ilike(contacts.lastName, term),
      ilike(contacts.phoneE164, term),
      ilike(contacts.email, term),
      ilike(contacts.company, term),
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }
  if (query.status) {
    conditions.push(eq(contacts.status, query.status));
  }
  if (query.country) {
    conditions.push(eq(contacts.phoneCountry, query.country));
  }
  if (query.language) {
    conditions.push(eq(contacts.language, query.language));
  }
  if (query.source) {
    conditions.push(ilike(contacts.source, `%${query.source}%`));
  }
  if (query.tagId) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(contactTags)
          .where(and(eq(contactTags.contactId, contacts.id), eq(contactTags.tagId, query.tagId))),
      ),
    );
  }
  if (query.listId) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(contactListMembers)
          .where(and(eq(contactListMembers.contactId, contacts.id), eq(contactListMembers.contactListId, query.listId))),
      ),
    );
  }
  if (query.optInStatus) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(optInRecords)
          .where(
            and(
              eq(optInRecords.contactId, contacts.id),
              eq(optInRecords.status, query.optInStatus),
              eq(
                optInRecords.obtainedAt,
                db
                  .select({ latest: sql`max(${optInRecords.obtainedAt})` })
                  .from(optInRecords)
                  .where(eq(optInRecords.contactId, contacts.id)),
              ),
            ),
          ),
      ),
    );
  }
  if (query.suppressed === 'yes') {
    conditions.push(activeSuppressionCondition(db));
  } else if (query.suppressed === 'no') {
    conditions.push(not(activeSuppressionCondition(db)));
  }
  if (query.createdFrom) {
    const from = new Date(query.createdFrom);
    if (!Number.isNaN(from.getTime())) {
      conditions.push(gte(contacts.createdAt, from));
    }
  }
  if (query.createdTo) {
    const to = new Date(query.createdTo);
    if (!Number.isNaN(to.getTime())) {
      const end = new Date(to);
      end.setUTCHours(23, 59, 59, 999);
      conditions.push(lte(contacts.createdAt, end));
    }
  }
  if (query.messageFrom) {
    const from = new Date(query.messageFrom);
    if (!Number.isNaN(from.getTime())) {
      conditions.push(gte(sql`greatest(${contacts.lastInboundMessageAt}, ${contacts.lastOutboundMessageAt})`, from));
    }
  }
  if (query.messageTo) {
    const to = new Date(query.messageTo);
    if (!Number.isNaN(to.getTime())) {
      const end = new Date(to);
      end.setUTCHours(23, 59, 59, 999);
      conditions.push(lte(sql`greatest(${contacts.lastInboundMessageAt}, ${contacts.lastOutboundMessageAt})`, end));
    }
  }
  return conditions;
}

function activeSuppressionCondition(db: DrizzleDB): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(suppressionEntries)
      .where(and(eq(suppressionEntries.contactId, contacts.id), isNull(suppressionEntries.removedAt))),
  );
}

@Injectable()
export class ContactsDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  findById(id: string): Promise<ContactRow | undefined> {
    return this.db.query.contacts.findFirst({ where: eq(contacts.id, id) });
  }

  findByPhone(e164: string): Promise<ContactRow | undefined> {
    return this.db.query.contacts.findFirst({ where: eq(contacts.phoneE164, e164) });
  }

  insert(values: Partial<ContactRow> & { phoneE164: string }): Promise<ContactRow[]> {
    return this.db.insert(contacts).values(values).returning();
  }

  update(id: string, values: Partial<ContactRow>): Promise<ContactRow[]> {
    return this.db.update(contacts).set(values).where(eq(contacts.id, id)).returning();
  }

  async list(query: ContactQuery): Promise<ContactListResult> {
    const conditions = buildConditions(this.db, query);
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const orderColumn = SORT_COLUMNS[query.sortBy] ?? contacts.createdAt;
    const orderFn = query.sortOrder === 'asc' ? asc : desc;

    const rows = await this.db
      .select()
      .from(contacts)
      .where(where)
      .orderBy(orderFn(orderColumn))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const [totalRow] = await this.db.select({ value: count() }).from(contacts).where(where);

    const items = await this.enrich(rows);
    return { items, total: totalRow?.value ?? 0 };
  }

  async exportAll(query: ContactQuery): Promise<EnrichedContact[]> {
    const conditions = buildConditions(this.db, query);
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const orderColumn = SORT_COLUMNS[query.sortBy] ?? contacts.createdAt;
    const orderFn = query.sortOrder === 'asc' ? asc : desc;
    const rows = await this.db.select().from(contacts).where(where).orderBy(orderFn(orderColumn)).limit(10000);
    return this.enrich(rows);
  }

  async enrich(rows: ContactRow[]): Promise<EnrichedContact[]> {
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((row) => row.id);

    const tagRows = await this.db
      .select({ tag: tags, contactId: contactTags.contactId })
      .from(contactTags)
      .innerJoin(tags, and(eq(contactTags.tagId, tags.id), isNull(tags.archivedAt)))
      .where(inArray(contactTags.contactId, ids));

    const consentRows = await this.db
      .select()
      .from(optInRecords)
      .where(inArray(optInRecords.contactId, ids));

    const suppressionRows = await this.db
      .select()
      .from(suppressionEntries)
      .where(and(inArray(suppressionEntries.contactId, ids), isNull(suppressionEntries.removedAt)));

    const tagsByContact = new Map<string, TagRow[]>();
    for (const row of tagRows) {
      const list = tagsByContact.get(row.contactId) ?? [];
      list.push(row.tag);
      tagsByContact.set(row.contactId, list);
    }

    const latestConsentByContact = new Map<string, OptInRecordRow>();
    for (const record of consentRows) {
      const current = latestConsentByContact.get(record.contactId);
      if (
        !current ||
        record.obtainedAt.getTime() > current.obtainedAt.getTime() ||
        (record.obtainedAt.getTime() === current.obtainedAt.getTime() &&
          record.createdAt.getTime() > current.createdAt.getTime())
      ) {
        latestConsentByContact.set(record.contactId, record);
      }
    }

    const suppressedIds = new Set(suppressionRows.map((row) => row.contactId));

    return rows.map((contact) => ({
      contact,
      tags: tagsByContact.get(contact.id) ?? [],
      optInStatus: latestConsentByContact.get(contact.id)?.status ?? 'UNKNOWN',
      suppressed: suppressedIds.has(contact.id),
    }));
  }

  async tagsForContact(contactId: string): Promise<TagRow[]> {
    const rows = await this.db
      .select({ tag: tags })
      .from(contactTags)
      .innerJoin(tags, and(eq(contactTags.tagId, tags.id), isNull(tags.archivedAt)))
      .where(eq(contactTags.contactId, contactId));
    return rows.map((row) => row.tag);
  }

  async listsForContact(contactId: string): Promise<typeof contactLists.$inferSelect[]> {
    return this.db
      .select({ list: contactLists })
      .from(contactListMembers)
      .innerJoin(contactLists, and(eq(contactListMembers.contactListId, contactLists.id), isNull(contactLists.archivedAt)))
      .where(eq(contactListMembers.contactId, contactId))
      .then((rows) => rows.map((row) => row.list));
  }

  async consentHistory(contactId: string): Promise<OptInRecordRow[]> {
    return this.db
      .select()
      .from(optInRecords)
      .where(eq(optInRecords.contactId, contactId))
      .orderBy(desc(optInRecords.obtainedAt), desc(optInRecords.createdAt));
  }

  async latestConsent(contactId: string): Promise<OptInRecordRow | undefined> {
    const rows = await this.db
      .select()
      .from(optInRecords)
      .where(eq(optInRecords.contactId, contactId))
      .orderBy(desc(optInRecords.obtainedAt), desc(optInRecords.createdAt))
      .limit(1);
    return rows[0];
  }

  async suppressionEntriesForContact(contactId: string): Promise<SuppressionEntryRow[]> {
    return this.db
      .select()
      .from(suppressionEntries)
      .where(eq(suppressionEntries.contactId, contactId))
      .orderBy(desc(suppressionEntries.createdAt));
  }

  async hasActiveSuppression(contactId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: suppressionEntries.id })
      .from(suppressionEntries)
      .where(and(eq(suppressionEntries.contactId, contactId), isNull(suppressionEntries.removedAt)))
      .limit(1);
    return rows.length > 0;
  }

  async importHistory(contactId: string): Promise<ContactImportHistoryItem[]> {
    const rows = await this.db
      .select({
        importJobId: importRows.importJobId,
        fileName: importJobs.originalFilename,
        status: importRows.status,
        importedAt: importRows.createdAt,
      })
      .from(importRows)
      .innerJoin(importJobs, eq(importRows.importJobId, importJobs.id))
      .where(eq(importRows.contactId, contactId))
      .orderBy(desc(importRows.createdAt));
    return rows.map((row) => ({ ...row, fileName: row.fileName ?? null }));
  }
}

export interface ContactImportHistoryItem {
  importJobId: string;
  fileName: string | null;
  status: string;
  importedAt: Date;
}
