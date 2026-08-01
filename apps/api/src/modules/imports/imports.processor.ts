import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { ImportOptions, ImportableField } from '@wa/shared';
import { AUDIT_ACTIONS } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { AuditService } from '../../common/audit/audit.module';
import { NotificationsService } from '../notifications/notifications.service';
import { ContactsDao } from '../contacts/contacts.dao';
import { ContactListsDao } from '../contacts/lists.dao';
import { TagsDao } from '../contacts/tags.dao';
import { ImportsDao } from './imports.dao';
import { ImportStorage } from './imports.storage';
import { parseFile } from './imports.parser';
import { validateImport, type ImportCandidate, type ValidationResult } from './imports.validator';
import {
  contactListMembers,
  contactTags,
  contacts,
  importRows,
  optInRecords,
  suppressionEntries,
  tags,
} from '../../db/schema';

const BATCH_SIZE = 500;

export interface ImportRunResult {
  createdRows: number;
  updatedRows: number;
  skippedRows: number;
  duplicateRows: number;
  invalidRows: number;
  errorRows: number;
}

type RowStatus = 'CREATED' | 'UPDATED' | 'SKIPPED' | 'DUPLICATE';

function resultKeyFor(status: RowStatus): keyof ImportRunResult {
  switch (status) {
    case 'CREATED':
      return 'createdRows';
    case 'UPDATED':
      return 'updatedRows';
    case 'DUPLICATE':
      return 'duplicateRows';
    case 'SKIPPED':
      return 'skippedRows';
  }
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

@Injectable()
export class ImportsProcessor {
  constructor(
    private readonly importsDao: ImportsDao,
    private readonly contactsDao: ContactsDao,
    private readonly tagsDao: TagsDao,
    private readonly listsDao: ContactListsDao,
    private readonly storage: ImportStorage,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    @Inject(DATABASE) private readonly db: DrizzleDB,
  ) {}

  async run(jobId: string): Promise<ImportRunResult> {
    const job = await this.importsDao.findById(jobId);
    if (!job) {
      throw new Error('JOB_NOT_FOUND');
    }
    if (job.status !== 'VALIDATING' && job.status !== 'PROCESSING' && job.status !== 'FAILED') {
      throw new Error('INVALID_JOB_STATE');
    }

    const options = (job.options ?? {}) as ImportOptions;
    const columnMapping = (job.columnMapping ?? {}) as Record<string, ImportableField>;

    await this.importsDao.update(jobId, { status: 'PROCESSING', startedAt: new Date() });

    const buffer = this.storage.read(jobId);
    const parsed = parseFile(buffer, job.fileType, (job.options as { sheetName?: string } | null)?.sheetName);

    let validation: ValidationResult;
    try {
      validation = validateImport(parsed, columnMapping, options);
    } catch (error) {
      await this.fail(jobId, error);
      throw error;
    }

    const result = await this.processCandidates(jobId, validation, options);
    await this.finalize(jobId, validation, result);
    return result;
  }

  private async processCandidates(jobId: string, validation: ValidationResult, options: ImportOptions): Promise<ImportRunResult> {
    const result: ImportRunResult = {
      createdRows: 0,
      updatedRows: 0,
      skippedRows: 0,
      duplicateRows: 0,
      invalidRows: validation.invalidCount,
      errorRows: 0,
    };

    const validCandidates = validation.candidates.filter((candidate) => candidate.errors.length === 0);
    const tagNameCache = new Map<string, string>();
    const listNameCache = new Map<string, string>();

    for (let offset = 0; offset < validCandidates.length; offset += BATCH_SIZE) {
      const chunk = validCandidates.slice(offset, offset + BATCH_SIZE);
      const outcomeUpdates: Array<{ rowNumber: number; status: RowStatus; contactId: string | null; errorMessages: string[] }> = [];

      await this.db.transaction(async (tx) => {
        for (const candidate of chunk) {
          const outcome = await this.applyCandidate(
            tx,
            candidate,
            options,
            tagNameCache,
            listNameCache,
          );
          result[resultKeyFor(outcome.status)] += 1;
          outcomeUpdates.push({
            rowNumber: candidate.rowNumber,
            status: outcome.status,
            contactId: outcome.contactId,
            errorMessages: outcome.errorMessages,
          });
        }

        await tx.insert(importRows).values(
          chunk.map((candidate) => ({
            importJobId: jobId,
            rowNumber: candidate.rowNumber,
            rawData: candidate.rawData,
            normalizedPhone: candidate.normalizedPhone,
          })),
        );

        for (const update of outcomeUpdates) {
          await tx
            .update(importRows)
            .set({
              status: update.status,
              contactId: update.contactId,
              errorMessages: update.errorMessages,
            })
            .where(and(eq(importRows.importJobId, jobId), eq(importRows.rowNumber, update.rowNumber)));
        }
      });
    }

    return result;
  }

  private async applyCandidate(
    tx: DrizzleDB,
    candidate: ImportCandidate,
    options: ImportOptions,
    tagNameCache: Map<string, string>,
    listNameCache: Map<string, string>,
  ): Promise<{ status: RowStatus; contactId: string | null; errorMessages: string[] }> {
    if (!candidate.normalizedPhone) {
      return { status: 'SKIPPED', contactId: null, errorMessages: ['NO_PHONE'] };
    }

    const existing = await this.contactsDao.findByPhone(candidate.normalizedPhone);
    if (existing) {
      if (options.updateMode === 'none') {
        return { status: options.skipDuplicates ? 'SKIPPED' : 'DUPLICATE', contactId: existing.id, errorMessages: [] };
      }
      await this.applyUpdate(tx, existing.id, candidate, options, tagNameCache, listNameCache);
      return { status: 'UPDATED', contactId: existing.id, errorMessages: [] };
    }

    const suppressed = await this.hasActiveSuppressionByPhone(this.db, candidate.normalizedPhone);
    const insertValues: Partial<typeof contacts.$inferInsert> & { phoneE164: string } = {
      phoneE164: candidate.normalizedPhone,
      phoneCountry: null,
      firstName: candidate.fields.firstName ?? null,
      lastName: candidate.fields.lastName ?? null,
      displayName: candidate.fields.displayName ?? null,
      email: candidate.fields.email ?? null,
      company: candidate.fields.company ?? null,
      language: candidate.fields.language as never,
      source: candidate.fields.source ?? 'IMPORT',
    };

    const [row] = await tx.insert(contacts).values(insertValues).returning();
    if (!row) {
      return { status: 'SKIPPED', contactId: null, errorMessages: ['INSERT_FAILED'] };
    }

    await this.applyOptIn(tx, row.id, candidate, suppressed);
    await this.applyTags(tx, row.id, candidate.tags, options.tagIds, tagNameCache);
    await this.applyList(tx, row.id, candidate.list, options.listId, listNameCache);

    return { status: 'CREATED', contactId: row.id, errorMessages: [] };
  }

  private async applyUpdate(
    tx: DrizzleDB,
    contactId: string,
    candidate: ImportCandidate,
    options: ImportOptions,
    tagNameCache: Map<string, string>,
    listNameCache: Map<string, string>,
  ): Promise<void> {
    const current = await this.contactsDao.findById(contactId);
    if (!current) {
      return;
    }

    const patch: Record<string, string | null> = {};
    const fields: Array<[keyof typeof contacts.$inferSelect, string | null | undefined]> = [
      ['firstName', candidate.fields.firstName],
      ['lastName', candidate.fields.lastName],
      ['displayName', candidate.fields.displayName],
      ['email', candidate.fields.email],
      ['company', candidate.fields.company],
      ['language', candidate.fields.language],
      ['source', candidate.fields.source],
    ];

    for (const [key, value] of fields) {
      if (value === undefined) {
        continue;
      }
      if (options.updateMode === 'merge-empty') {
        if (value !== null && value.trim() !== '') {
          patch[key] = value;
        }
      } else {
        patch[key] = value ?? null;
      }
    }

    if (Object.keys(patch).length > 0) {
      await tx.update(contacts).set(patch as Partial<typeof contacts.$inferInsert>).where(eq(contacts.id, contactId));
    }

    const suppressed = await this.hasActiveSuppressionByPhone(this.db, current.phoneE164);
    await this.applyOptIn(tx, contactId, candidate, suppressed);
    await this.applyTags(tx, contactId, candidate.tags, options.tagIds, tagNameCache);
    await this.applyList(tx, contactId, candidate.list, options.listId, listNameCache);
  }

  private async applyOptIn(tx: DrizzleDB, contactId: string, candidate: ImportCandidate, suppressed: boolean): Promise<void> {
    if (suppressed) {
      await tx.insert(optInRecords).values({
        contactId,
        status: 'OPTED_OUT',
        source: 'suppression',
        obtainedAt: new Date(),
      });
      return;
    }
    if (!candidate.optInStatus) {
      return;
    }
    await tx.insert(optInRecords).values({
      contactId,
      status: candidate.optInStatus,
      source: candidate.optInSource ?? 'import',
      obtainedAt: candidate.optInDate ?? new Date(),
    });
  }

  private async applyTags(
    tx: DrizzleDB,
    contactId: string,
    tagNames: string[],
    optionTagIds: string[] | undefined,
    tagNameCache: Map<string, string>,
  ): Promise<void> {
    const resolvedTagIds = new Set<string>();
    for (const name of tagNames) {
      const slug = slugify(name);
      let tagId = tagNameCache.get(slug);
      if (!tagId) {
        const existing = await this.tagsDao.findBySlug(slug);
        if (existing) {
          tagId = existing.id;
        } else {
          const [created] = await tx.insert(tags).values({ name, slug }).returning();
          tagId = created?.id;
        }
        if (tagId) {
          tagNameCache.set(slug, tagId);
        }
      }
      if (tagId) {
        resolvedTagIds.add(tagId);
      }
    }
    for (const tagId of optionTagIds ?? []) {
      resolvedTagIds.add(tagId);
    }
    if (resolvedTagIds.size > 0) {
      await tx
        .insert(contactTags)
        .values([...resolvedTagIds].map((tagId) => ({ contactId, tagId })))
        .onConflictDoNothing();
    }
  }

  private async applyList(
    tx: DrizzleDB,
    contactId: string,
    listName: string | null,
    optionListId: string | undefined,
    listNameCache: Map<string, string>,
  ): Promise<void> {
    let listId = optionListId ?? null;
    if (!listId && listName) {
      const cached = listNameCache.get(listName);
      if (cached) {
        listId = cached;
      } else {
        const existing = await this.listsDao.findByName(listName);
        listId = existing?.id ?? null;
        if (listId) {
          listNameCache.set(listName, listId);
        }
      }
    }
    if (listId) {
      await tx
        .insert(contactListMembers)
        .values({ contactListId: listId, contactId, addedByUserId: null })
        .onConflictDoNothing();
      await this.listsDao.refreshCount(listId);
    }
  }

  private async finalize(jobId: string, validation: ValidationResult, result: ImportRunResult): Promise<void> {
    const job = await this.importsDao.findById(jobId);
    await this.importsDao.update(jobId, {
      status: 'COMPLETED',
      completedAt: new Date(),
      totalRows: validation.candidates.length,
      validRows: validation.validCount,
      invalidRows: validation.invalidCount,
      createdRows: result.createdRows,
      updatedRows: result.updatedRows,
      skippedRows: result.skippedRows,
      duplicateRows: result.duplicateRows,
      errorRows: result.errorRows,
    });

    const rejected = validation.candidates.filter((candidate) => candidate.errors.length > 0);
    if (rejected.length > 0) {
      const reasonHeaders = [...new Set(rejected.flatMap((candidate) => candidate.errors))];
      const lines = [
        `rowNumber,phone,${reasonHeaders.join(',')}`,
        ...rejected.map((candidate) => `${candidate.rowNumber},${candidate.phone ?? ''},${candidate.errors.join(',')}`),
      ];
      this.storage.saveRejectedCsv(jobId, `${lines.join('\r\n')}\r\n`);
    }

    await this.auditService.record({
      actorUserId: job?.createdByUserId,
      action: AUDIT_ACTIONS.IMPORT_COMPLETED,
      entityType: 'import_job',
      entityId: jobId,
      metadata: {
        totalRows: validation.candidates.length,
        createdRows: result.createdRows,
        updatedRows: result.updatedRows,
        skippedRows: result.skippedRows,
        duplicateRows: result.duplicateRows,
        invalidRows: result.invalidRows,
      },
    });

    if (job?.createdByUserId) {
      await this.notificationsService.notifyTargets({
        userIds: [job.createdByUserId],
        type: 'IMPORT',
        severity: 'SUCCESS',
        titleAr: 'اكتمل الاستيراد',
        titleEn: 'Import completed',
        messageAr: `اكتمل استيراد ${validation.candidates.length} صف، منها ${result.invalidRows} مرفوض.`,
        messageEn: `Import of ${validation.candidates.length} rows finished, ${result.invalidRows} rejected.`,
        actionUrl: '/imports',
        entityType: 'import_job',
        entityId: jobId,
        category: 'import',
        email: {
          templateKey: 'import-completed',
          vars: {
            fileName: job.originalFilename,
            created: result.createdRows,
            updated: result.updatedRows,
            rejected: result.invalidRows,
          },
        },
      });
    }

    this.storage.removeUpload(jobId);
  }

  private async fail(jobId: string, error: unknown): Promise<void> {
    const job = await this.importsDao.findById(jobId);
    const reason = error instanceof Error ? error.message : String(error);
    await this.importsDao.update(jobId, {
      status: 'FAILED',
      completedAt: new Date(),
      errorRows: 1,
    });
    await this.auditService.record({
      actorUserId: job?.createdByUserId,
      action: AUDIT_ACTIONS.IMPORT_COMPLETED,
      entityType: 'import_job',
      entityId: jobId,
      metadata: { failed: true, error: reason },
    });
    if (job?.createdByUserId) {
      await this.notificationsService.notifyTargets({
        userIds: [job.createdByUserId],
        type: 'IMPORT',
        severity: 'ERROR',
        titleAr: 'فشل الاستيراد',
        titleEn: 'Import failed',
        messageAr: 'فشل معالجة ملف الاستيراد.',
        messageEn: 'The import file failed to process.',
        actionUrl: '/imports',
        entityType: 'import_job',
        entityId: jobId,
        category: 'import',
        email: {
          templateKey: 'import-failed',
          vars: { fileName: job.originalFilename, reason: reason.slice(0, 300) },
        },
      });
    }
  }

  private async hasActiveSuppressionByPhone(db: DrizzleDB, e164: string): Promise<boolean> {
    const rows = await db
      .select({ id: suppressionEntries.id })
      .from(suppressionEntries)
      .where(and(eq(suppressionEntries.phoneE164, e164), isNull(suppressionEntries.removedAt)))
      .limit(1);
    return rows.length > 0;
  }
}
