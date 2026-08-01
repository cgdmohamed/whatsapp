import { ForbiddenException } from '@nestjs/common';

import { ERROR_CODES } from '../src/common/errors';
import { InboxRealtimeService } from '../src/modules/inbox/inbox.realtime.service';
import {
  assertConversationAccess,
  assertCanSend,
  canSendToConversation,
} from '../src/modules/inbox/inbox.permissions';
import { InboxInboundService } from '../src/modules/inbox/inbox-inbound.service';
import { InboxSendService } from '../src/modules/inbox/inbox-send.service';
import { InboxService } from '../src/modules/inbox/inbox.service';
import { InboxMediaService } from '../src/modules/inbox/inbox-media.service';
import { toMessageDto, toMediaFileDto } from '../src/modules/inbox/inbox.mapper';
import type { ConversationRow } from '../src/db/schema';

function conversation(overrides: Partial<ConversationRow> = {}): ConversationRow {
  return {
    id: 'conv-1',
    contactId: 'contact-1',
    whatsappPhoneNumberId: 'wa-pn-1',
    status: 'NEW',
    priority: 'NORMAL',
    assignedUserId: null,
    assignedAt: null,
    lastMessageId: null,
    lastMessageAt: new Date(),
    lastInboundMessageAt: null,
    lastOutboundMessageAt: null,
    unreadCount: 0,
    serviceWindowExpiresAt: null,
    closedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ConversationRow;
}

describe('inbox permissions', () => {
  it('allows an agent to send only on conversations assigned to them', () => {
    const mine = conversation({ assignedUserId: 'u1' });
    const theirs = conversation({ assignedUserId: 'u2' });
    const unassigned = conversation({ assignedUserId: null });

    expect(canSendToConversation('AGENT', mine, 'u1')).toBe(true);
    expect(canSendToConversation('AGENT', theirs, 'u1')).toBe(false);
    expect(canSendToConversation('AGENT', unassigned, 'u1')).toBe(false);
    expect(canSendToConversation('MANAGER', theirs, 'u1')).toBe(true);
    expect(canSendToConversation('ADMIN', theirs, 'u1')).toBe(true);
  });

  it('enforces conversation view access for agents', () => {
    const unassigned = conversation({ assignedUserId: null });
    const mine = conversation({ assignedUserId: 'u1' });

    // Agent without the canViewUnassigned setting sees only their own conversations.
    assertConversationAccess('AGENT', mine, 'u1', false);
    expect(() => assertConversationAccess('AGENT', unassigned, 'u1', false)).toThrow(ForbiddenException);
    expect(() => assertConversationAccess('AGENT', conversation({ assignedUserId: 'u2' }), 'u1', false)).toThrow(ForbiddenException);

    // Agent with the setting may also view unassigned conversations.
    assertConversationAccess('AGENT', unassigned, 'u1', true);
    expect(() => assertConversationAccess('AGENT', conversation({ assignedUserId: 'u2' }), 'u1', true)).toThrow(ForbiddenException);
  });

  it('blocks sending when the actor has no send permission', () => {
    expect(() => assertCanSend('AGENT', conversation({ assignedUserId: 'u2' }), 'u1')).toThrow(ForbiddenException);
  });
});

describe('inbox realtime authorization', () => {
  let realtime: InboxRealtimeService;

  beforeEach(() => {
    realtime = new InboxRealtimeService();
  });

  function connect(userId: string, role: 'ADMIN' | 'MANAGER' | 'AGENT', canViewUnassigned: boolean): { received: Array<{ type: string; conversationId: string }> } {
    const seen: Array<{ type: string; conversationId: string }> = [];
    realtime.connect(userId, { userId, role, canViewUnassigned }).subscribe((event) => {
      seen.push({ type: event.type, conversationId: event.conversationId });
    });
    return { received: seen };
  }

  it('delivers to admins and managers regardless of assignment', () => {
    const admin = connect('admin-1', 'ADMIN', false);
    const manager = connect('mgr-1', 'MANAGER', false);
    realtime.emitToConversation(
      { type: 'message', conversationId: 'c1', payload: {}, at: new Date().toISOString() },
      { assignedUserId: 'someone-else' },
    );
    expect(admin.received).toHaveLength(1);
    expect(manager.received).toHaveLength(1);
  });

  it('delivers to the assigned agent only', () => {
    const owner = connect('agent-1', 'AGENT', false);
    const other = connect('agent-2', 'AGENT', false);
    realtime.emitToConversation(
      { type: 'message', conversationId: 'c1', payload: {}, at: new Date().toISOString() },
      { assignedUserId: 'agent-1' },
    );
    expect(owner.received).toHaveLength(1);
    expect(other.received).toHaveLength(0);
  });

  it('lets agents with canViewUnassigned see unassigned conversations only', () => {
    const allowed = connect('agent-1', 'AGENT', true);
    const restricted = connect('agent-2', 'AGENT', false);
    realtime.emitToConversation(
      { type: 'conversation', conversationId: 'c1', payload: {}, at: new Date().toISOString() },
      { assignedUserId: null },
    );
    expect(allowed.received).toHaveLength(1);
    expect(restricted.received).toHaveLength(0);
  });
});

describe('InboxInboundService', () => {
  let db: any;
  let conversationsDao: any;
  let messagesDao: any;
  let mediaFilesDao: any;
  let contactsDao: any;
  let recipientsDao: any;
  let realtime: any;
  let settingsService: any;
  let auditService: any;
  let mediaQueue: any;

  function buildService(): InboxInboundService {
    return new InboxInboundService(
      mediaQueue,
      db,
      conversationsDao,
      messagesDao,
      mediaFilesDao,
      contactsDao,
      recipientsDao,
      realtime,
      settingsService,
      auditService,
    );
  }

  beforeEach(() => {
    db = {
      insert: jest.fn().mockReturnValue({ values: jest.fn().mockReturnValue(Promise.resolve()) }),
    };
    mediaQueue = { add: jest.fn() };
    conversationsDao = {
      findForInbound: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      incrementUnread: jest.fn(),
    };
    messagesDao = { insert: jest.fn() };
    mediaFilesDao = { insert: jest.fn() };
    contactsDao = { findByPhone: jest.fn(), insert: jest.fn(), update: jest.fn() };
    recipientsDao = { listByStatusForContact: jest.fn(), setStatus: jest.fn() };
    realtime = { emitToConversation: jest.fn() };
    settingsService = { getAll: jest.fn().mockResolvedValue({ serviceWindowHours: 24 }) };
    auditService = { record: jest.fn() };
  });

  it('creates a contact and conversation, stores the message, bumps unread and opens the service window', async () => {
    contactsDao.findByPhone.mockResolvedValue(undefined);
    contactsDao.insert.mockResolvedValue([{ id: 'contact-1', phoneE164: '+15551234567', status: 'ACTIVE' }]);
    conversationsDao.findForInbound.mockResolvedValue(undefined);
    conversationsDao.insert.mockResolvedValue(conversation({ id: 'conv-1' }));
    conversationsDao.update.mockImplementation(async (id: string, patch: Partial<ConversationRow>) => ({ ...conversation(), ...patch, id }));
    conversationsDao.findById.mockResolvedValue(conversation({ id: 'conv-1', status: 'OPEN', closedAt: null }));
    messagesDao.insert.mockResolvedValue({ id: 'msg-1', direction: 'INBOUND', status: 'RECEIVED', type: 'TEXT', createdAt: new Date() });

    const result = await buildService().handleInboundMessage(
      { waMessageId: 'wamid-1', waPhoneNumberId: 'wa-pn-1', from: '+15551234567', timestamp: '1700000000', type: 'TEXT', body: 'hello' },
      'evt-1',
    );

    expect(contactsDao.insert).toHaveBeenCalled();
    expect(conversationsDao.insert).toHaveBeenCalled();
    expect(messagesDao.insert).toHaveBeenCalledWith(expect.objectContaining({ direction: 'INBOUND', status: 'RECEIVED' }));
    expect(conversationsDao.incrementUnread).toHaveBeenCalledWith('conv-1');
    expect(conversationsDao.update).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({ status: 'OPEN', serviceWindowExpiresAt: expect.any(Date) }),
    );
    expect(realtime.emitToConversation).toHaveBeenCalled();
    expect(result.message.id).toBe('msg-1');
  });

  it('reuses an existing conversation and auto-reopens a closed one', async () => {
    const closed = conversation({ id: 'conv-9', status: 'CLOSED', closedAt: new Date() });
    contactsDao.findByPhone.mockResolvedValue({ id: 'contact-1', phoneE164: '+15551234567', status: 'ACTIVE' });
    conversationsDao.findForInbound.mockResolvedValue(closed);
    conversationsDao.update.mockImplementation(async (_id: string, patch: Partial<ConversationRow>) => ({ ...closed, ...patch }));
    conversationsDao.findById.mockResolvedValue({ ...closed, status: 'OPEN', closedAt: null });
    messagesDao.insert.mockResolvedValue({ id: 'msg-1', direction: 'INBOUND', status: 'RECEIVED', createdAt: new Date() });

    await buildService().handleInboundMessage(
      { waMessageId: 'wamid-2', waPhoneNumberId: 'wa-pn-1', from: '+15551234567', timestamp: '1700000000', type: 'TEXT', body: 'still there?' },
      'evt-2',
    );

    expect(conversationsDao.insert).not.toHaveBeenCalled();
    expect(conversationsDao.update).toHaveBeenCalledWith('conv-9', expect.objectContaining({ status: 'OPEN', closedAt: null }));
  });

  it('records an opt-out, stops active recipients and does not attribute to campaigns', async () => {
    contactsDao.findByPhone.mockResolvedValue({ id: 'contact-1', phoneE164: '+15551234567', status: 'ACTIVE' });
    conversationsDao.findForInbound.mockResolvedValue(conversation({ id: 'conv-1' }));
    conversationsDao.update.mockImplementation(async (_id: string, patch: Partial<ConversationRow>) => ({ ...conversation(), ...patch }));
    conversationsDao.findById.mockResolvedValue(conversation({ id: 'conv-1', status: 'OPEN' }));
    messagesDao.insert.mockResolvedValue({ id: 'msg-1', direction: 'INBOUND', status: 'RECEIVED', createdAt: new Date() });
    recipientsDao.listByStatusForContact.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
    recipientsDao.setStatus.mockResolvedValue(undefined);

    const result = await buildService().handleInboundMessage(
      { waMessageId: 'wamid-3', waPhoneNumberId: 'wa-pn-1', from: '+15551234567', timestamp: '1700000000', type: 'TEXT', body: 'STOP' },
      'evt-3',
    );

    expect(result.isOptOut).toBe(true);
    expect(db.insert).toHaveBeenCalled();
    expect(recipientsDao.listByStatusForContact).toHaveBeenCalledWith('contact-1', ['PENDING', 'QUEUED', 'SENDING']);
    expect(recipientsDao.setStatus).toHaveBeenCalledWith('r1', 'OPTED_OUT', expect.objectContaining({ optedOutAt: expect.any(Date) }));
    expect(recipientsDao.setStatus).toHaveBeenCalledWith('r2', 'OPTED_OUT', expect.objectContaining({ optedOutAt: expect.any(Date) }));
  });

  it('enqueues media download for inbound media messages', async () => {
    contactsDao.findByPhone.mockResolvedValue({ id: 'contact-1', phoneE164: '+15551234567', status: 'ACTIVE' });
    conversationsDao.findForInbound.mockResolvedValue(conversation({ id: 'conv-1' }));
    conversationsDao.update.mockImplementation(async (_id: string, patch: Partial<ConversationRow>) => ({ ...conversation(), ...patch }));
    conversationsDao.findById.mockResolvedValue(conversation({ id: 'conv-1', status: 'OPEN' }));
    messagesDao.insert.mockResolvedValue({ id: 'msg-1', direction: 'INBOUND', status: 'RECEIVED', createdAt: new Date() });
    mediaFilesDao.insert.mockResolvedValue({ id: 'media-1', messageId: 'msg-1', status: 'PENDING', createdAt: new Date() });

    await buildService().handleInboundMessage(
      { waMessageId: 'wamid-4', waPhoneNumberId: 'wa-pn-1', from: '+15551234567', timestamp: '1700000000', type: 'IMAGE', mediaId: 'mid-1', mimeType: 'image/jpeg', sha256: null, caption: null },
      'evt-4',
    );

    expect(mediaFilesDao.insert).toHaveBeenCalledWith(expect.objectContaining({ direction: 'INBOUND', source: 'INBOUND_META', metaMediaId: 'mid-1' }));
    expect(mediaQueue.add).toHaveBeenCalledWith('download', { mediaFileId: 'media-1' }, expect.any(Object));
  });
});

describe('InboxSendService', () => {
  let sendQueue: any;
  let conversationsDao: any;
  let messagesDao: any;
  let mediaFilesDao: any;
  let mediaStorage: any;
  let contactsDao: any;
  let templatesDao: any;
  let whatsappService: any;
  let realtime: any;
  let accessService: any;
  let auditService: any;

  function buildService(): InboxSendService {
    return new InboxSendService(
      sendQueue,
      conversationsDao,
      messagesDao,
      mediaFilesDao,
      mediaStorage,
      contactsDao,
      templatesDao,
      whatsappService,
      realtime,
      accessService,
      auditService,
    );
  }

  beforeEach(() => {
    sendQueue = { add: jest.fn() };
    conversationsDao = { findById: jest.fn(), update: jest.fn() };
    messagesDao = { insert: jest.fn(), update: jest.fn(), findById: jest.fn() };
    mediaFilesDao = {};
    mediaStorage = {};
    contactsDao = { hasActiveSuppression: jest.fn(), latestConsent: jest.fn() };
    templatesDao = {};
    whatsappService = {};
    realtime = {};
    accessService = { assertSendPermission: jest.fn() };
    auditService = { record: jest.fn() };
  });

  it('rejects a reply when the 24h service window has expired', async () => {
    const expired = conversation({ id: 'conv-1', status: 'OPEN', assignedUserId: 'u1', serviceWindowExpiresAt: new Date(Date.now() - 1000) });
    conversationsDao.findById.mockResolvedValue(expired);
    accessService.assertSendPermission.mockResolvedValue(undefined);
    contactsDao.hasActiveSuppression.mockResolvedValue(false);
    contactsDao.latestConsent.mockResolvedValue(undefined);

    await expect(
      buildService().sendReply(
        { id: 'u1', name: 'A', email: 'a@x.com', role: 'AGENT', status: 'ACTIVE', preferredLanguage: 'ar' },
        'conv-1',
        { type: 'TEXT', textContent: 'hello' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects a reply to a closed conversation', async () => {
    const closed = conversation({ id: 'conv-1', status: 'CLOSED', assignedUserId: 'u1', serviceWindowExpiresAt: new Date(Date.now() + 60_000) });
    conversationsDao.findById.mockResolvedValue(closed);
    accessService.assertSendPermission.mockResolvedValue(undefined);

    await expect(
      buildService().sendReply(
        { id: 'u1', name: 'A', email: 'a@x.com', role: 'AGENT', status: 'ACTIVE', preferredLanguage: 'ar' },
        'conv-1',
        { type: 'TEXT', textContent: 'hello' },
      ),
    ).rejects.toThrow(ERROR_CODES.INBOX_CONVERSATION_CLOSED);
  });

  it('rejects a reply to a suppressed contact', async () => {
    const open = conversation({ id: 'conv-1', status: 'OPEN', assignedUserId: 'u1', serviceWindowExpiresAt: new Date(Date.now() + 60_000) });
    conversationsDao.findById.mockResolvedValue(open);
    accessService.assertSendPermission.mockResolvedValue(undefined);
    contactsDao.hasActiveSuppression.mockResolvedValue(true);

    await expect(
      buildService().sendReply(
        { id: 'u1', name: 'A', email: 'a@x.com', role: 'AGENT', status: 'ACTIVE', preferredLanguage: 'ar' },
        'conv-1',
        { type: 'TEXT', textContent: 'hello' },
      ),
    ).rejects.toThrow(ERROR_CODES.INBOX_CONTACT_SUPPRESSED);
  });

  it('enqueues a send job and records an audit entry on success', async () => {
    const open = conversation({ id: 'conv-1', status: 'OPEN', assignedUserId: 'u1', serviceWindowExpiresAt: new Date(Date.now() + 60_000) });
    conversationsDao.findById.mockResolvedValue(open);
    accessService.assertSendPermission.mockResolvedValue(undefined);
    contactsDao.hasActiveSuppression.mockResolvedValue(false);
    contactsDao.latestConsent.mockResolvedValue(undefined);
    messagesDao.insert.mockResolvedValue({ id: 'msg-1', direction: 'OUTBOUND', status: 'PENDING', type: 'text', textContent: 'hello', createdAt: new Date() });

    const row = await buildService().sendReply(
      { id: 'u1', name: 'A', email: 'a@x.com', role: 'AGENT', status: 'ACTIVE', preferredLanguage: 'ar' },
      'conv-1',
      { type: 'TEXT', textContent: 'hello' },
    );

    expect(sendQueue.add).toHaveBeenCalledWith('send', { messageId: 'msg-1' }, expect.any(Object));
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'inbox.message_send' }));
    expect(toMessageDto(row).textContent).toBe('hello');
  });
});

describe('InboxService internal notes', () => {
  it('persists a note and never touches the message store', async () => {
    const db = {};
    const conversationsDao = { findById: jest.fn().mockResolvedValue(conversation({ id: 'conv-1', assignedUserId: 'u1' })) };
    const internalNotesDao = {
      insert: jest.fn().mockResolvedValue({ id: 'note-1', conversationId: 'conv-1', userId: 'u1', content: 'private', createdAt: new Date(), updatedAt: new Date(), deletedAt: null }),
    };
    const realtime = { emitToConversation: jest.fn() };
    const accessService = { getAccessibleConversation: jest.fn().mockResolvedValue(conversation({ id: 'conv-1', assignedUserId: 'u1' })) };
    const auditService = { record: jest.fn() };
    const messagesDao = { insert: jest.fn() };

    const service = new InboxService(
      db as never,
      conversationsDao as never,
      {} as never,
      internalNotesDao as never,
      {} as never,
      messagesDao as never,
      {} as never,
      {} as never,
      {} as never,
      accessService as never,
      realtime as never,
      auditService as never,
    );

    const note = await service.createNote(
      'conv-1',
      { content: 'internal only' },
      { id: 'u1', name: 'Agent', email: 'a@x.com', role: 'AGENT', status: 'ACTIVE', preferredLanguage: 'ar' },
    );

    expect(internalNotesDao.insert).toHaveBeenCalledWith(expect.objectContaining({ content: 'internal only', conversationId: 'conv-1' }));
    expect(messagesDao.insert).not.toHaveBeenCalled();
    expect(realtime.emitToConversation).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'note', conversationId: 'conv-1' }),
      { assignedUserId: 'u1' },
    );
    expect(note.id).toBe('note-1');
  });
});

describe('InboxMediaService authorization', () => {
  let mediaFilesDao: any;
  let storage: any;
  let accessService: any;
  let configService: any;

  function buildService(): InboxMediaService {
    return new InboxMediaService(
      mediaFilesDao,
      storage,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      configService,
      accessService,
    );
  }

  beforeEach(() => {
    mediaFilesDao = {
      findById: jest.fn().mockResolvedValue({
        id: 'media-1',
        conversationId: 'conv-1',
        storedFilename: 'abc.jpg',
        contentType: 'image/jpeg',
        originalFilename: 'photo.jpg',
        sizeBytes: 100,
      }),
    };
    storage = { exists: jest.fn().mockReturnValue(true), stream: jest.fn().mockReturnValue('stream') };
    accessService = { getAccessibleConversation: jest.fn() };
    configService = { get: jest.fn().mockReturnValue('secret'), getOrThrow: jest.fn().mockReturnValue('secret') };
  });

  it('rejects streaming when the actor cannot access the conversation', async () => {
    accessService.getAccessibleConversation.mockRejectedValue(new ForbiddenException(ERROR_CODES.INBOX_ACCESS_DENIED));
    await expect(buildService().getForStream(
      { id: 'u2', name: 'A', email: 'a@x.com', role: 'AGENT', status: 'ACTIVE', preferredLanguage: 'ar' },
      'media-1',
    )).rejects.toThrow(ERROR_CODES.INBOX_ACCESS_DENIED);
  });

  it('rejects a stream with an invalid or expired signature', async () => {
    await expect(buildService().getForSignedStream('media-1', Date.now() + 60_000, 'not-a-signature')).rejects.toThrow(ERROR_CODES.INBOX_MEDIA_SIGNATURE_INVALID);
    await expect(buildService().getForSignedStream('media-1', Date.now() - 1000, 'anything')).rejects.toThrow(ERROR_CODES.INBOX_MEDIA_SIGNATURE_INVALID);
  });

  it('rejects minting a signed URL when the actor cannot access the conversation', async () => {
    accessService.getAccessibleConversation.mockRejectedValue(new ForbiddenException(ERROR_CODES.INBOX_ACCESS_DENIED));
    await expect(buildService().createSignedUrl(
      { id: 'u2', name: 'A', email: 'a@x.com', role: 'AGENT', status: 'ACTIVE', preferredLanguage: 'ar' },
      'media-1',
    )).rejects.toThrow(ERROR_CODES.INBOX_ACCESS_DENIED);
  });

  it('streams a file whose signature verifies', async () => {
    const service = buildService();
    accessService.getAccessibleConversation.mockResolvedValue({ id: 'conv-1' });
    const signed = await service.createSignedUrl(
      { id: 'u2', name: 'A', email: 'a@x.com', role: 'AGENT', status: 'ACTIVE', preferredLanguage: 'ar' },
      'media-1',
    );
    const match = /expires=(\d+)&token=([0-9a-f]+)/.exec(signed.url);
    const result = await service.getForSignedStream('media-1', Number(match?.[1]), match?.[2] ?? '');
    expect(result.contentType).toBe('image/jpeg');
    expect(result.filename).toBe('photo.jpg');
    expect(result.sizeBytes).toBe(100);
    expect(toMediaFileDto).toBeDefined();
  });
});
