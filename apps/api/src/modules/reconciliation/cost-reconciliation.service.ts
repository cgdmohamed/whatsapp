import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CostReconciliationDetail,
  CostReconciliationJobDto,
  CostReconciliationQuery,
  CostReconciliationUploadResult,
  CostReconciliationValidationSummary,
  PaginatedCostReconciliations,
  PricingCategory,
  ReconciliationUnmatchedRow,
} from '@wa/shared';
import { AUDIT_ACTIONS, PRICING_CATEGORIES } from '@wa/shared';

import { AuditService } from '../../common/audit/audit.module';
import { ERROR_CODES } from '../../common/errors';
import { SettingsService } from '../settings/settings.service';
import { MessageCostsDao } from '../pricing/message-costs.dao';
import type { AuthUser } from '../auth/auth.types';
import { CostReconciliationDao, toCostReconciliationJobDto } from './cost-reconciliation.dao';
import { parseReconciliationCsv, type ParsedReconciliationRow } from './cost-reconciliation.parser';
import { ReconciliationStorage } from './cost-reconciliation.storage';
import type { MessageCostRow, MessageRow } from '../../db/schema';

export interface UploadedFileLike {
  originalname: string;
  buffer: Buffer;
  size: number;
  mimetype: string;
}

const HARD_UPLOAD_CAP_BYTES = 20 * 1024 * 1024;

function toMoney(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function categoryOrDefault(raw: string | null): PricingCategory {
  const upper = String(raw ?? '').trim().toUpperCase();
  return (PRICING_CATEGORIES as readonly string[]).includes(upper) ? (upper as PricingCategory) : 'UNKNOWN';
}

@Injectable()
export class CostReconciliationService {
  constructor(
    private readonly dao: CostReconciliationDao,
    private readonly storage: ReconciliationStorage,
    private readonly costsDao: MessageCostsDao,
    private readonly auditService: AuditService,
    private readonly settingsService: SettingsService,
  ) {}

  async upload(file: UploadedFileLike, actor: AuthUser): Promise<CostReconciliationUploadResult> {
    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException(ERROR_CODES.RECONCILIATION_EMPTY_FILE);
    }
    if (file.size > HARD_UPLOAD_CAP_BYTES) {
      throw new BadRequestException(ERROR_CODES.RECONCILIATION_FILE_TOO_LARGE);
    }
    const ext = (file.originalname ?? '').split('.').pop()?.toLowerCase();
    if (ext !== 'csv') {
      throw new BadRequestException(ERROR_CODES.RECONCILIATION_FILE_TYPE_UNSUPPORTED);
    }

    let parsed;
    try {
      parsed = parseReconciliationCsv(file.buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PARSE_FAILED';
      if (message === 'EMPTY_FILE') {
        throw new BadRequestException(ERROR_CODES.RECONCILIATION_EMPTY_FILE);
      }
      if (message === 'TOO_MANY_ROWS') {
        throw new BadRequestException(ERROR_CODES.RECONCILIATION_FILE_TOO_LARGE);
      }
      if (message === 'MISSING_REQUIRED_COLUMNS') {
        throw new BadRequestException(ERROR_CODES.RECONCILIATION_REQUIRED_COLUMNS_MISSING);
      }
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }

    const job = await this.dao.insert({
      sourceType: 'CSV',
      originalFilename: file.originalname,
      currency: parsed.detectedCurrency,
      status: 'UPLOADED',
      totalRows: parsed.rows.length,
      matchedRows: 0,
      unmatchedRows: 0,
      adjustedRows: 0,
      createdByUserId: actor.id,
    });

    try {
      this.storage.save(job.id, file.buffer);
    } catch {
      this.storage.remove(job.id);
      await this.dao.update(job.id, { status: 'FAILED' });
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }

    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.RECONCILIATION_UPLOAD,
      entityType: 'cost_reconciliation_job',
      entityId: job.id,
      metadata: { filename: file.originalname, totalRows: parsed.rows.length, currency: parsed.detectedCurrency },
    });

    return { job: toCostReconciliationJobDto(job), headers: parsed.headers, previewRows: parsed.previewRows };
  }

  async validate(jobId: string, actor: AuthUser): Promise<CostReconciliationValidationSummary> {
    const job = await this.requireJob(jobId);
    if (job.status !== 'UPLOADED' && job.status !== 'READY') {
      throw new BadRequestException(ERROR_CODES.RECONCILIATION_JOB_STATE_INVALID);
    }

    const parsed = this.parseStoredFile(jobId);
    const { matchedMessages, unmatched } = await this.matchRows(parsed.rows);

    await this.dao.update(jobId, {
      status: 'READY',
      startedAt: null,
      completedAt: null,
      totalRows: parsed.rows.length,
      matchedRows: matchedMessages.length,
      unmatchedRows: unmatched.length,
      adjustedRows: 0,
      currency: parsed.rows.find((row) => row.currency)?.currency ?? job.currency,
    });
    this.storage.saveUnmatched(jobId, unmatched);

    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.RECONCILIATION_VALIDATE,
      entityType: 'cost_reconciliation_job',
      entityId: jobId,
      metadata: { totalRows: parsed.rows.length, matchedRows: matchedMessages.length, unmatchedRows: unmatched.length },
    });

    const updated = await this.requireJob(jobId);
    return {
      job: toCostReconciliationJobDto(updated),
      totalRows: updated.totalRows,
      matchedRows: updated.matchedRows,
      unmatchedRows: updated.unmatchedRows,
      issues: parsed.issues.slice(0, 1000),
    };
  }

  async apply(jobId: string, actor: AuthUser): Promise<CostReconciliationJobDto> {
    const job = await this.requireJob(jobId);
    if (job.status !== 'READY') {
      throw new BadRequestException(ERROR_CODES.RECONCILIATION_JOB_STATE_INVALID);
    }

    await this.dao.update(jobId, { status: 'PROCESSING', startedAt: new Date(), completedAt: null });
    try {
      const parsed = this.parseStoredFile(jobId);
      const { matchedMessages, unmatched } = await this.matchRows(parsed.rows);
      const tolerancePercent = await this.tolerance();

      const rowsByMessage = new Map<string, ParsedReconciliationRow>();
      for (const row of parsed.rows) {
        if (row.metaMessageId) {
          rowsByMessage.set(row.metaMessageId, row);
        }
      }
      const costsByMessage = await this.dao.findCostsByMessageIds(matchedMessages.map((message) => message.id));

      let adjustedRows = 0;
      for (const message of matchedMessages) {
        const row = rowsByMessage.get(message.metaMessageId ?? '');
        if (!row) {
          continue;
        }
        const existing = costsByMessage.get(message.id);
        if (existing) {
          if (await this.applyCost(existing, row, tolerancePercent)) {
            adjustedRows += 1;
          }
        } else {
          await this.createCostRow(message, row);
          adjustedRows += 1;
        }
      }

      this.storage.saveUnmatched(jobId, unmatched);

      const updated = await this.dao.update(jobId, {
        status: 'COMPLETED',
        completedAt: new Date(),
        totalRows: parsed.rows.length,
        matchedRows: matchedMessages.length,
        unmatchedRows: unmatched.length,
        adjustedRows,
      });
      if (!updated) {
        throw new NotFoundException(ERROR_CODES.RECONCILIATION_NOT_FOUND);
      }

      await this.auditService.record({
        actorUserId: actor.id,
        action: AUDIT_ACTIONS.RECONCILIATION_APPLY,
        entityType: 'cost_reconciliation_job',
        entityId: jobId,
        metadata: { matchedRows: matchedMessages.length, unmatchedRows: unmatched.length, adjustedRows },
      });

      return toCostReconciliationJobDto(updated);
    } catch (error) {
      await this.dao.update(jobId, { status: 'FAILED', completedAt: new Date() });
      throw error;
    }
  }

  async list(query: CostReconciliationQuery): Promise<PaginatedCostReconciliations> {
    const { items, total } = await this.dao.list(query);
    const totalPages = total === 0 ? 0 : Math.ceil(total / query.pageSize);
    return { items, total, page: query.page, pageSize: query.pageSize, totalPages };
  }

  async get(jobId: string): Promise<CostReconciliationDetail> {
    const job = await this.requireJob(jobId);
    return {
      job: toCostReconciliationJobDto(job),
      unmatchedRows: this.storage.readUnmatched(jobId),
    };
  }

  async downloadUnmatched(jobId: string): Promise<Buffer> {
    await this.requireJob(jobId);
    if (!this.storage.hasUnmatchedCsv(jobId)) {
      throw new NotFoundException(ERROR_CODES.RECONCILIATION_NOT_FOUND);
    }
    return this.storage.readUnmatchedCsv(jobId);
  }

  private parseStoredFile(jobId: string): ReturnType<typeof parseReconciliationCsv> {
    try {
      return parseReconciliationCsv(this.storage.read(jobId));
    } catch {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }
  }

  private async matchRows(rows: ParsedReconciliationRow[]): Promise<{ matchedMessages: MessageRow[]; unmatched: ReconciliationUnmatchedRow[] }> {
    const metaIds = [...new Set(rows.map((row) => row.metaMessageId).filter((id): id is string => id !== null))];
    const messagesByMeta = await this.dao.findMessagesByMetaIds(metaIds);

    const matchedMessages: MessageRow[] = [];
    const unmatched: ReconciliationUnmatchedRow[] = [];
    for (const row of rows) {
      if (row.metaMessageId && messagesByMeta.has(row.metaMessageId)) {
        const message = messagesByMeta.get(row.metaMessageId)!;
        if (!matchedMessages.includes(message)) {
          matchedMessages.push(message);
        }
      } else {
        unmatched.push(this.toUnmatchedRow(row, null));
      }
    }
    return { matchedMessages, unmatched };
  }

  private toUnmatchedRow(row: ParsedReconciliationRow, matchedMessageId: string | null): ReconciliationUnmatchedRow {
    return {
      rowNumber: row.rowNumber,
      metaMessageId: row.metaMessageId,
      phoneNumberId: row.phoneNumberId,
      recipientMarket: row.recipientMarket,
      messageCategory: row.messageCategory,
      billingDate: row.billingDate,
      amount: row.amount,
      currency: row.currency,
      matchedMessageId,
    };
  }

  private async applyCost(cost: MessageCostRow, row: ParsedReconciliationRow, tolerancePercent: number): Promise<boolean> {
    const amount = row.amount ?? 0;
    const previousFinal = toMoney(cost.finalCost);
    const changed =
      cost.confirmedCost === null ||
      previousFinal === null ||
      Math.abs(previousFinal - amount) > this.toleranceAmount(previousFinal, tolerancePercent);

    const now = new Date();
    const currency = row.currency ?? cost.currency ?? null;
    const chargeStatus = amount > 0 ? 'PAID' : 'FREE';

    await this.costsDao.update(cost.id, {
      confirmedCost: String(amount),
      finalCost: cost.adjustedCost !== null && cost.adjustedCost !== undefined ? cost.adjustedCost : String(amount),
      confirmedAt: now,
      chargeStatus,
      freeReason: amount === 0 && cost.freeReason === null ? 'PROVIDER_EXEMPTION' : cost.freeReason,
      calculationStatus: cost.calculationStatus === 'ADJUSTED' ? 'ADJUSTED' : 'CONFIRMED',
      currency,
    });

    await this.costsDao.addEvent({
      messageCostId: cost.id,
      eventType: 'CONFIRMED',
      previousStatus: cost.chargeStatus,
      newStatus: chargeStatus,
      previousAmount: cost.confirmedCost,
      newAmount: String(amount),
      currency,
      reason: 'reconciled from provider cost report',
      source: 'reconciliation',
    });

    return changed;
  }

  private async createCostRow(message: MessageRow, row: ParsedReconciliationRow) {
    const amount = row.amount ?? 0;
    const chargeStatus = amount > 0 ? 'PAID' : 'FREE';
    const now = new Date();
    return this.costsDao.upsertForMessage({
      messageId: message.id,
      campaignId: message.campaignId,
      campaignRecipientId: message.campaignRecipientId,
      conversationId: message.conversationId,
      contactId: message.contactId,
      whatsappPhoneNumberId: message.whatsappPhoneNumberId,
      pricingRuleId: null,
      recipientMarket: row.recipientMarket,
      recipientCountry: null,
      messageCategory: categoryOrDefault(row.messageCategory),
      billingModel: 'UNKNOWN',
      currency: row.currency,
      unitPrice: null,
      inputTokenCount: null,
      outputTokenCount: null,
      estimatedCost: null,
      confirmedCost: String(amount),
      adjustedCost: null,
      finalCost: String(amount),
      calculationStatus: 'CONFIRMED',
      chargeStatus,
      freeReason: amount === 0 ? 'PROVIDER_EXEMPTION' : null,
      customerServiceWindowOpen: null,
      freeEntryPointWindowOpen: null,
      costCalculatedAt: now,
      confirmedAt: now,
    });
  }

  private async tolerance(): Promise<number> {
    const settings = await this.settingsService.getAll();
    return Number.isFinite(settings.reconciliationTolerancePercent) ? settings.reconciliationTolerancePercent : 5;
  }

  private toleranceAmount(previous: number, percent: number): number {
    return (previous * percent) / 100;
  }

  private async requireJob(jobId: string) {
    const job = await this.dao.findById(jobId);
    if (!job) {
      throw new NotFoundException(ERROR_CODES.RECONCILIATION_NOT_FOUND);
    }
    return job;
  }
}
