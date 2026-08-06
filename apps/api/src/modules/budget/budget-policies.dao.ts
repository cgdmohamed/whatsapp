import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type {
  BudgetPolicyDto,
  BudgetPolicyQuery,
  BudgetPolicyStatus,
  BudgetScopeType,
  BudgetUsage,
} from '@wa/shared';
import { BUDGET_SCOPE_TYPES, BUDGET_PERIOD_TYPES } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { toMoney } from '../../common/money';
import {
  budgetOverrideEvents,
  budgetPolicies,
  budgetUsageSnapshots,
  campaigns,
  messageCosts,
  type BudgetOverrideEventRow,
  type BudgetPolicyRow,
  type BudgetUsageSnapshotRow,
  type NewBudgetOverrideEvent,
  type NewBudgetPolicy,
  type NewBudgetUsageSnapshot,
} from '../../db/schema';

export function toBudgetPolicyDto(row: BudgetPolicyRow): BudgetPolicyDto {
  return {
    id: row.id,
    name: row.name,
    scopeType: row.scopeType,
    scopeId: row.scopeId ?? null,
    currency: row.currency,
    periodType: row.periodType,
    amountLimit: toMoney(row.amountLimit) ?? 0,
    warningThresholdPercentage: row.warningThresholdPercentage,
    criticalThresholdPercentage: row.criticalThresholdPercentage,
    hardStopEnabled: row.hardStopEnabled,
    allowAdminOverride: row.allowAdminOverride,
    status: row.status,
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString() : null,
    createdByUserId: row.createdByUserId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface UsageTotals {
  estimatedUsage: number;
  confirmedUsage: number;
  adjustedUsage: number;
  totalUsage: number;
}

export function usageStatus(
  policy: BudgetPolicyRow,
  totals: UsageTotals,
  limit: number,
): BudgetUsage['status'] {
  if (policy.hardStopEnabled && totals.totalUsage >= limit) {
    return 'BLOCKED';
  }
  const percent = limit > 0 ? (totals.totalUsage / limit) * 100 : 0;
  if (percent >= policy.criticalThresholdPercentage) {
    return 'CRITICAL';
  }
  if (percent >= policy.warningThresholdPercentage) {
    return 'WARNING';
  }
  return 'OK';
}

export function periodFor(
  policy: BudgetPolicyRow,
  asOf: Date,
): { start: Date | null; end: Date | null } {
  switch (policy.periodType) {
    case 'DAILY':
      return { start: new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())), end: null };
    case 'WEEKLY': {
      const day = asOf.getUTCDay() === 0 ? 7 : asOf.getUTCDay();
      const weekStart = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate() - (day - 1)));
      return { start: weekStart, end: null };
    }
    case 'MONTHLY':
      return { start: new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1)), end: null };
    case 'CUSTOM':
      return { start: policy.effectiveFrom, end: policy.effectiveTo };
    case 'CAMPAIGN_LIFETIME':
    default:
      return { start: null, end: null };
  }
}

@Injectable()
export class BudgetPoliciesDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  async list(query: BudgetPolicyQuery): Promise<{ items: BudgetPolicyDto[]; total: number }> {
    const conditions: SQL[] = [];
    if (query.scopeType) {
      conditions.push(eq(budgetPolicies.scopeType, query.scopeType));
    }
    if (query.status) {
      conditions.push(eq(budgetPolicies.status, query.status));
    }
    const where = and(...conditions);
    const rows = await this.db
      .select()
      .from(budgetPolicies)
      .where(where)
      .orderBy(desc(budgetPolicies.createdAt));
    return { items: rows.map(toBudgetPolicyDto), total: rows.length };
  }

  async findById(id: string): Promise<BudgetPolicyRow | null> {
    const [row] = await this.db.select().from(budgetPolicies).where(eq(budgetPolicies.id, id));
    return row ?? null;
  }

  async activePolicies(asOf = new Date()): Promise<BudgetPolicyRow[]> {
    const validUntil = or(isNull(budgetPolicies.effectiveTo), gte(budgetPolicies.effectiveTo, asOf));
    const conditions: SQL[] = [eq(budgetPolicies.status, 'ACTIVE'), lte(budgetPolicies.effectiveFrom, asOf)];
    if (validUntil) {
      conditions.push(validUntil);
    }
    return this.db.select().from(budgetPolicies).where(and(...conditions));
  }

  async create(set: NewBudgetPolicy): Promise<BudgetPolicyRow> {
    const [row] = await this.db.insert(budgetPolicies).values(set).returning();
    if (!row) {
      throw new Error('BUDGET_POLICY_CREATE_FAILED');
    }
    return row;
  }

  async update(id: string, values: Partial<NewBudgetPolicy>): Promise<BudgetPolicyRow | null> {
    const [row] = await this.db
      .update(budgetPolicies)
      .set(values)
      .where(eq(budgetPolicies.id, id))
      .returning();
    return row ?? null;
  }

  async setStatus(id: string, status: BudgetPolicyStatus): Promise<void> {
    await this.db.update(budgetPolicies).set({ status }).where(eq(budgetPolicies.id, id));
  }

  async activeForScope(scopeType: string, scopeId: string | null, asOf = new Date()): Promise<BudgetPolicyRow[]> {
    const conditions: SQL[] = [
      eq(budgetPolicies.status, 'ACTIVE'),
      lte(budgetPolicies.effectiveFrom, asOf),
      eq(budgetPolicies.scopeType, scopeType as BudgetScopeType),
    ];
    const validUntil = or(isNull(budgetPolicies.effectiveTo), gte(budgetPolicies.effectiveTo, asOf));
    if (validUntil) {
      conditions.push(validUntil);
    }
    if (scopeId === null) {
      conditions.push(isNull(budgetPolicies.scopeId));
    } else {
      conditions.push(eq(budgetPolicies.scopeId, scopeId));
    }
    return this.db.select().from(budgetPolicies).where(and(...conditions));
  }

  async overrides(policyId: string): Promise<BudgetOverrideEventRow[]> {
    return this.db
      .select()
      .from(budgetOverrideEvents)
      .where(eq(budgetOverrideEvents.budgetPolicyId, policyId))
      .orderBy(desc(budgetOverrideEvents.createdAt));
  }

  async insertOverride(event: NewBudgetOverrideEvent): Promise<BudgetOverrideEventRow> {
    const [row] = await this.db.insert(budgetOverrideEvents).values(event).returning();
    if (!row) {
      throw new Error('BUDGET_OVERRIDE_CREATE_FAILED');
    }
    return row;
  }

  async usageForPolicy(
    policy: BudgetPolicyRow,
    periodStart: Date | null,
    periodEnd: Date | null,
  ): Promise<UsageTotals> {
    const conditions: SQL[] = [
      eq(messageCosts.currency, policy.currency),
      inArray(messageCosts.chargeStatus, ['PAID', 'UNKNOWN']),
    ];
    if (periodStart) {
      conditions.push(gte(messageCosts.createdAt, periodStart));
    }
    if (periodEnd) {
      conditions.push(lte(messageCosts.createdAt, periodEnd));
    }
    switch (policy.scopeType) {
      case 'GLOBAL':
        break;
      case 'CAMPAIGN':
        conditions.push(eq(messageCosts.campaignId, policy.scopeId!));
        break;
      case 'WHATSAPP_PHONE_NUMBER':
        conditions.push(eq(messageCosts.whatsappPhoneNumberId, policy.scopeId!));
        break;
      case 'USER':
        conditions.push(eq(campaigns.createdByUserId, policy.scopeId!));
        break;
      default:
        return { estimatedUsage: 0, confirmedUsage: 0, adjustedUsage: 0, totalUsage: 0 };
    }

    const [row] = await this.db
      .select({
        estimated: sql<string>`coalesce(sum(${messageCosts.estimatedCost}), 0)`,
        confirmed: sql<string>`coalesce(sum(${messageCosts.confirmedCost}), 0)`,
        adjusted: sql<string>`coalesce(sum(${messageCosts.adjustedCost}), 0)`,
        total: sql<string>`coalesce(sum(coalesce(${messageCosts.finalCost}, ${messageCosts.adjustedCost}, ${messageCosts.confirmedCost}, ${messageCosts.estimatedCost})), 0)`,
      })
      .from(messageCosts)
      .leftJoin(campaigns, eq(messageCosts.campaignId, campaigns.id))
      .where(and(...conditions));

    return {
      estimatedUsage: toMoney(row?.estimated ?? '0') ?? 0,
      confirmedUsage: toMoney(row?.confirmed ?? '0') ?? 0,
      adjustedUsage: toMoney(row?.adjusted ?? '0') ?? 0,
      totalUsage: toMoney(row?.total ?? '0') ?? 0,
    };
  }

  async insertSnapshot(snapshot: NewBudgetUsageSnapshot): Promise<BudgetUsageSnapshotRow> {
    const [row] = await this.db.insert(budgetUsageSnapshots).values(snapshot).returning();
    if (!row) {
      throw new Error('BUDGET_SNAPSHOT_CREATE_FAILED');
    }
    return row;
  }

  async latestSnapshot(policyId: string): Promise<BudgetUsageSnapshotRow | null> {
    const [row] = await this.db
      .select()
      .from(budgetUsageSnapshots)
      .where(eq(budgetUsageSnapshots.budgetPolicyId, policyId))
      .orderBy(desc(budgetUsageSnapshots.calculatedAt))
      .limit(1);
    return row ?? null;
  }
}

export { BUDGET_SCOPE_TYPES as budgetScopeTypes, BUDGET_PERIOD_TYPES as budgetPeriodTypes };
