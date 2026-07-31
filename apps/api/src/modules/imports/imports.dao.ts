import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import type { ImportJobQuery, ImportJobDto, ImportRowDto } from '@wa/shared';
import { IMPORT_JOB_STATUSES } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { importJobs, importRows, type ImportJobRow, type ImportRowRow } from '../../db/schema';

export interface ImportJobListResult {
  items: ImportJobDto[];
  total: number;
}

export function toImportJobDto(row: ImportJobRow): ImportJobDto {
  return {
    id: row.id,
    originalFilename: row.originalFilename,
    fileType: row.fileType,
    status: row.status,
    totalRows: row.totalRows,
    validRows: row.validRows,
    invalidRows: row.invalidRows,
    createdRows: row.createdRows,
    updatedRows: row.updatedRows,
    skippedRows: row.skippedRows,
    duplicateRows: row.duplicateRows,
    errorRows: row.errorRows,
    createdByUserId: row.createdByUserId,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    hasRejectedRows: row.invalidRows + row.errorRows > 0,
  };
}

export function toImportRowDto(row: ImportRowRow): ImportRowDto {
  return {
    id: row.id,
    importJobId: row.importJobId,
    rowNumber: row.rowNumber,
    rawData: row.rawData,
    normalizedPhone: row.normalizedPhone,
    status: row.status,
    contactId: row.contactId ?? null,
    errorMessages: row.errorMessages,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class ImportsDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  async list(query: ImportJobQuery): Promise<ImportJobListResult> {
    const conditions: SQL[] = [];
    if (query.status) {
      conditions.push(eq(importJobs.status, query.status));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db
      .select()
      .from(importJobs)
      .where(where)
      .orderBy(desc(importJobs.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const [totalRow] = await this.db.select({ value: count() }).from(importJobs).where(where);
    return { items: rows.map(toImportJobDto), total: totalRow?.value ?? 0 };
  }

  findById(id: string): Promise<ImportJobRow | undefined> {
    return this.db.query.importJobs.findFirst({ where: eq(importJobs.id, id) });
  }

  insert(values: Omit<typeof importJobs.$inferInsert, 'id'>): Promise<ImportJobRow[]> {
    return this.db.insert(importJobs).values(values).returning();
  }

  update(id: string, values: Partial<ImportJobRow>): Promise<ImportJobRow[]> {
    return this.db.update(importJobs).set(values).where(eq(importJobs.id, id)).returning();
  }

  async rowsForJob(jobId: string, limit = 5000): Promise<ImportRowRow[]> {
    return this.db.select().from(importRows).where(eq(importRows.importJobId, jobId)).orderBy(importRows.rowNumber).limit(limit);
  }

  insertRows(values: Array<Omit<typeof importRows.$inferInsert, 'id' | 'createdAt'>>): Promise<void> {
    if (values.length === 0) {
      return Promise.resolve();
    }
    return this.db.insert(importRows).values(values).then(() => undefined);
  }

  async countRowsByStatus(jobId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ status: importRows.status, value: count() })
      .from(importRows)
      .where(eq(importRows.importJobId, jobId))
      .groupBy(importRows.status);
    return new Map(rows.map((row) => [row.status, row.value]));
  }

  async statusCounts(): Promise<Record<(typeof IMPORT_JOB_STATUSES)[number], number>> {
    const rows = await this.db
      .select({ status: importJobs.status, value: count() })
      .from(importJobs)
      .groupBy(importJobs.status);
    const result = {} as Record<(typeof IMPORT_JOB_STATUSES)[number], number>;
    for (const status of IMPORT_JOB_STATUSES) {
      result[status] = 0;
    }
    for (const row of rows) {
      result[row.status as (typeof IMPORT_JOB_STATUSES)[number]] = row.value;
    }
    return result;
  }
}
