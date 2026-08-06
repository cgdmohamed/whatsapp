import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { BudgetOverrideInput, BudgetUsage } from '@wa/shared';

import { toMoney } from '../../common/money';
import {
  BudgetPoliciesDao,
  periodFor,
  toBudgetPolicyDto,
  usageStatus,
  type UsageTotals,
} from './budget-policies.dao';
import type { BudgetPolicyRow } from '../../db/schema';

export interface HardStopResult {
  allowed: boolean;
  status: BudgetUsage['status'] | null;
  blockingPolicyId: string | null;
  blockingPolicyName: string | null;
  reason: string | null;
}

@Injectable()
export class BudgetService {
  constructor(private readonly dao: BudgetPoliciesDao) {}

  async getUsage(policyId: string, asOf = new Date()): Promise<BudgetUsage> {
    const policy = await this.dao.findById(policyId);
    if (!policy) {
      throw new NotFoundException('NOT_FOUND');
    }
    return this.computeUsage(policy, asOf, true);
  }

  async checkHardStop(
    scopeType: string,
    scopeId: string | null,
    currency: string,
    additionalCost: number,
    asOf = new Date(),
  ): Promise<HardStopResult> {
    const relevant = await this.relevantPolicies(scopeType, scopeId, asOf);
    for (const policy of relevant) {
      if (policy.currency !== currency) {
        continue;
      }
      const usage = await this.usageFor(policy, asOf);
      if (policy.hardStopEnabled && usage.totalUsage + additionalCost > (toMoney(policy.amountLimit) ?? 0)) {
        return {
          allowed: false,
          status: 'BLOCKED',
          blockingPolicyId: policy.id,
          blockingPolicyName: policy.name,
          reason: 'BUDGET_HARD_STOP',
        };
      }
    }
    return { allowed: true, status: null, blockingPolicyId: null, blockingPolicyName: null, reason: null };
  }

  async checkUsageAgainst(
    policyId: string,
    additionalCost: number,
    asOf = new Date(),
  ): Promise<BudgetUsage> {
    const policy = await this.dao.findById(policyId);
    if (!policy) {
      throw new NotFoundException('NOT_FOUND');
    }
    const usage = await this.usageFor(policy, asOf);
    const limit = toMoney(policy.amountLimit) ?? 0;
    const totalUsage = usage.totalUsage + additionalCost;
    const percent = limit > 0 ? (totalUsage / limit) * 100 : 0;
    return {
      policyId: policy.id,
      scopeType: policy.scopeType,
      periodType: policy.periodType,
      periodStart: this.period(policy, asOf).start?.toISOString() ?? '',
      periodEnd: this.period(policy, asOf).end?.toISOString() ?? null,
      currency: policy.currency,
      amountLimit: limit,
      estimatedUsage: usage.estimatedUsage,
      confirmedUsage: usage.confirmedUsage,
      adjustedUsage: usage.adjustedUsage,
      totalUsage,
      remainingAmount: Math.max(limit - totalUsage, 0),
      usagePercentage: percent,
      status: usageStatus(policy, { ...usage, totalUsage }, limit),
      calculatedAt: asOf.toISOString(),
    };
  }

  async recordOverride(
    input: BudgetOverrideInput,
    actorUserId: string,
  ): Promise<BudgetOverrideEventResult> {
    const policy = await this.dao.findById(input.policyId);
    if (!policy) {
      throw new NotFoundException('NOT_FOUND');
    }
    if (!policy.allowAdminOverride) {
      throw new BadRequestException('BUDGET_OVERRIDE_DISABLED');
    }
    const usage = await this.usageFor(policy, new Date());
    const amountBefore = toMoney(policy.amountLimit) ?? 0;
    const amountAfter = input.amountAfter;

    if (amountAfter > amountBefore) {
      await this.dao.update(policy.id, { amountLimit: String(amountAfter) });
    }

    const event = await this.dao.insertOverride({
      budgetPolicyId: policy.id,
      relatedCampaignId: input.relatedCampaignId ?? null,
      relatedMessageId: input.relatedMessageId ?? null,
      requestedByUserId: actorUserId,
      approvedByUserId: actorUserId,
      reason: input.reason,
      amountBefore: String(amountBefore),
      amountAfter: String(amountAfter),
      currency: policy.currency,
    });

    return {
      id: event.id,
      policyId: event.budgetPolicyId,
      amountBefore: toMoney(event.amountBefore),
      amountAfter: toMoney(event.amountAfter),
      currency: event.currency,
      reason: event.reason,
      createdAt: event.createdAt.toISOString(),
      currentUsage: usage.totalUsage,
      remainingAmount: Math.max(amountAfter - usage.totalUsage, 0),
    };
  }

  async listOverrides(policyId: string): Promise<Array<{ id: string; amountBefore: number | null; amountAfter: number | null; currency: string | null; reason: string; createdAt: string }>> {
    const rows = await this.dao.overrides(policyId);
    return rows.map((row) => ({
      id: row.id,
      amountBefore: toMoney(row.amountBefore),
      amountAfter: toMoney(row.amountAfter),
      currency: row.currency,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private async computeUsage(policy: BudgetPolicyRow, asOf: Date, snapshot: boolean): Promise<BudgetUsage> {
    const usage = await this.usageFor(policy, asOf);
    const period = this.period(policy, asOf);
    const limit = toMoney(policy.amountLimit) ?? 0;
    const status = usageStatus(policy, usage, limit);
    const result: BudgetUsage = {
      policyId: policy.id,
      scopeType: policy.scopeType,
      periodType: policy.periodType,
      periodStart: period.start?.toISOString() ?? '',
      periodEnd: period.end?.toISOString() ?? null,
      currency: policy.currency,
      amountLimit: limit,
      estimatedUsage: usage.estimatedUsage,
      confirmedUsage: usage.confirmedUsage,
      adjustedUsage: usage.adjustedUsage,
      totalUsage: usage.totalUsage,
      remainingAmount: Math.max(limit - usage.totalUsage, 0),
      usagePercentage: limit > 0 ? (usage.totalUsage / limit) * 100 : 0,
      status,
      calculatedAt: asOf.toISOString(),
    };
    if (snapshot) {
      await this.dao.insertSnapshot({
        budgetPolicyId: policy.id,
        periodStart: period.start ?? asOf,
        periodEnd: period.end,
        estimatedUsage: String(usage.estimatedUsage),
        confirmedUsage: String(usage.confirmedUsage),
        adjustedUsage: String(usage.adjustedUsage),
        remainingAmount: String(result.remainingAmount),
        currency: policy.currency,
        calculatedAt: asOf,
      });
    }
    return result;
  }

  private async usageFor(policy: BudgetPolicyRow, asOf: Date): Promise<UsageTotals> {
    const period = this.period(policy, asOf);
    return this.dao.usageForPolicy(policy, period.start, period.end);
  }

  private period(policy: BudgetPolicyRow, asOf: Date): { start: Date | null; end: Date | null } {
    return periodFor(policy, asOf);
  }

  private async relevantPolicies(scopeType: string, scopeId: string | null, asOf: Date): Promise<BudgetPolicyRow[]> {
    const globalPolicies = await this.dao.activeForScope('GLOBAL', null, asOf);
    if (!scopeId) {
      return globalPolicies;
    }
    const scopePolicies = await this.dao.activeForScope(scopeType, scopeId, asOf);
    return [...globalPolicies, ...scopePolicies];
  }
}

export interface BudgetOverrideEventResult {
  id: string;
  policyId: string;
  amountBefore: number | null;
  amountAfter: number | null;
  currency: string | null;
  reason: string;
  createdAt: string;
  currentUsage: number;
  remainingAmount: number;
}

export { toBudgetPolicyDto };
