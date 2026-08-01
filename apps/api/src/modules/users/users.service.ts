import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import type { CreateUserInput, PaginatedUsers, UpdateUserInput, UserDto, UserQuery } from '@wa/shared';
import { AUDIT_ACTIONS } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { ERROR_CODES } from '../../common/errors';
import { PasswordService } from '../../common/auth/password.service';
import { AuditService } from '../../common/audit/audit.module';
import type { AuthUser } from '../auth/auth.types';
import { PasswordResetDao } from '../auth/password-reset.dao';
import { MailService } from '../mail/mail.service';
import { UsersDao } from './users.dao';
import { toUserDto } from './user.mapper';
import { refreshTokens, users, passwordHistory, type UserRow } from '../../db/schema';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const {
  USER_ACTIVATE,
  USER_ARCHIVE,
  USER_CREATE,
  USER_RESET_PASSWORD,
  USER_REVOKE_SESSIONS,
  USER_SUSPEND,
  USER_UPDATE,
  AUTH_RESET_LINK_REQUESTED,
  AUTH_TEMP_PASSWORD_SET,
} = AUDIT_ACTIONS;

@Injectable()
export class UsersService {
  constructor(
    private readonly usersDao: UsersDao,
    private readonly passwordService: PasswordService,
    private readonly auditService: AuditService,
    private readonly passwordResetDao: PasswordResetDao,
    private readonly mailService: MailService,
    @Inject(DATABASE) private readonly db: DrizzleDB,
  ) {}

  async list(query: UserQuery, actor: AuthUser): Promise<PaginatedUsers> {
    const { items, total } = await this.usersDao.list({
      ...query,
      managerScope: actor.role === 'MANAGER',
    });
    const totalPages = total === 0 ? 0 : Math.ceil(total / query.pageSize);
    return {
      items: items.map(toUserDto),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages,
    };
  }

  async get(id: string, actor: AuthUser): Promise<UserDto> {
    const user = await this.usersDao.findById(id);
    if (!user) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    this.assertCanView(actor, user);
    return toUserDto(user);
  }

  async create(input: CreateUserInput, actor: AuthUser): Promise<UserDto> {
    if (actor.role !== 'ADMIN' && input.role === 'ADMIN') {
      throw new ForbiddenException(ERROR_CODES.FORBIDDEN);
    }

    const existing = await this.usersDao.findByEmail(input.email);
    if (existing) {
      throw new ConflictException(ERROR_CODES.CONFLICT);
    }

    const passwordHash = await this.passwordService.hash(input.password);

    const created = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(users)
        .values({
          name: input.name,
          email: input.email.toLowerCase(),
          role: input.role,
          preferredLanguage: input.preferredLanguage,
          passwordHash,
        })
        .returning();
      if (row) {
        await this.auditService.record({
          actorUserId: actor.id,
          action: USER_CREATE,
          entityType: 'user',
          entityId: row.id,
          metadata: { email: row.email, role: row.role },
        });
      }
      return row;
    });

    if (!created) {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }
    return toUserDto(created);
  }

  async update(id: string, input: UpdateUserInput, actor: AuthUser): Promise<UserDto> {
    const user = await this.usersDao.findById(id);
    if (!user) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    if (user.status === 'ARCHIVED') {
      throw new ForbiddenException(ERROR_CODES.FORBIDDEN);
    }

    const patch = this.buildPatch(user, input, actor);

    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx.update(users).set(patch).where(eq(users.id, id)).returning();
      if (row) {
        await this.auditService.record({
          actorUserId: actor.id,
          action: USER_UPDATE,
          entityType: 'user',
          entityId: row.id,
          metadata: { fields: Object.keys(patch), email: row.email },
        });
      }
      return row;
    });

    if (!updated) {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }
    return toUserDto(updated);
  }

  async suspend(id: string, actor: AuthUser): Promise<UserDto> {
    return this.transitionStatus(id, actor, 'SUSPENDED', USER_SUSPEND);
  }

  async activate(id: string, actor: AuthUser): Promise<UserDto> {
    return this.transitionStatus(id, actor, 'ACTIVE', USER_ACTIVATE);
  }

  async archive(id: string, actor: AuthUser): Promise<UserDto> {
    const user = await this.usersDao.findById(id);
    if (!user) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    if (user.id === actor.id) {
      throw new ForbiddenException(ERROR_CODES.CANNOT_ARCHIVE_SELF);
    }
    if (user.status === 'ARCHIVED') {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }

    const archived = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(users)
        .set({ status: 'ARCHIVED', archivedAt: new Date() })
        .where(eq(users.id, id))
        .returning();
      if (row) {
        await tx
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(eq(refreshTokens.userId, id));
        await this.auditService.record({
          actorUserId: actor.id,
          action: USER_ARCHIVE,
          entityType: 'user',
          entityId: row.id,
          metadata: { email: row.email },
        });
      }
      return row;
    });

    if (!archived) {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }
    return toUserDto(archived);
  }

  async resetPassword(id: string, password: string, actor: AuthUser): Promise<UserDto> {
    const user = await this.usersDao.findById(id);
    if (!user) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    if (user.status === 'ARCHIVED') {
      throw new ForbiddenException(ERROR_CODES.FORBIDDEN);
    }

    const passwordHash = await this.passwordService.hash(password);

    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(users)
        .set({ passwordHash, mustChangePassword: false, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null })
        .where(eq(users.id, id))
        .returning();
      if (row) {
        await tx
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(eq(refreshTokens.userId, id));
        await tx.insert(passwordHistory).values({ userId: id, passwordHash });
        await this.auditService.record({
          actorUserId: actor.id,
          action: USER_RESET_PASSWORD,
          entityType: 'user',
          entityId: row.id,
          metadata: { email: row.email },
        });
      }
      return row;
    });

    if (!updated) {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }
    return toUserDto(updated);
  }

  async sendResetLink(id: string, actor: AuthUser): Promise<UserDto> {
    const user = await this.usersDao.findById(id);
    if (!user) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    if (user.status !== 'ACTIVE' || user.archivedAt) {
      throw new ForbiddenException(ERROR_CODES.FORBIDDEN);
    }

    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const tokenRow = await this.passwordResetDao.createToken({
      userId: user.id,
      tokenHash: sha256(rawToken),
      expiresAt,
    });
    await this.passwordResetDao.revokeForUser(user.id, tokenRow.id);
    const resetUrl = `${this.mailService.publicUrl}/reset-password?token=${rawToken}`;

    await this.mailService.enqueue({
      templateKey: 'admin-password-reset',
      to: user.email,
      userId: user.id,
      language: user.preferredLanguage === 'en' ? 'en' : 'ar',
      vars: { resetUrl },
      idempotencyKey: this.mailService.buildIdempotencyKey(['admin-password-reset', user.id, tokenRow.id]),
      triggerEvent: 'admin-reset-link',
      category: 'security',
      securityCritical: true,
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: AUTH_RESET_LINK_REQUESTED,
      entityType: 'user',
      entityId: user.id,
      metadata: { email: user.email },
    });
    return toUserDto(user);
  }

  async setTemporaryPassword(id: string, actor: AuthUser): Promise<UserDto> {
    const user = await this.usersDao.findById(id);
    if (!user) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    if (user.status !== 'ACTIVE' || user.archivedAt) {
      throw new ForbiddenException(ERROR_CODES.FORBIDDEN);
    }

    const tempPassword = randomBytes(9).toString('base64url').slice(0, 12);
    const passwordHash = await this.passwordService.hash(tempPassword);

    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash, mustChangePassword: true, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null })
        .where(eq(users.id, id));
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.userId, id));
      await tx.insert(passwordHistory).values({ userId: id, passwordHash });
    });

    await this.mailService.enqueue({
      templateKey: 'temp-password',
      to: user.email,
      userId: user.id,
      language: user.preferredLanguage === 'en' ? 'en' : 'ar',
      vars: { tempPassword },
      idempotencyKey: this.mailService.buildIdempotencyKey(['temp-password', user.id, Date.now()]),
      triggerEvent: 'admin-temp-password',
      category: 'security',
      securityCritical: true,
    });

    await this.auditService.record({
      actorUserId: actor.id,
      action: AUTH_TEMP_PASSWORD_SET,
      entityType: 'user',
      entityId: user.id,
      metadata: { email: user.email },
    });
    return toUserDto((await this.usersDao.findById(id))!);
  }

  async revokeSessions(id: string, actor: AuthUser): Promise<void> {
    const user = await this.usersDao.findById(id);
    if (!user) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    await this.usersDao.revokeAllSessions(id);
    await this.auditService.record({
      actorUserId: actor.id,
      action: USER_REVOKE_SESSIONS,
      entityType: 'user',
      entityId: id,
      metadata: { email: user.email },
    });
  }

  private async transitionStatus(
    id: string,
    actor: AuthUser,
    nextStatus: 'ACTIVE' | 'SUSPENDED',
    action: (typeof USER_SUSPEND) | (typeof USER_ACTIVATE),
  ): Promise<UserDto> {
    const user = await this.usersDao.findById(id);
    if (!user) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    if (user.id === actor.id) {
      throw new ForbiddenException(ERROR_CODES.CANNOT_ARCHIVE_SELF);
    }
    if (user.status === nextStatus) {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }
    if (user.status === 'ARCHIVED') {
      throw new ForbiddenException(ERROR_CODES.FORBIDDEN);
    }

    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(users)
        .set({ status: nextStatus })
        .where(eq(users.id, id))
        .returning();
      if (row) {
        if (nextStatus === 'SUSPENDED') {
          await tx
            .update(refreshTokens)
            .set({ revokedAt: new Date() })
            .where(eq(refreshTokens.userId, id));
        }
        await this.auditService.record({
          actorUserId: actor.id,
          action,
          entityType: 'user',
          entityId: row.id,
          metadata: { email: row.email, status: row.status },
        });
      }
      return row;
    });

    if (!updated) {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }
    return toUserDto(updated);
  }

  private assertCanView(actor: AuthUser, target: UserRow): void {
    if (actor.role === 'ADMIN') {
      return;
    }
    if (actor.role === 'AGENT') {
      if (actor.id === target.id) {
        return;
      }
      throw new ForbiddenException(ERROR_CODES.FORBIDDEN);
    }
    if (actor.role === 'MANAGER') {
      if (target.role === 'ADMIN') {
        throw new ForbiddenException(ERROR_CODES.FORBIDDEN);
      }
      return;
    }
    throw new ForbiddenException(ERROR_CODES.FORBIDDEN);
  }

  private buildPatch(user: UserRow, input: UpdateUserInput, actor: AuthUser): Partial<typeof users.$inferInsert> {
    const patch: Partial<typeof users.$inferInsert> = {};
    const isSelf = actor.id === user.id;

    if (input.name !== undefined) {
      if (actor.role === 'AGENT' && !isSelf) {
        throw new ForbiddenException(ERROR_CODES.FORBIDDEN);
      }
      patch.name = input.name;
    }

    if (input.preferredLanguage !== undefined) {
      if (actor.role === 'AGENT' && !isSelf) {
        throw new ForbiddenException(ERROR_CODES.FORBIDDEN);
      }
      patch.preferredLanguage = input.preferredLanguage;
    }

    if (input.role !== undefined) {
      if (actor.role !== 'ADMIN') {
        throw new ForbiddenException(ERROR_CODES.FORBIDDEN);
      }
      if (isSelf) {
        throw new ForbiddenException(ERROR_CODES.CANNOT_MODIFY_OWN_ROLE);
      }
      patch.role = input.role;
    }

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }

    if (actor.role === 'MANAGER' && user.role !== 'AGENT') {
      throw new ForbiddenException(ERROR_CODES.FORBIDDEN);
    }

    return patch;
  }
}
