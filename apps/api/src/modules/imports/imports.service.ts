import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import type {
  ConfigureImportInput,
  ImportableField,
  ImportJobDetailDto,
  ImportJobDto,
  ImportJobQuery,
  ImportOptions,
  ImportUploadDto,
  ImportValidationSummaryDto,
  PaginatedImportJobs,
} from '@wa/shared';
import { AUDIT_ACTIONS, IMPORTABLE_FIELDS } from '@wa/shared';

import { IMPORTS_QUEUE } from '../../common/queue/queue.module';
import { ERROR_CODES } from '../../common/errors';
import { AuditService } from '../../common/audit/audit.module';
import { SettingsService } from '../settings/settings.service';
import type { AuthUser } from '../auth/auth.types';
import type { ImportJobRow } from '../../db/schema';
import { ImportsDao, toImportJobDto, toImportRowDto } from './imports.dao';
import { ImportStorage, fileTypeFromFilename } from './imports.storage';
import { parseFile } from './imports.parser';
import { autoMapColumns, validateImport } from './imports.validator';
import { assertCan } from '../contacts/contacts.permissions';

export interface UploadedFileLike {
  originalname: string;
  buffer: Buffer;
  size: number;
  mimetype: string;
}

const HARD_UPLOAD_CAP_MB = 50;

@Injectable()
export class ImportsService {
  constructor(
    private readonly importsDao: ImportsDao,
    private readonly storage: ImportStorage,
    private readonly auditService: AuditService,
    private readonly settingsService: SettingsService,
    @Inject(IMPORTS_QUEUE) private readonly importsQueue: Queue,
  ) {}

  async upload(file: UploadedFileLike, actor: AuthUser): Promise<ImportUploadDto> {
    assertCan(actor.role, 'import.manage');
    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException(ERROR_CODES.IMPORT_EMPTY_FILE);
    }
    const maxBytes = await this.maxUploadBytes();
    if (file.size > maxBytes) {
      throw new BadRequestException(ERROR_CODES.IMPORT_FILE_TOO_LARGE);
    }

    let fileType: 'csv' | 'xlsx';
    try {
      fileType = fileTypeFromFilename(file.originalname);
      if (fileType === 'csv' && file.buffer.length >= 2 && file.buffer[0] === 0x50 && file.buffer[1] === 0x4b) {
        throw new Error('BINARY_FILE_WITH_CSV_EXTENSION');
      }
    } catch {
      throw new BadRequestException(ERROR_CODES.IMPORT_FILE_TYPE_UNSUPPORTED);
    }

    let parsed;
    try {
      parsed = parseFile(file.buffer, fileType);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PARSE_FAILED';
      if (message === 'EMPTY_FILE') {
        throw new BadRequestException(ERROR_CODES.IMPORT_EMPTY_FILE);
      }
      if (message === 'TOO_MANY_ROWS') {
        throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
      }
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }

    const [job] = await this.importsDao.insert({
      originalFilename: file.originalname,
      storedFilename: `${file.originalname}-${Date.now()}`,
      fileType,
      status: 'UPLOADED',
      totalRows: parsed.totalRows,
      createdByUserId: actor.id,
    });
    if (!job) {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }

    try {
      this.storage.save(job.id, file.buffer);
    } catch {
      this.storage.remove(job.id);
      await this.importsDao.delete(job.id);
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.IMPORT_UPLOAD,
      entityType: 'import_job',
      entityId: job.id,
      metadata: { filename: file.originalname, totalRows: parsed.totalRows },
    });

    return {
      jobId: job.id,
      originalFilename: file.originalname,
      fileType,
      sheets: parsed.sheets,
      headers: parsed.headers,
      previewRows: parsed.previewRows,
      totalRows: parsed.totalRows,
    };
  }

  async configure(jobId: string, input: ConfigureImportInput, actor: AuthUser): Promise<ImportValidationSummaryDto> {
    assertCan(actor.role, 'import.manage');
    const job = await this.requireJob(jobId);
    if (job.status !== 'UPLOADED') {
      throw new BadRequestException(ERROR_CODES.IMPORT_JOB_STATE_INVALID);
    }

    const buffer = this.storage.read(jobId);
    const parsed = parseFile(buffer, job.fileType, input.sheetName);

    const rawMapping = Object.keys(input.columnMapping).length > 0 ? { ...input.columnMapping } : autoMapColumns(parsed.headers);

    const invalidColumns = Object.keys(rawMapping).filter((column) => !parsed.headers.includes(column));
    if (invalidColumns.length > 0) {
      throw new BadRequestException(ERROR_CODES.IMPORT_NO_HEADER_MATCH);
    }
    const invalidFields = Object.values(rawMapping).filter(
      (field) => !(IMPORTABLE_FIELDS as readonly string[]).includes(field),
    );
    if (invalidFields.length > 0) {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }
    if (!Object.values(rawMapping).includes('phone')) {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }
    const columnMapping = rawMapping as Record<string, ImportableField>;

    const options = { ...input.options, sheetName: input.sheetName } as ImportOptions & { sheetName?: string };
    const validation = validateImport(parsed, columnMapping, options);

    await this.importsDao.update(jobId, {
      status: 'CONFIGURED',
      columnMapping,
      options: { ...options } as unknown as Record<string, unknown>,
      totalRows: validation.candidates.length,
      validRows: validation.validCount,
      invalidRows: validation.invalidCount,
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.IMPORT_CONFIGURE,
      entityType: 'import_job',
      entityId: jobId,
      metadata: { mapping: columnMapping, validRows: validation.validCount, invalidRows: validation.invalidCount },
    });

    return {
      jobId,
      status: 'CONFIGURED',
      totalRows: validation.candidates.length,
      validRows: validation.validCount,
      invalidRows: validation.invalidCount,
      duplicateRows: validation.duplicateInFileCount,
      issues: validation.issues.slice(0, 1000),
    };
  }

  async start(jobId: string, actor: AuthUser): Promise<ImportJobDto> {
    assertCan(actor.role, 'import.manage');
    const job = await this.requireJob(jobId);
    if (job.status !== 'CONFIGURED') {
      throw new BadRequestException(ERROR_CODES.IMPORT_JOB_STATE_INVALID);
    }

    await this.importsDao.update(jobId, { status: 'VALIDATING' });
    try {
      await this.importsQueue.add(
        'process-import',
        { jobId },
        {
          jobId: `import-${jobId}`,
          attempts: 2,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 200,
          removeOnFail: 200,
        },
      );
    } catch (error) {
      // Enqueue failed (e.g., Redis unavailable): revert to CONFIGURED so the
      // operator can retry instead of being stuck in VALIDATING forever.
      await this.importsDao.update(jobId, { status: 'CONFIGURED' });
      throw error;
    }

    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.IMPORT_START,
      entityType: 'import_job',
      entityId: jobId,
      metadata: { totalRows: job.totalRows },
    });

    const [updated] = await this.importsDao.update(jobId, { status: 'PROCESSING' });
    return toImportJobDto(updated ?? job);
  }

  async list(query: ImportJobQuery, actor: AuthUser): Promise<PaginatedImportJobs> {
    assertCan(actor.role, 'import.manage');
    const { items, total } = await this.importsDao.list(query);
    const totalPages = total === 0 ? 0 : Math.ceil(total / query.pageSize);
    return { items, total, page: query.page, pageSize: query.pageSize, totalPages };
  }

  async get(jobId: string, actor: AuthUser): Promise<ImportJobDetailDto> {
    assertCan(actor.role, 'import.manage');
    const job = await this.requireJob(jobId);
    const rows = await this.importsDao.rowsForJob(jobId, 5000);
    return {
      ...toImportJobDto(job),
      rows: rows.map(toImportRowDto),
    };
  }

  async rejectedCsv(jobId: string, actor: AuthUser): Promise<Buffer> {
    assertCan(actor.role, 'import.manage');
    await this.requireJob(jobId);
    try {
      return this.storage.readRejectedCsv(jobId);
    } catch {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
  }

  private async requireJob(jobId: string): Promise<ImportJobRow> {
    const job = await this.importsDao.findById(jobId);
    if (!job) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    return job;
  }

  private async maxUploadBytes(): Promise<number> {
    const settings = await this.settingsService.getAll();
    const configuredMb = Number.isFinite(settings.maxImportFileSizeMb) && settings.maxImportFileSizeMb > 0
      ? settings.maxImportFileSizeMb
      : 20;
    return Math.min(configuredMb, HARD_UPLOAD_CAP_MB) * 1024 * 1024;
  }
}
