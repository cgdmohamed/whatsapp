import { MessageTemplatesService } from '../src/modules/whatsapp/templates/message-templates.service';
import type { AuthUser } from '../src/modules/auth/auth.types';
import type { NewMessageTemplate, MessageTemplateRow } from '../src/db/schema';

function makeAuth(role: AuthUser['role']): AuthUser {
  return { id: 'user-1', name: 'Tester', email: 't@x.com', role, status: 'ACTIVE', preferredLanguage: 'en' };
}

function row(overrides: Partial<MessageTemplateRow> = {}): MessageTemplateRow {
  const now = new Date();
  return {
    id: 'tmpl-1',
    whatsappAccountId: 'acc-1',
    metaTemplateId: 'meta-1',
    name: 'order_confirmation',
    language: 'en_US',
    category: 'UTILITY',
    status: 'APPROVED',
    qualityScore: null,
    rejectionReason: null,
    components: [
      { type: 'BODY', position: 0, text: 'Hi {{1}}', example: null, buttons: null, variables: [] },
    ],
    rawMetaPayload: null,
    blockedAt: null,
    metaUpdatedAt: now,
    lastSyncedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as MessageTemplateRow;
}

describe('MessageTemplatesService', () => {
  let service: MessageTemplatesService;
  let whatsappService: {
    requireAccount: jest.Mock;
    buildClient: jest.Mock;
  };
  let templatesDao: {
    list: jest.Mock;
    findById: jest.Mock;
    findByMetaTemplateId: jest.Mock;
    findByMetaTemplateIds: jest.Mock;
    upsert: jest.Mock;
    syncSummary: jest.Mock;
    recordSync: jest.Mock;
  };
  let auditService: { record: jest.Mock };
  let client: { listTemplates: jest.Mock; createTemplate: jest.Mock };

  beforeEach(() => {
    client = { listTemplates: jest.fn(), createTemplate: jest.fn() };
    whatsappService = {
      requireAccount: jest.fn().mockResolvedValue({ id: 'acc-1', wabaId: 'waba-1', templatesLastSyncedAt: null }),
      buildClient: jest.fn().mockResolvedValue(client),
    };
    templatesDao = {
      list: jest.fn(),
      findById: jest.fn(),
      findByMetaTemplateId: jest.fn(),
      findByMetaTemplateIds: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      syncSummary: jest.fn().mockResolvedValue({ total: 0, approvedCount: 0, blockedCount: 0, blockedTemplates: [] }),
      recordSync: jest.fn().mockResolvedValue(undefined),
    };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    service = new MessageTemplatesService(
      whatsappService as never,
      templatesDao as never,
      auditService as never,
    );
  });

  describe('syncFromMeta', () => {
    it('inserts new templates fetched from Meta', async () => {
      client.listTemplates.mockResolvedValue([
        {
          id: 'm1',
          name: 'order_confirmation',
          status: 'APPROVED',
          category: 'UTILITY',
          language: 'en_US',
          components: [{ type: 'BODY', text: 'Hi {{1}}' }],
          quality_score: 'GREEN',
        },
      ]);
      templatesDao.upsert.mockImplementation(async (_acc: string, _metaId: string, values) => ({
        row: { id: 'tmpl-1', blockedAt: values.blockedAt, status: values.status } as MessageTemplateRow,
        inserted: true,
        changed: true,
      }));

      const result = await service.syncFromMeta();
      expect(result.totalFetched).toBe(1);
      expect(result.inserted).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.unchanged).toBe(0);
      expect(templatesDao.upsert).toHaveBeenCalledTimes(1);
      expect(templatesDao.recordSync).toHaveBeenCalledWith('acc-1', expect.any(Date));
    });

    it('dedupes by metaTemplateId via upsert and counts updates', async () => {
      const previous = row({ id: 'tmpl-1', status: 'PENDING' });
      templatesDao.findByMetaTemplateIds.mockResolvedValue([previous]);
      templatesDao.findByMetaTemplateId.mockResolvedValue(previous);
      client.listTemplates.mockResolvedValue([
        {
          id: 'meta-1',
          name: 'order_confirmation',
          status: 'APPROVED',
          category: 'UTILITY',
          language: 'en_US',
          components: [{ type: 'BODY', text: 'Hi {{1}}' }],
        },
      ]);
      templatesDao.upsert.mockResolvedValue({ row: previous, inserted: false, changed: true });

      const result = await service.syncFromMeta();
      expect(result.updated).toBe(1);
      expect(result.inserted).toBe(0);
    });

    it('flags and audits a previously approved template that becomes paused', async () => {
      const previous = row({ id: 'tmpl-1', status: 'APPROVED', blockedAt: null });
      templatesDao.findByMetaTemplateIds.mockResolvedValue([previous]);
      templatesDao.findByMetaTemplateId.mockResolvedValue(previous);
      client.listTemplates.mockResolvedValue([
        {
          id: 'meta-1',
          name: 'order_confirmation',
          status: 'PAUSED',
          category: 'UTILITY',
          language: 'en_US',
          components: [{ type: 'BODY', text: 'Hi {{1}}' }],
          rejected_reason: 'policy violation',
        },
      ]);
      templatesDao.upsert.mockImplementation(async (_acc: string, _metaId: string, values: Partial<NewMessageTemplate>) => ({
        row: { ...previous, status: values.status, blockedAt: values.blockedAt } as MessageTemplateRow,
        inserted: false,
        changed: true,
      }));

      const result = await service.syncFromMeta();
      expect(result.blockedTemplates).toHaveLength(1);
      expect(result.blockedTemplates[0]?.status).toBe('PAUSED');
      expect(result.blockedTemplates[0]?.previousStatus).toBe('APPROVED');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'whatsapp.template_status_blocked', entityId: 'tmpl-1' }),
      );
    });

    it('clears blockedAt when a paused template returns to approved', async () => {
      const previous = row({ id: 'tmpl-1', status: 'PAUSED', blockedAt: new Date('2024-01-01') });
      templatesDao.findByMetaTemplateIds.mockResolvedValue([previous]);
      templatesDao.findByMetaTemplateId.mockResolvedValue(previous);
      client.listTemplates.mockResolvedValue([
        {
          id: 'meta-1',
          name: 'order_confirmation',
          status: 'APPROVED',
          category: 'UTILITY',
          language: 'en_US',
          components: [{ type: 'BODY', text: 'Hi {{1}}' }],
        },
      ]);
      templatesDao.upsert.mockImplementation(async (_acc: string, _metaId: string, values: Partial<NewMessageTemplate>) => ({
        row: { ...previous, status: values.status, blockedAt: values.blockedAt } as MessageTemplateRow,
        inserted: false,
        changed: true,
      }));

      await service.syncFromMeta();
      expect(templatesDao.upsert.mock.calls[0][2].blockedAt).toBeNull();
      expect(auditService.record).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'whatsapp.template_status_blocked' }),
      );
    });

    it('collects per-template errors without failing the whole sync', async () => {
      client.listTemplates.mockResolvedValue([
        { id: 'm-bad', name: 'broken', status: 'APPROVED', category: 'UTILITY', language: 'en', components: [] },
        { id: 'm-good', name: 'good', status: 'APPROVED', category: 'UTILITY', language: 'en', components: [] },
      ]);
      templatesDao.upsert
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValueOnce({ row: row({ id: 'g' }), inserted: true, changed: true });

      const result = await service.syncFromMeta();
      expect(result.errors).toHaveLength(1);
      expect(result.inserted).toBe(1);
    });
  });

  describe('list / permissions', () => {
    it('forces approvedOnly for AGENT', async () => {
      templatesDao.list.mockResolvedValue({ items: [], total: 0 });
      await service.list({ page: 1, pageSize: 20, sortBy: 'updatedAt', sortOrder: 'desc' }, makeAuth('AGENT'));
      expect(templatesDao.list).toHaveBeenCalledWith('acc-1', expect.any(Object), { approvedOnly: true });
    });

    it('does not force approvedOnly for ADMIN', async () => {
      templatesDao.list.mockResolvedValue({ items: [], total: 0 });
      await service.list({ page: 1, pageSize: 20, sortBy: 'updatedAt', sortOrder: 'desc' }, makeAuth('ADMIN'));
      expect(templatesDao.list).toHaveBeenCalledWith('acc-1', expect.any(Object), { approvedOnly: false });
    });
  });

  describe('getDetail', () => {
    it('forbids AGENT from viewing non-approved templates', async () => {
      templatesDao.findById.mockResolvedValue(row({ status: 'PAUSED' }));
      await expect(service.getDetail('tmpl-1', makeAuth('AGENT'))).rejects.toMatchObject({ name: 'ForbiddenException' });
    });

    it('allows AGENT to view approved templates', async () => {
      templatesDao.findById.mockResolvedValue(row({ status: 'APPROVED' }));
      const dto = await service.getDetail('tmpl-1', makeAuth('AGENT'));
      expect(dto.status).toBe('APPROVED');
    });

    it('throws NotFound when missing', async () => {
      templatesDao.findById.mockResolvedValue(undefined);
      await expect(service.getDetail('missing', makeAuth('ADMIN'))).rejects.toMatchObject({ name: 'NotFoundException' });
    });
  });

  describe('createTemplate', () => {
    it('rejects components with variable sequence issues', async () => {
      await expect(
        service.createTemplate({
          name: 'my_tmpl',
          language: 'en_US',
          category: 'UTILITY',
          components: [
            { type: 'HEADER', headerFormat: 'TEXT', text: 'Order {{2}}' },
            { type: 'BODY', text: 'Hi {{1}}' },
          ],
        }),
      ).rejects.toMatchObject({ name: 'BadRequestException' });
      expect(client.createTemplate).not.toHaveBeenCalled();
    });

    it('creates a template via Meta then syncs', async () => {
      client.createTemplate.mockResolvedValue({ id: 'new-meta', status: 'PENDING', category: 'UTILITY' });
      client.listTemplates.mockResolvedValue([
        {
          id: 'new-meta',
          name: 'welcome',
          status: 'PENDING',
          category: 'UTILITY',
          language: 'en_US',
          components: [{ type: 'BODY', text: 'Hello {{1}}' }],
        },
      ]);
      templatesDao.upsert.mockResolvedValue({ row: row({ id: 't' }), inserted: true, changed: true });

      const result = await service.createTemplate({
        name: 'welcome',
        language: 'en_US',
        category: 'UTILITY',
        components: [{ type: 'BODY', text: 'Hello {{1}}' }],
      });
      expect(result.metaTemplateId).toBe('new-meta');
      expect(client.createTemplate).toHaveBeenCalledTimes(1);
      expect(templatesDao.upsert).toHaveBeenCalled();
    });
  });

  describe('preview', () => {
    it('renders component text with provided samples', async () => {
      const preview = await service.preview({
        components: [
          {
            type: 'BODY',
            position: 0,
            text: 'Hi {{1}}',
            example: null,
            buttons: null,
            variables: [{ name: '{{1}}', format: 'TEXT', required: true, example: null }],
          },
        ],
        samples: ['Alice'],
      });
      expect(preview.bodyText).toBe('Hi Alice');
    });
  });

  describe('getSyncStatus', () => {
    it('returns empty status when no account is configured', async () => {
      whatsappService.requireAccount.mockRejectedValue(new Error('no account'));
      const status = await service.getSyncStatus();
      expect(status.total).toBe(0);
      expect(status.lastSyncedAt).toBeNull();
    });

    it('returns counts from the DAO', async () => {
      templatesDao.syncSummary.mockResolvedValue({
        total: 5,
        approvedCount: 3,
        blockedCount: 1,
        blockedTemplates: [{ id: 'b1', name: 'paused one', status: 'PAUSED' }],
      });
      const status = await service.getSyncStatus();
      expect(status.total).toBe(5);
      expect(status.approvedCount).toBe(3);
      expect(status.blockedCount).toBe(1);
      expect(status.blockedTemplates[0]?.status).toBe('PAUSED');
    });
  });
});