import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { webhookEventsQuerySchema, type PaginatedWebhookEvents, type WebhookEventDetailDto, type WebhookEventsQuery } from '@wa/shared';

import { Roles } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { WebhookEventsService } from '../whatsapp/webhook/webhook-events.service';

@ApiTags('integration-logs')
@Controller('integration-logs')
export class IntegrationLogsController {
  constructor(private readonly webhookEventsService: WebhookEventsService) {}

  @ApiBearerAuth()
  @Get('webhooks')
  @Roles('ADMIN')
  list(
    @Query(new ZodValidationPipe(webhookEventsQuerySchema)) query: WebhookEventsQuery,
  ): Promise<PaginatedWebhookEvents> {
    return this.webhookEventsService.list(query);
  }

  @ApiBearerAuth()
  @Get('webhooks/:id')
  @Roles('ADMIN')
  detail(@Param('id') id: string): Promise<WebhookEventDetailDto> {
    return this.webhookEventsService.detail(id);
  }
}
