import { Module } from '@nestjs/common';

import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { IntegrationLogsController } from './integration-logs.controller';

@Module({
  imports: [WhatsAppModule],
  controllers: [IntegrationLogsController],
})
export class IntegrationLogsModule {}
