import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { DailySummarySettings, SaveDailySummarySettingsInput } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { settings, users } from '../../db/schema';
import { MailService } from './mail.service';

const NAMESPACE = 'mail-summary';

export const SUMMARY_SECTIONS = [
  'campaignsCompleted',
  'messagesSent',
  'delivered',
  'read',
  'replies',
  'failed',
  'optOuts',
  'openConversations',
  'unassignedConversations',
  'failedImports',
  'integrationErrors',
  'queueHealth',
] as const;

const DEFAULT_SUMMARY: DailySummarySettings = {
  enabled: false,
  recipients: [],
  time: '08:00',
  includeSections: [...SUMMARY_SECTIONS],
};

@Injectable()
export class MailSummaryService {
  private readonly logger = new Logger(MailSummaryService.name);

  constructor(
    private readonly mailService: MailService,
    @Inject(DATABASE) private readonly db: DrizzleDB,
  ) {}

  async getSettings(): Promise<DailySummarySettings> {
    const [row] = await this.db.select().from(settings).where(and(eq(settings.namespace, NAMESPACE), eq(settings.key, 'settings')));
    if (!row?.publicValue) {
      return DEFAULT_SUMMARY;
    }
    try {
      return { ...DEFAULT_SUMMARY, ...(JSON.parse(row.publicValue) as Partial<DailySummarySettings>) };
    } catch {
      return DEFAULT_SUMMARY;
    }
  }

  async saveSettings(input: SaveDailySummarySettingsInput): Promise<DailySummarySettings> {
    const current = await this.getSettings();
    const next: DailySummarySettings = {
      enabled: input.enabled ?? current.enabled,
      recipients: input.recipients ?? current.recipients,
      time: input.time ?? current.time,
      includeSections: input.includeSections ?? current.includeSections,
    };
    await this.db
      .insert(settings)
      .values({ namespace: NAMESPACE, key: 'settings', publicValue: JSON.stringify(next) })
      .onConflictDoUpdate({ target: [settings.namespace, settings.key], set: { publicValue: JSON.stringify(next) } });
    return next;
  }

  async runFor(day: Date): Promise<void> {
    const settingsData = await this.getSettings();
    if (!settingsData.enabled) {
      return;
    }
    const date = day.toISOString().slice(0, 10);
    const stats = await this.compute(date);
    const recipients = settingsData.recipients.length > 0 ? settingsData.recipients : await this.adminEmails();

    for (const email of recipients) {
      const idempotencyKey = `daily-summary-${date}-${email}`;
      await this.mailService.enqueue({
        templateKey: 'daily-summary',
        to: email,
        language: 'ar',
        vars: { date, ...stats },
        idempotencyKey,
        triggerEvent: 'daily-summary',
        category: 'management',
      });
    }
    this.logger.log(`Daily summary for ${date} dispatched to ${recipients.length} recipients`);
  }

  private async adminEmails(): Promise<string[]> {
    const rows = await this.db.select({ email: users.email }).from(users).where(and(eq(users.role, 'ADMIN'), eq(users.status, 'ACTIVE')));
    return rows.map((row) => row.email);
  }

  private async compute(date: string): Promise<Record<string, number>> {
    const from = new Date(`${date}T00:00:00+02:00`);
    const to = new Date(`${date}T23:59:59+02:00`);
    const c = async (table: string, extra = ''): Promise<number> => {
      try {
        const rows = await this.db.execute(sql`
          SELECT count(*)::int AS value FROM ${sql.raw(table)}
          WHERE "created_at" >= ${from} AND "created_at" < ${to} ${sql.raw(extra)}
        `);
        const first = rows.rows[0] as { value?: number } | undefined;
        return Number(first?.value ?? 0);
      } catch {
        return 0;
      }
    };
    return {
      campaignsCompleted: await c('campaigns', `AND status IN ('COMPLETED','CANCELLED')`),
      messagesSent: await c('messages', `AND "direction" = 'OUTBOUND'`),
      delivered: await c('messages', `AND status = 'DELIVERED'`),
      read: await c('messages', `AND status = 'READ'`),
      replies: await c('messages', `AND "direction" = 'INBOUND'`),
      failed: await c('messages', `AND status = 'FAILED'`),
      optOuts: await c('suppression_entries'),
      openConversations: await c('conversations', `AND status = 'OPEN'`),
      unassignedConversations: await c('conversations', `AND status = 'OPEN' AND NOT EXISTS (SELECT 1 FROM conversation_assignments a WHERE a.conversation_id = conversations.id)`),
      failedImports: await c('import_jobs', `AND status = 'FAILED'`),
      integrationErrors: await c('webhook_events', `AND processing_status = 'FAILED'`),
      queueHealth: 0,
    };
  }
}
