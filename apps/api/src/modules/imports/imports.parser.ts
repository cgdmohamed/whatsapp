import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';

export interface ParsedSheet {
  sheets: string[];
  selectedSheet: string;
  headers: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
  previewRows: unknown[][];
}

const MAX_PREVIEW_ROWS = 20;
const MAX_ROWS = 100_000;

function decodeCsvBuffer(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1256').decode(buffer);
  }
}

function autoHeaders(width: number): string[] {
  return Array.from({ length: width }, (_, index) => `column_${index + 1}`);
}

function recordsFromArrays(rows: unknown[][], headers: string[], hasHeader: boolean): { records: Record<string, unknown>[]; totalRows: number } {
  const effectiveHeaders = hasHeader ? headers : autoHeaders(headers.length);
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const records: Record<string, unknown>[] = [];
  for (const row of dataRows) {
    const record: Record<string, unknown> = {};
    effectiveHeaders.forEach((header, index) => {
      record[header] = row[index];
    });
    if (Object.values(record).some((value) => value !== undefined && value !== null && String(value).trim() !== '')) {
      records.push(record);
    }
  }
  return { records, totalRows: records.length };
}

export function parseCsv(buffer: Buffer): ParsedSheet {
  const content = decodeCsvBuffer(buffer);
  let records: string[][] | undefined;
  try {
    records = parse(content, {
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    }) as unknown as string[][];
  } catch {
    records = parse(content, {
      skip_empty_lines: true,
      relax_column_count: true,
    }) as unknown as string[][];
  }

  if (!records || records.length === 0) {
    throw new Error('EMPTY_FILE');
  }
  if (records.length > MAX_ROWS + 1) {
    throw new Error('TOO_MANY_ROWS');
  }

  const headerRow = records[0];
  if (!headerRow) {
    throw new Error('EMPTY_FILE');
  }
  const headers = headerRow.map((value) => String(value).trim());
  const { records: rowRecords, totalRows } = recordsFromArrays(records, headers, true);
  if (totalRows === 0) {
    throw new Error('EMPTY_FILE');
  }

  return {
    sheets: ['csv'],
    selectedSheet: 'csv',
    headers,
    rows: rowRecords,
    totalRows,
    previewRows: records.slice(1, 1 + MAX_PREVIEW_ROWS),
  };
}

export function parseXlsx(buffer: Buffer, requestedSheet?: string): ParsedSheet {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    throw new Error('UNREADABLE_FILE');
  }

  if (workbook.SheetNames.length === 0) {
    throw new Error('EMPTY_FILE');
  }

  const sheets = workbook.SheetNames;
  const selectedSheet = requestedSheet && sheets.includes(requestedSheet) ? requestedSheet : sheets[0];
  if (!selectedSheet) {
    throw new Error('EMPTY_FILE');
  }
  const worksheet = workbook.Sheets[selectedSheet];
  if (!worksheet) {
    throw new Error('EMPTY_FILE');
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: false, defval: null });
  if (matrix.length === 0) {
    throw new Error('EMPTY_FILE');
  }
  if (matrix.length > MAX_ROWS + 1) {
    throw new Error('TOO_MANY_ROWS');
  }

  const headerRow = matrix[0];
  if (!headerRow) {
    throw new Error('EMPTY_FILE');
  }
  const headers = headerRow.map((value) => String(value ?? '').trim());
  const { records: rowRecords, totalRows } = recordsFromArrays(matrix, headers, true);
  if (totalRows === 0) {
    throw new Error('EMPTY_FILE');
  }

  return {
    sheets,
    selectedSheet,
    headers,
    rows: rowRecords,
    totalRows,
    previewRows: matrix.slice(1, 1 + MAX_PREVIEW_ROWS),
  };
}

export function parseFile(buffer: Buffer, fileType: 'csv' | 'xlsx', requestedSheet?: string): ParsedSheet {
  if (fileType === 'csv') {
    return parseCsv(buffer);
  }
  return parseXlsx(buffer, requestedSheet);
}
