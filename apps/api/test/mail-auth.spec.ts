import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';

import { AuthService } from '../src/modules/auth/auth.service';
import { MailService } from '../src/modules/mail/mail.service';
import { PasswordPolicyService } from '../src/modules/auth/password-policy.service';
import { sanitizeHelpHtml } from '../src/modules/help/help-sanitize';

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    name: 'User',
    email: 'user@example.com',
    role: 'AGENT',
    status: 'ACTIVE',
    preferredLanguage: 'ar',
    passwordHash: 'hash',
    mustChangePassword: false,
    failedLoginCount: 0,
    lockedUntil: null,
    archivedAt: null,
    ...overrides,
  };
}

function buildAuthService(overrides: Record<string, unknown> = {}) {
  const usersDao = {
    findByEmail: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue(makeUser()),
    update: jest.fn().mockResolvedValue(undefined),
    revokeAllSessions: jest.fn().mockResolvedValue(undefined),
    ...(overrides.usersDao ?? {}),
  };
  const passwordService = {
    hash: jest.fn().mockResolvedValue('new-hash'),
    verify: jest.fn().mockResolvedValue(true),
  };
  const tokensService = {
    createAccessToken: jest.fn().mockResolvedValue('access'),
    issueRefreshToken: jest.fn().mockResolvedValue({ token: 'refresh', recordId: 'r1' }),
    hashToken: jest.fn().mockReturnValue('th'),
  };
  const auditService = { record: jest.fn().mockResolvedValue(undefined) };
  const loginThrottle = { isBlocked: jest.fn().mockResolvedValue(false), recordFailure: jest.fn(), reset: jest.fn() };
  const requestContext = { current: { ipAddress: '1.2.3.4', userAgent: 'jest' } };
  const resetDao = {
    createToken: jest.fn().mockResolvedValue({ id: 't1', userId: 'u1' }),
    findByTokenHash: jest.fn().mockResolvedValue(undefined),
    revokeForUser: jest.fn().mockResolvedValue(undefined),
    markUsed: jest.fn().mockResolvedValue(undefined),
    addHistory: jest.fn().mockResolvedValue(undefined),
    listHistory: jest.fn().mockResolvedValue([]),
    pruneHistory: jest.fn().mockResolvedValue(undefined),
    ...(overrides.resetDao ?? {}),
  };
  const policy = {
    getPolicy: jest.fn().mockResolvedValue({ minLength: 10, requireUppercase: true, requireLowercase: true, requireNumber: true, requireSpecial: false, historySize: 5, resetTokenExpiryMinutes: 30 }),
    validate: jest.fn().mockResolvedValue('OK'),
    recordPassword: jest.fn().mockResolvedValue(undefined),
    ...(overrides.policy ?? {}),
  };
  const mail = {
    publicUrl: 'http://localhost:5173',
    enqueue: jest.fn().mockResolvedValue({ id: 'e1', status: 'QUEUED', queued: true }),
    buildIdempotencyKey: jest.fn().mockImplementation((parts: unknown[]) => parts.filter((p) => p !== undefined && p !== '').join(':')),
    ...(overrides.mail ?? {}),
  };
  const notifications = { createForUser: jest.fn().mockResolvedValue(undefined), notifyTargets: jest.fn().mockResolvedValue(undefined) };
  const db = { ...(overrides.db ?? {}) };

  const service = new AuthService(
    usersDao as never,
    passwordService as never,
    tokensService as never,
    auditService as never,
    loginThrottle as never,
    requestContext as never,
    resetDao as never,
    policy as never,
    mail as never,
    notifications as never,
    db as never,
  );
  return { service, usersDao, resetDao, policy, mail, auditService, passwordService };
}

describe('AuthService password recovery', () => {
  it('returns a generic message for an unknown email and creates no token', async () => {
    const { service, resetDao, mail } = buildAuthService();
    const result = await service.forgotPassword('missing@example.com');
    expect(result.message).toContain('eligible account');
    expect(resetDao.createToken).not.toHaveBeenCalled();
    expect(mail.enqueue).not.toHaveBeenCalled();
  });

  it('creates a token and enqueues a reset email for an active user', async () => {
    const { service, usersDao, resetDao, mail, auditService } = buildAuthService();
    usersDao.findByEmail.mockResolvedValue(makeUser());
    await service.forgotPassword('user@example.com');
    expect(resetDao.createToken).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }));
    expect(resetDao.revokeForUser).toHaveBeenCalled();
    expect(mail.enqueue).toHaveBeenCalledWith(expect.objectContaining({ templateKey: 'password-reset-request' }));
    expect(auditService.record).toHaveBeenCalled();
  });

  it('does not send a reset email to a suspended account', async () => {
    const { service, usersDao, resetDao, mail } = buildAuthService();
    usersDao.findByEmail.mockResolvedValue(makeUser({ status: 'SUSPENDED' }));
    await service.forgotPassword('user@example.com');
    expect(resetDao.createToken).not.toHaveBeenCalled();
    expect(mail.enqueue).not.toHaveBeenCalled();
  });

  it('rejects an invalid reset token', async () => {
    const { service } = buildAuthService();
    await expect(service.resetPassword('not-a-real-token', 'NewPassword123')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates a reset token only when fresh, unused and unrevoked', async () => {
    const { service, resetDao } = buildAuthService();
    resetDao.findByTokenHash.mockResolvedValue({ id: 't1', userId: 'u1', usedAt: null, revokedAt: null, expiresAt: new Date(Date.now() + 60000) });
    expect((await service.validateResetToken('raw-token')).valid).toBe(true);

    resetDao.findByTokenHash.mockResolvedValue({ id: 't1', userId: 'u1', usedAt: new Date(), revokedAt: null, expiresAt: new Date(Date.now() + 60000) });
    expect((await service.validateResetToken('raw-token')).valid).toBe(false);

    resetDao.findByTokenHash.mockResolvedValue({ id: 't1', userId: 'u1', usedAt: null, revokedAt: null, expiresAt: new Date(Date.now() - 60000) });
    expect((await service.validateResetToken('raw-token')).valid).toBe(false);
  });

  it('performs a password reset, revokes sessions and sends confirmation', async () => {
    const resetDao = {
      findByTokenHash: jest.fn().mockResolvedValue({ id: 't1', userId: 'u1', usedAt: null, revokedAt: null, expiresAt: new Date(Date.now() + 60000) }),
      revokeForUser: jest.fn().mockResolvedValue(undefined),
    };
    const db = {
      transaction: jest.fn().mockImplementation(async (callback) =>
        callback({
          update: jest.fn().mockReturnValue({ set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }) }),
          insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) }),
        }),
      ),
    };
    const mail = {
      publicUrl: 'http://localhost:5173',
      enqueue: jest.fn().mockResolvedValue({ id: 'e1', status: 'QUEUED', queued: true }),
      buildIdempotencyKey: jest.fn().mockImplementation((parts: unknown[]) => parts.filter((p) => p !== undefined && p !== '').join(':')),
    };
    const { service, auditService } = buildAuthService({ resetDao, db, mail });
    await service.resetPassword('raw-token', 'NewPassword123');
    expect(mail.enqueue).toHaveBeenCalledWith(expect.objectContaining({ templateKey: 'password-reset-confirmation' }));
    expect(resetDao.revokeForUser).toHaveBeenCalled();
    expect(auditService.record).toHaveBeenCalled();
  });
});

describe('PasswordPolicyService', () => {
  it('rejects passwords shorter than the minimum length', async () => {
    const resetDao = { listHistory: jest.fn().mockResolvedValue([]) } as never;
    const passwordService = { verify: jest.fn().mockResolvedValue(false) } as never;
    const db = { select: jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) }) }) } as never;
    const service = new PasswordPolicyService(passwordService as never, resetDao as never, db as never);
    await expect(service.validate('short1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects recently used passwords from history', async () => {
    const resetDao = { listHistory: jest.fn().mockResolvedValue(['old-hash']) } as never;
    const passwordService = { verify: jest.fn().mockResolvedValue(true) } as never;
    const db = { select: jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) }) }) } as never;
    const service = new PasswordPolicyService(passwordService as never, resetDao as never, db as never);
    await expect(service.validate('LongPassword1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('MailService', () => {
  function buildMail(overrides: Record<string, unknown> = {}) {
    const configService = { get: jest.fn().mockImplementation((key: string) => (key === 'APP_PUBLIC_URL' ? 'http://localhost:5173' : undefined)) };
    const mailLogDao = {
      findByIdempotencyKey: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockResolvedValue({ id: 'log1' }),
      findById: jest.fn().mockResolvedValue({ attemptCount: 0 }),
      markProcessing: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      ...(overrides.mailLogDao ?? {}),
    };
    const settingsService = {
      getConfig: jest.fn().mockResolvedValue({ enabled: true, host: 'smtp.test', port: 587, secure: false, username: 'u', fromEmail: 'noreply@test.com', fromName: 'Test', replyTo: '' }),
      getPassword: jest.fn().mockResolvedValue('secret'),
      recordSent: jest.fn().mockResolvedValue(undefined),
      recordFailed: jest.fn().mockResolvedValue(undefined),
      ...(overrides.settingsService ?? {}),
    };
    const db = { query: { notificationPreferences: { findFirst: jest.fn().mockResolvedValue(null) } } };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const service = new MailService(configService as never, mailLogDao as never, settingsService as never, db as never, queue as never);
    return { service, mailLogDao, settingsService, queue };
  }

  const input = {
    templateKey: 'password-changed',
    to: 'user@example.com',
    userId: 'u1',
    language: 'en' as const,
    vars: { changedAt: '2026-01-01' },
    idempotencyKey: 'k1',
    triggerEvent: 'password-changed',
    category: 'security' as const,
    securityCritical: true,
  };

  it('skips enqueue when email is disabled', async () => {
    const { service, settingsService, queue, mailLogDao } = buildMail();
    settingsService.getConfig.mockResolvedValue({ enabled: false });
    const result = await service.enqueue(input);
    expect(result.status).toBe('CANCELLED');
    expect(queue.add).not.toHaveBeenCalled();
    expect(mailLogDao.insert).not.toHaveBeenCalled();
  });

  it('is idempotent by idempotency key', async () => {
    const { service, mailLogDao, queue } = buildMail();
    mailLogDao.findByIdempotencyKey.mockResolvedValue({ id: 'existing', status: 'SENT' });
    const result = await service.enqueue(input);
    expect(result.id).toBe('existing');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('queues a new job and inserts a log', async () => {
    const { service, mailLogDao, queue } = buildMail();
    const result = await service.enqueue(input);
    expect(result.queued).toBe(true);
    expect(mailLogDao.insert).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalled();
  });

  it('escapes variables when rendering templates', () => {
    const { service } = buildMail();
    const rendered = service.render('campaign-failed', 'en', { campaignName: '<script>alert(1)</script>', reason: 'x' });
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;');
  });
});

describe('sanitizeHelpHtml', () => {
  it('strips dangerous markup from stored content', () => {
    const out = sanitizeHelpHtml('<p>ok</p><script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).toContain('<p>ok</p>');
  });
});
