import { BadRequestException, NotFoundException } from '@nestjs/common';

import { ImportsService } from '../src/modules/imports/imports.service';
import type { AuthUser } from '../src/modules/auth/auth.types';

function adminUser(): AuthUser {
  return { id: 'u-admin', name: 'Admin', email: 'admin@x.com', role: 'ADMIN', status: 'ACTIVE', preferredLanguage: 'en' };
}

function job(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'job-1',
    originalFilename: 'contacts.csv',
    storedFilename: 'contacts.csv-1',
    fileType: 'csv',
    status: 'COMPLETED',
    totalRows: 10,
    validRows: 10,
    invalidRows: 0,
    createdRows: 5,
    updatedRows: 0,
    skippedRows: 0,
    duplicateRows: 0,
    errorRows: 0,
    createdByUserId: 'u-admin',
    startedAt: new Date(),
    completedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

describe('ImportsService.remove', () => {
  let importsDao: any;
  let storage: any;
  let auditService: any;
  let settingsService: any;
  let importsQueue: any;

  function buildService(): ImportsService {
    return new ImportsService(importsDao, storage, auditService, settingsService, importsQueue);
  }

  beforeEach(() => {
    importsDao = {
      findById: jest.fn(),
      createdContactIdsForJob: jest.fn().mockResolvedValue(['c1', 'c2', 'c3']),
      deleteContacts: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    storage = { remove: jest.fn() };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    settingsService = {};
    importsQueue = {};
  });

  it('deletes created contacts and the job for a completed import', async () => {
    importsDao.findById.mockResolvedValue(job());

    const result = await buildService().remove('job-1', adminUser());

    expect(importsDao.createdContactIdsForJob).toHaveBeenCalledWith('job-1');
    expect(importsDao.deleteContacts).toHaveBeenCalledWith(['c1', 'c2', 'c3']);
    expect(importsDao.delete).toHaveBeenCalledWith('job-1');
    expect(storage.remove).toHaveBeenCalledWith('job-1');
    expect(result).toEqual({ deletedRows: 5, deletedContacts: 3 });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'import.delete',
        entityType: 'import_job',
        entityId: 'job-1',
        metadata: expect.objectContaining({ deletedRows: 5, deletedContacts: 3 }),
      }),
    );
  });

  it('returns zero deletions when the job created no contacts', async () => {
    importsDao.findById.mockResolvedValue(job());
    importsDao.createdContactIdsForJob.mockResolvedValue([]);

    const result = await buildService().remove('job-1', adminUser());

    expect(importsDao.deleteContacts).toHaveBeenCalledWith([]);
    expect(result).toEqual({ deletedRows: 5, deletedContacts: 0 });
  });

  it('rejects deletion while the import is running', async () => {
    importsDao.findById.mockResolvedValue(job({ status: 'PROCESSING' }));

    await expect(buildService().remove('job-1', adminUser())).rejects.toBeInstanceOf(BadRequestException);
    expect(importsDao.delete).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND for an unknown job', async () => {
    importsDao.findById.mockResolvedValue(undefined);

    await expect(buildService().remove('job-1', adminUser())).rejects.toBeInstanceOf(NotFoundException);
  });
});
