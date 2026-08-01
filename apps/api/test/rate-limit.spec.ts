import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';

import { RateLimitGuard } from '../src/common/guards/rate-limit.guard';
import { LoginThrottleService } from '../src/common/throttling/login-throttle.service';
import { ERROR_CODES } from '../src/common/errors';

function fakeRedis(initial: Record<string, number> = {}) {
  const store = new Map<string, number>(Object.entries(initial));
  const now = Date.now();
  const expires = new Map<string, number>();
  return {
    store,
    redis: {
      incr: jest.fn(async (key: string) => {
        const next = (store.get(key) ?? 0) + 1;
        store.set(key, next);
        return next;
      }),
      get: jest.fn(async (key: string) => String(store.get(key) ?? 0)),
      expire: jest.fn(async (key: string, ttl: number) => {
        expires.set(key, now + ttl * 1000);
        return 'OK';
      }),
      del: jest.fn(async (key: string) => {
        store.delete(key);
        return 1;
      }),
    },
    expires,
  };
}

function makeContext(ip = '1.2.3.4'): ExecutionContext {
  const request = { ip, method: 'GET', route: { path: '/api/test' }, path: '/api/test' };
  const response = { setHeader: jest.fn() };
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard', () => {
  it('rejects requests beyond the configured limit with 429 and rate-limit headers', async () => {
    const { redis } = fakeRedis();
    const configService = { get: jest.fn().mockImplementation((key: string) => (key === 'RATE_LIMIT_DISABLED' ? false : undefined)) };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue({ limit: 3, ttlSeconds: 60 }) };
    const guard = new RateLimitGuard(redis as never, configService as never, reflector as never);
    const context = makeContext();

    const response = context.switchToHttp().getResponse() as { setHeader: jest.Mock };

    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
      response: expect.objectContaining({ message: ERROR_CODES.RATE_LIMITED }),
    });
    expect(redis.incr).toHaveBeenCalled();
  });

  it('uses the default limit when no decorator metadata is present', async () => {
    const { redis } = fakeRedis();
    const configService = { get: jest.fn().mockReturnValue(false) };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };
    const guard = new RateLimitGuard(redis as never, configService as never, reflector as never);

    for (let i = 0; i < 300; i += 1) {
      await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    }
    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(HttpException);
  });

  it('is bypassed when rate limiting is disabled', async () => {
    const { redis } = fakeRedis();
    const configService = { get: jest.fn().mockReturnValue(true) };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue({ limit: 1, ttlSeconds: 60 }) };
    const guard = new RateLimitGuard(redis as never, configService as never, reflector as never);

    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(redis.incr).not.toHaveBeenCalled();
  });
});

describe('LoginThrottleService', () => {
  const email = 'test@example.com';
  const ip = '1.2.3.4';

  it('blocks after the configured number of failed attempts within the window', async () => {
    const { redis } = fakeRedis();
    const configService = { get: jest.fn().mockReturnValue(false) };
    const service = new LoginThrottleService(redis as never, configService as never);

    for (let i = 0; i < 5; i += 1) {
      expect(await service.isBlocked(email, ip)).toBe(false);
      await service.recordFailure(email, ip);
    }
    expect(await service.isBlocked(email, ip)).toBe(true);
  });

  it('resets the counter after a successful login', async () => {
    const { redis } = fakeRedis();
    const configService = { get: jest.fn().mockReturnValue(false) };
    const service = new LoginThrottleService(redis as never, configService as never);

    for (let i = 0; i < 5; i += 1) {
      await service.recordFailure(email, ip);
    }
    expect(await service.isBlocked(email, ip)).toBe(true);

    await service.reset(email, ip);
    expect(await service.isBlocked(email, ip)).toBe(false);
    expect(redis.del).toHaveBeenCalled();
  });

  it('scopes failures by both email and IP address', async () => {
    const { redis } = fakeRedis();
    const configService = { get: jest.fn().mockReturnValue(false) };
    const service = new LoginThrottleService(redis as never, configService as never);

    for (let i = 0; i < 5; i += 1) {
      await service.recordFailure(email, ip);
    }
    expect(await service.isBlocked(email, ip)).toBe(true);
    expect(await service.isBlocked(email, '9.9.9.9')).toBe(false);
  });

  it('is bypassed when rate limiting is disabled', async () => {
    const { redis } = fakeRedis();
    const configService = { get: jest.fn().mockReturnValue(true) };
    const service = new LoginThrottleService(redis as never, configService as never);

    for (let i = 0; i < 10; i += 1) {
      await service.recordFailure(email, ip);
    }
    expect(await service.isBlocked(email, ip)).toBe(false);
  });
});
