import { BadRequestException } from '@nestjs/common';

import { parseReconciliationCsv } from '../src/modules/reconciliation/cost-reconciliation.parser';
import { CostReconciliationService } from '../src/modules/reconciliation/cost-reconciliation.service';

const SAMPLE_HEADERS = ['Message ID', 'Phone number ID', 'Recipient market', 'Message category', 'Billing date', 'Amount', 'Currency'];

function buildCsv(rows: string[][]): string {
  return [SAMPLE_HEADERS.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

describe('parseReconciliationCsv', () => {
  it('parses a Meta cost report into rows', () => {
    const csv = buildCsv([
      ['wamid.abc', '123456789', 'US', 'MARKETING', '2026-08-01', '0.005', 'USD'],
      ['wamid.def', '123456789', 'EG', 'UTILITY', '2026-08-01', '0.0100', 'USD'],
    ]);
    const result = parseReconciliationCsv(Buffer.from(csv, 'utf8'));
    expect(result.rows).toHaveLength(2);
    expect(result.detectedCurrency).toBe('USD');
    expect(result.rows[0]).toMatchObject({ metaMessageId: 'wamid.abc', recipientMarket: 'US', amount: 0.005 });
    expect(result.rows[1]?.amount).toBe(0.01);
  });

  it('matches headers case-insensitively and ignores BOM', () => {
    const csv = '\uFEFF' + buildCsv([['wamid.abc', '123456789', 'us', 'SERVICE', '2026-08-01', '0', 'usd']]);
    const result = parseReconciliationCsv(Buffer.from(csv, 'utf8'));
    expect(result.rows[0]?.currency).toBe('USD');
    expect(result.rows[0]?.recipientMarket).toBe('us');
  });

  it('throws when required columns are missing', () => {
    expect(() => parseReconciliationCsv(Buffer.from('foo,bar\n1,2\n', 'utf8'))).toThrow('MISSING_REQUIRED_COLUMNS');
  });

  it('throws on an empty file', () => {
    expect(() => parseReconciliationCsv(Buffer.from('', 'utf8'))).toThrow('EMPTY_FILE');
  });

  it('flags rows without a message id or amount as issues', () => {
    const csv = buildCsv([
      ['', '123456789', 'US', 'MARKETING', '2026-08-01', '0.005', 'USD'],
      ['wamid.abc', '123456789', 'US', 'MARKETING', '2026-08-01', '', 'USD'],
    ]);
    const result = parseReconciliationCsv(Buffer.from(csv, 'utf8'));
    expect(result.issues.some((issue) => issue.includes('missing message id'))).toBe(true);
    expect(result.issues.some((issue) => issue.includes('invalid amount'))).toBe(true);
  });
});

describe('CostReconciliationService', () => {
  const message = {
    id: 'msg-1',
    metaMessageId: 'wamid.abc',
    campaignId: 'camp-1',
    campaignRecipientId: 'recip-1',
    conversationId: null,
    contactId: 'contact-1',
    whatsappPhoneNumberId: 'pn-1',
  };
  const job = (overrides: Record<string, unknown> = {}) => ({
    id: 'job-1',
    sourceType: 'CSV',
    originalFilename: 'cost-report.csv',
    periodStart: null,
    periodEnd: null,
    currency: 'USD',
    status: 'UPLOADED',
    totalRows: 0,
    matchedRows: 0,
    unmatchedRows: 0,
    adjustedRows: 0,
    createdByUserId: 'user-1',
    startedAt: null,
    completedAt: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  });
  const cost = {
    id: 'cost-1',
    messageId: 'msg-1',
    finalCost: '0.005',
    confirmedCost: '0.005',
    adjustedCost: null,
    chargeStatus: 'PAID',
    freeReason: null,
    calculationStatus: 'ESTIMATED',
    currency: 'USD',
  };
  const csv = buildCsv([['wamid.abc', '123456789', 'US', 'MARKETING', '2026-08-01', '0.0045', 'USD']]);
  const actor = { id: 'user-1', role: 'ADMIN' };

  function buildService() {
    let currentJob = job();
    const dao = {
      insert: jest.fn().mockImplementation((values: Record<string, unknown>) => {
        currentJob = job({ ...currentJob, ...values });
        return Promise.resolve(currentJob);
      }),
      findById: jest.fn().mockImplementation(() => Promise.resolve(currentJob)),
      update: jest.fn().mockImplementation((_id: string, patch: Record<string, unknown>) => {
        currentJob = job({ ...currentJob, ...patch });
        return Promise.resolve(currentJob);
      }),
      list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      findMessagesByMetaIds: jest.fn().mockResolvedValue(new Map([[message.metaMessageId, message]])),
      findCostsByMessageIds: jest.fn().mockResolvedValue(new Map([[message.id, cost]])),
    };
    const storage = {
      save: jest.fn(),
      read: jest.fn().mockReturnValue(Buffer.from(csv, 'utf8')),
      saveUnmatched: jest.fn(),
      readUnmatched: jest.fn().mockReturnValue([]),
      hasUnmatchedCsv: jest.fn().mockReturnValue(true),
      readUnmatchedCsv: jest.fn().mockReturnValue(Buffer.from('a\n')),
      remove: jest.fn(),
    };
    const costsDao = { update: jest.fn().mockResolvedValue(cost), addEvent: jest.fn().mockResolvedValue(undefined), upsertForMessage: jest.fn().mockResolvedValue(cost) };
    const auditService = { record: jest.fn().mockResolvedValue(undefined) };
    const settingsService = { getAll: jest.fn().mockResolvedValue({ reconciliationTolerancePercent: 5 }) };

    const service = new CostReconciliationService(
      dao as never,
      storage as never,
      costsDao as never,
      auditService as never,
      settingsService as never,
    );
    return { service, dao, storage, costsDao, auditService, settingsService };
  }

  it('uploads a CSV and creates an UPLOADED job', async () => {
    const { service, dao, storage, auditService } = buildService();
    const result = await service.upload(
      { originalname: 'cost-report.csv', buffer: Buffer.from(csv, 'utf8'), size: Buffer.byteLength(csv), mimetype: 'text/csv' },
      actor as never,
    );
    expect(result.job.status).toBe('UPLOADED');
    expect(result.job.totalRows).toBe(1);
    expect(result.headers).toContain('Message ID');
    expect(dao.insert).toHaveBeenCalled();
    expect(storage.save).toHaveBeenCalledWith('job-1', expect.any(Buffer));
    expect(auditService.record).toHaveBeenCalled();
  });

  it('rejects uploads without a CSV extension', async () => {
    const { service } = buildService();
    await expect(
      service.upload({ originalname: 'report.xlsx', buffer: Buffer.from(csv, 'utf8'), size: 10, mimetype: 'application/vnd.ms-excel' }, actor as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates a job and reports matched/unmatched counts', async () => {
    const { service, dao, storage } = buildService();
    const result = await service.validate('job-1', actor as never);
    expect(result.job.status).toBe('READY');
    expect(result.matchedRows).toBe(1);
    expect(result.unmatchedRows).toBe(0);
    expect(dao.update).toHaveBeenCalledWith('job-1', expect.objectContaining({ status: 'READY' }));
    expect(storage.saveUnmatched).toHaveBeenCalled();
  });

  it('rejects validate/apply from the wrong state', async () => {
    const { service, dao } = buildService();
    dao.findById.mockResolvedValue(job({ status: 'COMPLETED' }));
    await expect(service.validate('job-1', actor as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.apply('job-1', actor as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('applies confirmed costs to matched message costs', async () => {
    const { service, dao, storage, costsDao, auditService } = buildService();
    dao.findById.mockResolvedValue(job({ status: 'READY' }));
    const result = await service.apply('job-1', actor as never);
    expect(result.status).toBe('COMPLETED');
    expect(result.adjustedRows).toBe(1);
    expect(result.matchedRows).toBe(1);
    expect(costsDao.update).toHaveBeenCalledWith('cost-1', expect.objectContaining({ confirmedCost: '0.0045', chargeStatus: 'PAID', calculationStatus: 'CONFIRMED' }));
    expect(costsDao.addEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'CONFIRMED', source: 'reconciliation' }));
    expect(storage.saveUnmatched).toHaveBeenCalled();
    expect(auditService.record).toHaveBeenCalled();
  });

  it('creates a cost row when the matched message has none', async () => {
    const { service, dao, costsDao } = buildService();
    dao.findById.mockResolvedValue(job({ status: 'READY' }));
    dao.findCostsByMessageIds.mockResolvedValue(new Map());
    const result = await service.apply('job-1', actor as never);
    expect(result.adjustedRows).toBe(1);
    expect(costsDao.upsertForMessage).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'msg-1', confirmedCost: '0.0045', chargeStatus: 'PAID' }));
  });

  it('treats differences within tolerance as no adjustment', async () => {
    const { service, dao, costsDao, settingsService } = buildService();
    dao.findById.mockResolvedValue(job({ status: 'READY' }));
    settingsService.getAll.mockResolvedValue({ reconciliationTolerancePercent: 5 });
    const withinTolerance = { ...cost, finalCost: '0.0046', confirmedCost: '0.0046' };
    dao.findCostsByMessageIds.mockResolvedValue(new Map([[message.id, withinTolerance]]));
    const result = await service.apply('job-1', actor as never);
    expect(result.adjustedRows).toBe(0);
    expect(costsDao.update).toHaveBeenCalledWith('cost-1', expect.objectContaining({ confirmedCost: '0.0045' }));
  });

  it('returns paginated list and detail with unmatched rows', async () => {
    const { service, storage } = buildService();
    const listResult = await service.list({ page: 1, pageSize: 20 });
    expect(listResult).toEqual({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });

    storage.readUnmatched.mockReturnValue([{ rowNumber: 2, metaMessageId: 'wamid.zzz', phoneNumberId: null, recipientMarket: null, messageCategory: null, billingDate: null, amount: 0.01, currency: 'USD', matchedMessageId: null }]);
    const detail = await service.get('job-1');
    expect(detail.job.id).toBe('job-1');
    expect(detail.unmatchedRows).toHaveLength(1);
  });
});
