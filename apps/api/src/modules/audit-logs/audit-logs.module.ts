import { Module } from '@nestjs/common';

import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsDao } from './audit-logs.dao';
import { AuditLogsService } from './audit-logs.service';

@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogsDao, AuditLogsService],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}
