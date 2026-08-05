import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { ContactsService } from '../src/modules/contacts/contacts.service';
import type { AuthUser } from '../src/modules/auth/auth.types';

function adminUser(): AuthUser {
  return { id: 'u-admin', name: 'Admin', email: 'admin@x.com', role: 'ADMIN', status: 'ACTIVE', preferredLanguage: 'en' };
}

function managerUser(): AuthUser {
  return { id: 'u-manager', name: 'Manager', email: 'manager@x.com', role: 'MANAGER', status: 'ACTIVE', preferredLanguage: 'en' };
}

function agentUser(): AuthUser {
  return { id: 'u-agent', name: 'Agent', email: 'agent@x.com', role: 'AGENT', status: 'ACTIVE', preferredLanguage: 'en' };
}

function contact(overrides: Record<string, unknown> = {}): any {
  return { id: 'c1', phoneE164: '+966501234567', ...overrides };
}

function selectChain(resolved: unknown) {
  return {
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(resolved),
    }),
  };
}

describe('ContactsService delete', () => {
  let contactsDao: any;
  let tagsDao: any;
  let listsDao: any;
  let auditService: any;
  let db: any;

  function buildService(): ContactsService {
    return new ContactsService(contactsDao, tagsDao, listsDao, auditService, db);
  }

  beforeEach(() => {
    contactsDao = { findById: jest.fn() };
    tagsDao = {};
    listsDao = { refreshCount: jest.fn().mockResolvedValue(undefined) };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    db = {
      select: jest.fn(),
      delete: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue({ rowCount: 1 }) }),
      transaction: jest.fn(async (callback: (tx: any) => Promise<void>) => callback(db)),
    };
  });

  describe('remove', () => {
    beforeEach(() => {
      contactsDao.findById.mockResolvedValue(contact());
      db.select.mockReturnValue(selectChain([]));
    });

    it('hard-deletes the contact and records a CONTACT_DELETE audit entry', async () => {
      const result = await buildService().remove('c1', adminUser());

      expect(db.delete).toHaveBeenCalled();
      expect(result).toEqual({ affected: 1 });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'contact.delete',
          entityType: 'contact',
          entityId: 'c1',
          metadata: expect.objectContaining({ phone: '+966501234567' }),
        }),
      );
    });

    it('refreshes list member counts after deletion', async () => {
      db.select.mockReturnValue(selectChain([{ listId: 'l1' }, { listId: 'l2' }, { listId: 'l1' }]));

      await buildService().remove('c1', adminUser());

      expect(listsDao.refreshCount).toHaveBeenCalledTimes(2);
      expect(listsDao.refreshCount).toHaveBeenCalledWith('l1');
      expect(listsDao.refreshCount).toHaveBeenCalledWith('l2');
    });

    it('allows MANAGER role', async () => {
      await expect(buildService().remove('c1', managerUser())).resolves.toEqual({ affected: 1 });
    });

    it('rejects AGENT role', async () => {
      await expect(buildService().remove('c1', agentUser())).rejects.toBeInstanceOf(ForbiddenException);
      expect(db.delete).not.toHaveBeenCalled();
    });

    it('throws NOT_FOUND for an unknown contact', async () => {
      contactsDao.findById.mockResolvedValue(undefined);

      await expect(buildService().remove('c1', adminUser())).rejects.toBeInstanceOf(NotFoundException);
      expect(db.delete).not.toHaveBeenCalled();
    });
  });

  describe('bulkDelete', () => {
    it('deletes only existing ids and audits a contact.bulk delete action', async () => {
      db.select
        .mockReturnValueOnce(selectChain([{ id: 'c1' }, { id: 'c2' }]))
        .mockReturnValueOnce(selectChain([]));

      const result = await buildService().bulkDelete(['c1', 'c2', 'missing'], adminUser());

      expect(result).toEqual({ affected: 2 });
      expect(db.delete).toHaveBeenCalled();
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'contact.bulk',
          entityType: 'contact',
          metadata: expect.objectContaining({ action: 'delete', affected: 2, contactIds: ['c1', 'c2', 'missing'] }),
        }),
      );
    });

    it('returns zero when no ids exist', async () => {
      db.select.mockReturnValueOnce(selectChain([]));

      const result = await buildService().bulkDelete(['missing'], adminUser());

      expect(result).toEqual({ affected: 0 });
      expect(db.delete).not.toHaveBeenCalled();
      expect(auditService.record).not.toHaveBeenCalled();
    });

    it('returns zero for an empty id list', async () => {
      const result = await buildService().bulkDelete([], adminUser());

      expect(result).toEqual({ affected: 0 });
      expect(db.select).not.toHaveBeenCalled();
    });

    it('rejects AGENT role', async () => {
      await expect(buildService().bulkDelete(['c1'], agentUser())).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
