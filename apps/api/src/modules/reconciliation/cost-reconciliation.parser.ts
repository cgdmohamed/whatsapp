import { parse } from 'csv-parse/sync';

export interface ParsedReconciliationRow {
  rowNumber: number;
  metaMessageId: string | null;
  phoneNumberId: string | null;
  recipientMarket: string | null;
  messageCategory: string | null;
  billingDate: string | null;
  amount: number | null;
  currency: string | null;
}

export interface ParsedReconciliationCsv {
  headers: string[];
  rows: ParsedReconciliationRow[];
  issues: string[];
  detectedCurrency: string | null;
  previewRows: string[][];
}

export const RECONCILIATION_MAX_ROWS = 50_000;
const MAX_PREVIEW_ROWS = 20;

type HeaderKey = 'messageId' | 'phoneNumberId' | 'recipientMarket' | 'messageCategory' | 'billingDate' | 'amount' | 'currency';

const HEADER_ALIASES: Record<HeaderKey, string[]> = {
  messageId: ['messageid', 'wamid', 'messaageid', 'metamessageid', 'id'],
  phoneNumberId: ['phonenumberid', 'phonenumber', 'wabaphonenumberid', 'waphonenumberid'],
  recipientMarket: ['recipientmarket', 'recipientcountry', 'country', 'countrycode', 'country_code', 'market', 'region'],
  messageCategory: ['messagecategory', 'category', 'messagetype', 'templatename'],
  billingDate: ['billingdate', 'billeddate', 'date', 'billingdate(date)', 'billingmonth'],
  amount: ['amount', 'amountbilled', 'totalamount', 'totalamountbilled', 'cost', 'price', 'charge', 'unitprice', 'amountusd'],
  currency: ['currency', 'currencycode'],
};

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function decodeCsvBuffer(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1256').decode(buffer);
  }
}

function pickHeader(headers: string[], aliases: string[]): string | null {
  for (const alias of aliases) {
    const index = headers.findIndex((header) => normalizeHeader(header) === alias);
    if (index >= 0) {
      return headers[index] ?? null;
    }
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }
  return String(value).trim();
}

export function parseReconciliationCsv(buffer: Buffer): ParsedReconciliationCsv {
  const content = decodeCsvBuffer(buffer);
  let records: string[][] | undefined;
  try {
    records = parse(content, {
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
      bom: true,
    }) as unknown as string[][];
  } catch {
    records = parse(content, {
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
      bom: true,
    }) as unknown as string[][];
  }

  if (!records || records.length === 0) {
    throw new Error('EMPTY_FILE');
  }
  if (records.length - 1 > RECONCILIATION_MAX_ROWS) {
    throw new Error('TOO_MANY_ROWS');
  }
  const headerRow = records[0];
  if (!headerRow || headerRow.every((cell) => String(cell).trim() === '')) {
    throw new Error('EMPTY_FILE');
  }
  const headers = headerRow.map((value) => String(value).trim());

  const columnNames: Record<HeaderKey, string | null> = {
    messageId: pickHeader(headers, HEADER_ALIASES.messageId),
    phoneNumberId: pickHeader(headers, HEADER_ALIASES.phoneNumberId),
    recipientMarket: pickHeader(headers, HEADER_ALIASES.recipientMarket),
    messageCategory: pickHeader(headers, HEADER_ALIASES.messageCategory),
    billingDate: pickHeader(headers, HEADER_ALIASES.billingDate),
    amount: pickHeader(headers, HEADER_ALIASES.amount),
    currency: pickHeader(headers, HEADER_ALIASES.currency),
  };

  if (!columnNames.messageId || !columnNames.amount) {
    throw new Error('MISSING_REQUIRED_COLUMNS');
  }

  const rows: ParsedReconciliationRow[] = [];
  const issues: string[] = [];
  const currencies = new Map<string, number>();
  const previewRows: string[][] = [];

  for (let index = 1; index < records.length; index++) {
    const rowNumber = index + 1;
    const raw = records[index];
    if (!raw || raw.every((cell) => String(cell).trim() === '')) {
      continue;
    }
    const valueAt = (name: string | null): unknown => (name ? raw[headers.indexOf(name)] : undefined);

    const metaMessageId = asString(valueAt(columnNames.messageId));
    const amount = asNumber(valueAt(columnNames.amount));
    const phoneNumberId = asString(valueAt(columnNames.phoneNumberId));
    const recipientMarket = asString(valueAt(columnNames.recipientMarket));
    const messageCategory = asString(valueAt(columnNames.messageCategory));
    const billingDate = asString(valueAt(columnNames.billingDate));
    const currency = asString(valueAt(columnNames.currency));
    const currencyCode = currency ? currency.toUpperCase() : null;

    if (!metaMessageId) {
      issues.push(`row ${rowNumber}: missing message id`);
    }
    if (amount === null) {
      issues.push(`row ${rowNumber}: invalid amount`);
    }
    if (currencyCode) {
      currencies.set(currencyCode, (currencies.get(currencyCode) ?? 0) + 1);
    }

    rows.push({
      rowNumber,
      metaMessageId,
      phoneNumberId,
      recipientMarket,
      messageCategory,
      billingDate,
      amount,
      currency: currencyCode,
    });
    if (previewRows.length < MAX_PREVIEW_ROWS) {
      previewRows.push(raw.map((cell) => String(cell)));
    }
  }

  if (rows.length === 0) {
    throw new Error('EMPTY_FILE');
  }

  let detectedCurrency: string | null = null;
  let maxCount = 0;
  for (const [code, count] of currencies) {
    if (count > maxCount) {
      maxCount = count;
      detectedCurrency = code;
    }
  }

  return { headers, rows, issues, detectedCurrency, previewRows };
}
