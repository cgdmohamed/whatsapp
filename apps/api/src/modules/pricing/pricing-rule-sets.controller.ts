import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  AUDIT_ACTIONS,
  pricingRuleQuerySchema,
  pricingRuleSetCreateSchema,
  pricingRuleSetUpdateSchema,
  type PricingCoverage,
  type PricingImportPreview,
  type PricingRuleQuery,
  type PricingRuleSetCreateInput,
  type PricingRuleSetDto,
  type PricingRuleSetUpdateInput,
} from '@wa/shared';

import { CurrentUser, Roles } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditService } from '../../common/audit/audit.module';
import type { AuthUser } from '../auth/auth.types';
import { PricingRuleSetsService, type UploadedFileLike } from './pricing-rule-sets.service';

@ApiTags('pricing')
@ApiBearerAuth()
@Controller('admin/whatsapp-pricing')
export class PricingRuleSetsController {
  constructor(
    private readonly service: PricingRuleSetsService,
    private readonly auditService: AuditService,
  ) {}

  @Get('rule-sets')
  @Roles('ADMIN')
  list(@Query(new ZodValidationPipe(pricingRuleQuerySchema)) query: PricingRuleQuery): Promise<{ items: PricingRuleSetDto[]; total: number }> {
    return this.service.list(query);
  }

  @Get('rule-sets/:id')
  @Roles('ADMIN')
  get(@Param('id') id: string): Promise<PricingRuleSetDto> {
    return this.service.get(id);
  }

  @Post('rule-sets')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(pricingRuleSetCreateSchema)) input: PricingRuleSetCreateInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<PricingRuleSetDto> {
    const created = await this.service.create(input, actor.id);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.PRICING_RULE_SET_CREATE,
      entityType: 'pricing_rule_set',
      entityId: created.id,
      metadata: { name: created.name, currency: created.currency, version: created.version },
    });
    return created;
  }

  @Patch('rule-sets/:id')
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(pricingRuleSetUpdateSchema)) input: PricingRuleSetUpdateInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<PricingRuleSetDto> {
    const updated = await this.service.update(id, input);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.PRICING_RULE_SET_UPDATE,
      entityType: 'pricing_rule_set',
      entityId: updated.id,
      metadata: { name: updated.name },
    });
    return updated;
  }

  @Post('rule-sets/:id/duplicate')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async duplicate(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<PricingRuleSetDto> {
    const created = await this.service.duplicate(id, actor.id);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.PRICING_RULE_SET_DUPLICATE,
      entityType: 'pricing_rule_set',
      entityId: created.id,
      metadata: { sourceId: id, name: created.name },
    });
    return created;
  }

  @Post('rule-sets/:id/validate')
  @Roles('ADMIN')
  async validate(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<PricingRuleSetDto> {
    const validated = await this.service.validate(id);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.PRICING_RULE_SET_VALIDATE,
      entityType: 'pricing_rule_set',
      entityId: id,
      metadata: { name: validated.name },
    });
    return validated;
  }

  @Post('rule-sets/:id/activate')
  @Roles('ADMIN')
  async activate(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<PricingRuleSetDto> {
    const activated = await this.service.activate(id, actor.id);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.PRICING_RULE_SET_ACTIVATE,
      entityType: 'pricing_rule_set',
      entityId: activated.id,
      metadata: { name: activated.name, version: activated.version },
    });
    return activated;
  }

  @Post('rule-sets/:id/archive')
  @Roles('ADMIN')
  async archive(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<PricingRuleSetDto> {
    const archived = await this.service.archive(id);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.PRICING_RULE_SET_ARCHIVE,
      entityType: 'pricing_rule_set',
      entityId: archived.id,
      metadata: { name: archived.name },
    });
    return archived;
  }

  @Post('rule-sets/import-preview')
  @Roles('ADMIN')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async importPreview(
    @UploadedFile() file: UploadedFileLike,
    @CurrentUser() actor: AuthUser,
  ): Promise<PricingImportPreview> {
    const preview = await this.service.importPreview(file);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.PRICING_IMPORT_PREVIEW,
      entityType: 'pricing_rule_set',
      metadata: { totalRows: preview.totalRows, validRows: preview.validRows, invalidRows: preview.invalidRows },
    });
    return preview;
  }

  @Post('rule-sets/import')
  @Roles('ADMIN')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  @HttpCode(HttpStatus.CREATED)
  async import(
    @UploadedFile() file: UploadedFileLike,
    @CurrentUser() actor: AuthUser,
  ): Promise<PricingRuleSetDto> {
    const created = await this.service.importCreate(file, actor.id);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.PRICING_IMPORT_CREATE,
      entityType: 'pricing_rule_set',
      entityId: created.id,
      metadata: { name: created.name, currency: created.currency },
    });
    return created;
  }

  @Get('coverage')
  @Roles('ADMIN')
  async coverage(@CurrentUser() actor: AuthUser): Promise<PricingCoverage> {
    const coverage = await this.service.coverage();
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.PRICING_COVERAGE,
      entityType: 'pricing_rule_set',
      metadata: { activeRuleSetId: coverage.activeRuleSetId },
    });
    return coverage;
  }
}
