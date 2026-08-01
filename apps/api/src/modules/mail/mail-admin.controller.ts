import { Body, Controller, Get, HttpCode, HttpStatus, Inject, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  mailTestInputSchema,
  saveDailySummarySettingsInputSchema,
  saveMailConfigInputSchema,
  type DailySummarySettings,
  type MailConfigDto,
  type MailTestInput,
  type PaginatedEmailLogs,
  type SaveDailySummarySettingsInput,
  type SaveMailConfigInput,
} from '@wa/shared';
import { eq } from 'drizzle-orm';

import { CurrentUser, RateLimit, Roles } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditService } from '../../common/audit/audit.module';
import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { AUDIT_ACTIONS } from '@wa/shared';
import { ERROR_CODES } from '../../common/errors';
import { emailLogs } from '../../db/schema';
import type { AuthUser } from '../auth/auth.types';
import { MailLogDao } from './mail-log.dao';
import { MailService } from './mail.service';
import { MailSettingsService } from './mail-settings.service';
import { MailSummaryService } from './mail-summary.service';
import { MailSummaryScheduler } from './mail-summary.scheduler';

@ApiTags('admin-email')
@ApiBearerAuth()
@Controller('admin/email')
export class MailAdminController {
  constructor(
    private readonly settingsService: MailSettingsService,
    private readonly mailService: MailService,
    private readonly mailLogDao: MailLogDao,
    private readonly summaryService: MailSummaryService,
    private readonly summaryScheduler: MailSummaryScheduler,
    private readonly auditService: AuditService,
    @Inject(DATABASE) private readonly db: DrizzleDB,
  ) {}

  @Get('settings')
  @Roles('ADMIN')
  async settings(): Promise<{ email: MailConfigDto; dailySummary: DailySummarySettings }> {
    const [email, dailySummary] = await Promise.all([this.settingsService.getConfigDto(), this.summaryService.getSettings()]);
    return { email, dailySummary };
  }

  @Patch('settings')
  @Roles('ADMIN')
  async saveSettings(@Body(new ZodValidationPipe(saveMailConfigInputSchema)) input: SaveMailConfigInput, @CurrentUser() actor: AuthUser): Promise<MailConfigDto> {
    const result = await this.settingsService.save(input);
    await this.auditService.record({
      actorUserId: actor.id,
      action: input.password ? AUDIT_ACTIONS.SMTP_CREDENTIALS_REPLACED : AUDIT_ACTIONS.SMTP_SETTINGS_CHANGED,
      entityType: 'mail',
      metadata: { host: result.host, port: result.port, enabled: result.enabled },
    });
    return result;
  }

  @Post('settings/test')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  async testConnection(@CurrentUser() actor: AuthUser): Promise<{ ok: boolean; error?: string }> {
    const result = await this.settingsService.testConnection();
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.SMTP_CONNECTION_TESTED,
      entityType: 'mail',
      metadata: { ok: result.ok },
    });
    return result;
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 10, ttlSeconds: 60 })
  @Roles('ADMIN')
  async sendTestEmail(@Body(new ZodValidationPipe(mailTestInputSchema)) input: MailTestInput, @CurrentUser() actor: AuthUser): Promise<{ queued: boolean; status: string }> {
    const result = await this.mailService.enqueue({
      templateKey: 'test-email',
      to: input.to,
      userId: actor.id,
      language: input.language,
      vars: { sentAt: new Date().toISOString() },
      idempotencyKey: this.mailService.buildIdempotencyKey(['test-email', input.to, Date.now()]),
      triggerEvent: 'admin-test-email',
      category: 'security',
      securityCritical: true,
    });
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.EMAIL_TEST_REQUESTED,
      entityType: 'mail',
      metadata: { to: input.to },
    });
    return { queued: result.queued, status: result.status };
  }

  @Get('logs')
  @Roles('ADMIN')
  async logs(@Query('status') status: string | undefined, @Query('page') page = '1', @Query('pageSize') pageSize = '50'): Promise<PaginatedEmailLogs> {
    const { items, total } = await this.mailLogDao.list({
      status: status as never,
      page: Number(page),
      pageSize: Number(pageSize),
    });
    return {
      items: items.map((row) => ({
        id: row.id,
        userId: row.userId,
        recipientEmail: row.recipientEmail,
        templateKey: row.templateKey,
        subject: row.subject,
        language: row.language,
        status: row.status,
        providerMessageId: row.providerMessageId,
        idempotencyKey: row.idempotencyKey,
        relatedEntityType: row.relatedEntityType,
        relatedEntityId: row.relatedEntityId,
        triggerEvent: row.triggerEvent,
        attemptCount: row.attemptCount,
        queuedAt: row.queuedAt.toISOString(),
        sentAt: row.sentAt?.toISOString() ?? null,
        failedAt: row.failedAt?.toISOString() ?? null,
        failureCode: row.failureCode,
        failureMessage: row.failureMessage,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page: Number(page),
      pageSize: Number(pageSize),
      totalPages: total === 0 ? 0 : Math.ceil(total / Number(pageSize)),
    };
  }

  @Post('logs/:id/retry')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  async retryFailed(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<{ queued: boolean }> {
    const log = await this.mailLogDao.findById(id);
    if (!log) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    await this.db.update(emailLogs).set({ status: 'QUEUED', failedAt: null, failureCode: null, failureMessage: null }).where(eq(emailLogs.id, id));
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.EMAIL_MANUAL_RETRY,
      entityType: 'email_log',
      entityId: id,
      metadata: { templateKey: log.templateKey },
    });
    return { queued: true };
  }

  @Patch('daily-summary')
  @Roles('ADMIN')
  async saveDailySummary(@Body(new ZodValidationPipe(saveDailySummarySettingsInputSchema)) input: SaveDailySummarySettingsInput, @CurrentUser() actor: AuthUser): Promise<DailySummarySettings> {
    const result = await this.summaryService.saveSettings(input);
    await this.summaryScheduler.upsertRepeatJob();
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.DAILY_SUMMARY_SETTINGS_CHANGED,
      entityType: 'mail-summary',
      metadata: { enabled: result.enabled, time: result.time },
    });
    return result;
  }
}
