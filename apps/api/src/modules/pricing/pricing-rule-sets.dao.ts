import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, isNull, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import type {
  PricingCoverage,
  PricingRuleDto,
  PricingRuleQuery,
  PricingRuleSetDto,
  PricingRuleSetStatus,
} from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { toMoney } from '../../common/money';
import {
  pricingRules,
  pricingRuleSets,
  type NewPricingRule,
  type NewPricingRuleSet,
  type PricingRuleRow,
  type PricingRuleSetRow,
} from '../../db/schema';

export interface RuleSetWithRules extends PricingRuleSetRow {
  rules: PricingRuleRow[];
}

export function toRuleDto(row: PricingRuleRow): PricingRuleDto {
  return {
    id: row.id,
    pricingRuleSetId: row.pricingRuleSetId,
    marketCode: row.marketCode,
    countryCode: row.countryCode,
    messageCategory: row.messageCategory,
    messageType: row.messageType,
    billingModel: row.billingModel,
    unitPrice: toMoney(row.unitPrice) ?? 0,
    tokenInputPrice: toMoney(row.tokenInputPrice),
    tokenOutputPrice: toMoney(row.tokenOutputPrice),
    minimumCharge: toMoney(row.minimumCharge),
    currency: row.currency,
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString() : null,
    customerServiceWindowRequired: row.customerServiceWindowRequired,
    freeEntryPointEligible: row.freeEntryPointEligible,
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toRuleSetDto(row: PricingRuleSetRow, rules: PricingRuleRow[] = []): PricingRuleSetDto {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    description: row.description ?? null,
    currency: row.currency,
    status: row.status,
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString() : null,
    sourceType: row.sourceType,
    sourceReference: row.sourceReference ?? null,
    version: row.version,
    createdByUserId: row.createdByUserId ?? null,
    approvedByUserId: row.approvedByUserId ?? null,
    rules: rules.map(toRuleDto),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
  };
}

@Injectable()
export class PricingRuleSetsDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  async list(query: PricingRuleQuery): Promise<{ items: PricingRuleSetDto[]; total: number }> {
    const conditions: SQL[] = [];
    if (query.includeArchived !== 'yes') {
      conditions.push(isNull(pricingRuleSets.archivedAt));
    }
    if (query.status) {
      conditions.push(eq(pricingRuleSets.status, query.status));
    }
    const where = and(...conditions);

    const [setRows, totalRows] = await Promise.all([
      this.db.select().from(pricingRuleSets).where(where).orderBy(desc(pricingRuleSets.effectiveFrom)),
      this.db.select({ value: count() }).from(pricingRuleSets).where(where),
    ]);

    let rules: PricingRuleRow[] = [];
    if (setRows.length > 0) {
      rules = await this.db
        .select()
        .from(pricingRules)
        .where(inArray(pricingRules.pricingRuleSetId, setRows.map((row) => row.id)));
    }
    const rulesBySet = new Map<string, PricingRuleRow[]>();
    for (const rule of rules) {
      const list = rulesBySet.get(rule.pricingRuleSetId) ?? [];
      list.push(rule);
      rulesBySet.set(rule.pricingRuleSetId, list);
    }

    return {
      items: setRows.map((row) => toRuleSetDto(row, rulesBySet.get(row.id) ?? [])),
      total: totalRows[0]?.value ?? 0,
    };
  }

  async findById(id: string): Promise<RuleSetWithRules | null> {
    const [setRow] = await this.db.select().from(pricingRuleSets).where(eq(pricingRuleSets.id, id));
    if (!setRow) {
      return null;
    }
    const rules = await this.db.select().from(pricingRules).where(eq(pricingRules.pricingRuleSetId, id));
    return { ...setRow, rules };
  }

  async findActiveRuleSet(asOf = new Date()): Promise<RuleSetWithRules | null> {
    const [setRow] = await this.db
      .select()
      .from(pricingRuleSets)
      .where(
        and(
          eq(pricingRuleSets.status, 'ACTIVE'),
          isNull(pricingRuleSets.archivedAt),
          lte(pricingRuleSets.effectiveFrom, asOf),
          or(isNull(pricingRuleSets.effectiveTo), gte(pricingRuleSets.effectiveTo, asOf)),
        ),
      )
      .orderBy(desc(pricingRuleSets.effectiveFrom))
      .limit(1);
    if (!setRow) {
      return null;
    }
    const rules = await this.db.select().from(pricingRules).where(eq(pricingRules.pricingRuleSetId, setRow.id));
    return { ...setRow, rules };
  }

  async create(set: NewPricingRuleSet, rules: Array<Omit<NewPricingRule, 'pricingRuleSetId'>>): Promise<RuleSetWithRules> {
    return this.db.transaction(async (tx) => {
      const [created] = await tx.insert(pricingRuleSets).values(set).returning();
      if (!created) {
        throw new Error('RULE_SET_CREATE_FAILED');
      }
      const inserted = await tx
        .insert(pricingRules)
        .values(rules.map((rule) => ({ ...rule, pricingRuleSetId: created.id })))
        .returning();
      return { ...created, rules: inserted };
    });
  }

  async update(id: string, values: Partial<NewPricingRuleSet>): Promise<RuleSetWithRules | null> {
    const [updated] = await this.db
      .update(pricingRuleSets)
      .set(values)
      .where(eq(pricingRuleSets.id, id))
      .returning();
    if (!updated) {
      return null;
    }
    const rules = await this.db.select().from(pricingRules).where(eq(pricingRules.pricingRuleSetId, id));
    return { ...updated, rules };
  }

  async replaceRules(setId: string, rules: NewPricingRule[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(pricingRules).where(eq(pricingRules.pricingRuleSetId, setId));
      if (rules.length > 0) {
        await tx.insert(pricingRules).values(rules);
      }
    });
  }

  async activate(id: string, approvedByUserId: string): Promise<RuleSetWithRules | null> {
    const [updated] = await this.db
      .update(pricingRuleSets)
      .set({ status: 'ACTIVE', approvedByUserId })
      .where(eq(pricingRuleSets.id, id))
      .returning();
    if (!updated) {
      return null;
    }
    const rules = await this.db.select().from(pricingRules).where(eq(pricingRules.pricingRuleSetId, id));
    return { ...updated, rules };
  }

  async archive(id: string): Promise<RuleSetWithRules | null> {
    const [updated] = await this.db
      .update(pricingRuleSets)
      .set({ status: 'ARCHIVED', archivedAt: new Date() })
      .where(eq(pricingRuleSets.id, id))
      .returning();
    if (!updated) {
      return null;
    }
    const rules = await this.db.select().from(pricingRules).where(eq(pricingRules.pricingRuleSetId, id));
    return { ...updated, rules };
  }

  async setStatus(id: string, status: PricingRuleSetStatus): Promise<void> {
    await this.db.update(pricingRuleSets).set({ status }).where(eq(pricingRuleSets.id, id));
  }

  async nextVersion(): Promise<number> {
    const rows = await this.db
      .select({ value: sql<number>`coalesce(max(${pricingRuleSets.version}), 0) + 1` })
      .from(pricingRuleSets);
    return rows[0]?.value ?? 1;
  }

  async overlaps(effectiveFrom: Date, effectiveTo: Date | null, excludeId?: string): Promise<PricingRuleSetRow[]> {
    const conditions: SQL[] = [
      eq(pricingRuleSets.status, 'ACTIVE'),
      isNull(pricingRuleSets.archivedAt),
      lte(pricingRuleSets.effectiveFrom, effectiveTo ?? new Date('2999-12-31T23:59:59.999Z')),
    ];
    const overlap = or(isNull(pricingRuleSets.effectiveTo), gte(pricingRuleSets.effectiveTo, effectiveFrom));
    if (overlap) {
      conditions.push(overlap);
    }
    if (excludeId) {
      conditions.push(ne(pricingRuleSets.id, excludeId));
    }
    return this.db.select().from(pricingRuleSets).where(and(...conditions));
  }

  async coverage(): Promise<PricingCoverage> {
    const active = await this.findActiveRuleSet();
    const rules = active?.rules ?? [];
    const marketsCovered = [...new Set(rules.map((rule) => rule.marketCode))].sort();
    const categoriesCovered = [...new Set(rules.map((rule) => rule.messageCategory))].sort() as PricingCoverage['categoriesCovered'];

    const conflicts: PricingCoverage['conflicts'] = [];
    const seen = new Map<string, PricingRuleRow>();
    for (const rule of rules) {
      const key = `${rule.marketCode}:${rule.countryCode}:${rule.messageCategory}:${rule.messageType}`;
      const existing = seen.get(key);
      if (existing) {
        conflicts.push({
          ruleA: existing.id,
          ruleB: rule.id,
          message: `duplicate:${key}`,
        });
      }
      seen.set(key, rule);
    }

    return {
      activeRuleSetId: active?.id ?? null,
      activeRuleSetName: active?.name ?? null,
      activeCurrency: active?.currency ?? null,
      activeEffectiveFrom: active?.effectiveFrom ? active.effectiveFrom.toISOString() : null,
      activeEffectiveTo: active?.effectiveTo ? active.effectiveTo.toISOString() : null,
      activeVersion: active?.version ?? null,
      totalRules: rules.length,
      marketsCovered,
      categoriesCovered,
      missingMarkets: [],
      conflicts,
      freeEntryPointRules: rules.filter((rule) => rule.freeEntryPointEligible).length,
      perMessageRules: rules.filter((rule) => rule.billingModel === 'PER_MESSAGE').length,
      perTokenRules: rules.filter((rule) => rule.billingModel === 'PER_TOKEN').length,
      freeRules: rules.filter((rule) => rule.billingModel === 'FREE').length,
      generatedAt: new Date().toISOString(),
    };
  }
}
