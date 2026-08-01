import { BadRequestException, NotFoundException } from '@nestjs/common';

jest.mock('node:fs', () => ({
  existsSync: jest.fn(),
  createReadStream: jest.fn(),
}));

import { csvCell, csvRow } from '../src/modules/reports/csv';
import { ExportsService } from '../src/modules/reports/exports.service';
import { toExportJobDto } from '../src/modules/reports/exports-dao';
import { ReportsService } from '../src/modules/reports/reports.service';
import { AuditLogsService } from '../src/modules/audit-logs/audit-logs.service';
import type { ExportJobRow } from '../src/db/schema';
import type { AuthUser } from '../src/modules/auth/auth.types';

function adminUser(): AuthUser {
  return { id: 'u-admin', name: 'Admin', email: 'admin@x.com', role: 'ADMIN', status: 'ACTIVE', preferredLanguage: 'en' };
}

function managerUser(): AuthUser {
  return { id: 'u-mgr', name: 'Manager', email: 'mgr@x.com', role: 'MANAGER', status: 'ACTIVE', preferredLanguage: 'en' };
}

function exportJob(overrides: Partial<ExportJobRow> = {}): ExportJobRow {
  return {
    id: '9b0e7b22-2f8d-4f6b-8d4b-9f8f4b9b9b9b',
    type: 'campaign-recipients',
    filters: { campaignId: 'camp-1' },
    status: 'COMPLETED',
    fileName: 'camp-1.csv',
    totalRows: 10,
    errorMessage: null,
    createdByUserId: 'u-mgr',
    startedAt: new Date(),
    completedAt: new Date(),
    downloadCount: 2,
    expiresAt: null,
    createdAt: new Date(),
    ...overrides,
  } as ExportJobRow;
}

describe('csv helpers', () => {
  it('emits empty cells for null and undefined', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes cells containing commas, quotes or newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell('plain')).toBe('plain');
  });

  it('joins rows and escapes embedded quotes', () => {
    expect(csvRow(['id', 'name'])).toBe('id,name');
    expect(csvRow([1, 'a,b'])).toBe('1,"a,b"');
  });
});

describe('ReportsService', () => {
  it('wraps DAO results into paginated envelopes', async () => {
    const dao = {
      dashboardSummary: jest.fn(),
      dashboardTrends: jest.fn(),
      campaignPerformance: jest.fn().mockResolvedValue({ items: [{ id: 'c1' }], total: 25 }),
      failureAnalysis: jest.fn(),
      inboxPerformance: jest.fn().mockResolvedValue({ items: [{ id: 'x' }], total: 0 }),
      contactReport: jest.fn().mockResolvedValue({ items: [], total: 7 }),
      contactBreakdown: jest.fn(),
    };
    const service = new ReportsService(dao as never);

    const result = await service.campaignPerformance({ page: 2, pageSize: 10, sortBy: 'createdAt', sortOrder: 'desc' });
    expect(result).toEqual({ items: [{ id: 'c1' }], total: 25, page: 2, pageSize: 10, totalPages: 3 });

    expect(await service.inboxPerformance({ page: 1, pageSize: 20, sortBy: 'messagesSent', sortOrder: 'desc' })).toMatchObject({
      total: 0,
      totalPages: 0,
    });
    expect(await service.contactReport({ page: 1, pageSize: 5, sortBy: 'createdAt', sortOrder: 'desc' })).toMatchObject({
      total: 7,
      totalPages: 2,
    });
  });
});

describe('ExportsService', () => {
  let exportsDao: any;
  let auditService: any;
  let exportsQueue: any;
  let configService: any;

  function buildService(): ExportsService {
    return new ExportsService(exportsDao, auditService, exportsQueue, configService);
  }

  beforeEach(() => {
    exportsDao = {
      insert: jest.fn().mockResolvedValue(exportJob()),
      findById: jest.fn().mockResolvedValue(exportJob()),
      incrementDownload: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue({ items: [exportJob()], total: 1 }),
    };
    auditService = { record: jest.fn() };
    exportsQueue = { add: jest.fn() };
    configService = { get: jest.fn().mockReturnValue('./exports'), getOrThrow: jest.fn() };
  });

  it('rejects campaign-recipients exports without a campaign filter', async () => {
    await expect(
      buildService().create(managerUser(), { type: 'campaign-recipients' }),
    ).rejects.toThrow(BadRequestException);
    expect(exportsQueue.add).not.toHaveBeenCalled();
  });

  it('allows only ADMIN to export the audit log', async () => {
    await expect(
      buildService().create(managerUser(), { type: 'audit-log', filters: null }),
    ).rejects.toThrow('FORBIDDEN');
    expect(exportsQueue.add).not.toHaveBeenCalled();

    const row = exportJob({ type: 'audit-log' });
    exportsDao.insert.mockResolvedValue(row);
    await expect(
      buildService().create(adminUser(), { type: 'audit-log', filters: null }),
    ).resolves.toMatchObject({ type: 'audit-log' });
    expect(exportsQueue.add).toHaveBeenCalledWith('export', { exportJobId: row.id }, expect.any(Object));
  });

  it('creates an export job, enqueues it and records an audit entry', async () => {
    const row = exportJob({ type: 'contacts' });
    exportsDao.insert.mockResolvedValue(row);

    const dto = await buildService().create(managerUser(), { type: 'contacts', filters: null });

    expect(exportsDao.insert).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'contacts', status: 'PENDING', createdByUserId: 'u-mgr' }),
    );
    expect(exportsQueue.add).toHaveBeenCalledWith('export', { exportJobId: row.id }, expect.any(Object));
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'export.create' }));
    expect(dto.status).toBe('COMPLETED');
    expect(dto.downloadUrl).toBeNull();
  });

  it('builds download URLs for completed jobs in list responses', async () => {
    const service = buildService();
    const result = await service.list(managerUser(), { page: 1, pageSize: 20 });
    expect(result.items[0]?.downloadUrl).toBe('/api/reports/exports/9b0e7b22-2f8d-4f6b-8d4b-9f8f4b9b9b9b/download');
  });

  it('hides non-admin users exports from other non-admin users', async () => {
    exportsDao.findById.mockResolvedValue(exportJob({ createdByUserId: 'someone-else' }));
    await expect(buildService().get(managerUser(), 'id')).rejects.toThrow(NotFoundException);
    await expect(buildService().get(adminUser(), 'id')).resolves.toMatchObject({ id: expect.any(String) });
  });

  it('refuses to stream a job that is not completed', async () => {
    exportsDao.findById.mockResolvedValue(exportJob({ status: 'RUNNING', fileName: null }));
    const res = { setHeader: jest.fn() } as any;
    await expect(buildService().download(managerUser(), 'id', res)).rejects.toThrow(BadRequestException);
  });

  it('streams the CSV file for a completed job and bumps the download count', async () => {
    const fsMock = jest.requireMock('node:fs') as { existsSync: jest.Mock; createReadStream: jest.Mock };
    fsMock.existsSync.mockReturnValue(true);
    fsMock.createReadStream.mockReturnValue({ on: jest.fn() });
    exportsDao.findById.mockResolvedValue(exportJob());
    const res = { setHeader: jest.fn() } as any;
    const service = buildService();
    const file = await service.download(managerUser(), 'id', res);
    expect(file).toBeDefined();
    expect(exportsDao.incrementDownload).toHaveBeenCalledWith('id');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
  });
});

describe('AuditLogsService', () => {
  it('wraps DAO results into a paginated envelope', async () => {
    const dao = {
      list: jest.fn().mockResolvedValue({ items: [{ id: 'a1' }], total: 41 }),
      exportAll: jest.fn().mockResolvedValue([]),
    };
    const service = new AuditLogsService(dao as never);
    const result = await service.list({ page: 2, pageSize: 10 });
    expect(result).toEqual({ items: [{ id: 'a1' }], total: 41, page: 2, pageSize: 10, totalPages: 5 });
  });
});

describe('toExportJobDto', () => {
  it('maps a DB row to the DTO shape', () => {
    const dto = toExportJobDto(exportJob(), '/download');
    expect(dto).toEqual({
      id: '9b0e7b22-2f8d-4f6b-8d4b-9f8f4b9b9b9b',
      type: 'campaign-recipients',
      filters: { campaignId: 'camp-1' },
      status: 'COMPLETED',
      fileName: 'camp-1.csv',
      totalRows: 10,
      errorMessage: null,
      createdByUserId: 'u-mgr',
      createdAt: expect.any(String),
      startedAt: expect.any(String),
      completedAt: expect.any(String),
      downloadCount: 2,
      downloadUrl: '/download',
    });
  });
});
