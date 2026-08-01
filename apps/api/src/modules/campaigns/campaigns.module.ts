import { Module } from '@nestjs/common';

import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AudienceService } from './audience.service';
import { CampaignDispatchService } from './campaign-dispatch.service';
import { CampaignProcessor } from './campaign-processor';
import { CampaignRecipientsDao } from './campaign-recipients.dao';
import { CampaignStatusService } from './campaign-status.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsDao } from './campaigns.dao';
import { CampaignsService } from './campaigns.service';
import {
  CampaignMetricsWorker,
  CampaignRecipientBuilderWorker,
  CampaignSchedulerWorker,
  WhatsappMessageSendWorker,
  WhatsappStatusReconciliationWorker,
} from './campaign-workers';
import { MessagesDao } from '../inbox/messages.dao';

@Module({
  imports: [WhatsAppModule, NotificationsModule],
  controllers: [CampaignsController],
  providers: [
    CampaignsDao,
    CampaignRecipientsDao,
    MessagesDao,
    AudienceService,
    CampaignsService,
    CampaignDispatchService,
    CampaignProcessor,
    CampaignStatusService,
    CampaignSchedulerWorker,
    CampaignRecipientBuilderWorker,
    WhatsappMessageSendWorker,
    CampaignMetricsWorker,
    WhatsappStatusReconciliationWorker,
  ],
  exports: [CampaignsService],
})
export class CampaignsModule {}