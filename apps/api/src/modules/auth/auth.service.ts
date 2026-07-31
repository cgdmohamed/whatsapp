import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { AUDIT_ACTIONS, type AuthResponse } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { ERROR_CODES } from '../../common/errors';
import { PasswordService } from '../../common/auth/password.service';
import { AuditService } from '../../common/audit/audit.module';
import { LoginThrottleService } from '../../common/throttling/login-throttle.service';
import { RequestContextService } from '../../common/context/request-context.service';
import { UsersDao } from '../users/users.dao';
import { toUserDto } from '../users/user.mapper';
import { TokensService, type TokenMeta } from './tokens.service';
import { refreshTokens, users, type UserRow } from '../../db/schema';

const {
  AUTH_CHANGE_PASSWORD,
  AUTH_LOGIN,
  AUTH_LOGIN_BLOCKED,
  AUTH_LOGIN_FAILED,
  AUTH_LOGOUT,
  AUTH_REFRESH,
  AUTH_REFRESH_REUSE,
  AUTH_REVOKE_SESSIONS,
} = AUDIT_ACTIONS;

export interface LoginResult {
  user: UserRow;
  accessToken: string;
  refreshToken: string;
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
      if (user) {
        await this.loginThrottleService.recordFailure(normalizedEmail, meta.ipAddress);
      }
      await this.auditService.record({
        action: AUTH_LOGIN_FAILED,
        entityType: 'user',
        entityId: user?.id,
        metadata: { email: maskEmail(normalizedEmail) },
      });
      throw new UnauthorizedException(ERROR_CODES.INVALID_CREDENTIALS);
    }

    await this.loginThrottleService.reset(normalizedEmail, meta.ipAddress);

    const accessToken = await this.tokensService.createAccessToken(user);
    const { token: refreshToken } = await this.tokensService.issueRefreshToken(user.id, meta, this.db);

    await this.usersDao.update(user.id, { lastLoginAt: new Date() });
    await this.auditService.record({
      actorUserId: user.id,
      action: AUTH_LOGIN,
      entityType: 'user',
      entityId: user.id,
      metadata: { ipAddress: meta.ipAddress },
    });

    return { user, accessToken, refreshToken };
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

    const isSame = await this.passwordService.verify(newPassword, user.passwordHash);
    if (isSame) {
      throw new BadRequestException(ERROR_CODES.SAME_PASSWORD);
    }

    const passwordHash = await this.passwordService.hash(newPassword);
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
    });

    await this.auditService.record({
      actorUserId: userId,
      action: AUTH_CHANGE_PASSWORD,
      entityType: 'user',
      entityId: userId,
    });
  }

  async revokeSessions(userId: string): Promise<void> {
    await this.usersDao.revokeAllSessions(userId);
    await this.auditService.record({
      actorUserId: userId,
      action: AUTH_REVOKE_SESSIONS,
      entityType: 'user',
      entityId: userId,
    });
  }

  private meta(): TokenMeta {
    const context = this.requestContext.current;
    return { ipAddress: context.ipAddress, userAgent: context.userAgent };
  }
}
