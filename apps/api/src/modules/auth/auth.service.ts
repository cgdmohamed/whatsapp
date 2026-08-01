import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { AUDIT_ACTIONS, type AuthResponse } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { ERROR_CODES } from '../../common/errors';
import { PasswordService } from '../../common/auth/password.service';
import { AuditService } from '../../common/audit/audit.module';
import { LoginThrottleService } from '../../common/throttling/login-throttle.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { UsersDao } from '../users/users.dao';
import { toUserDto } from '../users/user.mapper';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TokensService, type TokenMeta } from './tokens.service';
import { PasswordResetDao } from './password-reset.dao';
import { PasswordPolicyService } from './password-policy.service';
import { refreshTokens, settings, users, passwordHistory, passwordResetTokens, type UserRow } from '../../db/schema';

const {
  AUTH_CHANGE_PASSWORD,
  AUTH_FORGOT_PASSWORD,
  AUTH_LOGIN,
  AUTH_LOGIN_BLOCKED,
  AUTH_LOGIN_FAILED,
  AUTH_LOGOUT,
  AUTH_PASSWORD_RESET,
  AUTH_REFRESH,
  AUTH_REFRESH_REUSE,
  AUTH_REVOKE_SESSIONS,
} = AUDIT_ACTIONS;

const GENERIC_FORGOT_RESPONSE = 'If an eligible account exists for this email, password recovery instructions will be sent.';

export interface LoginResult {
  user: UserRow;
  accessToken: string;
  refreshToken: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) {
    return '***';
  }
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersDao: UsersDao,
    private readonly passwordService: PasswordService,
    private readonly tokensService: TokensService,
    private readonly auditService: AuditService,
    private readonly loginThrottleService: LoginThrottleService,
    private readonly requestContext: RequestContextService,
    private readonly resetDao: PasswordResetDao,
    private readonly policyService: PasswordPolicyService,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
    @Inject(DATABASE) private readonly db: DrizzleDB,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const meta = this.meta();
    const normalizedEmail = email.toLowerCase().trim();

    if (await this.loginThrottleService.isBlocked(normalizedEmail, meta.ipAddress)) {
      await this.auditService.record({
        action: AUTH_LOGIN_BLOCKED,
        entityType: 'user',
        metadata: { email: maskEmail(normalizedEmail), ipAddress: meta.ipAddress },
      });
      throw new UnauthorizedException(ERROR_CODES.LOGIN_BLOCKED);
    }

    const user = await this.usersDao.findByEmail(normalizedEmail);
    const passwordValid = user ? await this.passwordService.verify(password, user.passwordHash) : false;

    if (!user || !passwordValid || user.status !== 'ACTIVE') {
      if (user && user.status === 'ACTIVE') {
        await this.loginThrottleService.recordFailure(normalizedEmail, meta.ipAddress);
        const failedCount = (user.failedLoginCount ?? 0) + 1;
        const lockedUntil = failedCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
        await this.usersDao.update(user.id, { failedLoginCount: failedCount, lockedUntil });
      }
      await this.auditService.record({
        action: AUTH_LOGIN_FAILED,
        entityType: 'user',
        entityId: user?.id,
        metadata: { email: maskEmail(normalizedEmail) },
      });
      throw new UnauthorizedException(ERROR_CODES.INVALID_CREDENTIALS);
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new UnauthorizedException(ERROR_CODES.LOGIN_BLOCKED);
    }

    await this.loginThrottleService.reset(normalizedEmail, meta.ipAddress);
    await this.usersDao.update(user.id, { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null });

    const accessToken = await this.tokensService.createAccessToken(user);
    const { token: refreshToken } = await this.tokensService.issueRefreshToken(user.id, meta, this.db);

    await this.auditService.record({
      actorUserId: user.id,
      action: AUTH_LOGIN,
      entityType: 'user',
      entityId: user.id,
      metadata: { ipAddress: meta.ipAddress },
    });

    if (await this.readBoolSetting('securityLoginAlertEmailEnabled', false)) {
      await this.notificationsService.notifyTargets({
        userIds: [user.id],
        type: 'SECURITY',
        severity: 'WARNING',
        titleAr: 'تسجيل دخول جديد',
        titleEn: 'New sign-in',
        messageAr: 'تم تسجيل الدخول إلى حسابك من جهاز جديد.',
        messageEn: 'A new device signed in to your account.',
        category: 'security',
        email: {
          templateKey: 'new-login-alert',
          vars: { at: new Date().toISOString(), ip: meta.ipAddress, userAgent: meta.userAgent },
          securityCritical: true,
        },
      });
    }

    return { user, accessToken, refreshToken };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const meta = this.meta();
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.usersDao.findByEmail(normalizedEmail);

    if (user && user.status === 'ACTIVE' && !user.archivedAt) {
      const rawToken = randomBytes(32).toString('base64url');
      const expiryMinutes = (await this.policyService.getPolicy()).resetTokenExpiryMinutes;
      const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);
      const tokenHash = hashToken(rawToken);
      const tokenRow = await this.resetDao.createToken({
        userId: user.id,
        tokenHash,
        expiresAt,
        requestedIp: meta.ipAddress,
        requestedUserAgent: meta.userAgent,
      });
      await this.resetDao.revokeForUser(user.id, tokenRow.id);
      const resetUrl = `${this.mailService.publicUrl}/reset-password?token=${rawToken}`;
      await this.mailService.enqueue({
        templateKey: 'password-reset-request',
        to: user.email,
        userId: user.id,
        language: user.preferredLanguage === 'en' ? 'en' : 'ar',
        vars: { resetUrl },
        idempotencyKey: this.mailService.buildIdempotencyKey(['password-reset-request', user.id, tokenRow.id]),
        triggerEvent: 'forgot-password',
        category: 'security',
        securityCritical: true,
      });
      await this.auditService.record({
        actorUserId: user.id,
        action: AUTH_FORGOT_PASSWORD,
        entityType: 'user',
        entityId: user.id,
        metadata: { ipAddress: meta.ipAddress },
      });
    }

    return { message: GENERIC_FORGOT_RESPONSE };
  }

  async validateResetToken(rawToken: string): Promise<{ valid: boolean }> {
    const token = await this.resolveToken(rawToken);
    return { valid: Boolean(token) };
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const meta = this.meta();
    const token = await this.resolveToken(rawToken);
    if (!token) {
      throw new BadRequestException(ERROR_CODES.RESET_TOKEN_INVALID);
    }

    await this.policyService.validate(newPassword, token.userId);

    const passwordHash = await this.passwordService.hash(newPassword);
    await this.db.transaction(async (tx) => {
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.id, token.id), isNull(passwordResetTokens.usedAt)));
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, token.userId), isNull(refreshTokens.revokedAt)));
      await tx
        .update(users)
        .set({ passwordHash, mustChangePassword: false, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null })
        .where(eq(users.id, token.userId));
      await tx.insert(passwordHistory).values({ userId: token.userId, passwordHash });
    });
    await this.resetDao.revokeForUser(token.userId);

    const user = await this.usersDao.findById(token.userId);
    if (user) {
      await this.mailService.enqueue({
        templateKey: 'password-reset-confirmation',
        to: user.email,
        userId: user.id,
        language: user.preferredLanguage === 'en' ? 'en' : 'ar',
        vars: { changedAt: new Date().toISOString(), ip: meta.ipAddress },
        idempotencyKey: this.mailService.buildIdempotencyKey(['password-reset-confirmation', user.id, token.id]),
        triggerEvent: 'password-reset',
        category: 'security',
        securityCritical: true,
      });
      await this.notificationsService.createForUser(user.id, {
        type: 'SECURITY',
        severity: 'SUCCESS',
        titleAr: 'تم إعادة تعيين كلمة المرور',
        titleEn: 'Password reset',
        messageAr: 'تم تغيير كلمة مرور حسابك بنجاح.',
        messageEn: 'Your account password was changed successfully.',
      });
    }
    await this.auditService.record({
      actorUserId: user?.id,
      action: AUTH_PASSWORD_RESET,
      entityType: 'user',
      entityId: user?.id,
      metadata: { ipAddress: meta.ipAddress },
    });
  }

  private async resolveToken(rawToken: string): Promise<{ id: string; userId: string } | null> {
    if (!rawToken) {
      return null;
    }
    const tokenHash = hashToken(rawToken);
    const token = await this.resetDao.findByTokenHash(tokenHash);
    if (!token || token.usedAt || token.revokedAt || token.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    const user = await this.usersDao.findById(token.userId);
    if (!user || user.status !== 'ACTIVE' || user.archivedAt) {
      return null;
    }
    return { id: token.id, userId: token.userId };
  }

  private async readBoolSetting(key: string, fallback: boolean): Promise<boolean> {
    const [row] = await this.db.select().from(settings).where(and(eq(settings.namespace, 'app'), eq(settings.key, key)));
    if (!row?.publicValue) return fallback;
    return row.publicValue === 'true' || row.publicValue === '1' || row.publicValue === 'yes';
  }

  async refresh(refreshToken: string | undefined): Promise<LoginResult> {
    if (!refreshToken) {
      throw new UnauthorizedException(ERROR_CODES.INVALID_TOKEN);
    }
    const meta = this.meta();
    const tokenHash = this.tokensService.hashToken(refreshToken);

    const record = await this.db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.tokenHash, tokenHash),
    });
    if (!record) {
      throw new UnauthorizedException(ERROR_CODES.INVALID_TOKEN);
    }

    if (record.revokedAt) {
      if (record.replacedByTokenId) {
        // Reuse detection: a previously rotated token was presented again.
        await this.db
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(and(eq(refreshTokens.userId, record.userId), isNull(refreshTokens.revokedAt)));
        await this.auditService.record({
          actorUserId: record.userId,
          action: AUTH_REFRESH_REUSE,
          entityType: 'refresh_token',
          entityId: record.id,
          metadata: { ipAddress: meta.ipAddress },
        });
      }
      throw new UnauthorizedException(ERROR_CODES.INVALID_TOKEN);
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException(ERROR_CODES.INVALID_TOKEN);
    }

    const user = await this.usersDao.findById(record.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException(ERROR_CODES.INVALID_TOKEN);
    }

    const rotated = await this.db.transaction(async (tx) => {
      const { token, recordId } = await this.tokensService.issueRefreshToken(user.id, meta, tx);
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date(), replacedByTokenId: recordId })
        .where(eq(refreshTokens.id, record.id));
      return token;
    });

    const accessToken = await this.tokensService.createAccessToken(user);
    await this.auditService.record({
      actorUserId: user.id,
      action: AUTH_REFRESH,
      entityType: 'refresh_token',
      entityId: record.id,
      metadata: { ipAddress: meta.ipAddress },
    });

    return { user, accessToken, refreshToken: rotated };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }
    const tokenHash = this.tokensService.hashToken(refreshToken);
    const record = await this.db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.tokenHash, tokenHash),
    });
    if (!record || record.revokedAt) {
      return;
    }
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, record.id));
    await this.auditService.record({
      actorUserId: record.userId,
      action: AUTH_LOGOUT,
      entityType: 'refresh_token',
      entityId: record.id,
    });
  }

  async me(userId: string): Promise<AuthResponse> {
    const user = await this.usersDao.findById(userId);
    if (!user) {
      throw new UnauthorizedException(ERROR_CODES.INVALID_TOKEN);
    }
    return { user: toUserDto(user) };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.usersDao.findById(userId);
    if (!user) {
      throw new UnauthorizedException(ERROR_CODES.INVALID_TOKEN);
    }

    const valid = await this.passwordService.verify(currentPassword, user.passwordHash);
    if (!valid) {
      throw new BadRequestException(ERROR_CODES.INVALID_CURRENT_PASSWORD);
    }

    await this.policyService.validate(newPassword, userId, user.passwordHash);

    const passwordHash = await this.passwordService.hash(newPassword);
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash, mustChangePassword: false, passwordChangedAt: new Date() }).where(eq(users.id, userId));
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
      await tx.insert(passwordHistory).values({ userId, passwordHash });
    });
    await this.policyService.recordPassword(userId, passwordHash);

    await this.mailService.enqueue({
      templateKey: 'password-changed',
      to: user.email,
      userId,
      language: user.preferredLanguage === 'en' ? 'en' : 'ar',
      vars: { changedAt: new Date().toISOString() },
      idempotencyKey: this.mailService.buildIdempotencyKey(['password-changed', userId, Date.now()]),
      triggerEvent: 'password-changed',
      category: 'security',
      securityCritical: true,
    });

    await this.auditService.record({
      actorUserId: userId,
      action: AUTH_CHANGE_PASSWORD,
      entityType: 'user',
      entityId: userId,
    });
  }

  async revokeSessions(userId: string): Promise<void> {
    const user = await this.usersDao.findById(userId);
    await this.usersDao.revokeAllSessions(userId);
    await this.auditService.record({
      actorUserId: userId,
      action: AUTH_REVOKE_SESSIONS,
      entityType: 'user',
      entityId: userId,
    });
    if (user) {
      await this.notificationsService.notifyTargets({
        userIds: [userId],
        type: 'SECURITY',
        severity: 'WARNING',
        titleAr: 'تم إلغاء جميع الجلسات',
        titleEn: 'All sessions revoked',
        messageAr: 'تم تسجيل خروجك من جميع الأجهزة.',
        messageEn: 'You were signed out of all devices.',
        category: 'security',
        email: {
          templateKey: 'sessions-revoked',
          vars: {},
          securityCritical: true,
        },
      });
    }
  }

  private meta(): TokenMeta {
    const context = this.requestContext.current;
    return { ipAddress: context.ipAddress, userAgent: context.userAgent };
  }
}
