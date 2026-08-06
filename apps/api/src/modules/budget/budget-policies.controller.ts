import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AUDIT_ACTIONS,
  budgetPolicyCreateSchema,
  budgetPolicyQuerySchema,
  budgetPolicyUpdateSchema,
  budgetOverrideInputSchema,
  type BudgetOverrideInput,
  type BudgetPolicyCreateInput,
  type BudgetPolicyDto,
  type BudgetPolicyList,
  type BudgetPolicyQuery,
  type BudgetPolicyUpdateInput,
  type BudgetUsage,
} from '@wa/shared';
import { z } from 'zod';

import { CurrentUser, Roles } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditService } from '../../common/audit/audit.module';
import type { AuthUser } from '../auth/auth.types';
import { BudgetPoliciesDao, toBudgetPolicyDto } from './budget-policies.dao';
import { BudgetService } from './budget.service';

const hardStopCheckSchema = z.object({
  scopeType: z.enum(['GLOBAL', 'WHATSAPP_PHONE_NUMBER', 'CAMPAIGN', 'USER']),
  scopeId: z.string().uuid().nullable().optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'INVALID_CURRENCY_CODE'),
  additionalCost: z.coerce.number().min(0),
});
type HardStopCheckInput = z.infer<typeof hardStopCheckSchema>;

@ApiTags('budgets')
@ApiBearerAuth()
@Controller('admin/budgets')
export class BudgetPoliciesController {
  constructor(
    private readonly dao: BudgetPoliciesDao,
    private readonly service: BudgetService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @Roles('ADMIN')
  list(@Query(new ZodValidationPipe(budgetPolicyQuerySchema)) query: BudgetPolicyQuery): Promise<BudgetPolicyList> {
    return this.dao.list(query);
  }

  @Post()
  @Roles('ADMIN')
  async create(
    @Body(new ZodValidationPipe(budgetPolicyCreateSchema)) input: BudgetPolicyCreateInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<BudgetPolicyDto> {
    const row = await this.dao.create({
      name: input.name,
      scopeType: input.scopeType,
      scopeId: input.scopeId ?? null,
      currency: input.currency,
      periodType: input.periodType,
      amountLimit: String(input.amountLimit),
      warningThresholdPercentage: input.warningThresholdPercentage,
      criticalThresholdPercentage: input.criticalThresholdPercentage,
      hardStopEnabled: input.hardStopEnabled,
      allowAdminOverride: input.allowAdminOverride,
      effectiveFrom: new Date(input.effectiveFrom),
      effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
      createdByUserId: actor.id,
    });
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.BUDGET_CREATE,
      entityType: 'budget_policy',
      entityId: row.id,
      metadata: { scopeType: row.scopeType, periodType: row.periodType, currency: row.currency },
    });
    return toBudgetPolicyDto(row);
  }

  @Get(':id')
  @Roles('ADMIN')
  async get(@Param('id') id: string): Promise<BudgetPolicyDto> {
    const row = await this.dao.findById(id);
    if (!row) {
      throw new NotFoundException('NOT_FOUND');
    }
    return toBudgetPolicyDto(row);
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(budgetPolicyUpdateSchema)) input: BudgetPolicyUpdateInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<BudgetPolicyDto> {
    const existing = await this.dao.findById(id);
    if (!existing) {
      throw new NotFoundException('NOT_FOUND');
    }
    const values: Record<string, unknown> = {};
    if (input.name !== undefined) {
      values.name = input.name;
    }
    if (input.amountLimit !== undefined) {
      values.amountLimit = String(input.amountLimit);
    }
    if (input.warningThresholdPercentage !== undefined) {
      values.warningThresholdPercentage = input.warningThresholdPercentage;
    }
    if (input.criticalThresholdPercentage !== undefined) {
      values.criticalThresholdPercentage = input.criticalThresholdPercentage;
    }
    if (input.hardStopEnabled !== undefined) {
      values.hardStopEnabled = input.hardStopEnabled;
    }
    if (input.allowAdminOverride !== undefined) {
      values.allowAdminOverride = input.allowAdminOverride;
    }
    if (input.effectiveTo !== undefined) {
      values.effectiveTo = input.effectiveTo === null ? null : new Date(input.effectiveTo);
    }
    const row = await this.dao.update(id, values);
    if (!row) {
      throw new NotFoundException('NOT_FOUND');
    }
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.BUDGET_UPDATE,
      entityType: 'budget_policy',
      entityId: id,
    });
    return toBudgetPolicyDto(row);
  }

  @Post(':id/disable')
  @Roles('ADMIN')
  async disable(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<{ id: string; status: string }> {
    await this.dao.setStatus(id, 'DISABLED');
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.BUDGET_DISABLE,
      entityType: 'budget_policy',
      entityId: id,
    });
    return { id, status: 'DISABLED' };
  }

  @Post(':id/enable')
  @Roles('ADMIN')
  async enable(@Param('id') id: string): Promise<{ id: string; status: string }> {
    await this.dao.setStatus(id, 'ACTIVE');
    return { id, status: 'ACTIVE' };
  }

  @Get(':id/usage')
  @Roles('ADMIN', 'MANAGER')
  usage(@Param('id') id: string): Promise<BudgetUsage> {
    return this.service.getUsage(id);
  }

  @Get(':id/overrides')
  @Roles('ADMIN')
  overrides(@Param('id') id: string) {
    return this.service.listOverrides(id);
  }

  @Post(':id/override')
  @Roles('ADMIN')
  async override(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(budgetOverrideInputSchema)) input: BudgetOverrideInput,
    @CurrentUser() actor: AuthUser,
  ) {
    if (input.policyId !== id) {
      throw new NotFoundException('NOT_FOUND');
    }
    const result = await this.service.recordOverride(input, actor.id);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.BUDGET_OVERRIDE,
      entityType: 'budget_policy',
      entityId: id,
      metadata: { amountAfter: input.amountAfter, reason: input.reason },
    });
    return result;
  }

  @Post('check')
  @Roles('ADMIN', 'MANAGER')
  checkHardStop(@Body(new ZodValidationPipe(hardStopCheckSchema)) input: HardStopCheckInput) {
    return this.service.checkHardStop(input.scopeType, input.scopeId ?? null, input.currency, input.additionalCost);
  }
}
