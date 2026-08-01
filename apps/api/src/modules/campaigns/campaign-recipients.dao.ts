import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, asc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import type { CampaignRecipientDto, CampaignRecipientQuery, CampaignRecipientStatus, EligibilityReason } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { campaignRecipients, type CampaignRecipientRow, type NewCampaignRecipient } from '../../db/schema';

export interface RecipientListResult {
  items: CampaignRecipientDto[];
  total: number;
}

export function toRecipientDto(row: CampaignRecipientRow): CampaignRecipientDto {
  return {
    id: row.id,
    campaignId: row.campaignId,
    contactId: row.contactId ?? null,
    phoneE164: row.phoneE164,
    contactSnapshot: (row.contactSnapshot as Record<string, unknown>) ?? {},
    resolvedTemplateParameters: (row.resolvedTemplateParameters as string[]) ?? [],
    status: row.status,
    eligibilityReason: (row.eligibilityReason as EligibilityReason | null) ?? null,
    idempotencyKey: row.idempotencyKey,
    queueJobId: row.queueJobId ?? null,
    metaMessageId: row.metaMessageId ?? null,
    queuedAt: row.queuedAt ? row.queuedAt.toISOString() : null,
    sendAttemptedAt: row.sendAttemptedAt ? row.sendAttemptedAt.toISOString() : null,
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    repliedAt: row.repliedAt ? row.repliedAt.toISOString() : null,
    failedAt: row.failedAt ? row.failedAt.toISOString() : null,
    optedOutAt: row.optedOutAt ? row.optedOutAt.toISOString() : null,
    failureCode: row.failureCode ?? null,
    failureMessage: row.failureMessage ?? null,
    attemptCount: row.attemptCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class CampaignRecipientsDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  async list(campaignId: string, query: CampaignRecipientQuery): Promise<RecipientListResult> {
    const conditions: SQL[] = [eq(campaignRecipients.campaignId, campaignId)];
    if (query.status) {
      conditions.push(eq(campaignRecipients.status, query.status));
    }
    if (query.failureCode) {
      conditions.push(eq(campaignRecipients.failureCode, query.failureCode));
    }
    if (query.search) {
      const term = `%${query.search}%`;
      conditions.push(or(ilike(campaignRecipients.phoneE164, term), ilike(campaignRecipients.failureMessage, term))!);
    }
    const where = and(...conditions);
    const orderColumn =
      query.sortBy === 'phoneE164'
        ? campaignRecipients.phoneE164
        : query.sortBy === 'status'
          ? campaignRecipients.status
          : query.sortBy === 'sentAt'
            ? campaignRecipients.sentAt
            : query.sortBy === 'updatedAt'
              ? campaignRecipients.updatedAt
              : campaignRecipients.createdAt;
    const order = query.sortOrder === 'asc' ? asc(orderColumn) : desc(orderColumn);

    const rows = await this.db
      .select()
      .from(campaignRecipients)
      .where(where)
      .orderBy(order)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const [totalRow] = await this.db.select({ value: count() }).from(campaignRecipients).where(where);
    return { items: rows.map(toRecipientDto), total: totalRow?.value ?? 0 };
  }

  findById(id: string): Promise<CampaignRecipientRow | undefined> {
    return this.db.query.campaignRecipients.findFirst({ where: eq(campaignRecipients.id, id) });
  }

  findByMetaMessageId(metaMessageId: string): Promise<CampaignRecipientRow | undefined> {
    return this.db.query.campaignRecipients.findFirst({ where: eq(campaignRecipients.metaMessageId, metaMessageId) });
  }

  async listByCampaign(campaignId: string): Promise<CampaignRecipientRow[]> {
    return this.db.select().from(campaignRecipients).where(eq(campaignRecipients.campaignId, campaignId));
  }

  async deleteByCampaignId(campaignId: string): Promise<void> {
    await this.db.delete(campaignRecipients).where(eq(campaignRecipients.campaignId, campaignId));
  }

  async insertMany(values: NewCampaignRecipient[]): Promise<void> {
    if (values.length === 0) {
      return;
    }
    const payload = values.map((value) => ({
      ...value,
      // cast jsonb columns to plain objects for insertion
      contactSnapshot: value.contactSnapshot as unknown as Record<string, unknown> | null,
      resolvedTemplateParameters: value.resolvedTemplateParameters as unknown as string[] | null,
    })) as unknown as Array<typeof campaignRecipients.$inferInsert>;
    await this.db.insert(campaignRecipients).values(payload).onConflictDoNothing({
      target: campaignRecipients.idempotencyKey,
    });
  }

  async setStatus(
    id: string,
    status: CampaignRecipientStatus,
    values: Partial<CampaignRecipientRow> = {},
  ): Promise<void> {
    await this.db.update(campaignRecipients).set({ status, ...values }).where(eq(campaignRecipients.id, id));
  }

  async setQueueJobId(id: string, queueJobId: string, queuedAt: Date): Promise<void> {
    await this.db
      .update(campaignRecipients)
      .set({ queueJobId, queuedAt, status: 'QUEUED' })
      .where(eq(campaignRecipients.id, id));
  }

  async setStatusByMetaMessageId(
    metaMessageId: string,
    apply: { status: CampaignRecipientStatus; values: Partial<CampaignRecipientRow> },
    currentStatuses: CampaignRecipientStatus[] = ['QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'READ'],
  ): Promise<CampaignRecipientRow | undefined> {
    const rows = await this.db
      .update(campaignRecipients)
      .set({ status: apply.status, ...apply.values })
      .where(
        and(
          eq(campaignRecipients.metaMessageId, metaMessageId),
          inArray(campaignRecipients.status, currentStatuses),
        ),
      )
      .returning();
    return rows[0];
  }

  async update(id: string, values: Partial<CampaignRecipientRow>): Promise<CampaignRecipientRow | undefined> {
    const rows = await this.db.update(campaignRecipients).set(values).where(eq(campaignRecipients.id, id)).returning();
    return rows[0];
  }

  async findEligibleForCampaign(campaignId: string): Promise<CampaignRecipientRow[]> {
    return this.db
      .select()
      .from(campaignRecipients)
      .where(
        and(
          eq(campaignRecipients.campaignId, campaignId),
          eq(campaignRecipients.status, 'PENDING'),
        ),
      );
  }

  async countByStatus(campaignId: string, status: CampaignRecipientStatus): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(campaignRecipients)
      .where(and(eq(campaignRecipients.campaignId, campaignId), eq(campaignRecipients.status, status)));
    return row?.value ?? 0;
  }

  async countByStatuses(campaignId: string, statuses: CampaignRecipientStatus[]): Promise<number> {
    if (statuses.length === 0) {
      return 0;
    }
    const [row] = await this.db
      .select({ value: count() })
      .from(campaignRecipients)
      .where(and(eq(campaignRecipients.campaignId, campaignId), inArray(campaignRecipients.status, statuses)));
    return row?.value ?? 0;
  }

  async listByStatusForContact(contactId: string, statuses: CampaignRecipientStatus[]): Promise<CampaignRecipientRow[]> {
    if (statuses.length === 0) {
      return [];
    }
    return this.db
      .select()
      .from(campaignRecipients)
      .where(and(eq(campaignRecipients.contactId, contactId), inArray(campaignRecipients.status, statuses)));
  }

  async cancelUnsentForCampaign(campaignId: string): Promise<CampaignRecipientRow[]> {
    return this.db
      .update(campaignRecipients)
      .set({ status: 'CANCELLED' })
      .where(
        and(
          eq(campaignRecipients.campaignId, campaignId),
          inArray(campaignRecipients.status, ['PENDING', 'QUEUED', 'INELIGIBLE']),
        ),
      )
      .returning();
  }

  recipientCsvRow(row: CampaignRecipientRow): string {
    const cells = [
      row.phoneE164,
      row.status,
      row.eligibilityReason ?? '',
      row.sentAt ? row.sentAt.toISOString() : '',
      row.deliveredAt ? row.deliveredAt.toISOString() : '',
      row.readAt ? row.readAt.toISOString() : '',
      row.repliedAt ? row.repliedAt.toISOString() : '',
      row.failedAt ? row.failedAt.toISOString() : '',
      row.failureCode ?? '',
      (row.failureMessage ?? '').replace(/"/g, '""'),
      String(row.attemptCount),
    ];
    return cells.map((cell) => `"${cell}"`).join(',');
  }
}