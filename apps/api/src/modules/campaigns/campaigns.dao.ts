import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, asc, eq, exists, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type {
  AudienceSnapshotContact,
  CampaignDto,
  CampaignQuery,
  CampaignRecipientStatus,
  CampaignStatus,
  TemplateSnapshot,
  VariableMapping,
} from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { campaigns, campaignRecipients, type CampaignRow, type NewCampaign } from '../../db/schema';

export interface CampaignListResult {
  items: CampaignDto[];
  total: number;
}

export function toCampaignDto(row: CampaignRow): CampaignDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    whatsappPhoneNumberId: row.whatsappPhoneNumberId ?? null,
    messageTemplateId: row.messageTemplateId ?? null,
    templateSnapshot: (row.templateSnapshot as unknown as TemplateSnapshot | null) ?? null,
    language: row.language,
    status: row.status,
    audienceType: row.audienceType,
    audienceSnapshot: (row.audienceSnapshot as unknown as AudienceSnapshotContact[]) ?? [],
    variableMapping: (row.variableMapping as unknown as VariableMapping[]) ?? [],
    scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    pausedAt: row.pausedAt ? row.pausedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    createdByUserId: row.createdByUserId ?? null,
    approvedByUserId: row.approvedByUserId ?? null,
    totalRecipients: row.totalRecipients,
    eligibleRecipients: row.eligibleRecipients,
    skippedRecipients: row.skippedRecipients,
    queuedRecipients: row.queuedRecipients,
    sentRecipients: row.sentRecipients,
    deliveredRecipients: row.deliveredRecipients,
    readRecipients: row.readRecipients,
    repliedRecipients: row.repliedRecipients,
    failedRecipients: row.failedRecipients,
    optedOutRecipients: row.optedOutRecipients,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
  };
}

@Injectable()
export class CampaignsDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  async list(query: CampaignQuery): Promise<CampaignListResult> {
    const conditions: SQL[] = [isNull(campaigns.archivedAt)];
    if (query.search) {
      const term = `%${query.search}%`;
      conditions.push(or(ilike(campaigns.name, term), ilike(campaigns.description, term))!);
    }
    if (query.status) {
      conditions.push(eq(campaigns.status, query.status));
    }
    if (query.templateId) {
      conditions.push(eq(campaigns.messageTemplateId, query.templateId));
    }
    if (query.createdByUserId) {
      conditions.push(eq(campaigns.createdByUserId, query.createdByUserId));
    }
    if (query.createdFrom) {
      conditions.push(gte(campaigns.createdAt, new Date(query.createdFrom)));
    }
    if (query.createdTo) {
      conditions.push(lte(campaigns.createdAt, new Date(query.createdTo)));
    }

    const where = and(...conditions);
    const orderColumn =
      query.sortBy === 'name'
        ? campaigns.name
        : query.sortBy === 'status'
          ? campaigns.status
          : query.sortBy === 'updatedAt'
            ? campaigns.updatedAt
            : query.sortBy === 'scheduledAt'
              ? campaigns.scheduledAt
              : campaigns.createdAt;
    const order = query.sortOrder === 'asc' ? asc(orderColumn) : desc(orderColumn);

    const rows = await this.db
      .select()
      .from(campaigns)
      .where(where)
      .orderBy(order)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const [totalRow] = await this.db.select({ value: count() }).from(campaigns).where(where);
    return { items: rows.map(toCampaignDto), total: totalRow?.value ?? 0 };
  }

  findById(id: string): Promise<CampaignRow | undefined> {
    return this.db.query.campaigns.findFirst({ where: eq(campaigns.id, id) });
  }

  async insert(values: Omit<NewCampaign, 'id' | 'createdAt' | 'updatedAt'>): Promise<CampaignRow> {
    const [row] = await this.db.insert(campaigns).values(values).returning();
    return row!;
  }

  async update(id: string, values: Partial<CampaignRow>): Promise<CampaignRow | undefined> {
    const rows = await this.db.update(campaigns).set(values).where(eq(campaigns.id, id)).returning();
    return rows[0];
  }

  async archive(id: string): Promise<void> {
    await this.db.update(campaigns).set({ archivedAt: new Date() }).where(eq(campaigns.id, id));
  }

  async countByStatus(status: CampaignStatus): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(campaigns)
      .where(and(eq(campaigns.status, status), isNull(campaigns.archivedAt)));
    return row?.value ?? 0;
  }

  async listDueScheduled(now: Date): Promise<CampaignRow[]> {
    return this.db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.status, 'SCHEDULED'), lte(campaigns.scheduledAt, now), isNull(campaigns.archivedAt)));
  }

  async listActiveIds(): Promise<string[]> {
    const rows = await this.db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(
        and(
          inArray(campaigns.status, ['QUEUING', 'RUNNING', 'PAUSED'] as CampaignStatus[]),
          isNull(campaigns.archivedAt),
        ),
      );
    return rows.map((row) => row.id);
  }

  async listActiveForContact(contactId: string): Promise<CampaignRow[]> {
    const rows = await this.db
      .select()
      .from(campaigns)
      .where(
        and(
          exists(
            this.db
              .select({ one: sql`1` })
              .from(campaignRecipients)
              .where(
                and(
                  eq(campaignRecipients.campaignId, campaigns.id),
                  eq(campaignRecipients.contactId, contactId),
                  inArray(campaignRecipients.status, ['PENDING', 'QUEUED'] as CampaignRecipientStatus[]),
                ),
              ),
          ),
          inArray(campaigns.status, ['QUEUING', 'RUNNING', 'PAUSED', 'SCHEDULED'] as CampaignStatus[]),
          isNull(campaigns.archivedAt),
        ),
      );
    return rows;
  }
}