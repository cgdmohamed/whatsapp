import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { auditLogQuerySchema, type AuditLogQuery, type PaginatedAuditLogs } from '@wa/shared';

import { Roles } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditLogsService } from './audit-logs.service';

@ApiTags('audit-logs')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @Roles('ADMIN')
  list(@Query(new ZodValidationPipe(auditLogQuerySchema)) query: AuditLogQuery): Promise<PaginatedAuditLogs> {
    return this.auditLogsService.list(query);
  }
}
