import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { ExportJobDto, ExportJobStatus, ExportJobType, ExportQuery } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { exportJobs, type ExportJobRow, type NewExportJob } from '../../db/schema';

export function toExportJobDto(row: ExportJobRow, downloadUrl: string | null): ExportJobDto {
  return {
    id: row.id,
    type: row.type,
    filters: (row.filters as Record<string, unknown> | null) ?? null,
    status: row.status,
    fileName: row.fileName ?? null,
    totalRows: row.totalRows,
    errorMessage: row.errorMessage ?? null,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    downloadCount: row.downloadCount,
    downloadUrl,
  };
}

@Injectable()
export class ExportsDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  insert(values: NewExportJob): Promise<ExportJobRow> {
    return this.db.insert(exportJobs).values(values).returning().then((rows) => rows[0]!);
  }

  findById(id: string): Promise<ExportJobRow | undefined> {
    return this.db.query.exportJobs.findFirst({ where: eq(exportJobs.id, id) });
  }

  async update(id: string, values: Partial<NewExportJob>): Promise<ExportJobRow | undefined> {
    const rows = await this.db.update(exportJobs).set(values).where(eq(exportJobs.id, id)).returning();
    return rows[0];
  }

  async list(query: ExportQuery, userId: string, isAdmin: boolean): Promise<{ items: ExportJobRow[]; total: number }> {
    const conditions = [isAdmin ? undefined : eq(exportJobs.createdByUserId, userId)];
    if (query.type) {
      conditions.push(eq(exportJobs.type, query.type));
    }
    if (query.status) {
      conditions.push(eq(exportJobs.status, query.status));
    }
    const where = and(...conditions);

    const rows = await this.db
      .select()
      .from(exportJobs)
      .where(where)
      .orderBy(desc(exportJobs.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const totalRows = await this.db.select({ value: count() }).from(exportJobs).where(where);
    return { items: rows, total: totalRows[0]?.value ?? 0 };
  }

  async markStarted(id: string): Promise<void> {
    await this.db.update(exportJobs).set({ status: 'RUNNING', startedAt: new Date() }).where(eq(exportJobs.id, id));
  }

  async markCompleted(id: string, fileName: string, totalRows: number): Promise<void> {
    await this.db
      .update(exportJobs)
      .set({ status: 'COMPLETED', fileName, totalRows, completedAt: new Date() })
      .where(eq(exportJobs.id, id));
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await this.db
      .update(exportJobs)
      .set({ status: 'FAILED', errorMessage, completedAt: new Date() })
      .where(eq(exportJobs.id, id));
  }

  async incrementDownload(id: string): Promise<void> {
    await this.db
      .update(exportJobs)
      .set({ downloadCount: sql`${exportJobs.downloadCount} + 1` })
      .where(eq(exportJobs.id, id));
  }
}

export type { ExportJobRow, ExportJobStatus, ExportJobType };
