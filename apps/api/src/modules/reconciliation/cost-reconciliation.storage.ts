import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ReconciliationUnmatchedRow } from '@wa/shared';

import { csvRow } from '../reports/csv';

@Injectable()
export class ReconciliationStorage {
  private readonly dir: string;

  constructor(configService: ConfigService) {
    this.dir = configService.get<string>('RECONCILIATION_UPLOAD_DIR') ?? join(process.cwd(), 'data', 'reconciliations');
    mkdirSync(this.dir, { recursive: true });
  }

  uploadPathFor(jobId: string): string {
    return join(this.dir, `${jobId}.upload`);
  }

  unmatchedJsonPathFor(jobId: string): string {
    return join(this.dir, `${jobId}.unmatched.json`);
  }

  unmatchedCsvPathFor(jobId: string): string {
    return join(this.dir, `${jobId}.unmatched.csv`);
  }

  save(jobId: string, buffer: Buffer): void {
    writeFileSync(this.uploadPathFor(jobId), buffer);
  }

  read(jobId: string): Buffer {
    return readFileSync(this.uploadPathFor(jobId));
  }

  saveUnmatched(jobId: string, rows: ReconciliationUnmatchedRow[]): void {
    writeFileSync(this.unmatchedJsonPathFor(jobId), JSON.stringify(rows), 'utf-8');
    const lines = [
      csvRow(['Row', 'Message ID', 'Phone Number ID', 'Recipient Market', 'Message Category', 'Billing Date', 'Amount', 'Currency', 'Matched Message ID']),
      ...rows.map((row) =>
        csvRow([row.rowNumber, row.metaMessageId, row.phoneNumberId, row.recipientMarket, row.messageCategory, row.billingDate, row.amount, row.currency, row.matchedMessageId]),
      ),
    ];
    writeFileSync(this.unmatchedCsvPathFor(jobId), `${lines.join('\n')}\n`, 'utf-8');
  }

  readUnmatched(jobId: string): ReconciliationUnmatchedRow[] {
    const path = this.unmatchedJsonPathFor(jobId);
    if (!existsSync(path)) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
      return Array.isArray(parsed) ? (parsed as ReconciliationUnmatchedRow[]) : [];
    } catch {
      return [];
    }
  }

  readUnmatchedCsv(jobId: string): Buffer {
    return readFileSync(this.unmatchedCsvPathFor(jobId));
  }

  hasUnmatchedCsv(jobId: string): boolean {
    return existsSync(this.unmatchedCsvPathFor(jobId));
  }

  remove(jobId: string): void {
    for (const path of [this.uploadPathFor(jobId), this.unmatchedJsonPathFor(jobId), this.unmatchedCsvPathFor(jobId)]) {
      try {
        if (existsSync(path)) {
          unlinkSync(path);
        }
      } catch {
        // best-effort cleanup
      }
    }
  }
}
