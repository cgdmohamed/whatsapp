import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type {
  CreateMessageTemplateInput,
  MessageTemplateDto,
  MessageTemplateQuery,
  PaginatedMessageTemplates,
  TemplateCreateResultDto,
  TemplatePreviewDto,
  TemplatePreviewInput,
  TemplateSyncResultDto,
  TemplateSyncStatusDto,
} from '@wa/shared';
import { AUDIT_ACTIONS, createMessageTemplateSchema, messageTemplateQuerySchema, templatePreviewInputSchema } from '@wa/shared';

import { CurrentUser, Roles } from '../../../common/decorators';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { AuditService } from '../../../common/audit/audit.module';
import type { AuthUser } from '../../auth/auth.types';
import { MessageTemplatesService } from './message-templates.service';

@ApiTags('whatsapp')
@ApiBearerAuth()
@Controller('whatsapp/templates')
export class MessageTemplatesController {
  constructor(
    private readonly templatesService: MessageTemplatesService,
    private readonly auditService: AuditService,
  ) {}

  @Get('sync-status')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  getSyncStatus(): Promise<TemplateSyncStatusDto> {
    return this.templatesService.getSyncStatus();
  }

  @Get()
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  list(
    @Query(new ZodValidationPipe(messageTemplateQuerySchema)) query: MessageTemplateQuery,
    @CurrentUser() actor: AuthUser,
  ): Promise<PaginatedMessageTemplates> {
    return this.templatesService.list(query, actor);
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  detail(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<MessageTemplateDto> {
    return this.templatesService.getDetail(id, actor);
  }

  @Post('sync')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  async sync(@CurrentUser() actor: AuthUser): Promise<TemplateSyncResultDto> {
    const result = await this.templatesService.syncFromMeta();
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.TEMPLATE_SYNC,
      entityType: 'whatsapp-account',
      metadata: {
        totalFetched: result.totalFetched,
        inserted: result.inserted,
        updated: result.updated,
        blockedTemplates: result.blockedTemplates.length,
      },
    });
    return result;
  }

  @Post('preview')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  @HttpCode(HttpStatus.OK)
  preview(
    @Body(new ZodValidationPipe(templatePreviewInputSchema)) input: TemplatePreviewInput,
  ): Promise<TemplatePreviewDto> {
    return this.templatesService.preview(input);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  async create(
    @Body(new ZodValidationPipe(createMessageTemplateSchema)) input: CreateMessageTemplateInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<TemplateCreateResultDto> {
    const result = await this.templatesService.createTemplate(input);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.TEMPLATE_CREATE,
      entityType: 'message-template',
      metadata: {
        name: input.name,
        language: input.language,
        category: input.category,
        metaTemplateId: result.metaTemplateId,
      },
    });
    return result;
  }
}
