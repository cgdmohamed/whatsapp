import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, ilike, lte, or, type SQL } from 'drizzle-orm';
import type { AuditLogDto, AuditLogQuery } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { auditLogs, users, type AuditLogRow } from '../../db/schema';

export interface AuditLogListResult {
  items: AuditLogDto[];
  total: number;
}

function buildConditions(query: AuditLogQuery): SQL[] {
  const conditions: SQL[] = [];
  if (query.action) {
    conditions.push(eq(auditLogs.action, query.action));
  }
  if (query.entityType) {
    conditions.push(ilike(auditLogs.entityType, `%${query.entityType}%`));
  }
  if (query.actorUserId) {
    conditions.push(eq(auditLogs.actorUserId, query.actorUserId));
  }
  if (query.from) {
    const from = new Date(query.from);
    if (!Number.isNaN(from.getTime())) {
      conditions.push(gte(auditLogs.createdAt, from));
    }
  }
  if (query.to) {
    const to = new Date(query.to);
    if (!Number.isNaN(to.getTime())) {
      to.setUTCHours(23, 59, 59, 999);
      conditions.push(lte(auditLogs.createdAt, to));
    }
  }
  if (query.search) {
    const term = `%${query.search}%`;
    const search = or(
      ilike(auditLogs.action, term),
      ilike(auditLogs.entityType, term),
      ilike(auditLogs.entityId, term),
      ilike(auditLogs.ipAddress, term),
    );
    if (search) {
      conditions.push(search);
    }
  }
  return conditions;
}

export function toAuditLogDto(row: AuditLogRow & { actorName: string | null }): AuditLogDto {
  return {
    id: row.id,
    actorUserId: row.actorUserId ?? null,
    actorName: row.actorName ?? null,
    action: row.action,
    entityType: row.entityType ?? null,
    entityId: row.entityId ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    ipAddress: row.ipAddress ?? null,
    userAgent: row.userAgent ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class AuditLogsDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  async list(query: AuditLogQuery): Promise<AuditLogListResult> {
    const conditions = buildConditions(query);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db
      .select({ log: auditLogs, actorName: users.name })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const totalRows = await this.db.select({ value: count() }).from(auditLogs).where(where);

    const items = rows.map((row) =>
      toAuditLogDto({
        ...row.log,
        actorName: row.actorName,
      }),
    );

    return { items, total: totalRows[0]?.value ?? 0 };
  }

  async exportAll(query: AuditLogQuery): Promise<AuditLogDto[]> {
    const conditions = buildConditions(query);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db
      .select({ log: auditLogs, actorName: users.name })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(50000);

    return rows.map((row) =>
      toAuditLogDto({
        ...row.log,
        actorName: row.actorName,
      }),
    );
  }
}
