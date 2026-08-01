import { collectTemplateVariableNames } from '../src/modules/campaigns/audience.service';
import { AudienceService } from '../src/modules/campaigns/audience.service';
import { CampaignProcessor } from '../src/modules/campaigns/campaign-processor';
import { CampaignStatusService } from '../src/modules/campaigns/campaign-status.service';
import { MetaApiError } from '../src/modules/whatsapp/meta-api/meta-api.errors';
import type { TemplateComponent, VariableMapping } from '@wa/shared';

function templateComponents(...specs: Array<[string, string | null, TemplateComponent['variables'], string[] | null]>): TemplateComponent[] {
  return specs.map(([type, text, variables, example], index) => ({
    type: type as TemplateComponent['type'],
    position: index,
    text,
    example,
    buttons: null,
    variables,
  }));
}

describe('campaigns', () => {
  describe('collectTemplateVariableNames', () => {
    it('collects variables in header, body, footer, buttons order', () => {
      const components: TemplateComponent[] = [
        templateComponents(['BUTTONS', null, [], null])[0]!,
        templateComponents(['BODY', 'Hi {{2}}', [{ name: '{{2}}', format: 'TEXT', required: true, example: null }], null])[0]!,
        templateComponents(['HEADER', 'Order {{1}}', [{ name: '{{1}}', format: 'TEXT', required: true, example: null }], null])[0]!,
      ];
      // wire a URL button variable into the BUTTONS component
      (components[0] as TemplateComponent).buttons = [
        { type: 'URL', text: 'Open', url: 'https://x.com/{{3}}', phoneNumber: null },
      ];
      expect(collectTemplateVariableNames(components)).toEqual(['{{1}}', '{{2}}', '{{3}}']);
    });

    it('deduplicates repeated variable names', () => {
      const components = templateComponents([
        'BODY',
        'Hi {{1}}',
        [
          { name: '{{1}}', format: 'TEXT', required: true, example: null },
          { name: '{{1}}', format: 'TEXT', required: true, example: null },
        ],
        null,
      ]);
      expect(collectTemplateVariableNames(components)).toEqual(['{{1}}']);
    });
  });

  describe('AudienceService.resolveVariable', () => {
    let service: AudienceService;

    beforeEach(() => {
      service = new AudienceService({} as never);
    });

    it('resolves from contact fields', () => {
      const contact = {
        id: 'c1',
        phoneE164: '+15551234567',
        firstName: 'John',
        lastName: 'Doe',
        displayName: 'John Doe',
        company: 'Acme',
        email: 'j@acme.com',
        language: 'en',
        status: 'ACTIVE',
        customFields: { accountId: 'A42' },
      };
      const mapping: VariableMapping[] = [
        { variableName: '{{1}}', source: 'FIRST_NAME' },
        { variableName: '{{2}}', source: 'COMPANY' },
        { variableName: '{{3}}', source: 'CUSTOM_FIELD', customFieldKey: 'accountId' },
        { variableName: '{{4}}', source: 'STATIC', staticText: 'Hello' },
      ];
      expect(service.resolveVariable(contact, mapping[0]!).value).toBe('John');
      expect(service.resolveVariable(contact, mapping[1]!).value).toBe('Acme');
      expect(service.resolveVariable(contact, mapping[2]!).value).toBe('A42');
      expect(service.resolveVariable(contact, mapping[3]!).value).toBe('Hello');
    });

    it('applies fallback when the source value is empty', () => {
      const contact = {
        id: 'c1',
        phoneE164: '+15551234567',
        firstName: null,
        lastName: 'Doe',
        displayName: null,
        company: null,
        email: null,
        language: 'en',
        status: 'ACTIVE',
        customFields: null,
      };
      const mapping: VariableMapping = { variableName: '{{1}}', source: 'FIRST_NAME', fallback: 'Friend' };
      const result = service.resolveVariable(contact, mapping);
      expect(result.value).toBe('Friend');
      expect(result.missing).toBe(false);
    });

    it('flags missing values with no fallback', () => {
      const contact = {
        id: 'c1',
        phoneE164: '+15551234567',
        firstName: null,
        lastName: null,
        displayName: null,
        company: null,
        email: null,
        language: 'en',
        status: 'ACTIVE',
        customFields: null,
      };
      const mapping: VariableMapping = { variableName: '{{1}}', source: 'CUSTOM_FIELD', customFieldKey: 'nope' };
      const result = service.resolveVariable(contact, mapping);
      expect(result.missing).toBe(true);
      expect(result.value).toBeNull();
    });
  });

  describe('CampaignProcessor.sendRecipientMessage', () => {
    let processor: CampaignProcessor;
    let campaignsDao: { findById: jest.Mock; update: jest.Mock; listActiveIds: jest.Mock };
    let recipientsDao: { findById: jest.Mock; update: jest.Mock; setStatus: jest.Mock; countByStatus: jest.Mock };
    let templatesDao: { findById: jest.Mock };
    let phoneNumbersDao: { findById: jest.Mock };
    let whatsappService: { buildClient: jest.Mock };
    let messagesDao: { insert: jest.Mock; aggregateCampaignMetrics: jest.Mock };
    let dispatchService: { enqueueRecipientSend: jest.Mock };

    function makeJob(overrides: Record<string, unknown> = {}): any {
      return {
        id: 'job-1',
        token: 'token',
        data: { recipientId: 'r1' },
        attemptsMade: 0,
        opts: { attempts: 5 },
        moveToDelayed: jest.fn(),
        ...overrides,
      };
    }

    beforeEach(() => {
      campaignsDao = { findById: jest.fn(), update: jest.fn(), listActiveIds: jest.fn().mockResolvedValue([]) };
      recipientsDao = {
        findById: jest.fn(),
        update: jest.fn(),
        setStatus: jest.fn(),
        countByStatus: jest.fn().mockResolvedValue(0),
      };
      templatesDao = { findById: jest.fn() };
      phoneNumbersDao = { findById: jest.fn() };
      whatsappService = { buildClient: jest.fn() };
      messagesDao = { insert: jest.fn(), aggregateCampaignMetrics: jest.fn() };
      dispatchService = { enqueueRecipientSend: jest.fn() };
      processor = new CampaignProcessor(
        campaignsDao as never,
        recipientsDao as never,
        templatesDao as never,
        phoneNumbersDao as never,
        whatsappService as never,
        messagesDao as never,
        dispatchService as never,
      );
    });

    const recipient = (overrides = {}) => ({
      id: 'r1',
      campaignId: 'camp-1',
      contactId: 'c1',
      phoneE164: '+15551234567',
      status: 'QUEUED',
      idempotencyKey: 'k1',
      attemptCount: 0,
      resolvedTemplateParameters: ['John'],
      ...overrides,
    });

    const campaign = (overrides = {}) => ({
      id: 'camp-1',
      status: 'RUNNING',
      messageTemplateId: 'tmpl-1',
      whatsappPhoneNumberId: 'pn-1',
      templateSnapshot: {
        metaTemplateId: 'meta-1',
        name: 'welcome',
        language: 'en_US',
        components: [
          { type: 'BODY', position: 0, text: 'Hi {{1}}', example: null, buttons: null, variables: [{ name: '{{1}}', format: 'TEXT', required: true, example: null }] },
        ],
        blockedAt: null,
      },
      ...overrides,
    });

    it('sends successfully and persists the message row', async () => {
      recipientsDao.findById.mockResolvedValue(recipient());
      campaignsDao.findById.mockResolvedValue(campaign());
      templatesDao.findById.mockResolvedValue({ id: 'tmpl-1', status: 'APPROVED', name: 'welcome', language: 'en_US', blockedAt: null });
      phoneNumbersDao.findById.mockResolvedValue({ id: 'pn-1', phoneNumberId: 'meta-pn' });
      whatsappService.buildClient.mockResolvedValue({
        sendTemplateMessage: jest.fn().mockResolvedValue({ messages: [{ id: 'wamid-1' }] }),
      });

      await processor.sendRecipientMessage(makeJob());

      expect(messagesDao.insert).toHaveBeenCalledWith(
        expect.objectContaining({ metaMessageId: 'wamid-1', campaignRecipientId: 'r1', status: 'SENT' }),
      );
      expect(recipientsDao.update).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ status: 'SENT', metaMessageId: 'wamid-1' }),
      );
    });

    it('does not re-send when the recipient was already handled (idempotency)', async () => {
      recipientsDao.findById.mockResolvedValue(recipient({ status: 'SENT' }));
      await processor.sendRecipientMessage(makeJob());
      expect(whatsappService.buildClient).not.toHaveBeenCalled();
    });

    it('reschedules (moveToDelayed) when the campaign is paused', async () => {
      recipientsDao.findById.mockResolvedValue(recipient());
      campaignsDao.findById.mockResolvedValue(campaign({ status: 'PAUSED' }));
      const job = makeJob();
      await processor.sendRecipientMessage(job);
      expect(job.moveToDelayed).toHaveBeenCalled();
      expect(whatsappService.buildClient).not.toHaveBeenCalled();
    });

    it('marks the recipient cancelled when the campaign is cancelled', async () => {
      recipientsDao.findById.mockResolvedValue(recipient());
      campaignsDao.findById.mockResolvedValue(campaign({ status: 'CANCELLED' }));
      await processor.sendRecipientMessage(makeJob());
      expect(recipientsDao.setStatus).toHaveBeenCalledWith('r1', 'CANCELLED');
    });

    it('marks FAILED for a permanent Meta error (no retry)', async () => {
      recipientsDao.findById.mockResolvedValue(recipient());
      campaignsDao.findById.mockResolvedValue(campaign());
      templatesDao.findById.mockResolvedValue({ id: 'tmpl-1', status: 'APPROVED', name: 'welcome', language: 'en_US', blockedAt: null });
      phoneNumbersDao.findById.mockResolvedValue({ id: 'pn-1', phoneNumberId: 'meta-pn' });
      whatsappService.buildClient.mockResolvedValue({
        sendTemplateMessage: jest.fn().mockRejectedValue(
          new MetaApiError({ is_transient: false, error_code: 131047, title: 'OAuthException', message: 'permanent' } as never),
        ),
      });

      await processor.sendRecipientMessage(makeJob());
      expect(recipientsDao.update).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ status: 'FAILED', failureCode: '131047' }),
      );
      expect(messagesDao.insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED' }));
    });

    it('throws (triggers retry) for a transient Meta error with attempts remaining', async () => {
      recipientsDao.findById.mockResolvedValue(recipient());
      campaignsDao.findById.mockResolvedValue(campaign());
      templatesDao.findById.mockResolvedValue({ id: 'tmpl-1', status: 'APPROVED', name: 'welcome', language: 'en_US', blockedAt: null });
      phoneNumbersDao.findById.mockResolvedValue({ id: 'pn-1', phoneNumberId: 'meta-pn' });
      whatsappService.buildClient.mockResolvedValue({
        sendTemplateMessage: jest.fn().mockRejectedValue(
          new MetaApiError({ is_transient: true, error_code: 130429, title: 'Rate', message: 'rate limit' } as never),
        ),
      });

      const job = makeJob({ attemptsMade: 1 });
      await expect(processor.sendRecipientMessage(job)).rejects.toBeTruthy();
      expect(recipientsDao.update).not.toHaveBeenCalledWith('r1', expect.objectContaining({ status: 'FAILED' }));
    });

    it('marks FAILED when the template is no longer approved', async () => {
      recipientsDao.findById.mockResolvedValue(recipient());
      campaignsDao.findById.mockResolvedValue(campaign());
      templatesDao.findById.mockResolvedValue({ id: 'tmpl-1', status: 'PAUSED', blockedAt: new Date() });
      await processor.sendRecipientMessage(makeJob());
      expect(recipientsDao.update).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ status: 'FAILED', failureCode: 'TEMPLATE_NOT_APPROVED' }),
      );
    });
  });

  describe('CampaignStatusService (out-of-order, opt-out, reply attribution)', () => {
    let service: CampaignStatusService;
    let db: any;
    let messagesDao: any;
    let recipientsDao: any;
    let auditService: { record: jest.Mock };

    beforeEach(() => {
      db = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
      };
      messagesDao = {
        findByMetaMessageId: jest.fn(),
        applyStatusUpdate: jest.fn(),
        insertStatusEvent: jest.fn(),
        findOpenConversationForContact: jest.fn(),
        insertConversation: jest.fn(),
        touchConversation: jest.fn(),
        insert: jest.fn(),
        findRecentOutboundForContact: jest.fn(),
        aggregateCampaignMetrics: jest.fn(),
      };
      recipientsDao = {
        findById: jest.fn(),
        setStatus: jest.fn(),
        listByStatusForContact: jest.fn(),
      };
      auditService = { record: jest.fn() };
      service = new CampaignStatusService(db as never, messagesDao as never, recipientsDao as never, auditService as never);
    });

    it('does not downgrade a READ state when a delayed SENT arrives', async () => {
      const messageRow = { id: 'm1', campaignRecipientId: 'r1', status: 'READ' };
      messagesDao.findByMetaMessageId.mockResolvedValue(messageRow);
      messagesDao.applyStatusUpdate.mockResolvedValue({ messageRow, updated: false });

      await service.applyStatusUpdate(
        { waMessageId: 'wamid-1', waPhoneNumberId: 'pn', status: 'sent', timestamp: '1700000000', error: null },
        'evt-1',
      );
      expect(recipientsDao.setStatus).not.toHaveBeenCalled();
    });

    it('advances status and mirrors it to the recipient for a new event', async () => {
      const messageRow = { id: 'm1', campaignRecipientId: 'r1', status: 'SENT' };
      messagesDao.findByMetaMessageId.mockResolvedValue(messageRow);
      messagesDao.applyStatusUpdate.mockResolvedValue({ messageRow: { ...messageRow, status: 'DELIVERED' }, updated: true });
      recipientsDao.findById.mockResolvedValue({ id: 'r1', status: 'SENT' });

      await service.applyStatusUpdate(
        { waMessageId: 'wamid-1', waPhoneNumberId: 'pn', status: 'delivered', timestamp: '1700000000', error: null },
        'evt-1',
      );
      expect(recipientsDao.setStatus).toHaveBeenCalledWith('r1', 'DELIVERED', expect.objectContaining({ deliveredAt: expect.any(Date) }));
    });

    it('processes a STOP opt-out and cancels unsent recipients', async () => {
      db.select.mockReturnValue({
        from: () => ({
          where: () => ({ limit: () => Promise.resolve([{ id: 'c1', phoneE164: '+15551234567' }]) }),
        }),
      });
      db.insert.mockReturnValue({ values: () => Promise.resolve() });
      db.update.mockReturnValue({ set: () => ({ where: () => Promise.resolve() }) });
      messagesDao.findOpenConversationForContact.mockResolvedValue(undefined);
      messagesDao.insertConversation.mockResolvedValue({ id: 'conv-1' });
      messagesDao.insert.mockResolvedValue({});
      recipientsDao.listByStatusForContact.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);

      await service.handleInboundMessage(
        {
          waMessageId: 'wamid-in',
          waPhoneNumberId: 'pn',
          from: '+15551234567',
          timestamp: '1700000000',
          type: 'TEXT',
          body: 'STOP',
        },
        'evt-1',
      );
      expect(recipientsDao.setStatus).toHaveBeenCalledWith('r1', 'OPTED_OUT', expect.any(Object));
      expect(recipientsDao.setStatus).toHaveBeenCalledWith('r2', 'OPTED_OUT', expect.any(Object));
      expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'campaign.recipient_opt_out' }));
    });

    it('attributes a reply to the single recent campaign and does not downgrade others', async () => {
      db.select.mockReturnValue({
        from: () => ({
          where: () => ({ limit: () => Promise.resolve([{ id: 'c1', phoneE164: '+15551234567' }]) }),
        }),
      });
      db.insert.mockReturnValue({ values: () => Promise.resolve() });
      db.update.mockReturnValue({ set: () => ({ where: () => Promise.resolve() }) });
      messagesDao.findOpenConversationForContact.mockResolvedValue({ id: 'conv-1' });
      messagesDao.touchConversation.mockResolvedValue(undefined);
      messagesDao.findRecentOutboundForContact.mockResolvedValue([
        { id: 'm-camp', campaignId: 'camp-1', campaignRecipientId: 'r1', metaMessageId: 'wamid-out', status: 'DELIVERED' },
      ]);

      await service.handleInboundMessage(
        {
          waMessageId: 'wamid-reply',
          waPhoneNumberId: 'pn',
          from: '+15551234567',
          timestamp: '1700000000',
          type: 'TEXT',
          body: 'thanks!',
        },
        'evt-2',
      );
      expect(recipientsDao.setStatus).toHaveBeenCalledWith('r1', 'REPLIED', expect.objectContaining({ repliedAt: expect.any(Date) }));
    });

    it('does not attribute a reply when multiple distinct campaigns are recent', async () => {
      db.select.mockReturnValue({
        from: () => ({
          where: () => ({ limit: () => Promise.resolve([{ id: 'c1', phoneE164: '+15551234567' }]) }),
        }),
      });
      db.insert.mockReturnValue({ values: () => Promise.resolve() });
      db.update.mockReturnValue({ set: () => ({ where: () => Promise.resolve() }) });
      messagesDao.findOpenConversationForContact.mockResolvedValue({ id: 'conv-1' });
      messagesDao.touchConversation.mockResolvedValue(undefined);
      messagesDao.findRecentOutboundForContact.mockResolvedValue([
        { id: 'm1', campaignId: 'camp-1', campaignRecipientId: 'r1', metaMessageId: 'w1', status: 'DELIVERED' },
        { id: 'm2', campaignId: 'camp-2', campaignRecipientId: 'r2', metaMessageId: 'w2', status: 'DELIVERED' },
      ]);

      await service.handleInboundMessage(
        {
          waMessageId: 'wamid-reply2',
          waPhoneNumberId: 'pn',
          from: '+15551234567',
          timestamp: '1700000000',
          type: 'TEXT',
          body: 'hi',
        },
        'evt-3',
      );
      expect(recipientsDao.setStatus).not.toHaveBeenCalledWith('r1', 'REPLIED', expect.anything());
      expect(recipientsDao.setStatus).not.toHaveBeenCalledWith('r2', 'REPLIED', expect.anything());
    });
  });
});