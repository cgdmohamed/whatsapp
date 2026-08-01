import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { createTransport } from 'nodemailer';
import type { Language } from '@wa/shared';
import { randomUUID } from 'node:crypto';

import { EMAIL_QUEUE } from '../../common/queue/queue.module';
import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { notificationPreferences } from '../../db/schema';
import { EMAIL_TEMPLATES, type EmailVars } from './email-templates';
import { MailLogDao } from './mail-log.dao';
import { MailSettingsService } from './mail-settings.service';

export type EmailCategory = 'security' | 'campaign' | 'integration' | 'import' | 'management';

export interface EnqueueEmailInput {
  templateKey: string;
  to: string;
  userId?: string | null;
  language: Language;
  vars: EmailVars;
  idempotencyKey: string;
  triggerEvent?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  category?: EmailCategory;
  securityCritical?: boolean;
}

export interface EmailJobData {
  logId: string;
  templateKey: string;
  to: string;
  userId: string | null;
  language: Language;
  vars: EmailVars;
}

const SECURITY_CRITICAL_TEMPLATES = new Set([
  'password-changed',
  'password-reset-confirmation',
  'account-suspended',
  'new-login-alert',
  'sessions-revoked',
]);

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly appUrl: string;
  private readonly appName: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly mailLogDao: MailLogDao,
    private readonly settingsService: MailSettingsService,
    @Inject(DATABASE) private readonly db: DrizzleDB,
    @Inject(EMAIL_QUEUE) private readonly emailQueue: unknown,
  ) {
    this.appUrl = this.configService.get<string>('APP_PUBLIC_URL', 'http://localhost:5173');
    this.appName = 'WhatsApp Campaign Manager';
  }

  get isEnabled(): boolean {
    return this.configService.get<boolean>('MAIL_ENABLED', false);
  }

  get publicUrl(): string {
    return this.appUrl;
  }

  async enqueue(input: EnqueueEmailInput): Promise<{ id: string; status: string; queued: boolean }> {
    const enabled = (await this.settingsService.getConfig()).enabled;
    if (!enabled) {
      this.logger.log(`Transactional email disabled; not sending "${input.templateKey}" to ${input.to}`);
      return { id: '', status: 'CANCELLED', queued: false };
    }

    const existing = await this.mailLogDao.findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      return { id: existing.id, status: existing.status, queued: false };
    }

    if (input.userId && !input.securityCritical) {
      const allowed = await this.isAllowedByPreferences(input.userId, input.category ?? 'security', SECURITY_CRITICAL_TEMPLATES.has(input.templateKey));
      if (!allowed) {
        return { id: '', status: 'CANCELLED', queued: false };
      }
    }

    const log = await this.mailLogDao.insert({
      userId: input.userId ?? null,
      recipientEmail: input.to,
      templateKey: input.templateKey,
      subject: this.subjectFor(input.templateKey, input.language),
      language: input.language,
      status: 'QUEUED',
      idempotencyKey: input.idempotencyKey,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
      triggerEvent: input.triggerEvent,
      queuedAt: new Date(),
    });

    const jobData: EmailJobData = {
      logId: log.id,
      templateKey: input.templateKey,
      to: input.to,
      userId: input.userId ?? null,
      language: input.language,
      vars: input.vars,
    };

    await (this.emailQueue as { add: (name: string, data: unknown, opts?: unknown) => Promise<unknown> }).add(
      'send-email',
      jobData,
      { jobId: `email-${input.idempotencyKey}`, attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 200, removeOnFail: 200 },
    );

    return { id: log.id, status: 'QUEUED', queued: true };
  }

  async processEmail(jobData: EmailJobData): Promise<void> {
    const template = EMAIL_TEMPLATES[jobData.templateKey];
    if (!template) {
      await this.mailLogDao.updateStatus(jobData.logId, { status: 'FAILED', failedAt: new Date(), failureCode: 'UNKNOWN_TEMPLATE', failureMessage: `No template "${jobData.templateKey}"` });
      return;
    }

    const config = await this.settingsService.getConfig();
    if (!config.enabled) {
      await this.mailLogDao.updateStatus(jobData.logId, { status: 'CANCELLED' });
      return;
    }

    const password = await this.settingsService.getPassword();
    const log = await this.mailLogDao.findById(jobData.logId);
    const attemptCount = (log?.attemptCount ?? 0) + 1;
    await this.mailLogDao.markProcessing(jobData.logId, attemptCount);

    const { subject, html, text } = this.render(jobData.templateKey, jobData.language, jobData.vars);

    try {
      const transporter = createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.username ? { user: config.username, pass: password ?? '' } : undefined,
      });
      const fromName = config.fromName || this.appName;
      const from = { name: fromName, address: config.fromEmail || 'no-reply@localhost' };
      const info = await transporter.sendMail({
        from,
        to: jobData.to,
        replyTo: config.replyTo || undefined,
        subject,
        html,
        text,
      });
      transporter.close();
      const messageId = typeof info.messageId === 'string' ? info.messageId : null;
      await this.mailLogDao.updateStatus(jobData.logId, {
        status: 'SENT',
        providerMessageId: messageId,
        sentAt: new Date(),
      });
      await this.settingsService.recordSent(messageId ?? '');
      this.logger.log(`Email sent: template="${jobData.templateKey}" to=${jobData.to} id=${messageId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Email failed: template="${jobData.templateKey}" to=${jobData.to} error=${message}`);
      await this.mailLogDao.updateStatus(jobData.logId, {
        status: 'FAILED',
        failedAt: new Date(),
        failureCode: 'SMTP_ERROR',
        failureMessage: message.slice(0, 500),
      });
      await this.settingsService.recordFailed();
      throw error;
    }
  }

  render(templateKey: string, language: Language, vars: EmailVars) {
    const template = EMAIL_TEMPLATES[templateKey];
    if (!template) {
      throw new Error(`Unknown email template "${templateKey}"`);
    }
    const app = { appName: this.appName, appUrl: this.appUrl, companyName: this.appName, supportEmail: '' };
    const { subjectAr, subjectEn, body } = template;
    const rendered = body(vars, language, app);
    return {
      subject: language === 'ar' ? subjectAr : subjectEn,
      html: rendered.html,
      text: rendered.text,
    };
  }

  subjectFor(templateKey: string, language: Language): string {
    const template = EMAIL_TEMPLATES[templateKey];
    return template ? (language === 'ar' ? template.subjectAr : template.subjectEn) : templateKey;
  }
  buildIdempotencyKey(parts: Array<string | number | undefined>): string {
    return parts.filter((part) => part !== undefined && part !== '').join('-');
  }

  private async isAllowedByPreferences(userId: string, category: EmailCategory, securityCritical: boolean): Promise<boolean> {
    if (securityCritical) {
      return true;
    }
    const row = await this.db.query.notificationPreferences.findFirst({ where: eq(notificationPreferences.userId, userId) });
    if (!row) {
      return true;
    }
    switch (category) {
      case 'campaign':
        return row.emailCampaignAlerts;
      case 'integration':
        return row.emailIntegrationAlerts;
      case 'import':
        return row.emailImportAlerts;
      case 'management':
        return row.emailManagementSummary;
      default:
        return row.emailSecurityAlerts;
    }
  }
}

export function newIdempotencyKey(): string {
  return randomUUID();
}
