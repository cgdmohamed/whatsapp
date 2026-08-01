import { BadRequestException } from '@nestjs/common';

import { OperationsService } from '../src/modules/operations/operations.service';
import type { AuthUser } from '../src/modules/auth/auth.types';

function adminUser(): AuthUser {
  return { id: 'u-admin', name: 'Admin', email: 'admin@x.com', role: 'ADMIN', status: 'ACTIVE', preferredLanguage: 'en' };
}

function queueManagerFor(queue: Record<string, any>): any {
  return {
    getQueueByName: jest.fn().mockReturnValue(queue),
  };
}

describe('OperationsService', () => {
  let db: any;
  let redis: any;
  let queueManager: any;
  let auditService: any;

  function buildService(): OperationsService {
    return new OperationsService(db, redis, queueManager, auditService);
  }

  beforeEach(() => {
    function makeQuery(): any {
      const result = Promise.resolve([]);
      const chain: any = {
        from: () => chain,
        groupBy: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        where: () => chain,
      };
      (chain as any).then = (onFulfilled: (value: unknown) => unknown) => result.then(onFulfilled);
      (chain as any).catch = (onRejected: (reason: unknown) => unknown) => result.catch(onRejected);
      return chain;
    }
    db = {
      execute: jest.fn().mockResolvedValue(undefined),
      select: jest.fn().mockImplementation(() => makeQuery()),
    };
    redis = { ping: jest.fn().mockResolvedValue('PONG') };
    queueManager = queueManagerFor({ getJobCounts: jest.fn(), getWorkers: jest.fn() });
    auditService = { record: jest.fn() };
  });

  it('returns the full system status shape', async () => {
    queueManager.getQueueByName = jest.fn().mockReturnValue({
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 3, active: 1, delayed: 0, failed: 2, completed: 50, paused: 0 }),
      getWorkers: jest.fn().mockResolvedValue([{ id: 'w1' }, { id: 'w2' }]),
    });

    const result = await buildService().status();

    expect(result.database).toEqual({ up: true, latencyMs: expect.any(Number) });
    expect(result.redis).toEqual({ up: true, latencyMs: expect.any(Number) });
    expect(result.queues.length).toBeGreaterThan(0);
    expect(result.queues[0]).toMatchObject({ waiting: 3, failed: 2, paused: false, workers: 2 });
    expect(result.webhooks).toMatchObject({ received: 0 });
    expect(result.inbox).toMatchObject({ openConversations: 0, unreadConversations: 0, unassignedConversations: 0 });
    expect(result.whatsapp).toMatchObject({ phoneNumbers: 0 });
  });

  it('reports database and redis outages without throwing', async () => {
    db.execute.mockRejectedValue(new Error('db down'));
    redis.ping.mockRejectedValue(new Error('redis down'));
    queueManager.getQueueByName = jest.fn().mockReturnValue(undefined);

    const result = await buildService().status();
    expect(result.database).toEqual({ up: false, latencyMs: null });
    expect(result.redis).toEqual({ up: false, latencyMs: null });
    expect(result.queues).toHaveLength(result.queues.length);
  });

  it('rejects retry on an unknown queue', async () => {
    queueManager.getQueueByName = jest.fn().mockReturnValue(undefined);
    await expect(
      buildService().retryFailed(adminUser(), { queue: 'nope' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('retries failed jobs and records an audit entry', async () => {
    const retry = jest.fn().mockResolvedValue(undefined);
    const failedJob = { id: 'job-1', retry };
    queueManager.getQueueByName = jest.fn().mockReturnValue({ getFailed: jest.fn().mockResolvedValue([failedJob]) });

    const result = await buildService().retryFailed(adminUser(), { queue: 'webhooks' });
    expect(retry).toHaveBeenCalled();
    expect(result).toEqual({ queue: 'webhooks', retried: 1, errors: [] });
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'operations.retry_failed' }));
  });

  it('drains failed jobs and records an audit entry', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    queueManager.getQueueByName = jest.fn().mockReturnValue({ getFailed: jest.fn().mockResolvedValue([{ id: 'job-1', remove }]) });

    const result = await buildService().drainFailed(adminUser(), { queue: 'webhooks' });
    expect(remove).toHaveBeenCalled();
    expect(result).toEqual({ queue: 'webhooks', removed: 1, errors: [] });
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'operations.drain_failed' }));
  });

  it('collects per-job errors while processing the rest', async () => {
    const failing = { id: 'job-1', retry: jest.fn().mockRejectedValue(new Error('boom')) };
    const ok = { id: 'job-2', retry: jest.fn().mockResolvedValue(undefined) };
    queueManager.getQueueByName = jest.fn().mockReturnValue({ getFailed: jest.fn().mockResolvedValue([failing, ok]) });

    const result = await buildService().retryFailed(adminUser(), { queue: 'webhooks' });
    expect(result.retried).toBe(1);
    expect(result.errors).toEqual(['job-1: boom']);
  });
});
