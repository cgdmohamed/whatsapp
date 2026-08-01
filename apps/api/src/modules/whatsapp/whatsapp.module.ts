import { Module } from '@nestjs/common';

import { WhatsAppAccountsDao } from './whatsapp-accounts.dao';
import { WhatsAppPhoneNumbersDao } from './whatsapp-phone-numbers.dao';
import { WhatsAppCredentialsService } from './whatsapp-credentials.service';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { WebhookEventsDao } from './webhook/webhook-events.dao';
import { WebhookEventsService } from './webhook/webhook-events.service';
import { WebhookVerifierService } from './webhook/webhook-verifier.service';
import { WebhookProcessingService } from './webhook/webhook-processing.service';
import { WebhookProcessor } from './webhook/webhook.worker';
import { WebhookController } from './webhook/webhook.controller';
import { MessageTemplatesController } from './templates/message-templates.controller';
import { MessageTemplatesDao } from './templates/message-templates.dao';
import { MessageTemplatesService } from './templates/message-templates.service';
import { TemplateSyncWorker } from './templates/template-sync.worker';

@Module({
  controllers: [WhatsAppController, WebhookController, MessageTemplatesController],
  providers: [
    WhatsAppService,
    WhatsAppCredentialsService,
    WhatsAppAccountsDao,
    WhatsAppPhoneNumbersDao,
    WebhookEventsDao,
    WebhookEventsService,
    WebhookVerifierService,
    WebhookProcessingService,
    WebhookProcessor,
    MessageTemplatesDao,
    MessageTemplatesService,
    TemplateSyncWorker,
  ],
  exports: [WebhookEventsService, MessageTemplatesService, WhatsAppService, WhatsAppAccountsDao, WhatsAppPhoneNumbersDao, MessageTemplatesDao],
})
export class WhatsAppModule {}
