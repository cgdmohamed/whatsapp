import type { ImportOptions, ImportableField } from '@wa/shared';

import { normalizePhone } from '../contacts/phone/phone-normalizer';
import type { ParsedSheet } from './imports.parser';

export interface ImportCandidate {
  rowNumber: number;
  rawData: Record<string, unknown>;
  phone: string | null;
  normalizedPhone: string | null;
  fields: {
    firstName?: string | null;
    lastName?: string | null;
    displayName?: string | null;
    email?: string | null;
    company?: string | null;
    language?: string | null;
    source?: string | null;
  };
  tags: string[];
  list: string | null;
  optInStatus: 'OPTED_IN' | 'OPTED_OUT' | null;
  optInSource: string | null;
  optInDate: Date | null;
  errors: string[];
}

export interface ValidationResult {
  candidates: ImportCandidate[];
  validCount: number;
  invalidCount: number;
  duplicateInFileCount: number;
  issues: { rowNumber: number; reason: string }[];
}

const VALUE_ALIASES: Record<string, readonly string[]> = {
  phone: ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'mobilephone', 'cell', 'cellphone', 'whatsapp', 'whatsappnumber', 'tel', 'telephone', 'رقم', 'رقمالهاتف', 'الهاتف', 'موبايل', 'جوال'],
  first_name: ['firstname', 'first', 'الاسم', 'الاسمالاول', 'الاسم الأول'],
  last_name: ['lastname', 'last', 'surname', 'familyname', 'اسمالعائلة', 'الاسم الاخير', 'الاسم الأخير', 'الاسمالاخير'],
  display_name: ['displayname', 'fullname', 'name', 'الاسمالكامل', 'الاسم الكامل'],
  email: ['email', 'emailaddress', 'e-mail', 'بريد', 'بريدإلكتروني', 'البريد', 'ايميل', 'الايميل'],
  company: ['company', 'organization', 'organisation', 'employer', 'شركة', 'الشركة', 'المؤسسة'],
  language: ['language', 'lang', 'لغة', 'اللغة'],
  source: ['source', 'المصدر', 'مصدر'],
  tags: ['tags', 'tag', 'labels', 'label', 'وسوم', 'وسم', 'تصنيفات'],
  list: ['list', 'lists', 'group', 'قائمة', 'القائمة', 'مجموعة'],
  opt_in_status: ['optinstatus', 'opt-instatus', 'opt_in', 'optin', 'consent', 'consentstatus', 'حالةالموافقة', 'الموافقة'],
  opt_in_source: ['optinsource', 'opt-insource', 'optinsrc', 'consentsource', 'مصدرالموافقة'],
  opt_in_date: ['optindate', 'opt-indate', 'consentdate', 'تاريخالموافقة'],
};

const HEADER_NORMALIZE = /[^a-z0-9\u0600-\u06FF]+/g;

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(HEADER_NORMALIZE, '');
}

const ALIAS_LOOKUP = new Map<string, ImportableField>();
for (const [field, aliases] of Object.entries(VALUE_ALIASES)) {
  for (const alias of aliases) {
    const normalized = normalizeHeader(alias);
    if (!ALIAS_LOOKUP.has(normalized)) {
      ALIAS_LOOKUP.set(normalized, field as ImportableField);
    }
  }
}

export function autoMapColumns(headers: string[]): Record<string, ImportableField> {
  const mapping: Record<string, ImportableField> = {};
  const usedFields = new Set<ImportableField>();
  for (const header of headers) {
    const field = ALIAS_LOOKUP.get(normalizeHeader(header));
    if (field && !usedFields.has(field)) {
      mapping[header] = field;
      usedFields.add(field);
    }
  }
  return mapping;
}

function cellValue(record: Record<string, unknown>, column: string): string | null {
  const value = record[column];
  if (value === undefined || value === null) {
    return null;
  }
  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : null;
}

function splitListValue(value: string | null): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(/[;|,]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function parseOptInStatus(value: string | null): 'OPTED_IN' | 'OPTED_OUT' | null {
  if (!value) {
    return null;
  }
  const normalized = value.toLowerCase();
  if (['opted_in', 'opted-in', 'optin', 'optedin', 'yes', 'y', '1', 'true', 'موافق', 'نعم'].includes(normalized)) {
    return 'OPTED_IN';
  }
  if (['opted_out', 'opted-out', 'optout', 'optedout', 'no', 'n', '0', 'false', 'غيرموافق', 'لا'].includes(normalized)) {
    return 'OPTED_OUT';
  }
  return null;
}

function parseDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date;
  }
  const parts = value.split(/[./-]/);
  if (parts.length === 3) {
    const [day, month, year] = parts.map((part) => Number(part));
    if (day && month && year) {
      const parsed = new Date(Date.UTC(year, month - 1, day));
      if (
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day
      ) {
        return parsed;
      }
    }
  }
  return null;
}

export function validateImport(
  parsed: ParsedSheet,
  columnMapping: Record<string, ImportableField>,
  options: ImportOptions,
): ValidationResult {
  const candidates: ImportCandidate[] = [];
  const issues: { rowNumber: number; reason: string }[] = [];
  const seenPhones = new Map<string, number>();
  let validCount = 0;
  let invalidCount = 0;
  let duplicateInFileCount = 0;

  const mappedColumns = new Set(Object.values(columnMapping));
  const hasPhoneMapping = mappedColumns.has('phone');

  parsed.rows.forEach((record, index) => {
    const rowNumber = index + 1;
    const errors: string[] = [];

    if (!hasPhoneMapping) {
      errors.push('NO_PHONE_COLUMN');
    }

    let rawPhone: string | null = null;
    let normalizedPhone: string | null = null;
    for (const [column, field] of Object.entries(columnMapping)) {
      if (field === 'phone') {
        rawPhone = cellValue(record, column);
        break;
      }
    }

    if (rawPhone !== null && rawPhone !== undefined) {
      const result = normalizePhone(rawPhone, options.defaultCountry);
      if (result.ok) {
        normalizedPhone = result.e164;
      } else {
        errors.push(result.reason === 'EMPTY' ? 'EMPTY_PHONE' : 'INVALID_PHONE');
      }
    } else if (hasPhoneMapping) {
      errors.push('EMPTY_PHONE');
    }

    if (normalizedPhone) {
      const existing = seenPhones.get(normalizedPhone);
      if (existing !== undefined) {
        if (!options.skipDuplicates) {
          errors.push('DUPLICATE_IN_FILE');
        }
      } else {
        seenPhones.set(normalizedPhone, rowNumber);
      }
    }

    const fields: ImportCandidate['fields'] = {};
    let tags: string[] = [];
    let list: string | null = null;
    let optInStatus: 'OPTED_IN' | 'OPTED_OUT' | null = null;
    let optInSource: string | null = null;
    let optInDate: Date | null = null;

    for (const [column, field] of Object.entries(columnMapping)) {
      const value = cellValue(record, column);
      switch (field) {
        case 'first_name':
          fields.firstName = value;
          break;
        case 'last_name':
          fields.lastName = value;
          break;
        case 'display_name':
          fields.displayName = value;
          break;
        case 'email':
          if (value) {
            if (/.+@.+\..+/.test(value)) {
              fields.email = value;
            } else {
              errors.push('INVALID_EMAIL');
            }
          }
          break;
        case 'company':
          fields.company = value;
          break;
        case 'language':
          if (value) {
            const language = value.toLowerCase().slice(0, 2);
            if (['ar', 'en', 'fr'].includes(language)) {
              fields.language = language;
            } else {
              fields.language = value.slice(0, 2).toLowerCase();
            }
          }
          break;
        case 'source':
          fields.source = value;
          break;
        case 'tags':
          tags = splitListValue(value);
          break;
        case 'list':
          list = value;
          break;
        case 'opt_in_status':
          optInStatus = parseOptInStatus(value);
          break;
        case 'opt_in_source':
          optInSource = value;
          break;
        case 'opt_in_date':
          optInDate = parseDate(value);
          break;
        case 'phone':
          break;
      }
    }

    const candidate: ImportCandidate = {
      rowNumber,
      rawData: record,
      phone: rawPhone,
      normalizedPhone,
      fields,
      tags,
      list,
      optInStatus,
      optInSource,
      optInDate,
      errors,
    };

    if (errors.length > 0) {
      invalidCount += 1;
      if (errors.includes('DUPLICATE_IN_FILE')) {
        duplicateInFileCount += 1;
      }
      issues.push({ rowNumber, reason: errors.join('|') });
    } else {
      validCount += 1;
    }
    candidates.push(candidate);
  });

  return { candidates, validCount, invalidCount, duplicateInFileCount, issues };
}
