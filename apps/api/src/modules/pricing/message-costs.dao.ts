import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, inArray } from 'drizzle-orm';
import type { CampaignCostSummary, ConversationCostSummary, MessageCostDto } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { toMoney } from '../../common/money';
import {
  budgetOverrideEvents as budgetOverrideEventsCols,
  campaigns as campaignsCols,
  conversationEntryWindows as entryWindowsCols,
  conversations as conversationsCols,
  messageCostEvents,
  messageCosts,
  pricingRuleSets,
  type MessageCostEventRow,
  type MessageCostRow,
  type NewMessageCost,
  type NewMessageCostEvent,
} from '../../db/schema';

export function toMessageCostDto(row: MessageCostRow): MessageCostDto {
  return {
    id: row.id,
    messageId: row.messageId ?? null,
    campaignId: row.campaignId ?? null,
    campaignRecipientId: row.campaignRecipientId ?? null,
    conversationId: row.conversationId ?? null,
    contactId: row.contactId ?? null,
    whatsappPhoneNumberId: row.whatsappPhoneNumberId ?? null,
    pricingRuleId: row.pricingRuleId ?? null,
    recipientMarket: row.recipientMarket ?? null,
    recipientCountry: row.recipientCountry ?? null,
    messageCategory: row.messageCategory,
    billingModel: row.billingModel,
    currency: row.currency ?? null,
    unitPrice: toMoney(row.unitPrice),
    inputTokenCount: row.inputTokenCount ?? null,
    outputTokenCount: row.outputTokenCount ?? null,
    estimatedCost: toMoney(row.estimatedCost),
    confirmedCost: toMoney(row.confirmedCost),
    adjustedCost: toMoney(row.adjustedCost),
    finalCost: toMoney(row.finalCost),
    calculationStatus: row.calculationStatus,
    chargeStatus: row.chargeStatus,
    freeReason: row.freeReason ?? null,
    customerServiceWindowOpen: row.customerServiceWindowOpen ?? null,
    freeEntryPointWindowOpen: row.freeEntryPointWindowOpen ?? null,
    costCalculatedAt: row.costCalculatedAt ? row.costCalculatedAt.toISOString() : null,
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    adjustedAt: row.adjustedAt ? row.adjustedAt.toISOString() : null,
    adjustmentReason: row.adjustmentReason ?? null,
    adjustedByUserId: row.adjustedByUserId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface MessageCostWithEvents extends MessageCostRow {
  events: MessageCostEventRow[];
}

@Injectable()
export class MessageCostsDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  async upsertForMessage(values: NewMessageCost): Promise<MessageCostRow> {
    const rows = await this.db
      .insert(messageCosts)
      .values(values)
      .onConflictDoUpdate({
        target: messageCosts.messageId,
        set: {
          pricingRuleId: values.pricingRuleId,
          recipientMarket: values.recipientMarket,
          recipientCountry: values.recipientCountry,
          messageCategory: values.messageCategory,
          billingModel: values.billingModel,
          currency: values.currency,
          unitPrice: values.unitPrice,
          inputTokenCount: values.inputTokenCount,
          outputTokenCount: values.outputTokenCount,
          estimatedCost: values.estimatedCost,
          confirmedCost: values.confirmedCost,
          adjustedCost: values.adjustedCost,
          finalCost: values.finalCost,
          calculationStatus: values.calculationStatus,
          chargeStatus: values.chargeStatus,
          freeReason: values.freeReason,
          customerServiceWindowOpen: values.customerServiceWindowOpen,
          freeEntryPointWindowOpen: values.freeEntryPointWindowOpen,
          costCalculatedAt: values.costCalculatedAt,
          confirmedAt: values.confirmedAt,
          adjustedAt: values.adjustedAt,
          adjustmentReason: values.adjustmentReason,
          adjustedByUserId: values.adjustedByUserId,
        },
      })
      .returning();
    const row = rows[0];
    if (!row) {
      throw new Error('MESSAGE_COST_UPSERT_FAILED');
    }
    return row;
  }

  async findByMessageId(messageId: string): Promise<MessageCostRow | null> {
    const [row] = await this.db.select().from(messageCosts).where(eq(messageCosts.messageId, messageId));
    return row ?? null;
  }

  async findById(id: string): Promise<MessageCostWithEvents | null> {
    const [row] = await this.db.select().from(messageCosts).where(eq(messageCosts.id, id));
    if (!row) {
      return null;
    }
    const events = await this.db
      .select()
      .from(messageCostEvents)
      .where(eq(messageCostEvents.messageCostId, row.id))
      .orderBy(desc(messageCostEvents.createdAt));
    return { ...row, events };
  }

  async addEvent(event: NewMessageCostEvent): Promise<void> {
    await this.db.insert(messageCostEvents).values(event);
  }

  async listByCampaign(campaignId: string): Promise<MessageCostWithEvents[]> {
    const rows = await this.db
      .select()
      .from(messageCosts)
      .where(eq(messageCosts.campaignId, campaignId))
      .orderBy(desc(messageCosts.createdAt));
    const events = await this.eventsForCosts(rows.map((row) => row.id));
    return rows.map((row) => ({ ...row, events: events.get(row.id) ?? [] }));
  }

  async listByConversation(conversationId: string): Promise<MessageCostWithEvents[]> {
    const rows = await this.db
      .select()
      .from(messageCosts)
      .where(eq(messageCosts.conversationId, conversationId))
      .orderBy(desc(messageCosts.createdAt));
    const events = await this.eventsForCosts(rows.map((row) => row.id));
    return rows.map((row) => ({ ...row, events: events.get(row.id) ?? [] }));
  }

  async listByContact(contactId: string): Promise<MessageCostRow[]> {
    return this.db
      .select()
      .from(messageCosts)
      .where(eq(messageCosts.contactId, contactId))
      .orderBy(desc(messageCosts.createdAt));
  }

  async update(id: string, values: Partial<NewMessageCost>): Promise<MessageCostRow | null> {
    const [row] = await this.db.update(messageCosts).set(values).where(eq(messageCosts.id, id)).returning();
    return row ?? null;
  }

  async campaignSummary(campaignId: string): Promise<CampaignCostSummary> {
    const [campaignRows, costRows, overrideRows] = await Promise.all([
      this.campaignPricingContext(campaignId),
      this.aggregate(messageCosts.campaignId, campaignId),
      this.budgetOverrides(campaignId),
    ]);
    const freeMessages = costRows.all.filter((row) => row.chargeStatus === 'FREE').length;
    const chargeableMessages = costRows.all.filter((row) => row.chargeStatus === 'PAID' || row.chargeStatus === 'UNKNOWN').length;
    const unknownPricingMessages = costRows.all.filter((row) => row.calculationStatus === 'UNAVAILABLE').length;

    return {
      campaignId,
      pricingRuleSetId: campaignRows.pricingRuleSetId ?? null,
      pricingRuleSetName: campaignRows.pricingRuleSetName ?? null,
      pricingRuleSetVersion: campaignRows.version,
      pricingCalculatedAt: campaignRows.pricingCalculatedAt ? campaignRows.pricingCalculatedAt.toISOString() : null,
      estimatedCost: toMoney(campaignRows.estimatedCost),
      confirmedCost: costRows.confirmedCost,
      adjustedCost: costRows.adjustedCost,
      finalCost: costRows.finalCost,
      costCurrency: campaignRows.costCurrency ?? null,
      variancePercent: this.variance(toMoney(campaignRows.estimatedCost), costRows.finalCost),
      currencyTotals: costRows.currencyTotals,
      freeMessages,
      chargeableMessages,
      unknownPricingMessages,
      budgetStatus: 'UNAVAILABLE',
      budgetOverrides: overrideRows.map((row) => ({
        id: row.id,
        amountAfter: toMoney(row.amountAfter) ?? 0,
        currency: row.currency ?? '',
        reason: row.reason,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async conversationSummary(conversationId: string): Promise<ConversationCostSummary> {
    const [conversation, rows, windows] = await Promise.all([
      this.conversationContext(conversationId),
      this.aggregate(messageCosts.conversationId, conversationId),
      this.entryWindows(conversationId),
    ]);
    const openEntry = windows.find((window) => window.status === 'OPEN') ?? null;
    const chargeableRows = rows.all.filter((row) => row.chargeStatus === 'PAID' || row.chargeStatus === 'UNKNOWN');
    const pricingRuleId = chargeableRows[0]?.pricingRuleId ?? null;

    return {
      conversationId,
      serviceWindowOpen: conversation.serviceWindowExpiresAt ? conversation.serviceWindowExpiresAt.getTime() > Date.now() : null,
      serviceWindowOpenedAt: conversation.serviceWindowOpenedAt ? conversation.serviceWindowOpenedAt.toISOString() : null,
      serviceWindowExpiresAt: conversation.serviceWindowExpiresAt ? conversation.serviceWindowExpiresAt.toISOString() : null,
      entryWindowOpen: openEntry ? openEntry.expiresAt.getTime() > Date.now() : null,
      entryWindowSourceType: openEntry?.sourceType ?? null,
      entryWindowOpenedAt: openEntry?.openedAt.toISOString() ?? null,
      entryWindowExpiresAt: openEntry?.expiresAt.toISOString() ?? null,
      outboundMessageCount: rows.all.length,
      chargeableMessageCount: chargeableRows.length,
      freeMessageCount: rows.all.filter((row) => row.chargeStatus === 'FREE').length,
      unknownPricingMessageCount: rows.all.filter((row) => row.calculationStatus === 'UNAVAILABLE').length,
      estimatedCost: rows.estimatedCost,
      confirmedCost: rows.confirmedCost,
      finalCost: rows.finalCost,
      currency: rows.currency ?? null,
      currencyTotals: rows.currencyTotals,
      pricingRuleId,
      pricingAvailable: rows.all.length > 0 ? rows.all.some((row) => row.calculationStatus !== 'UNAVAILABLE') : false,
    };
  }

  private async eventsForCosts(costIds: string[]): Promise<Map<string, MessageCostEventRow[]>> {
    const map = new Map<string, MessageCostEventRow[]>();
    if (costIds.length === 0) {
      return map;
    }
    const events = await this.db
      .select()
      .from(messageCostEvents)
      .where(inArray(messageCostEvents.messageCostId, costIds))
      .orderBy(desc(messageCostEvents.createdAt));
    for (const event of events) {
      const list = map.get(event.messageCostId) ?? [];
      list.push(event);
      map.set(event.messageCostId, list);
    }
    return map;
  }

  private async aggregate(
    column: typeof messageCosts.campaignId | typeof messageCosts.conversationId,
    id: string,
  ): Promise<{
    all: MessageCostRow[];
    estimatedCost: number | null;
    confirmedCost: number | null;
    adjustedCost: number | null;
    finalCost: number | null;
    currency: string | null;
    currencyTotals: CampaignCostSummary['currencyTotals'];
  }> {
    const all = await this.db.select().from(messageCosts).where(eq(column, id));
    const currencyTotals = new Map<string, { currency: string; estimatedCost: number; confirmedCost: number; finalCost: number }>();
    for (const row of all) {
      const currency = row.currency ?? 'UNKNOWN';
      const current = currencyTotals.get(currency) ?? { currency, estimatedCost: 0, confirmedCost: 0, finalCost: 0 };
      current.estimatedCost += toMoney(row.estimatedCost) ?? 0;
      current.confirmedCost += toMoney(row.confirmedCost) ?? 0;
      current.finalCost += toMoney(row.finalCost) ?? 0;
      currencyTotals.set(currency, current);
    }
    const totals = [...currencyTotals.values()];
    const first = totals[0];
    return {
      all,
      estimatedCost: totals.length > 0 ? totals.reduce((sum, item) => sum + item.estimatedCost, 0) : null,
      confirmedCost: totals.length > 0 ? totals.reduce((sum, item) => sum + item.confirmedCost, 0) : null,
      adjustedCost: null,
      finalCost: totals.length > 0 ? totals.reduce((sum, item) => sum + item.finalCost, 0) : null,
      currency: first ? first.currency : null,
      currencyTotals: totals,
    };
  }

  private async campaignPricingContext(campaignId: string): Promise<{
    pricingRuleSetId: string | null;
    pricingRuleSetName: string | null;
    version: number | null;
    estimatedCost: string | null;
    costCurrency: string | null;
    pricingCalculatedAt: Date | null;
  }> {
    const [row] = await this.db
      .select({
        pricingRuleSetId: campaignsCols.pricingRuleSetId,
        pricingRuleSetName: pricingRuleSets.name,
        version: pricingRuleSets.version,
        estimatedCost: campaignsCols.estimatedCost,
        costCurrency: campaignsCols.costCurrency,
        pricingCalculatedAt: campaignsCols.pricingCalculatedAt,
      })
      .from(campaignsCols)
      .leftJoin(pricingRuleSets, eq(campaignsCols.pricingRuleSetId, pricingRuleSets.id))
      .where(eq(campaignsCols.id, campaignId));
    return (
      row ?? {
        pricingRuleSetId: null,
        pricingRuleSetName: null,
        version: null,
        estimatedCost: null,
        costCurrency: null,
        pricingCalculatedAt: null,
      }
    );
  }

  private async conversationContext(conversationId: string): Promise<{
    serviceWindowOpenedAt: Date | null;
    serviceWindowExpiresAt: Date | null;
  }> {
    const [row] = await this.db
      .select({
        serviceWindowOpenedAt: conversationsCols.serviceWindowOpenedAt,
        serviceWindowExpiresAt: conversationsCols.serviceWindowExpiresAt,
      })
      .from(conversationsCols)
      .where(eq(conversationsCols.id, conversationId));
    return { serviceWindowOpenedAt: row?.serviceWindowOpenedAt ?? null, serviceWindowExpiresAt: row?.serviceWindowExpiresAt ?? null };
  }

  private async entryWindows(conversationId: string) {
    return this.db
      .select({
        sourceType: entryWindowsCols.sourceType,
        status: entryWindowsCols.status,
        openedAt: entryWindowsCols.openedAt,
        expiresAt: entryWindowsCols.expiresAt,
      })
      .from(entryWindowsCols)
      .where(eq(entryWindowsCols.conversationId, conversationId));
  }

  private async budgetOverrides(campaignId: string): Promise<Array<{ id: string; amountAfter: string | null; currency: string | null; reason: string; createdAt: Date }>> {
    return this.db
      .select({
        id: budgetOverrideEventsCols.id,
        amountAfter: budgetOverrideEventsCols.amountAfter,
        currency: budgetOverrideEventsCols.currency,
        reason: budgetOverrideEventsCols.reason,
        createdAt: budgetOverrideEventsCols.createdAt,
      })
      .from(budgetOverrideEventsCols)
      .where(eq(budgetOverrideEventsCols.relatedCampaignId, campaignId));
  }

  private variance(estimated: number | null, final: number | null): number | null {
    if (estimated === null || final === null || estimated === 0) {
      return null;
    }
    return ((final - estimated) / estimated) * 100;
  }
}
