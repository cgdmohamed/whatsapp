import { Module } from '@nestjs/common';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ExportsDao } from './exports-dao';
import { ExportsProcessor } from './exports.processor';
import { ExportsService } from './exports.service';
import { ReportsController } from './reports.controller';
import { ReportsDao } from './reports-dao';
import { ReportsService } from './reports.service';

@Module({
  imports: [AuditLogsModule],
  controllers: [ReportsController],
  providers: [ReportsDao, ReportsService, ExportsDao, ExportsService, ExportsProcessor],
  exports: [ReportsService, ExportsService],
})
export class ReportsModule {}
