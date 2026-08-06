import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type {
  MessageCostEstimate,
  MessageCostEstimateInput,
  MessageCostDto,
  PricingCategory,
  PricingRuleDto,
} from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { contacts, conversationEntryWindows, conversations, type NewMessageCost } from '../../db/schema';
import { MessageCostsDao, toMessageCostDto } from './message-costs.dao';
import { PricingRuleSetsDao, toRuleDto } from './pricing-rule-sets.dao';
import type { PricingRuleRow } from '../../db/schema';

export interface CostContext {
  messageId?: string;
  campaignId?: string;
  campaignRecipientId?: string;
  conversationId?: string;
  contactId?: string;
  whatsappPhoneNumberId?: string;
  direction: 'INBOUND' | 'OUTBOUND';
  messageCategory?: PricingCategory;
  messageType?: string;
  recipientCountry?: string | null;
  recipientMarket?: string | null;
  serviceWindowOpen?: boolean | null;
  freeEntryPointWindowOpen?: boolean | null;
}

export interface WebhookCostConfirmation {
  confirmedCost: number | null;
  finalCost?: number | null;
  adjustedCost?: number | null;
  chargeStatus?: 'PAID' | 'FREE' | 'UNKNOWN' | 'NOT_CHARGEABLE';
  currency?: string | null;
  freeReason?: import('@wa/shared').FreeReason | null;
  source?: string;
}

@Injectable()
export class CostResolverService {
  constructor(
    @Inject(DATABASE) private readonly db: DrizzleDB,
    private readonly ruleSetsDao: PricingRuleSetsDao,
    private readonly costsDao: MessageCostsDao,
  ) {}

  async estimate(input: MessageCostEstimateInput): Promise<MessageCostEstimate> {
    const country = input.recipientCountry ?? (await this.countryForContact(input.contactId));
    const category = input.messageCategory ?? 'UNKNOWN';
    const ruleSet = await this.ruleSetsDao.findActiveRuleSet();
    const rule = ruleSet ? this.matchRule(ruleSet.rules, country, category, input.messageType) : null;

    const serviceWindowOpen = input.serviceWindowOpen ?? null;
    const freeEntryPointWindowOpen = input.freeEntryPointWindowOpen ?? null;
    const isInbound = input.contactId !== undefined && input.messageCategory === undefined;

    if (!rule) {
      return {
        category,
        billingModel: 'UNKNOWN',
        chargeStatus: isInbound ? 'NOT_CHARGEABLE' : 'UNKNOWN',
        freeReason: isInbound ? 'INBOUND_MESSAGE' : null,
        calculationStatus: 'UNAVAILABLE',
        currency: null,
        estimatedCost: null,
        unitPrice: null,
        pricingRuleId: null,
        pricingRuleSetVersion: ruleSet?.version ?? null,
        customerServiceWindowOpen: serviceWindowOpen,
        freeEntryPointWindowOpen: freeEntryPointWindowOpen,
        pricingAvailable: false,
      };
    }

    const { chargeStatus, freeReason } = this.classify(rule, isInbound, serviceWindowOpen, freeEntryPointWindowOpen);
    const cost = this.computeCost(rule, chargeStatus);

    return {
      category,
      billingModel: rule.billingModel,
      chargeStatus,
      freeReason,
      calculationStatus: chargeStatus === 'FREE' || chargeStatus === 'NOT_CHARGEABLE' ? 'NOT_APPLICABLE' : 'ESTIMATED',
      currency: rule.currency,
      estimatedCost: cost,
      unitPrice: this.money(rule.unitPrice),
      pricingRuleId: rule.id,
      pricingRuleSetVersion: ruleSet?.version ?? null,
      customerServiceWindowOpen: serviceWindowOpen,
      freeEntryPointWindowOpen: freeEntryPointWindowOpen,
      pricingAvailable: true,
    };
  }

  async record(context: CostContext): Promise<MessageCostDto> {
    if (!context.messageId) {
      throw new BadRequestException('INVALID_OPERATION');
    }
    const existing = await this.costsDao.findByMessageId(context.messageId);
    if (existing) {
      return toMessageCostDto(existing);
    }

    const country = context.recipientCountry ?? (await this.countryForContact(context.contactId));
    const market = context.recipientMarket ?? country ?? null;
    const category = context.messageCategory ?? 'UNKNOWN';
    const ruleSet = await this.ruleSetsDao.findActiveRuleSet();
    const rule = ruleSet ? this.matchRule(ruleSet.rules, country, category, context.messageType) : null;
    const isInbound = context.direction === 'INBOUND';

    const windows =
      context.conversationId && (context.serviceWindowOpen === null || context.freeEntryPointWindowOpen === null)
        ? await this.windowState(context.conversationId)
        : { serviceWindowOpen: context.serviceWindowOpen ?? null, freeEntryPointWindowOpen: context.freeEntryPointWindowOpen ?? null };

    const { chargeStatus, freeReason } = rule
      ? this.classify(rule, isInbound, windows.serviceWindowOpen, windows.freeEntryPointWindowOpen)
      : isInbound
        ? { chargeStatus: 'NOT_CHARGEABLE' as const, freeReason: 'INBOUND_MESSAGE' as const }
        : { chargeStatus: 'UNKNOWN' as const, freeReason: null };

    const cost = rule && chargeStatus !== 'FREE' && chargeStatus !== 'NOT_CHARGEABLE' ? this.computeCost(rule, chargeStatus) : null;
    const now = new Date();
    const row = await this.costsDao.upsertForMessage({
      messageId: context.messageId,
      campaignId: context.campaignId ?? null,
      campaignRecipientId: context.campaignRecipientId ?? null,
      conversationId: context.conversationId ?? null,
      contactId: context.contactId ?? null,
      whatsappPhoneNumberId: context.whatsappPhoneNumberId ?? null,
      pricingRuleId: rule?.id ?? null,
      recipientMarket: market,
      recipientCountry: country,
      messageCategory: category,
      billingModel: rule?.billingModel ?? 'UNKNOWN',
      currency: rule?.currency ?? null,
      unitPrice: rule ? this.moneyString(rule.unitPrice) : null,
      inputTokenCount: null,
      outputTokenCount: null,
      estimatedCost: cost !== null ? String(cost) : null,
      confirmedCost: null,
      adjustedCost: null,
      finalCost: null,
      calculationStatus: chargeStatus === 'FREE' || chargeStatus === 'NOT_CHARGEABLE' ? 'NOT_APPLICABLE' : rule ? 'ESTIMATED' : 'UNAVAILABLE',
      chargeStatus,
      freeReason,
      customerServiceWindowOpen: windows.serviceWindowOpen,
      freeEntryPointWindowOpen: windows.freeEntryPointWindowOpen,
      costCalculatedAt: now,
    });

    await this.costsDao.addEvent({
      messageCostId: row.id,
      eventType: chargeStatus === 'FREE' || chargeStatus === 'NOT_CHARGEABLE' ? 'MARKED_FREE' : 'ESTIMATED',
      previousStatus: null,
      newStatus: row.chargeStatus,
      previousAmount: null,
      newAmount: cost !== null ? String(cost) : null,
      currency: row.currency,
      reason: freeReason ?? null,
      source: 'cost_resolver',
    });

    return toMessageCostDto(row);
  }

  async recordInbound(messageId: string, context: Omit<CostContext, 'direction'>): Promise<MessageCostDto> {
    return this.record({ ...context, messageId, direction: 'INBOUND' });
  }

  async confirmFromWebhook(messageId: string, confirmation: WebhookCostConfirmation): Promise<MessageCostDto | null> {
    const existing = await this.costsDao.findByMessageId(messageId);
    if (!existing) {
      return null;
    }
    const previous = existing;
    const values: Partial<NewMessageCost> = {
      confirmedCost: confirmation.confirmedCost !== null && confirmation.confirmedCost !== undefined ? String(confirmation.confirmedCost) : existing.confirmedCost,
      finalCost: confirmation.finalCost !== null && confirmation.finalCost !== undefined ? String(confirmation.finalCost) : confirmation.confirmedCost !== null && confirmation.confirmedCost !== undefined ? String(confirmation.confirmedCost) : existing.finalCost,
      adjustedCost: confirmation.adjustedCost !== null && confirmation.adjustedCost !== undefined ? String(confirmation.adjustedCost) : existing.adjustedCost,
      chargeStatus: confirmation.chargeStatus ?? existing.chargeStatus,
      currency: confirmation.currency ?? existing.currency,
      freeReason: confirmation.freeReason ?? existing.freeReason,
      confirmedAt: confirmation.confirmedCost !== null && confirmation.confirmedCost !== undefined ? new Date() : existing.confirmedAt,
    };
    if (confirmation.finalCost !== undefined) {
      values.calculationStatus = 'CONFIRMED';
    }
    const updated = await this.costsDao.update(existing.id, values);
    if (!updated) {
      return null;
    }
    await this.costsDao.addEvent({
      messageCostId: updated.id,
      eventType: confirmation.chargeStatus === 'FREE' ? 'MARKED_FREE' : confirmation.chargeStatus === 'PAID' ? 'MARKED_PAID' : 'CONFIRMED',
      previousStatus: previous.chargeStatus,
      newStatus: updated.chargeStatus,
      previousAmount: previous.finalCost,
      newAmount: updated.finalCost,
      currency: updated.currency,
      reason: confirmation.freeReason ?? null,
      source: confirmation.source ?? 'webhook',
    });
    return toMessageCostDto(updated);
  }

  async adjust(costId: string, amount: number, reason: string, actorUserId: string, currency?: string): Promise<MessageCostDto> {
    const existing = await this.costsDao.findById(costId);
    if (!existing) {
      throw new NotFoundException('NOT_FOUND');
    }
    const now = new Date();
    const updated = await this.costsDao.update(costId, {
      adjustedCost: String(amount),
      finalCost: String(amount),
      adjustmentReason: reason,
      adjustedByUserId: actorUserId,
      adjustedAt: now,
      currency: currency ?? existing.currency,
      calculationStatus: 'ADJUSTED',
      chargeStatus: 'PAID',
    });
    if (!updated) {
      throw new NotFoundException('NOT_FOUND');
    }
    await this.costsDao.addEvent({
      messageCostId: costId,
      eventType: 'MANUAL_OVERRIDE',
      previousStatus: existing.chargeStatus,
      newStatus: 'PAID',
      previousAmount: existing.finalCost,
      newAmount: String(amount),
      currency: updated.currency,
      reason,
      source: 'admin',
      actorUserId,
    });
    return toMessageCostDto(updated);
  }

  private classify(
    rule: PricingRuleDto,
    isInbound: boolean,
    serviceWindowOpen: boolean | null,
    freeEntryPointWindowOpen: boolean | null,
  ): { chargeStatus: 'PAID' | 'FREE' | 'UNKNOWN' | 'NOT_CHARGEABLE'; freeReason: import('@wa/shared').FreeReason | null } {
    if (isInbound) {
      return { chargeStatus: 'NOT_CHARGEABLE', freeReason: 'INBOUND_MESSAGE' };
    }
    if (rule.billingModel === 'FREE') {
      return { chargeStatus: 'FREE', freeReason: 'PROVIDER_EXEMPTION' };
    }
    if (freeEntryPointWindowOpen && rule.freeEntryPointEligible) {
      return { chargeStatus: 'FREE', freeReason: 'FREE_ENTRY_POINT_WINDOW' };
    }
    if (serviceWindowOpen) {
      return { chargeStatus: 'FREE', freeReason: 'PROVIDER_EXEMPTION' };
    }
    return { chargeStatus: 'UNKNOWN', freeReason: null };
  }

  private computeCost(rule: PricingRuleDto, chargeStatus: string): number | null {
    if (chargeStatus === 'FREE' || chargeStatus === 'NOT_CHARGEABLE') {
      return 0;
    }
    if (rule.billingModel === 'PER_MESSAGE') {
      const unit = this.money(rule.unitPrice) ?? 0;
      const minimum = this.money(rule.minimumCharge);
      if (minimum !== null && minimum !== undefined && unit < minimum) {
        return minimum;
      }
      return unit;
    }
    if (rule.billingModel === 'PER_TOKEN') {
      return null;
    }
    return null;
  }

  private matchRule(rules: PricingRuleRow[], country: string | null, category: PricingCategory, messageType?: string): PricingRuleDto | null {
    if (!country) {
      return null;
    }
    const now = new Date();
    const match = rules.find((rule) => {
      if (rule.effectiveFrom > now || (rule.effectiveTo !== null && rule.effectiveTo < now)) {
        return false;
      }
      if (rule.countryCode !== country) {
        return false;
      }
      if (rule.messageCategory !== category) {
        return false;
      }
      if (rule.messageType !== '*' && rule.messageType !== messageType) {
        return false;
      }
      return true;
    });
    return match ? toRuleDto(match) : null;
  }

  private async countryForContact(contactId?: string): Promise<string | null> {
    if (!contactId) {
      return null;
    }
    const [row] = await this.db.select({ country: contacts.phoneCountry }).from(contacts).where(eq(contacts.id, contactId));
    return row?.country ?? null;
  }

  private async windowState(conversationId: string): Promise<{ serviceWindowOpen: boolean | null; freeEntryPointWindowOpen: boolean | null }> {
    const now = Date.now();
    const [conversation, windows] = await Promise.all([
      this.db
        .select({ expiresAt: conversations.serviceWindowExpiresAt })
        .from(conversations)
        .where(eq(conversations.id, conversationId)),
      this.db
        .select({ status: conversationEntryWindows.status, expiresAt: conversationEntryWindows.expiresAt })
        .from(conversationEntryWindows)
        .where(eq(conversationEntryWindows.conversationId, conversationId)),
    ]);
    const serviceWindowOpen = conversation[0]?.expiresAt ? conversation[0].expiresAt.getTime() > now : null;
    const openEntry = windows.find((window) => window.status === 'OPEN' && window.expiresAt.getTime() > now);
    return {
      serviceWindowOpen,
      freeEntryPointWindowOpen: openEntry ? true : windows.some((window) => window.status === 'OPEN') ? null : false,
    };
  }

  private money(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private moneyString(value: string | number | null | undefined): string | null {
    const parsed = this.money(value);
    return parsed === null ? null : String(parsed);
  }
}
