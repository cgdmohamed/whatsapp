import { Module } from '@nestjs/common';

import { MailModule } from '../mail/mail.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsDao } from './notifications.dao';
import { NotificationsRealtimeService } from './notifications-realtime.service';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [MailModule],
  controllers: [NotificationsController],
  providers: [NotificationsDao, NotificationsRealtimeService, NotificationsService],
  exports: [NotificationsService, NotificationsDao],
})
export class NotificationsModule {}
