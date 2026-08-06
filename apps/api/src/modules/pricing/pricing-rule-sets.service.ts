import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import type {
  PricingImportPreview,
  PricingImportRow,
  PricingRuleInput,
  PricingRuleQuery,
  PricingRuleSetCreateInput,
  PricingRuleSetDto,
  PricingRuleSetUpdateInput,
} from '@wa/shared';
import { PRICING_CATEGORIES, PRICING_BILLING_MODELS } from '@wa/shared';

import { PricingRuleSetsDao, toRuleSetDto } from './pricing-rule-sets.dao';

export interface UploadedFileLike {
  originalname: string;
  buffer: Buffer;
  size: number;
  mimetype: string;
}

const MAX_IMPORT_ROWS = 5_000;

export interface ParsedPricingImport {
  rows: PricingImportRow[];
  errors: Array<{ rowNumber: number; error: string }>;
  detectedCurrency: string | null;
}

function decodeCsvBuffer(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1256').decode(buffer);
  }
}

function normalizeRawValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }
  const text = String(value).trim();
  if (text === '') {
    return undefined;
  }
  return text;
}

function normalizeBoolean(value: unknown): boolean | undefined {
  const text = String(value ?? '').trim().toLowerCase();
  if (text === '') {
    return undefined;
  }
  return text === 'true' || text === '1' || text === 'yes';
}

@Injectable()
export class PricingRuleSetsService {
  constructor(private readonly dao: PricingRuleSetsDao) {}

  list(query: PricingRuleQuery): Promise<{ items: PricingRuleSetDto[]; total: number }> {
    return this.dao.list(query);
  }

  async get(id: string): Promise<PricingRuleSetDto> {
    const set = await this.dao.findById(id);
    if (!set) {
      throw new NotFoundException('NOT_FOUND');
    }
    return toRuleSetDto(set, set.rules);
  }

  async create(input: PricingRuleSetCreateInput, actorUserId: string): Promise<PricingRuleSetDto> {
    const effectiveFrom = new Date(input.effectiveFrom);
    const effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
    if (Number.isNaN(effectiveFrom.getTime()) || (effectiveTo && Number.isNaN(effectiveTo.getTime()))) {
      throw new BadRequestException('INVALID_DATE');
    }
    const version = await this.dao.nextVersion();
    const rules = input.rules.map((rule) => this.toRuleInsert(input, rule, effectiveFrom, effectiveTo));
    const created = await this.dao.create(
      {
        name: input.name,
        provider: input.provider ?? 'Meta',
        description: input.description ?? null,
        currency: input.currency,
        status: 'DRAFT',
        effectiveFrom,
        effectiveTo,
        sourceType: input.sourceType ?? 'MANUAL',
        sourceReference: input.sourceReference ?? null,
        version,
        createdByUserId: actorUserId,
      },
      rules,
    );
    return toRuleSetDto(created, created.rules);
  }

  async duplicate(id: string, actorUserId: string): Promise<PricingRuleSetDto> {
    const source = await this.dao.findById(id);
    if (!source) {
      throw new NotFoundException('NOT_FOUND');
    }
    const version = await this.dao.nextVersion();
    const rules = source.rules.map((rule) => ({
      marketCode: rule.marketCode,
      countryCode: rule.countryCode,
      messageCategory: rule.messageCategory,
      messageType: rule.messageType,
      billingModel: rule.billingModel,
      unitPrice: rule.unitPrice,
      tokenInputPrice: rule.tokenInputPrice,
      tokenOutputPrice: rule.tokenOutputPrice,
      minimumCharge: rule.minimumCharge,
      currency: rule.currency,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo,
      customerServiceWindowRequired: rule.customerServiceWindowRequired,
      freeEntryPointEligible: rule.freeEntryPointEligible,
      notes: rule.notes,
    }));
    const created = await this.dao.create(
      {
        name: `${source.name} (copy)`,
        provider: source.provider,
        description: source.description,
        currency: source.currency,
        status: 'DRAFT',
        effectiveFrom: source.effectiveFrom,
        effectiveTo: source.effectiveTo,
        sourceType: source.sourceType,
        sourceReference: source.sourceReference,
        version,
        createdByUserId: actorUserId,
      },
      rules,
    );
    return toRuleSetDto(created, created.rules);
  }

  async update(id: string, input: PricingRuleSetUpdateInput): Promise<PricingRuleSetDto> {
    const set = await this.dao.findById(id);
    if (!set) {
      throw new NotFoundException('NOT_FOUND');
    }
    if (set.status !== 'DRAFT') {
      throw new BadRequestException('INVALID_OPERATION');
    }
    const values: Record<string, unknown> = {};
    if (input.name !== undefined) {
      values.name = input.name;
    }
    if (input.description !== undefined) {
      values.description = input.description;
    }
    if (input.sourceReference !== undefined) {
      values.sourceReference = input.sourceReference;
    }
    if (input.effectiveTo !== undefined) {
      values.effectiveTo = input.effectiveTo === null ? null : new Date(input.effectiveTo);
    }
    const updated = await this.dao.update(id, values);
    if (!updated) {
      throw new NotFoundException('NOT_FOUND');
    }
    return toRuleSetDto(updated, updated.rules);
  }

  async validate(id: string): Promise<PricingRuleSetDto> {
    const set = await this.dao.findById(id);
    if (!set) {
      throw new NotFoundException('NOT_FOUND');
    }
    if (set.rules.length === 0) {
      throw new BadRequestException('AT_LEAST_ONE_RULE_REQUIRED');
    }
    const seen = new Set<string>();
    for (const rule of set.rules) {
      const key = `${rule.marketCode}:${rule.countryCode}:${rule.messageCategory}:${rule.messageType}`;
      if (seen.has(key)) {
        throw new BadRequestException('DUPLICATE_RULE');
      }
      seen.add(key);
    }
    return toRuleSetDto(set, set.rules);
  }

  async activate(id: string, actorUserId: string): Promise<PricingRuleSetDto> {
    const set = await this.dao.findById(id);
    if (!set) {
      throw new NotFoundException('NOT_FOUND');
    }
    if (set.rules.length === 0) {
      throw new BadRequestException('AT_LEAST_ONE_RULE_REQUIRED');
    }
    const now = new Date();
    if (set.effectiveFrom > now) {
      throw new BadRequestException('INVALID_OPERATION');
    }
    const overlaps = await this.dao.overlaps(set.effectiveFrom, set.effectiveTo, id);
    if (overlaps.some((other) => other.currency === set.currency)) {
      throw new BadRequestException('OVERLAPPING_RULE_SET');
    }
    const activated = await this.dao.activate(id, actorUserId);
    if (!activated) {
      throw new NotFoundException('NOT_FOUND');
    }
    return toRuleSetDto(activated, activated.rules);
  }

  async archive(id: string): Promise<PricingRuleSetDto> {
    const archived = await this.dao.archive(id);
    if (!archived) {
      throw new NotFoundException('NOT_FOUND');
    }
    return toRuleSetDto(archived, archived.rules);
  }

  async importPreview(file: UploadedFileLike): Promise<PricingImportPreview> {
    const { rows, errors, detectedCurrency } = this.parseImport(file);
    const overlappingRuleSets = await this.overlapIdsFor(rows);
    return {
      rows,
      errors,
      totalRows: rows.length + errors.length,
      validRows: rows.length,
      invalidRows: errors.length,
      detectedCurrency,
      overlappingRuleSets,
    };
  }

  async importCreate(file: UploadedFileLike, actorUserId: string): Promise<PricingRuleSetDto> {
    const { rows, detectedCurrency } = this.parseImport(file);
    const currency = detectedCurrency;
    if (!currency) {
      throw new BadRequestException('IMPORT_NO_HEADER_MATCH');
    }
    const baseName = (file.originalname ?? 'pricing-import').replace(/\.[^/.]+$/, '').slice(0, 80);
    const effectiveFrom = new Date();
    const version = await this.dao.nextVersion();
    const rules = rows.map((row) => ({
      marketCode: row.market_code,
      countryCode: row.country_code,
      messageCategory: row.message_category,
      messageType: '*',
      billingModel: row.billing_model,
      unitPrice: String(row.unit_price ?? 0),
      tokenInputPrice: row.token_input_price !== undefined ? String(row.token_input_price) : null,
      tokenOutputPrice: row.token_output_price !== undefined ? String(row.token_output_price) : null,
      minimumCharge: row.minimum_charge !== undefined ? String(row.minimum_charge) : null,
      currency,
      effectiveFrom: new Date(row.effective_from),
      effectiveTo: row.effective_to ? new Date(row.effective_to) : null,
      customerServiceWindowRequired: false,
      freeEntryPointEligible: row.free_entry_point_eligible,
      notes: row.notes ?? null,
    }));
    const created = await this.dao.create(
      {
        name: baseName,
        provider: 'Meta',
        description: `Imported from ${file.originalname ?? 'CSV'}`,
        currency,
        status: 'DRAFT',
        effectiveFrom,
        effectiveTo: null,
        sourceType: 'IMPORTED',
        sourceReference: file.originalname ?? null,
        version,
        createdByUserId: actorUserId,
      },
      rules,
    );
    return toRuleSetDto(created, created.rules);
  }

  coverage(): Promise<import('@wa/shared').PricingCoverage> {
    return this.dao.coverage();
  }

  private parseImport(file: UploadedFileLike): ParsedPricingImport {
    if (!file?.buffer) {
      throw new BadRequestException('IMPORT_EMPTY_FILE');
    }
    const content = decodeCsvBuffer(file.buffer);
    let records: string[][];
    try {
      records = parse(content, { skip_empty_lines: true, relax_column_count: true, trim: true }) as unknown as string[][];
    } catch {
      throw new BadRequestException('IMPORT_FILE_TYPE_UNSUPPORTED');
    }
    if (records.length === 0) {
      throw new BadRequestException('IMPORT_EMPTY_FILE');
    }
    if (records.length - 1 > MAX_IMPORT_ROWS) {
      throw new BadRequestException('IMPORT_FILE_TOO_LARGE');
    }
    const firstRecord = records[0];
    if (!firstRecord) {
      throw new BadRequestException('IMPORT_EMPTY_FILE');
    }
    const headers = firstRecord.map((value) => String(value).trim());
    const rows: PricingImportRow[] = [];
    const errors: Array<{ rowNumber: number; error: string }> = [];
    const currencies = new Map<string, number>();

    for (let index = 1; index < records.length; index++) {
      const rowNumber = index + 1;
      const raw = records[index];
      if (!raw) {
        continue;
      }
      const record: Record<string, unknown> = {};
      headers.forEach((header, headerIndex) => {
        record[header] = normalizeRawValue(raw[headerIndex]);
      });
      if (Object.values(record).every((value) => value === undefined)) {
        continue;
      }
      const normalized = {
        market_code: record['market_code'] ?? record['marketCode'],
        country_code: record['country_code'] ?? record['countryCode'],
        message_category: record['message_category'] ?? record['messageCategory'],
        billing_model: record['billing_model'] ?? record['billingModel'],
        unit_price: record['unit_price'] ?? record['unitPrice'],
        currency: record['currency'],
        effective_from: record['effective_from'] ?? record['effectiveFrom'],
        effective_to: record['effective_to'] ?? record['effectiveTo'],
        free_entry_point_eligible: normalizeBoolean(record['free_entry_point_eligible'] ?? record['freeEntryPointEligible']),
        token_input_price: record['token_input_price'] ?? record['tokenInputPrice'],
        token_output_price: record['token_output_price'] ?? record['tokenOutputPrice'],
        minimum_charge: record['minimum_charge'] ?? record['minimumCharge'],
        notes: record['notes'],
      };
      const parsed = this.validateImportRow(normalized);
      if (parsed.success) {
        rows.push(parsed.value);
        const currency = parsed.value.currency;
        currencies.set(currency, (currencies.get(currency) ?? 0) + 1);
      } else {
        errors.push({ rowNumber, error: parsed.error });
      }
    }

    let detectedCurrency: string | null = null;
    let maxCount = 0;
    for (const [currency, count] of currencies) {
      if (count > maxCount) {
        maxCount = count;
        detectedCurrency = currency;
      }
    }
    return { rows, errors, detectedCurrency };
  }

  private validateImportRow(value: Record<string, unknown>): { success: true; value: PricingImportRow } | { success: false; error: string } {
    if (!value.market_code || String(value.market_code).trim() === '') {
      return { success: false, error: 'missing:market_code' };
    }
    const countryCode = String(value.country_code ?? '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      return { success: false, error: 'invalid:country_code' };
    }
    const category = String(value.message_category ?? '').trim().toUpperCase();
    if (!(PRICING_CATEGORIES as readonly string[]).includes(category)) {
      return { success: false, error: `invalid:message_category:${category}` };
    }
    const billingModel = String(value.billing_model ?? '').trim().toUpperCase();
    if (!(PRICING_BILLING_MODELS as readonly string[]).includes(billingModel)) {
      return { success: false, error: `invalid:billing_model:${billingModel}` };
    }
    const unitPrice = this.coerceNumber(value.unit_price);
    if (unitPrice === null || unitPrice < 0) {
      return { success: false, error: 'invalid:unit_price' };
    }
    const currency = String(value.currency ?? '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      return { success: false, error: 'invalid:currency' };
    }
    const effectiveFrom = String(value.effective_from ?? '').trim();
    if (!effectiveFrom || Number.isNaN(new Date(effectiveFrom).getTime())) {
      return { success: false, error: 'invalid:effective_from' };
    }
    const effectiveToRaw = String(value.effective_to ?? '').trim();
    if (effectiveToRaw && Number.isNaN(new Date(effectiveToRaw).getTime())) {
      return { success: false, error: 'invalid:effective_to' };
    }

    return {
      success: true,
      value: {
        rowNumber: 0,
        market_code: String(value.market_code).trim(),
        country_code: countryCode,
        message_category: category as PricingImportRow['message_category'],
        billing_model: billingModel as PricingImportRow['billing_model'],
        unit_price: unitPrice,
        currency,
        effective_from: effectiveFrom,
        effective_to: effectiveToRaw ? effectiveToRaw : null,
        free_entry_point_eligible: typeof value.free_entry_point_eligible === 'boolean' ? value.free_entry_point_eligible : false,
        token_input_price: this.coerceNumber(value.token_input_price) ?? undefined,
        token_output_price: this.coerceNumber(value.token_output_price) ?? undefined,
        minimum_charge: this.coerceNumber(value.minimum_charge) ?? undefined,
        notes: value.notes !== undefined ? String(value.notes).trim() : undefined,
      },
    };
  }

  private coerceNumber(value: unknown): number | null {
    if (value === undefined || value === null || String(value).trim() === '') {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toRuleInsert(
    input: PricingRuleSetCreateInput,
    rule: PricingRuleInput,
    setFrom: Date,
    setTo: Date | null,
  ) {
    const ruleFrom = rule.effectiveFrom ? new Date(rule.effectiveFrom) : setFrom;
    const ruleTo = rule.effectiveTo ? new Date(rule.effectiveTo) : setTo;
    return {
      marketCode: rule.marketCode,
      countryCode: rule.countryCode,
      messageCategory: rule.messageCategory,
      messageType: rule.messageType ?? '*',
      billingModel: rule.billingModel,
      unitPrice: String(rule.unitPrice ?? 0),
      tokenInputPrice: rule.tokenInputPrice !== undefined ? String(rule.tokenInputPrice) : null,
      tokenOutputPrice: rule.tokenOutputPrice !== undefined ? String(rule.tokenOutputPrice) : null,
      minimumCharge: rule.minimumCharge !== undefined ? String(rule.minimumCharge) : null,
      currency: input.currency,
      effectiveFrom: ruleFrom,
      effectiveTo: ruleTo,
      customerServiceWindowRequired: rule.customerServiceWindowRequired ?? false,
      freeEntryPointEligible: rule.freeEntryPointEligible ?? false,
      notes: rule.notes ?? null,
    };
  }

  private async overlapIdsFor(rows: PricingImportRow[]): Promise<string[]> {
    if (rows.length === 0) {
      return [];
    }
    const froms = rows.map((row) => new Date(row.effective_from));
    const tos = rows.map((row) => (row.effective_to ? new Date(row.effective_to) : null));
    const minFrom = new Date(Math.min(...froms.map((date) => date.getTime())));
    const maxTo = new Date(Math.max(...tos.map((date) => (date ? date.getTime() : minFrom.getTime()))));
    const overlapping = await this.dao.overlaps(minFrom, maxTo);
    return overlapping.map((set) => set.id);
  }
}
