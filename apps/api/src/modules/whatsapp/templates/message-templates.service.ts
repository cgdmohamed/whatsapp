import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateMessageTemplateInput,
  MessageTemplateDto,
  MessageTemplateQuery,
  PaginatedMessageTemplates,
  TemplateCategory,
  TemplateCreateResultDto,
  TemplatePreviewDto,
  TemplatePreviewInput,
  TemplateStatus,
  TemplateSyncResultDto,
  TemplateSyncStatusDto,
} from '@wa/shared';
import { TEMPLATE_BLOCKING_STATUSES, TEMPLATE_CATEGORIES, TEMPLATE_STATUSES } from '@wa/shared';

import { ERROR_CODES } from '../../../common/errors';
import { AUDIT_ACTIONS } from '@wa/shared';
import { AuditService } from '../../../common/audit/audit.module';
import type { AuthUser } from '../../auth/auth.types';
import { MetaApiError } from '../meta-api/meta-api.errors';
import type { CreateTemplateResult } from '../meta-api/meta-api.types';
import { WhatsAppService } from '../whatsapp.service';
import { MessageTemplatesDao, toMessageTemplateDto } from './message-templates.dao';
import {
  buildCreateComponents,
  parseMetaComponents,
  renderTemplatePreview,
} from './template-components';

function normalizeTemplateStatus(value: string | undefined): TemplateStatus {
  if (value && (TEMPLATE_STATUSES as readonly string[]).includes(value)) {
    return value as TemplateStatus;
  }
  return 'PENDING';
}

function normalizeTemplateCategory(value: string | undefined): TemplateCategory {
  if (value && (TEMPLATE_CATEGORIES as readonly string[]).includes(value)) {
    return value as TemplateCategory;
  }
  return 'UTILITY';
}

function parseMetaTimestamp(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    const date = new Date(numeric * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

@Injectable()
export class MessageTemplatesService {
  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly templatesDao: MessageTemplatesDao,
    private readonly auditService: AuditService,
  ) {}

  async list(query: MessageTemplateQuery, actor: AuthUser): Promise<PaginatedMessageTemplates> {
    const account = await this.whatsappService.requireAccount();
    const result = await this.templatesDao.list(account.id, query, {
      approvedOnly: actor.role === 'AGENT',
    });
    return {
      items: result.items,
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(result.total / query.pageSize),
    };
  }

  async getDetail(id: string, actor: AuthUser): Promise<MessageTemplateDto> {
    const row = await this.templatesDao.findById(id);
    if (!row) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    if (actor.role === 'AGENT' && row.status !== 'APPROVED') {
      throw new ForbiddenException(ERROR_CODES.FORBIDDEN);
    }
    return toMessageTemplateDto(row);
  }

  async preview(input: TemplatePreviewInput): Promise<TemplatePreviewDto> {
    return renderTemplatePreview(input.components, input.samples);
  }

  async syncFromMeta(): Promise<TemplateSyncResultDto> {
    const account = await this.whatsappService.requireAccount();
    if (!account.wabaId) {
      throw new BadRequestException(ERROR_CODES.WHATSAPP_NOT_CONFIGURED);
    }
    const client = await this.whatsappService.buildClient();
    const metaTemplates = await client.listTemplates(account.wabaId);

    const existing = await this.templatesDao.findByMetaTemplateIds(
      account.id,
      metaTemplates.map((template) => template.id),
    );
    const existingByMetaId = new Map(existing.map((row) => [row.metaTemplateId, row]));

    const syncedAt = new Date();
    const result: TemplateSyncResultDto = {
      syncedAt: syncedAt.toISOString(),
      totalFetched: metaTemplates.length,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      blockedTemplates: [],
      errors: [],
    };

    for (const metaTemplate of metaTemplates) {
      try {
        const previous = existingByMetaId.get(metaTemplate.id);
        const status = normalizeTemplateStatus(metaTemplate.status);
        const isBlocking = (TEMPLATE_BLOCKING_STATUSES as readonly string[]).includes(status);
        const wasApproved = previous?.status === 'APPROVED';

        let blockedAt: Date | null = previous?.blockedAt ?? null;
        if (wasApproved && isBlocking) {
          blockedAt = syncedAt;
        } else if (status === 'APPROVED') {
          blockedAt = null;
        }

        const upsert = await this.templatesDao.upsert(account.id, metaTemplate.id, {
          name: metaTemplate.name,
          language: metaTemplate.language ?? 'unknown',
          category: normalizeTemplateCategory(metaTemplate.category),
          status,
          qualityScore: metaTemplate.quality_score ?? null,
          rejectionReason: metaTemplate.rejected_reason ?? null,
          components: parseMetaComponents(metaTemplate.components),
          rawMetaPayload: metaTemplate as unknown as Record<string, unknown>,
          blockedAt,
          metaUpdatedAt: parseMetaTimestamp(metaTemplate.updated_time),
          lastSyncedAt: syncedAt,
        });

        if (upsert.inserted) {
          result.inserted += 1;
        } else if (upsert.changed) {
          result.updated += 1;
        } else {
          result.unchanged += 1;
        }

        if (wasApproved && isBlocking && previous) {
          result.blockedTemplates.push({
            id: upsert.row.id,
            name: metaTemplate.name,
            status,
            previousStatus: previous.status,
          });
          await this.auditService.record({
            action: AUDIT_ACTIONS.TEMPLATE_STATUS_BLOCKED,
            entityType: 'message-template',
            entityId: upsert.row.id,
            metadata: {
              name: metaTemplate.name,
              metaTemplateId: metaTemplate.id,
              previousStatus: previous.status,
              status,
              reason: metaTemplate.rejected_reason ?? null,
            },
          });
        }
      } catch (error) {
        result.errors.push(
          `Failed to sync template '${metaTemplate.name ?? metaTemplate.id}': ${this.describeError(error)}`,
        );
      }
    }

    await this.templatesDao.recordSync(account.id, syncedAt);
    return result;
  }

  async createTemplate(input: CreateMessageTemplateInput): Promise<TemplateCreateResultDto> {
    const account = await this.whatsappService.requireAccount();
    if (!account.wabaId) {
      throw new BadRequestException(ERROR_CODES.WHATSAPP_NOT_CONFIGURED);
    }

    const built = buildCreateComponents(input.components, input.samples);
    if (built.issues.length > 0) {
      throw new BadRequestException({
        message: built.issues,
        error: ERROR_CODES.VALIDATION_ERROR,
      });
    }

    const client = await this.whatsappService.buildClient();
    let created: CreateTemplateResult;
    try {
      created = await client.createTemplate(account.wabaId, {
        name: input.name,
        language: input.language,
        category: input.category,
        components: built.metaComponents,
      });
    } catch (error) {
      throw new BadRequestException(this.describeError(error));
    }

    try {
      await this.syncFromMeta();
    } catch {
      // The template was created in Meta; persistence can retry on the next sync.
      return {
        metaTemplateId: created.id,
        name: input.name,
        status: created.status ?? 'PENDING',
        category: input.category,
        syncedAt: new Date().toISOString(),
      };
    }

    return {
      metaTemplateId: created.id,
      name: input.name,
      status: created.status ?? 'PENDING',
      category: input.category,
      syncedAt: new Date().toISOString(),
    };
  }

  async getSyncStatus(): Promise<TemplateSyncStatusDto> {
    const account = await this.whatsappService.requireAccount().catch(() => undefined);
    if (!account) {
      return { lastSyncedAt: null, total: 0, approvedCount: 0, blockedCount: 0, blockedTemplates: [] };
    }
    const summary = await this.templatesDao.syncSummary(account.id);
    return {
      lastSyncedAt: account.templatesLastSyncedAt ? account.templatesLastSyncedAt.toISOString() : null,
      total: summary.total,
      approvedCount: summary.approvedCount,
      blockedCount: summary.blockedCount,
      blockedTemplates: summary.blockedTemplates,
    };
  }

  async listApproved(): Promise<MessageTemplateDto[]> {
    const account = await this.whatsappService.requireAccount();
    const result = await this.templatesDao.list(
      account.id,
      { page: 1, pageSize: 100, sortBy: 'updatedAt', sortOrder: 'desc' },
      { approvedOnly: true },
    );
    return result.items.filter((template) => template.blockedAt === null);
  }

  private describeError(error: unknown): string {
    if (error instanceof MetaApiError) {
      const { normalized } = error;
      const combined = [normalized.title, normalized.message].filter(Boolean).join(': ');
      if (/variable|{{#}}/i.test(combined)) {
        return (
          'Template variables must use the format {{1}}, {{2}}, {{3}}… numbered sequentially and starting at {{1}}. ' +
          'Fix the variables in the header, body, and button URLs, then try again.'
        );
      }
      return combined;
    }
    return error instanceof Error ? error.message : String(error);
  }
}
