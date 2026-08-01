import { Injectable } from '@nestjs/common';
import type { AuditLogDto, AuditLogQuery, PaginatedAuditLogs } from '@wa/shared';

import { AuditLogsDao } from './audit-logs.dao';

@Injectable()
export class AuditLogsService {
  constructor(private readonly dao: AuditLogsDao) {}

  async list(query: AuditLogQuery): Promise<PaginatedAuditLogs> {
    const { items, total } = await this.dao.list(query);
    const totalPages = Math.ceil(total / query.pageSize);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages,
    };
  }

  exportAll(query: AuditLogQuery): Promise<AuditLogDto[]> {
    return this.dao.exportAll(query);
  }
}
