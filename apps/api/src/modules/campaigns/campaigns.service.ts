import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CampaignDto,
  CampaignQuery,
  CampaignRecipientQuery,
  CampaignRecipientStatus,
  CampaignStatus,
  CreateCampaignInput,
  PreflightReport,
  TemplateSnapshot,
  TestSendInput,
  TestSendResult,
  UpdateCampaignInput,
} from '@wa/shared';
import { AUDIT_ACTIONS } from '@wa/shared';

import { ERROR_CODES } from '../../common/errors';
import { AuditService } from '../../common/audit/audit.module';
import { SettingsService } from '../settings/settings.service';
import type { AuthUser } from '../auth/auth.types';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { MessageTemplatesDao } from '../whatsapp/templates/message-templates.dao';
import { WhatsAppAccountsDao } from '../whatsapp/whatsapp-accounts.dao';
import { WhatsAppPhoneNumbersDao } from '../whatsapp/whatsapp-phone-numbers.dao';
import { MetaApiError } from '../whatsapp/meta-api/meta-api.errors';
import { AudienceService, collectTemplateVariableNames } from './audience.service';
import { CampaignRecipientsDao } from './campaign-recipients.dao';
import { CampaignsDao, toCampaignDto } from './campaigns.dao';
import { CampaignDispatchService } from './campaign-dispatch.service';
import { MessagesDao } from '../inbox/messages.dao';
import type { CampaignRow, MessageTemplateRow } from '../../db/schema';

const EDITABLE_STATUSES: CampaignStatus[] = ['DRAFT'];

function isTransient(error: unknown): boolean {
  return error instanceof MetaApiError && error.normalized.is_transient;
}

function describeError(error: unknown): string {
  if (error instanceof MetaApiError) {
    const { normalized } = error;
    return [normalized.title, normalized.message].filter(Boolean).join(': ');
  }
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class CampaignsService {
  constructor(
    private readonly campaignsDao: CampaignsDao,
    private readonly recipientsDao: CampaignRecipientsDao,
    private readonly templatesDao: MessageTemplatesDao,
    private readonly whatsappService: WhatsAppService,
    private readonly accountsDao: WhatsAppAccountsDao,
    private readonly phoneNumbersDao: WhatsAppPhoneNumbersDao,
    private readonly audienceService: AudienceService,
    private readonly dispatchService: CampaignDispatchService,
    private readonly settingsService: SettingsService,
    private readonly messagesDao: MessagesDao,
    private readonly auditService: AuditService,
  ) {}

  async create(input: CreateCampaignInput, actor: AuthUser): Promise<CampaignDto> {
    const template = await this.templatesDao.findById(input.messageTemplateId);
    if (!template) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    const settings = await this.settingsService.getAll();
    const resolution = await this.audienceService.resolveAudience(
      input.audience,
      input.variableMapping,
      collectTemplateVariableNames(template.components),
      settings.defaultCountry,
    );
    const row = await this.campaignsDao.insert({
      name: input.name,
      description: input.description ?? null,
      whatsappPhoneNumberId: input.whatsappPhoneNumberId,
      messageTemplateId: input.messageTemplateId,
      templateSnapshot: this.snapshotTemplate(template),
      language: input.language,
      status: 'DRAFT',
      audienceType: input.audience.type,
      audienceSnapshot: resolution.snapshot as unknown[],
      variableMapping: input.variableMapping as unknown[],
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      createdByUserId: actor.id,
    });
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.CAMPAIGN_CREATE,
      entityType: 'campaign',
      entityId: row.id,
      metadata: { name: input.name, audienceSize: resolution.snapshot.length },
    });
    return toCampaignDto(row);
  }

  async update(id: string, input: UpdateCampaignInput, actor: AuthUser): Promise<CampaignDto> {
    const campaign = await this.requireCampaign(id);
    if (!EDITABLE_STATUSES.includes(campaign.status)) {
      throw new ConflictException(ERROR_CODES.INVALID_OPERATION);
    }
    const patch: Record<string, unknown> = { status: 'DRAFT' };
    if (input.name !== undefined) {
      patch.name = input.name;
    }
    if (input.description !== undefined) {
      patch.description = input.description;
    }
    if (input.whatsappPhoneNumberId !== undefined) {
      patch.whatsappPhoneNumberId = input.whatsappPhoneNumberId;
    }
    if (input.messageTemplateId !== undefined) {
      const template = await this.templatesDao.findById(input.messageTemplateId);
      if (!template) {
        throw new NotFoundException(ERROR_CODES.NOT_FOUND);
      }
      patch.messageTemplateId = input.messageTemplateId;
      patch.templateSnapshot = this.snapshotTemplate(template);
    }
    if (input.language !== undefined) {
      patch.language = input.language;
    }
    if (input.audience !== undefined) {
      patch.audienceType = input.audience.type;
    }
    if (input.variableMapping !== undefined) {
      patch.variableMapping = input.variableMapping as unknown;
    }
    if (input.scheduledAt !== undefined) {
      patch.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    }

    // If the audience, template, or variable mapping changed, rebuild the frozen snapshot.
    if (input.audience !== undefined || input.variableMapping !== undefined || input.messageTemplateId !== undefined) {
      const settings = await this.settingsService.getAll();
      const mergedVariableMapping = ((patch.variableMapping as unknown) ?? campaign.variableMapping) as never;
      const template = input.messageTemplateId
        ? await this.templatesDao.findById(input.messageTemplateId)
        : campaign.messageTemplateId
          ? await this.templatesDao.findById(campaign.messageTemplateId)
          : null;
      const templateVarNames = collectTemplateVariableNames(template?.components ?? null);

      let resolution;
      if (input.audience !== undefined) {
        resolution = await this.audienceService.resolveAudience(
          input.audience,
          mergedVariableMapping,
          templateVarNames,
          settings.defaultCountry,
        );
      } else {
        resolution = await this.audienceService.resolveFromSnapshot(
          (campaign.audienceSnapshot as unknown[]) as never,
          mergedVariableMapping,
          templateVarNames,
          settings.defaultCountry,
        );
      }
      patch.audienceSnapshot = resolution.snapshot as unknown[];
      await this.recipientsDao.deleteByCampaignId(id);
    }

    const updated = await this.campaignsDao.update(id, patch);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.CAMPAIGN_UPDATE,
      entityType: 'campaign',
      entityId: id,
      metadata: { fields: Object.keys(input) },
    });
    return toCampaignDto(updated!);
  }

  async get(id: string): Promise<CampaignDto> {
    const campaign = await this.requireCampaign(id);
    return toCampaignDto(campaign);
  }

  async list(query: CampaignQuery): Promise<{ items: CampaignDto[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const result = await this.campaignsDao.list(query);
    return {
      items: result.items,
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(result.total / query.pageSize),
    };
  }

  async validate(id: string, actor: AuthUser): Promise<PreflightReport> {
    const campaign = await this.requireCampaign(id);
    if (!['DRAFT', 'VALIDATING', 'READY'].includes(campaign.status)) {
      throw new ConflictException(ERROR_CODES.INVALID_OPERATION);
    }
    await this.campaignsDao.update(id, { status: 'VALIDATING' });

    const report = await this.runPreflight(campaign);
    await this.persistRecipients(campaign);

    if (report.valid) {
      await this.campaignsDao.update(id, {
        status: 'READY',
        eligibleRecipients: report.breakdown.eligible,
        skippedRecipients: report.breakdown.totalSelected - report.breakdown.eligible,
        totalRecipients: report.breakdown.totalSelected,
        approvedByUserId: actor.id,
      });
    } else {
      await this.campaignsDao.update(id, { status: 'DRAFT' });
    }
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.CAMPAIGN_VALIDATE,
      entityType: 'campaign',
      entityId: id,
      metadata: { valid: report.valid, eligible: report.breakdown.eligible },
    });
    return report;
  }

  private async runPreflight(campaign: CampaignRow): Promise<PreflightReport> {
    const errors: string[] = [];
    const checks = {
      accountConnected: false,
      phoneNumberActive: false,
      templateApproved: false,
      templateStatusUnchanged: false,
      templateLanguageMatches: false,
      sendingLimitsConfigured: false,
    };

    const template = campaign.messageTemplateId ? await this.templatesDao.findById(campaign.messageTemplateId) : null;
    const snapshot = (campaign.templateSnapshot as unknown as TemplateSnapshot | null) ?? null;
    checks.templateApproved = template?.status === 'APPROVED';
    checks.templateStatusUnchanged = template != null && (!snapshot || !snapshot.blockedAt) && template.status === 'APPROVED';
    checks.templateLanguageMatches = template?.language === campaign.language;
    if (!template) {
      errors.push('TEMPLATE_NOT_FOUND');
    } else if (template.status !== 'APPROVED') {
      errors.push('TEMPLATE_NOT_APPROVED');
    } else if (template.blockedAt) {
      errors.push('TEMPLATE_BLOCKED');
    } else if (template.language !== campaign.language) {
      errors.push('TEMPLATE_LANGUAGE_MISMATCH');
    }

    const account = await this.accountsDao.getFirst();
    checks.accountConnected = account?.status === 'CONNECTED' && !!account.wabaId;
    if (!checks.accountConnected) {
      errors.push('WHATSAPP_NOT_CONNECTED');
    }

    const phoneNumber = campaign.whatsappPhoneNumberId
      ? await this.phoneNumbersDao.findDefault(account?.id ?? '')
      : null;
    checks.phoneNumberActive = phoneNumber != null && (phoneNumber.status === null || phoneNumber.status === 'ACTIVE');
    if (!checks.phoneNumberActive) {
      errors.push('PHONE_NUMBER_NOT_ACTIVE');
    }

    const settings = await this.settingsService.getAll();
    checks.sendingLimitsConfigured = settings.campaignSendingConcurrency > 0 && settings.campaignMessagesPerMinute > 0;
    if (!checks.sendingLimitsConfigured) {
      errors.push('SENDING_LIMITS_NOT_CONFIGURED');
    }

    const resolution = await this.audienceService.resolveFromSnapshot(
      (campaign.audienceSnapshot as unknown[]) as never,
      (campaign.variableMapping as unknown[]) as never,
      collectTemplateVariableNames(snapshot?.components ?? null),
      settings.defaultCountry,
    );

    return this.audienceService.buildPreflightReport(campaign.id, resolution.recipients, checks, errors);
  }

  private async persistRecipients(campaign: CampaignRow): Promise<void> {
    const settings = await this.settingsService.getAll();
    const snapshot = (campaign.templateSnapshot as unknown as TemplateSnapshot) ?? null;
    const resolution = await this.audienceService.resolveFromSnapshot(
      (campaign.audienceSnapshot as unknown[]) as never,
      (campaign.variableMapping as unknown[]) as never,
      collectTemplateVariableNames(snapshot?.components ?? null),
      settings.defaultCountry,
    );
    const rows = resolution.recipients.map((recipient) => ({
      campaignId: campaign.id,
      contactId: recipient.contact.id,
      phoneE164: recipient.contact.phoneE164,
      contactSnapshot: recipient.contact as unknown as Record<string, unknown>,
      resolvedTemplateParameters: recipient.variables.map((v) => v.value ?? ''),
      status: (recipient.eligible ? 'PENDING' : 'INELIGIBLE') as CampaignRecipientStatus,
      eligibilityReason: recipient.reason,
      idempotencyKey: `cmp-${campaign.id}-${recipient.contact.id}`,
      attemptCount: 0,
    }));
    await this.recipientsDao.deleteByCampaignId(campaign.id);
    await this.recipientsDao.insertMany(rows);
  }

  async schedule(id: string, scheduledAt: string, actor: AuthUser): Promise<CampaignDto> {
    const campaign = await this.requireCampaign(id);
    if (campaign.status !== 'READY') {
      throw new ConflictException(ERROR_CODES.INVALID_OPERATION);
    }
    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now()) {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }
    const updated = await this.campaignsDao.update(id, {
      status: 'SCHEDULED',
      scheduledAt: when,
      approvedByUserId: actor.id,
    });
    await this.dispatchService.scheduleCampaignDispatch(id, when);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.CAMPAIGN_SCHEDULE,
      entityType: 'campaign',
      entityId: id,
      metadata: { scheduledAt: when.toISOString() },
    });
    return toCampaignDto(updated!);
  }

  async start(id: string, actor: AuthUser): Promise<CampaignDto> {
    const campaign = await this.requireCampaign(id);
    if (!['READY', 'PAUSED'].includes(campaign.status)) {
      throw new ConflictException(ERROR_CODES.INVALID_OPERATION);
    }
    const updated = await this.campaignsDao.update(id, {
      status: 'QUEUING',
      startedAt: campaign.startedAt ?? new Date(),
      pausedAt: null,
    });
    await this.dispatchService.dispatchCampaign(id);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.CAMPAIGN_START,
      entityType: 'campaign',
      entityId: id,
    });
    return toCampaignDto(updated!);
  }

  async pause(id: string, actor: AuthUser): Promise<CampaignDto> {
    const campaign = await this.requireCampaign(id);
    if (!['QUEUING', 'RUNNING'].includes(campaign.status)) {
      throw new ConflictException(ERROR_CODES.INVALID_OPERATION);
    }
    const updated = await this.campaignsDao.update(id, { status: 'PAUSED', pausedAt: new Date() });
    await this.dispatchService.pauseCampaign(id);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.CAMPAIGN_PAUSE,
      entityType: 'campaign',
      entityId: id,
    });
    return toCampaignDto(updated!);
  }

  async resume(id: string, actor: AuthUser): Promise<CampaignDto> {
    const campaign = await this.requireCampaign(id);
    if (campaign.status !== 'PAUSED') {
      throw new ConflictException(ERROR_CODES.INVALID_OPERATION);
    }
    const updated = await this.campaignsDao.update(id, { status: 'RUNNING', pausedAt: null });
    await this.dispatchService.resumeCampaign(id);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.CAMPAIGN_RESUME,
      entityType: 'campaign',
      entityId: id,
    });
    return toCampaignDto(updated!);
  }

  async cancel(id: string, actor: AuthUser): Promise<CampaignDto> {
    const campaign = await this.requireCampaign(id);
    if (['COMPLETED', 'CANCELLED', 'FAILED'].includes(campaign.status)) {
      throw new ConflictException(ERROR_CODES.INVALID_OPERATION);
    }
    await this.recipientsDao.cancelUnsentForCampaign(id);
    const updated = await this.campaignsDao.update(id, { status: 'CANCELLED', cancelledAt: new Date() });
    await this.dispatchService.cancelCampaign(id);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.CAMPAIGN_CANCEL,
      entityType: 'campaign',
      entityId: id,
    });
    return toCampaignDto(updated!);
  }

  async duplicate(id: string, actor: AuthUser): Promise<CampaignDto> {
    const campaign = await this.requireCampaign(id);
    const row = await this.campaignsDao.insert({
      name: `${campaign.name} (copy)`,
      description: campaign.description,
      whatsappPhoneNumberId: campaign.whatsappPhoneNumberId,
      messageTemplateId: campaign.messageTemplateId,
      templateSnapshot: campaign.templateSnapshot,
      language: campaign.language,
      status: 'DRAFT',
      audienceType: campaign.audienceType,
      audienceSnapshot: campaign.audienceSnapshot,
      variableMapping: campaign.variableMapping,
      scheduledAt: null,
      createdByUserId: actor.id,
    });
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.CAMPAIGN_DUPLICATE,
      entityType: 'campaign',
      entityId: row.id,
      metadata: { sourceId: id },
    });
    return toCampaignDto(row);
  }

  async archive(id: string, actor: AuthUser): Promise<CampaignDto> {
    const campaign = await this.requireCampaign(id);
    if (!['COMPLETED', 'CANCELLED', 'FAILED'].includes(campaign.status)) {
      throw new ConflictException(ERROR_CODES.INVALID_OPERATION);
    }
    await this.campaignsDao.archive(id);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.CAMPAIGN_ARCHIVE,
      entityType: 'campaign',
      entityId: id,
    });
    const updated = await this.requireCampaign(id);
    return toCampaignDto(updated);
  }

  async testSend(id: string, input: TestSendInput, actor: AuthUser): Promise<TestSendResult[]> {
    const campaign = await this.requireCampaign(id);
    const template = campaign.messageTemplateId ? await this.templatesDao.findById(campaign.messageTemplateId) : null;
    if (!template || template.status !== 'APPROVED') {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }
    const results: TestSendResult[] = [];
    for (const number of input.testNumbers) {
      const params = input.sampleParameters ?? [];
      try {
        const response = await this.whatsappService.sendTemplateMessage({
          to: number,
          templateName: template.name,
          languageCode: template.language,
          components: [],
          phoneNumberId: campaign.whatsappPhoneNumberId ?? '',
        } as never);
        const metaMessageId = response.messages[0]?.id ?? null;
        await this.messagesDao.insert({
          contactId: null,
          conversationId: null,
          campaignId: campaign.id,
          campaignRecipientId: null,
          whatsappPhoneNumberId: campaign.whatsappPhoneNumberId,
          direction: 'OUTBOUND',
          type: 'template',
          status: 'SENT',
          metaMessageId,
          textContent: null,
          templateName: template.name,
          templateLanguage: template.language,
          templateParameters: params,
          sentByUserId: actor.id,
          isTest: true,
          sentAt: new Date(),
        } as never);
        results.push({ number, success: true, metaMessageId, error: null });
      } catch (error) {
        results.push({
          number,
          success: false,
          metaMessageId: null,
          error: `${describeError(error)}${isTransient(error) ? ' (transient)' : ''}`,
        });
      }
    }
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.CAMPAIGN_TEST_SEND,
      entityType: 'campaign',
      entityId: id,
      metadata: { numbers: input.testNumbers },
    });
    return results;
  }

  async recipients(id: string, query: CampaignRecipientQuery) {
    await this.requireCampaign(id);
    const result = await this.recipientsDao.list(id, query);
    return {
      items: result.items,
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(result.total / query.pageSize),
    };
  }

  async downloadRecipientsCsv(id: string): Promise<string> {
    await this.requireCampaign(id);
    const rows = await this.recipientsDao.listByCampaign(id);
    const header =
      '"phone_e164","status","eligibility_reason","sent_at","delivered_at","read_at","replied_at","failed_at","failure_code","failure_message","attempt_count"\n';
    const body = rows.map((row) => this.recipientsDao.recipientCsvRow(row)).join('\n');
    return header + body;
  }

  async aggregateMetrics(id: string) {
    await this.requireCampaign(id);
    return this.messagesDao.aggregateCampaignMetrics(id);
  }

  private snapshotTemplate(template: MessageTemplateRow): Record<string, unknown> {
    return {
      metaTemplateId: template.metaTemplateId,
      name: template.name,
      language: template.language,
      components: template.components,
      blockedAt: template.blockedAt ? template.blockedAt.toISOString() : null,
    };
  }

  private async requireCampaign(id: string) {
    const campaign = await this.campaignsDao.findById(id);
    if (!campaign) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    return campaign;
  }
}