import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type {
  BulkContactActionInput,
  ConsentMutationInput,
  ContactDetailDto,
  ContactDto,
  ContactListDto,
  ContactQuery,
  CreateContactInput,
  IdListInput,
  PaginatedContacts,
  SuppressionMutationInput,
  TagDto,
  UpdateContactInput,
} from '@wa/shared';
import { AUDIT_ACTIONS } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { ERROR_CODES } from '../../common/errors';
import { AuditService } from '../../common/audit/audit.module';
import type { AuthUser } from '../auth/auth.types';
import { ContactsDao } from './contacts.dao';
import { ContactListsDao } from './lists.dao';
import { TagsDao } from './tags.dao';
import { toContactDetailDto, toContactDto, toTagSummary } from './contacts.mapper';
import { AGENT_EDITABLE_FIELDS, assertCan } from './contacts.permissions';
import { DEFAULT_IMPORT_COUNTRY, normalizePhone } from './phone/phone-normalizer';
import {
  auditLogs,
  contactTags,
  contactListMembers,
  contactLists,
  contacts,
  optInRecords,
  suppressionEntries,
  tags,
  users,
} from '../../db/schema';

const {
  CONTACT_ARCHIVE,
  CONTACT_BULK,
  CONTACT_CONSENT_UPDATE,
  CONTACT_CREATE,
  CONTACT_DELETE,
  CONTACT_LISTS_ADD,
  CONTACT_LISTS_REMOVE,
  CONTACT_RESTORE,
  CONTACT_SUPPRESS,
  CONTACT_TAGS_ADD,
  CONTACT_TAGS_REMOVE,
  CONTACT_UNSUPPRESS,
  CONTACT_UPDATE,
  TAG_CREATE,
  TAG_UPDATE,
  TAG_ARCHIVE,
  LIST_CREATE,
  LIST_UPDATE,
  LIST_ARCHIVE,
  LIST_MEMBERS_ADD,
  LIST_MEMBERS_REMOVE,
} = AUDIT_ACTIONS;

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

@Injectable()
export class ContactsService {
  constructor(
    private readonly contactsDao: ContactsDao,
    private readonly tagsDao: TagsDao,
    private readonly listsDao: ContactListsDao,
    private readonly auditService: AuditService,
    @Inject(DATABASE) private readonly db: DrizzleDB,
  ) {}

  // ---------- Contacts ----------

  async list(query: ContactQuery, actor: AuthUser): Promise<PaginatedContacts> {
    assertCan(actor.role, 'contact.view');
    const { items, total } = await this.contactsDao.list(query);
    const totalPages = total === 0 ? 0 : Math.ceil(total / query.pageSize);
    return {
      items: items.map(toContactDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages,
    };
  }

  async get(id: string, actor: AuthUser): Promise<ContactDetailDto> {
    assertCan(actor.role, 'contact.view');
    const contact = await this.contactsDao.findById(id);
    if (!contact) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    const [enriched] = await this.contactsDao.enrich([contact]);
    if (!enriched) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    const [lists, consentHistory, suppressionEntriesForContact, importHistory] = await Promise.all([
      this.contactsDao.listsForContact(id),
      this.contactsDao.consentHistory(id),
      this.contactsDao.suppressionEntriesForContact(id),
      this.contactsDao.importHistory(id),
    ]);

    const auditRows = await this.db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        actorName: users.name,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(eq(auditLogs.entityType, 'contact'))
      .orderBy(auditLogs.createdAt)
      .limit(200);

    return toContactDetailDto(
      toContactDto(enriched),
      lists,
      consentHistory,
      suppressionEntriesForContact,
      importHistory.map((row) => ({
        importJobId: row.importJobId,
        fileName: row.fileName ?? '',
        status: row.status as ContactDetailDto['importHistory'][number]['status'],
        importedAt: row.importedAt.toISOString(),
      })),
      auditRows.map((row) => ({
        id: row.id,
        action: row.action,
        actorName: row.actorName ?? null,
        metadata: row.metadata as Record<string, unknown> | null,
        createdAt: row.createdAt.toISOString(),
      })),
    );
  }

  async create(input: CreateContactInput, actor: AuthUser): Promise<ContactDto> {
    assertCan(actor.role, 'contact.create');
    const defaultCountry = input.phoneCountry ?? DEFAULT_IMPORT_COUNTRY;
    const normalized = normalizePhone(input.phone, defaultCountry);
    if (!normalized.ok) {
      throw new BadRequestException(normalized.reason === 'EMPTY' ? ERROR_CODES.PHONE_INVALID : ERROR_CODES.PHONE_INVALID);
    }

    const existing = await this.contactsDao.findByPhone(normalized.e164);
    if (existing) {
      throw new ConflictException(ERROR_CODES.CONFLICT);
    }

    const suppressed = await this.hasActiveSuppressionByPhone(normalized.e164);

    const touchedListIds = new Set<string>();
    const created = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(contacts)
        .values({
          phoneE164: normalized.e164,
          phoneCountry: input.phoneCountry ? input.phoneCountry : normalized.country,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
          displayName: input.displayName ?? null,
          email: input.email || null,
          company: input.company ?? null,
          language: input.language ?? null,
          source: input.source ?? 'MANUAL',
        })
        .returning();
      if (!row) {
        throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
      }

      if (input.tagIds && input.tagIds.length > 0) {
        const validTags = await this.tagsDao.findActiveByIds(input.tagIds);
        if (validTags.length > 0) {
          await tx
            .insert(contactTags)
            .values(validTags.map((tag) => ({ contactId: row.id, tagId: tag.id })))
            .onConflictDoNothing();
        }
      }

      if (input.listIds && input.listIds.length > 0) {
        const validLists = await this.listsDao.findActiveByIds(input.listIds);
        if (validLists.length > 0) {
          await tx
            .insert(contactListMembers)
            .values(validLists.map((list) => ({ contactListId: list.id, contactId: row.id, addedByUserId: actor.id })))
            .onConflictDoNothing();
          for (const list of validLists) {
            touchedListIds.add(list.id);
          }
        }
      }

      let optInStatus = input.optInStatus;
      if (suppressed) {
        optInStatus = 'OPTED_OUT';
      }
      if (optInStatus) {
        await tx.insert(optInRecords).values({
          contactId: row.id,
          status: optInStatus,
          source: suppressed ? 'suppression' : (input.optInSource ?? 'manual'),
          obtainedAt: new Date(),
          createdByUserId: actor.id,
        });
      }

      await this.auditService.record({
        actorUserId: actor.id,
        action: CONTACT_CREATE,
        entityType: 'contact',
        entityId: row.id,
        metadata: { phone: normalized.e164, source: row.source },
      });
      return row;
    });

    for (const listId of touchedListIds) {
      await this.listsDao.refreshCount(listId);
    }

    const [enriched] = await this.contactsDao.enrich([created]);
    return toContactDto(enriched!);
  }

  async update(id: string, input: UpdateContactInput, actor: AuthUser): Promise<ContactDto> {
    assertCan(actor.role, 'contact.edit');
    const contact = await this.contactsDao.findById(id);
    if (!contact) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }

    if (actor.role === 'AGENT') {
      const forbidden = Object.keys(input).filter((key) => !(AGENT_EDITABLE_FIELDS as readonly string[]).includes(key));
      if (forbidden.length > 0) {
        throw new ForbiddenException(ERROR_CODES.FORBIDDEN);
      }
    }

    const patch: Partial<typeof contacts.$inferInsert> = {};

    if (input.phone !== undefined) {
      assertCan(actor.role, 'contact.edit.phone');
      const defaultCountry = input.phoneCountry ?? contact.phoneCountry ?? DEFAULT_IMPORT_COUNTRY;
      const normalized = normalizePhone(input.phone, defaultCountry);
      if (!normalized.ok) {
        throw new BadRequestException(ERROR_CODES.PHONE_INVALID);
      }
      if (normalized.e164 !== contact.phoneE164) {
        const existing = await this.contactsDao.findByPhone(normalized.e164);
        if (existing) {
          throw new ConflictException(ERROR_CODES.CONFLICT);
        }
        patch.phoneE164 = normalized.e164;
        patch.phoneCountry = input.phoneCountry ?? normalized.country;
      }
    }

    for (const field of ['firstName', 'lastName', 'displayName', 'email', 'company', 'source'] as const) {
      if (input[field] !== undefined) {
        patch[field] = (input[field] as string | null) || null;
      }
    }
    if (input.language !== undefined) {
      patch.language = input.language;
    }
    if (input.customFields !== undefined) {
      patch.customFields = input.customFields;
    }

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }

    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx.update(contacts).set(patch).where(eq(contacts.id, id)).returning();
      if (row) {
        await this.auditService.record({
          actorUserId: actor.id,
          action: CONTACT_UPDATE,
          entityType: 'contact',
          entityId: row.id,
          metadata: { fields: Object.keys(patch) },
        });
      }
      return row;
    });

    if (!updated) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    const [enriched] = await this.contactsDao.enrich([updated]);
    return toContactDto(enriched!);
  }

  async archive(id: string, actor: AuthUser): Promise<ContactDto> {
    assertCan(actor.role, 'contact.archive');
    const contact = await this.contactsDao.findById(id);
    if (!contact) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    if (contact.archivedAt) {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }
    const updated = await this.transitionArchive(id, new Date(), CONTACT_ARCHIVE, actor);
    const [enriched] = await this.contactsDao.enrich([updated]);
    return toContactDto(enriched!);
  }

  async restore(id: string, actor: AuthUser): Promise<ContactDto> {
    assertCan(actor.role, 'contact.restore');
    const contact = await this.contactsDao.findById(id);
    if (!contact) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    if (!contact.archivedAt) {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }
    const updated = await this.transitionArchive(id, null, CONTACT_RESTORE, actor);
    const [enriched] = await this.contactsDao.enrich([updated]);
    return toContactDto(enriched!);
  }

  private async transitionArchive(
    id: string,
    archivedAt: Date | null,
    action: string,
    actor: AuthUser,
  ): Promise<typeof contacts.$inferSelect> {
    const [row] = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(contacts)
        .set({ archivedAt, status: archivedAt ? 'ARCHIVED' : 'ACTIVE' })
        .where(eq(contacts.id, id))
        .returning();
      if (updated) {
        await this.auditService.record({
          actorUserId: actor.id,
          action: action as typeof CONTACT_ARCHIVE,
          entityType: 'contact',
          entityId: updated.id,
        });
      }
      return updated ? [updated] : [];
    });
    if (!row) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    return row;
  }

  // ---------- Tags on contacts ----------

  async addTags(contactId: string, input: IdListInput, actor: AuthUser): Promise<ContactDto> {
    assertCan(actor.role, 'contact.tags');
    const contact = await this.requireContact(contactId);
    const validTags = await this.tagsDao.findActiveByIds(input.ids);
    await this.db
      .insert(contactTags)
      .values(validTags.map((tag) => ({ contactId, tagId: tag.id })))
      .onConflictDoNothing();
    await this.auditService.record({
      actorUserId: actor.id,
      action: CONTACT_TAGS_ADD,
      entityType: 'contact',
      entityId: contactId,
      metadata: { tagIds: validTags.map((tag) => tag.id) },
    });
    return this.enrichSingle(contact.id);
  }

  async removeTags(contactId: string, input: IdListInput, actor: AuthUser): Promise<ContactDto> {
    assertCan(actor.role, 'contact.tags');
    await this.requireContact(contactId);
    await this.db
      .delete(contactTags)
      .where(and(eq(contactTags.contactId, contactId), ...input.ids.map((tagId) => eq(contactTags.tagId, tagId))));
    await this.auditService.record({
      actorUserId: actor.id,
      action: CONTACT_TAGS_REMOVE,
      entityType: 'contact',
      entityId: contactId,
      metadata: { tagIds: input.ids },
    });
    return this.enrichSingle(contactId);
  }

  async addToLists(contactId: string, input: IdListInput, actor: AuthUser): Promise<ContactDto> {
    assertCan(actor.role, 'contact.lists');
    await this.requireContact(contactId);
    const validLists = await this.listsDao.findActiveByIds(input.ids);
    await this.db
      .insert(contactListMembers)
      .values(validLists.map((list) => ({ contactListId: list.id, contactId, addedByUserId: actor.id })))
      .onConflictDoNothing();
    for (const list of validLists) {
      await this.listsDao.refreshCount(list.id);
    }
    await this.auditService.record({
      actorUserId: actor.id,
      action: CONTACT_LISTS_ADD,
      entityType: 'contact',
      entityId: contactId,
      metadata: { listIds: validLists.map((list) => list.id) },
    });
    return this.enrichSingle(contactId);
  }

  async removeFromLists(contactId: string, input: IdListInput, actor: AuthUser): Promise<ContactDto> {
    assertCan(actor.role, 'contact.lists');
    await this.requireContact(contactId);
    await this.db
      .delete(contactListMembers)
      .where(and(eq(contactListMembers.contactId, contactId), ...input.ids.map((listId) => eq(contactListMembers.contactListId, listId))));
    for (const listId of input.ids) {
      await this.listsDao.refreshCount(listId);
    }
    await this.auditService.record({
      actorUserId: actor.id,
      action: CONTACT_LISTS_REMOVE,
      entityType: 'contact',
      entityId: contactId,
      metadata: { listIds: input.ids },
    });
    return this.enrichSingle(contactId);
  }

  // ---------- Consent & suppression ----------

  async setConsent(contactId: string, input: ConsentMutationInput, actor: AuthUser): Promise<ContactDto> {
    assertCan(actor.role, 'contact.consent');
    await this.requireContact(contactId);

    const hasActiveSuppression = await this.contactsDao.hasActiveSuppression(contactId);
    const latestConsent = await this.contactsDao.latestConsent(contactId);

    const movingToOptIn = input.status === 'OPTED_IN';
    const conflictsWithSuppression = hasActiveSuppression || (latestConsent?.status === 'OPTED_OUT' && input.status === 'OPTED_IN');

    if (movingToOptIn && conflictsWithSuppression) {
      const override = input.override === true && actor.role === 'ADMIN' && Boolean(input.auditReason);
      if (!override) {
        throw new ForbiddenException(ERROR_CODES.SUPPRESSED_CONTACT);
      }
    }

    const obtainedAt = input.obtainedAt ? new Date(input.obtainedAt) : new Date();
    if (Number.isNaN(obtainedAt.getTime())) {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }

    await this.db.insert(optInRecords).values({
      contactId,
      status: input.status,
      source: input.source ?? null,
      consentText: input.consentText ?? null,
      allowedCategories: input.allowedCategories ?? null,
      proofReference: input.proofReference ?? null,
      obtainedAt,
      expiresAt,
      createdByUserId: actor.id,
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: CONTACT_CONSENT_UPDATE,
      entityType: 'contact',
      entityId: contactId,
      metadata: { status: input.status, override: input.override === true, auditReason: input.auditReason ?? null },
    });

    return this.enrichSingle(contactId);
  }

  async suppress(contactId: string, input: SuppressionMutationInput, actor: AuthUser): Promise<ContactDto> {
    assertCan(actor.role, 'contact.suppress');
    const contact = await this.requireContact(contactId);

    await this.db.transaction(async (tx) => {
      await tx.insert(suppressionEntries).values({
        contactId,
        phoneE164: contact.phoneE164,
        reason: input.reason,
        source: input.source ?? 'manual',
        createdByUserId: actor.id,
      });
      await tx.insert(optInRecords).values({
        contactId,
        status: 'OPTED_OUT',
        source: 'suppression',
        obtainedAt: new Date(),
        createdByUserId: actor.id,
      });
      await this.auditService.record({
        actorUserId: actor.id,
        action: CONTACT_SUPPRESS,
        entityType: 'contact',
        entityId: contactId,
        metadata: { reason: input.reason, auditReason: input.auditReason ?? null },
      });
    });

    return this.enrichSingle(contactId);
  }

  async unsuppress(contactId: string, actor: AuthUser): Promise<ContactDto> {
    assertCan(actor.role, 'contact.unsuppress');
    await this.requireContact(contactId);
    await this.db
      .update(suppressionEntries)
      .set({ removedAt: new Date(), removedByUserId: actor.id })
      .where(and(eq(suppressionEntries.contactId, contactId), isNull(suppressionEntries.removedAt)));
    await this.auditService.record({
      actorUserId: actor.id,
      action: CONTACT_UNSUPPRESS,
      entityType: 'contact',
      entityId: contactId,
    });
    return this.enrichSingle(contactId);
  }

  // ---------- Bulk actions ----------

  async bulk(input: BulkContactActionInput, actor: AuthUser): Promise<{ affected: number }> {
    const capabilityByAction = {
      'add-tags': 'contact.tags',
      'remove-tags': 'contact.tags',
      'add-list': 'contact.lists',
      'remove-list': 'contact.lists',
      archive: 'contact.archive',
      export: 'contact.export',
      'add-suppression': 'contact.suppress',
    } as const;
    assertCan(actor.role, capabilityByAction[input.action]);

    const existingContacts = await this.db
      .select({ id: contacts.id })
      .from(contacts)
      .where(inArray(contacts.id, input.contactIds));
    const found = new Set(existingContacts.map((row) => row.id));
    const contactIds = input.contactIds.filter((id) => found.has(id));

    if (contactIds.length === 0) {
      return { affected: 0 };
    }

    let affected = 0;
    let listIdToRefresh: string | null = null;
    await this.db.transaction(async (tx) => {
      switch (input.action) {
        case 'add-tags': {
          const validTags = await this.tagsDao.findActiveByIds(input.tagIds ?? []);
          if (validTags.length > 0) {
            await tx
              .insert(contactTags)
              .values(validTags.flatMap((tag) => contactIds.map((contactId) => ({ contactId, tagId: tag.id }))))
              .onConflictDoNothing();
            affected = contactIds.length;
          }
          break;
        }
        case 'remove-tags': {
          if (input.tagIds && input.tagIds.length > 0) {
            await tx
              .delete(contactTags)
              .where(and(inArray(contactTags.contactId, contactIds), inArray(contactTags.tagId, input.tagIds)));
            affected = contactIds.length;
          }
          break;
        }
        case 'add-list': {
          if (input.listId) {
            const list = await this.listsDao.findActiveById(input.listId);
            if (list) {
              await tx
                .insert(contactListMembers)
                .values(contactIds.map((contactId) => ({ contactListId: list.id, contactId, addedByUserId: actor.id })))
                .onConflictDoNothing();
              affected = contactIds.length;
              listIdToRefresh = list.id;
            }
          }
          break;
        }
        case 'remove-list': {
          if (input.listId) {
            await tx
              .delete(contactListMembers)
              .where(and(eq(contactListMembers.contactListId, input.listId), inArray(contactListMembers.contactId, contactIds)));
            affected = contactIds.length;
            listIdToRefresh = input.listId;
          }
          break;
        }
        case 'archive': {
          await tx.update(contacts).set({ archivedAt: new Date(), status: 'ARCHIVED' }).where(inArray(contacts.id, contactIds));
          affected = contactIds.length;
          break;
        }
        case 'export': {
          affected = contactIds.length;
          break;
        }
        case 'add-suppression': {
          const rows = await tx.select().from(contacts).where(inArray(contacts.id, contactIds));
          for (const row of rows) {
            await tx.insert(suppressionEntries).values({
              contactId: row.id,
              phoneE164: row.phoneE164,
              reason: input.reason ?? 'OPTED_OUT',
              source: 'bulk',
              createdByUserId: actor.id,
            });
            await tx.insert(optInRecords).values({
              contactId: row.id,
              status: 'OPTED_OUT',
              source: 'suppression',
              obtainedAt: new Date(),
              createdByUserId: actor.id,
            });
          }
          affected = rows.length;
          break;
        }
      }
    });

    if (listIdToRefresh) {
      await this.listsDao.refreshCount(listIdToRefresh);
    }

    await this.auditService.record({
      actorUserId: actor.id,
      action: CONTACT_BULK,
      entityType: 'contact',
      metadata: { action: input.action, affected, contactIds: input.contactIds },
    });

    return { affected };
  }

  // ---------- Delete ----------

  async remove(id: string, actor: AuthUser): Promise<{ affected: number }> {
    assertCan(actor.role, 'contact.delete');
    const contact = await this.requireContact(id);
    await this.deleteContacts([contact.id]);
    await this.auditService.record({
      actorUserId: actor.id,
      action: CONTACT_DELETE,
      entityType: 'contact',
      entityId: contact.id,
      metadata: { phone: contact.phoneE164 },
    });
    return { affected: 1 };
  }

  async bulkDelete(ids: string[], actor: AuthUser): Promise<{ affected: number }> {
    assertCan(actor.role, 'contact.delete');
    if (ids.length === 0) {
      return { affected: 0 };
    }
    const existing = await this.db
      .select({ id: contacts.id })
      .from(contacts)
      .where(inArray(contacts.id, ids));
    const contactIds = existing.map((row) => row.id);
    if (contactIds.length === 0) {
      return { affected: 0 };
    }
    await this.deleteContacts(contactIds);
    await this.auditService.record({
      actorUserId: actor.id,
      action: CONTACT_BULK,
      entityType: 'contact',
      metadata: { action: 'delete', affected: contactIds.length, contactIds: ids },
    });
    return { affected: contactIds.length };
  }

  private async deleteContacts(contactIds: string[]): Promise<void> {
    const listRows = await this.db
      .select({ listId: contactListMembers.contactListId })
      .from(contactListMembers)
      .where(inArray(contactListMembers.contactId, contactIds));

    await this.db.transaction(async (tx) => {
      await tx.delete(contacts).where(inArray(contacts.id, contactIds));
    });

    for (const listId of [...new Set(listRows.map((row) => row.listId))]) {
      await this.listsDao.refreshCount(listId);
    }
  }

  async exportCsv(query: ContactQuery, actor: AuthUser): Promise<ContactDto[]> {
    assertCan(actor.role, 'contact.export');
    const items = await this.contactsDao.exportAll(query);
    return items.map(toContactDto);
  }

  // ---------- Tags ----------

  async listTags(query: { page: number; pageSize: number; search?: string }, actor: AuthUser): Promise<{ items: TagDto[]; total: number; page: number; pageSize: number; totalPages: number }> {
    assertCan(actor.role, 'contact.view');
    const { items, total } = await this.tagsDao.list({ ...query });
    return { items, total, page: query.page, pageSize: query.pageSize, totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize) };
  }

  async createTag(input: { name: string; description?: string }, actor: AuthUser): Promise<TagDto> {
    assertCan(actor.role, 'tag.manage');
    const slug = slugify(input.name);
    if (!slug) {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }
    if ((await this.tagsDao.slugCount(slug)) > 0) {
      throw new ConflictException(ERROR_CODES.CONFLICT);
    }
    const [row] = await this.tagsDao.insert({ name: input.name.trim(), slug, description: input.description ?? null });
    if (!row) {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }
    await this.auditService.record({
      actorUserId: actor.id,
      action: TAG_CREATE,
      entityType: 'tag',
      entityId: row.id,
      metadata: { name: row.name, slug },
    });
    return this.toTagDto(row);
  }

  async updateTag(id: string, input: { name?: string; description?: string | null }, actor: AuthUser): Promise<TagDto> {
    assertCan(actor.role, 'tag.manage');
    const tag = await this.tagsDao.findById(id);
    if (!tag || tag.archivedAt) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    const patch: Partial<typeof tags.$inferInsert> = {};
    if (input.name !== undefined) {
      const slug = slugify(input.name);
      if (!slug) {
        throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
      }
      if ((await this.tagsDao.slugCount(slug, id)) > 0) {
        throw new ConflictException(ERROR_CODES.CONFLICT);
      }
      patch.name = input.name.trim();
      patch.slug = slug;
    }
    if (input.description !== undefined) {
      patch.description = input.description;
    }
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }
    const [row] = await this.tagsDao.update(id, patch);
    if (!row) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    await this.auditService.record({
      actorUserId: actor.id,
      action: TAG_UPDATE,
      entityType: 'tag',
      entityId: row.id,
      metadata: { fields: Object.keys(patch) },
    });
    return this.toTagDto(row);
  }

  async archiveTag(id: string, actor: AuthUser): Promise<TagDto> {
    assertCan(actor.role, 'tag.manage');
    const tag = await this.tagsDao.findById(id);
    if (!tag || tag.archivedAt) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    const [row] = await this.tagsDao.update(id, { archivedAt: new Date() });
    await this.db.delete(contactTags).where(eq(contactTags.tagId, id));
    await this.auditService.record({
      actorUserId: actor.id,
      action: TAG_ARCHIVE,
      entityType: 'tag',
      entityId: id,
    });
    return this.toTagDto(row!);
  }

  // ---------- Lists ----------

  async listLists(query: { page: number; pageSize: number; search?: string; type?: 'STATIC' | 'FILTERED' }, actor: AuthUser): Promise<{
    items: ContactListDto[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    assertCan(actor.role, 'contact.view');
    const { items, total } = await this.listsDao.list(query);
    return { items, total, page: query.page, pageSize: query.pageSize, totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize) };
  }

  async createList(input: { name: string; description?: string; type: 'STATIC' | 'FILTERED' }, actor: AuthUser): Promise<ContactListDto> {
    assertCan(actor.role, 'list.manage');
    if (await this.listsDao.nameExists(input.name.trim())) {
      throw new ConflictException(ERROR_CODES.CONFLICT);
    }
    const [row] = await this.listsDao.insert({
      name: input.name.trim(),
      description: input.description ?? null,
      type: input.type,
      createdByUserId: actor.id,
    });
    if (!row) {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }
    await this.auditService.record({
      actorUserId: actor.id,
      action: LIST_CREATE,
      entityType: 'contact_list',
      entityId: row.id,
      metadata: { name: row.name, type: row.type },
    });
    return this.toListDto(row);
  }

  async updateList(id: string, input: { name?: string; description?: string | null; type?: 'STATIC' | 'FILTERED' }, actor: AuthUser): Promise<ContactListDto> {
    assertCan(actor.role, 'list.manage');
    const list = await this.listsDao.findById(id);
    if (!list || list.archivedAt) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    if (input.name !== undefined && input.name.trim() !== list.name && (await this.listsDao.nameExists(input.name.trim()))) {
      throw new ConflictException(ERROR_CODES.CONFLICT);
    }
    const patch: Partial<typeof contactLists.$inferInsert> = {};
    if (input.name !== undefined) {
      patch.name = input.name.trim();
    }
    if (input.description !== undefined) {
      patch.description = input.description;
    }
    if (input.type !== undefined) {
      patch.type = input.type;
    }
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }
    const [row] = await this.listsDao.update(id, patch);
    if (!row) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    await this.auditService.record({
      actorUserId: actor.id,
      action: LIST_UPDATE,
      entityType: 'contact_list',
      entityId: row.id,
      metadata: { fields: Object.keys(patch) },
    });
    return this.toListDto(row);
  }

  async archiveList(id: string, actor: AuthUser): Promise<ContactListDto> {
    assertCan(actor.role, 'list.manage');
    const list = await this.listsDao.findById(id);
    if (!list || list.archivedAt) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    const [row] = await this.listsDao.update(id, { archivedAt: new Date() });
    await this.auditService.record({
      actorUserId: actor.id,
      action: LIST_ARCHIVE,
      entityType: 'contact_list',
      entityId: id,
    });
    return this.toListDto(row!);
  }

  async listMembers(listId: string, actor: AuthUser): Promise<ContactDto[]> {
    assertCan(actor.role, 'contact.view');
    const list = await this.listsDao.findById(listId);
    if (!list || list.archivedAt) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    const memberIds = await this.listsDao.memberIds(listId);
    if (memberIds.length === 0) {
      return [];
    }
    const rows = await this.db.select().from(contacts).where(inArray(contacts.id, memberIds));
    const enriched = await this.contactsDao.enrich(rows);
    return enriched.map(toContactDto);
  }

  async addListMembers(listId: string, input: IdListInput, actor: AuthUser): Promise<ContactDto[]> {
    assertCan(actor.role, 'list.manage');
    const list = await this.requireList(listId);
    await this.listsDao.addMembers(list.id, input.ids, actor.id);
    await this.listsDao.refreshCount(list.id);
    await this.auditService.record({
      actorUserId: actor.id,
      action: LIST_MEMBERS_ADD,
      entityType: 'contact_list',
      entityId: list.id,
      metadata: { count: input.ids.length },
    });
    return this.listMembers(listId, actor);
  }

  async removeListMembers(listId: string, input: IdListInput, actor: AuthUser): Promise<ContactDto[]> {
    assertCan(actor.role, 'list.manage');
    const list = await this.requireList(listId);
    await this.listsDao.removeMembers(list.id, input.ids);
    await this.listsDao.refreshCount(list.id);
    await this.auditService.record({
      actorUserId: actor.id,
      action: LIST_MEMBERS_REMOVE,
      entityType: 'contact_list',
      entityId: list.id,
      metadata: { count: input.ids.length },
    });
    return this.listMembers(listId, actor);
  }

  // ---------- Helpers ----------

  private async requireContact(contactId: string): Promise<typeof contacts.$inferSelect> {
    const contact = await this.contactsDao.findById(contactId);
    if (!contact) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    return contact;
  }

  private async requireList(listId: string): Promise<typeof contactLists.$inferSelect> {
    const list = await this.listsDao.findById(listId);
    if (!list || list.archivedAt) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    return list;
  }

  private async enrichSingle(contactId: string): Promise<ContactDto> {
    const contact = await this.requireContact(contactId);
    const [enriched] = await this.contactsDao.enrich([contact]);
    return toContactDto(enriched!);
  }

  private async hasActiveSuppressionByPhone(e164: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: suppressionEntries.id })
      .from(suppressionEntries)
      .where(and(eq(suppressionEntries.phoneE164, e164), isNull(suppressionEntries.removedAt)))
      .limit(1);
    return rows.length > 0;
  }

  private toTagDto(tag: typeof tags.$inferSelect): TagDto {
    return {
      ...toTagSummary(tag),
      description: tag.description,
      contactCount: 0,
      createdAt: tag.createdAt.toISOString(),
      updatedAt: tag.updatedAt.toISOString(),
      archivedAt: tag.archivedAt ? tag.archivedAt.toISOString() : null,
    };
  }

  private toListDto(list: typeof contactLists.$inferSelect): ContactListDto {
    return {
      id: list.id,
      name: list.name,
      description: list.description,
      type: list.type,
      activeContactCount: list.activeContactCount,
      createdByUserId: list.createdByUserId ?? null,
      createdAt: list.createdAt.toISOString(),
      updatedAt: list.updatedAt.toISOString(),
      archivedAt: list.archivedAt ? list.archivedAt.toISOString() : null,
    };
  }
}
