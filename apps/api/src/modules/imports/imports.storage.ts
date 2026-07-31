import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';

@Injectable()
export class ImportStorage {
  private readonly dir: string;

  constructor(configService: ConfigService) {
    this.dir = configService.get<string>('IMPORT_UPLOAD_DIR') ?? join(process.cwd(), 'data', 'imports');
    mkdirSync(this.dir, { recursive: true });
  }

  pathFor(jobId: string): string {
    return join(this.dir, `${jobId}.upload`);
  }

  rejectedPathFor(jobId: string): string {
    return join(this.dir, `${jobId}.rejected.csv`);
  }

  save(jobId: string, buffer: Buffer): void {
    writeFileSync(this.pathFor(jobId), buffer);
  }

  read(jobId: string): Buffer {
    return readFileSync(this.pathFor(jobId));
  }

  saveRejectedCsv(jobId: string, content: string): void {
    writeFileSync(this.rejectedPathFor(jobId), content, 'utf-8');
  }

  readRejectedCsv(jobId: string): Buffer {
    return readFileSync(this.rejectedPathFor(jobId));
  }

  remove(jobId: string): void {
    try {
      for (const path of [this.pathFor(jobId), this.rejectedPathFor(jobId)]) {
        if (existsSync(path)) {
          unlinkSync(path);
        }
      }
    } catch {
      // best-effort cleanup
    }
  }
}

export function fileTypeFromFilename(filename: string): 'csv' | 'xlsx' {
  const ext = extname(filename).toLowerCase();
  if (ext === '.csv') {
    return 'csv';
  }
  if (ext === '.xlsx' || ext === '.xls') {
    return 'xlsx';
  }
  throw new Error('UNSUPPORTED_FILE_TYPE');
}
