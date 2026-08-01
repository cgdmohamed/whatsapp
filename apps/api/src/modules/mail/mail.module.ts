import { Module } from '@nestjs/common';

import { MailAdminController } from './mail-admin.controller';
import { MailService } from './mail.service';
import { MailLogDao } from './mail-log.dao';
import { MailSettingsService } from './mail-settings.service';
import { EmailWorker } from './email.worker';
import { MailSummaryService } from './mail-summary.service';
import { MailSummaryScheduler } from './mail-summary.scheduler';

@Module({
  controllers: [MailAdminController],
  providers: [MailService, MailLogDao, MailSettingsService, EmailWorker, MailSummaryService, MailSummaryScheduler],
  exports: [MailService, MailSettingsService, MailLogDao],
})
export class MailModule {}
