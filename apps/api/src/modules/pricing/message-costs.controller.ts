import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AUDIT_ACTIONS,
  messageCostEstimateInputSchema,
  type CampaignCostSummary,
  type ConversationCostSummary,
  type MessageCostDto,
  type MessageCostEstimate,
  type MessageCostEstimateInput,
} from '@wa/shared';
import { z } from 'zod';

import { CurrentUser, Roles } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditService } from '../../common/audit/audit.module';
import type { AuthUser } from '../auth/auth.types';
import { CostResolverService } from './cost-resolver.service';
import { MessageCostsDao, toMessageCostDto } from './message-costs.dao';

const adjustCostSchema = z.object({
  amount: z.coerce.number().min(0),
  reason: z.string().trim().min(3).max(1000),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
});
type AdjustCostInput = z.infer<typeof adjustCostSchema>;

@ApiTags('pricing')
@ApiBearerAuth()
@Controller('admin/whatsapp-pricing')
export class MessageCostsController {
  constructor(
    private readonly costsDao: MessageCostsDao,
    private readonly resolver: CostResolverService,
    private readonly auditService: AuditService,
  ) {}

  @Post('estimate')
  @Roles('ADMIN', 'MANAGER')
  estimate(@Body(new ZodValidationPipe(messageCostEstimateInputSchema)) input: MessageCostEstimateInput): Promise<MessageCostEstimate> {
    return this.resolver.estimate(input);
  }

  @Get('costs/:id')
  @Roles('ADMIN', 'MANAGER')
  async get(@Param('id') id: string): Promise<{ cost: MessageCostDto; events: unknown[] }> {
    const row = await this.costsDao.findById(id);
    if (!row) {
      throw new NotFoundException('NOT_FOUND');
    }
    return {
      cost: toMessageCostDto(row),
      events: row.events,
    };
  }

  @Get('costs/campaign/:campaignId')
  @Roles('ADMIN', 'MANAGER')
  async campaignCosts(@Param('campaignId') campaignId: string): Promise<{ summary: CampaignCostSummary; items: MessageCostDto[] }> {
    const [summary, rows] = await Promise.all([this.costsDao.campaignSummary(campaignId), this.costsDao.listByCampaign(campaignId)]);
    return { summary, items: rows.map(toMessageCostDto) };
  }

  @Get('costs/conversation/:conversationId')
  @Roles('ADMIN', 'MANAGER')
  async conversationCosts(@Param('conversationId') conversationId: string): Promise<{ summary: ConversationCostSummary; items: MessageCostDto[] }> {
    const [summary, rows] = await Promise.all([this.costsDao.conversationSummary(conversationId), this.costsDao.listByConversation(conversationId)]);
    return { summary, items: rows.map(toMessageCostDto) };
  }

  @Post('costs/:id/adjust')
  @Roles('ADMIN')
  async adjust(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adjustCostSchema)) input: AdjustCostInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<MessageCostDto> {
    const updated = await this.resolver.adjust(id, input.amount, input.reason, actor.id, input.currency);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.COST_MANUAL_OVERRIDE,
      entityType: 'message_cost',
      entityId: id,
      metadata: { amount: input.amount, reason: input.reason, currency: input.currency },
    });
    return updated;
  }
}
