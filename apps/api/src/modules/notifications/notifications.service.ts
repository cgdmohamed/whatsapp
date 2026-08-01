import { Inject, Injectable } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import type { NotificationPreferencesInput, NotificationType, Role } from '@wa/shared';
import { AUDIT_ACTIONS } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { AuditService } from '../../common/audit/audit.module';
import { users } from '../../db/schema';
import { MailService, type EmailCategory } from '../mail/mail.service';
import { NotificationsDao } from './notifications.dao';
import { NotificationsRealtimeService } from './notifications-realtime.service';

export interface CreateNotificationInput {
  type: NotificationType;
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  titleAr: string;
  titleEn: string;
  messageAr?: string;
  messageEn?: string;
  actionUrl?: string;
  entityType?: string;
  entityId?: string;
  expiresAt?: Date;
}

export interface NotifyTargetsOptions extends CreateNotificationInput {
  userIds?: string[];
  roles?: Role[];
  category: EmailCategory;
  email?: {
    templateKey: string;
    vars: Record<string, string | number | null | undefined>;
    securityCritical?: boolean;
  };
}

const CATEGORY_IN_APP_KEY: Record<EmailCategory, keyof import('../../db/schema').NotificationPreferencesRow> = {
  security: 'inAppSecurityAlerts',
  campaign: 'inAppCampaignAlerts',
  integration: 'inAppIntegrationAlerts',
  import: 'inAppImportAlerts',
  management: 'inAppSecurityAlerts',
};

const CATEGORY_EMAIL_KEY: Record<EmailCategory, keyof import('../../db/schema').NotificationPreferencesRow> = {
  security: 'emailSecurityAlerts',
  campaign: 'emailCampaignAlerts',
  integration: 'emailIntegrationAlerts',
  import: 'emailImportAlerts',
  management: 'emailManagementSummary',
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly dao: NotificationsDao,
    private readonly realtime: NotificationsRealtimeService,
    private readonly mailService: MailService,
    private readonly auditService: AuditService,
    @Inject(DATABASE) private readonly db: DrizzleDB,
  ) {}

  async createForUser(userId: string, input: CreateNotificationInput): Promise<void> {
    const row = await this.dao.insert({
      userId,
      type: input.type,
      severity: input.severity,
      titleAr: input.titleAr,
      titleEn: input.titleEn,
      messageAr: input.messageAr ?? null,
      messageEn: input.messageEn ?? null,
      actionUrl: input.actionUrl ?? null,
      relatedEntityType: input.entityType ?? null,
      relatedEntityId: input.entityId ?? null,
      expiresAt: input.expiresAt ?? null,
    });
    this.realtime.emit({ type: 'notification', id: row.id, userId });
  }

  async notifyTargets(options: NotifyTargetsOptions): Promise<void> {
    const ids = new Set<string>(options.userIds ?? []);
    if (options.roles && options.roles.length > 0) {
      const rows = await this.db
        .select({ id: users.id, email: users.email, preferredLanguage: users.preferredLanguage })
        .from(users)
        .where(inArray(users.role, options.roles));
      for (const row of rows) {
        ids.add(row.id);
      }
    }
    if (ids.size === 0) {
      return;
    }

    const prefs = new Map<string, import('../../db/schema').NotificationPreferencesRow | null>();
    for (const userId of ids) {
      prefs.set(userId, await this.dao.getPreferences(userId));
    }

    const usersById = new Map<string, { email: string; preferredLanguage: 'ar' | 'en' }>();
    if (options.email) {
      const rows = await this.db
        .select({ id: users.id, email: users.email, preferredLanguage: users.preferredLanguage })
        .from(users)
        .where(inArray(users.id, [...ids]));
      for (const row of rows) {
        usersById.set(row.id, { email: row.email, preferredLanguage: row.preferredLanguage });
      }
    }

    for (const userId of ids) {
      const pref = prefs.get(userId);
      const securityCritical = options.category === 'security';
      const inAppAllowed = securityCritical || !pref || Boolean(pref[CATEGORY_IN_APP_KEY[options.category]]);
      if (inAppAllowed) {
        await this.createForUser(userId, {
          type: options.type,
          severity: options.severity,
          titleAr: options.titleAr,
          titleEn: options.titleEn,
          messageAr: options.messageAr,
          messageEn: options.messageEn,
          actionUrl: options.actionUrl,
          entityType: options.entityType,
          entityId: options.entityId,
          expiresAt: options.expiresAt,
        });
      }

      if (options.email) {
        const emailAllowed = options.email.securityCritical || securityCritical || !pref || Boolean(pref[CATEGORY_EMAIL_KEY[options.category]]);
        if (emailAllowed) {
          const target = usersById.get(userId);
          if (target) {
            const idempotencyKey = this.mailService.buildIdempotencyKey([
              options.email.templateKey,
              userId,
              options.entityId ?? options.titleEn,
              Date.now(),
            ]);
            await this.mailService.enqueue({
              templateKey: options.email.templateKey,
              to: target.email,
              userId,
              language: target.preferredLanguage === 'en' ? 'en' : 'ar',
              vars: options.email.vars,
              idempotencyKey,
              triggerEvent: options.email.templateKey,
              relatedEntityType: options.entityType,
              relatedEntityId: options.entityId,
              category: options.category,
              securityCritical: options.email.securityCritical || securityCritical,
            });
          }
        }
      }
    }
  }

  async getPreferences(userId: string): Promise<import('@wa/shared').NotificationPreferencesDto> {
    const row = await this.dao.getPreferences(userId);
    return {
      emailSecurityAlerts: row?.emailSecurityAlerts ?? true,
      emailCampaignAlerts: row?.emailCampaignAlerts ?? true,
      emailIntegrationAlerts: row?.emailIntegrationAlerts ?? true,
      emailImportAlerts: row?.emailImportAlerts ?? true,
      emailManagementSummary: row?.emailManagementSummary ?? true,
      inAppSecurityAlerts: row?.inAppSecurityAlerts ?? true,
      inAppCampaignAlerts: row?.inAppCampaignAlerts ?? true,
      inAppIntegrationAlerts: row?.inAppIntegrationAlerts ?? true,
      inAppImportAlerts: row?.inAppImportAlerts ?? true,
    };
  }

  async updatePreferences(userId: string, input: NotificationPreferencesInput, actorId: string): Promise<import('@wa/shared').NotificationPreferencesDto> {
    const patch: Record<string, boolean> = {};
    for (const key of Object.keys(input) as Array<keyof NotificationPreferencesInput>) {
      const value = input[key];
      if (value !== undefined) {
        patch[key as string] = value;
      }
    }
    await this.dao.updatePreferences(userId, patch);
    await this.auditService.record({
      actorUserId: actorId,
      action: AUDIT_ACTIONS.NOTIFICATION_PREFERENCES_CHANGED,
      entityType: 'notification_preferences',
      entityId: userId,
      metadata: { keys: Object.keys(patch) },
    });
    return this.getPreferences(userId);
  }
}
