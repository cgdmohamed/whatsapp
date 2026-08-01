import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DEFAULT_SETTINGS } from '@wa/config';
import { eq } from 'drizzle-orm';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { ERROR_CODES } from '../../common/errors';
import { PasswordService } from '../../common/auth/password.service';
import { settings } from '../../db/schema';
import { PasswordResetDao } from './password-reset.dao';

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
  historySize: number;
  resetTokenExpiryMinutes: number;
}

@Injectable()
export class PasswordPolicyService {
  constructor(
    private readonly passwordService: PasswordService,
    private readonly resetDao: PasswordResetDao,
    @Inject(DATABASE) private readonly db: DrizzleDB,
  ) {}

  async getPolicy(): Promise<PasswordPolicy> {
    const rows = await this.db.select().from(settings).where(eq(settings.namespace, 'app'));
    const map = new Map(rows.map((row) => [row.key, row.publicValue ?? undefined]));
    const num = (key: string, fallback: number): number => {
      const value = map.get(key);
      const parsed = Number(value);
      return value === undefined || !Number.isFinite(parsed) ? fallback : parsed;
    };
    const bool = (key: string, fallback: boolean): boolean => {
      const value = map.get(key);
      if (value === undefined) return fallback;
      return value === 'true' || value === '1' || value === 'yes';
    };
    return {
      minLength: num('passwordMinLength', DEFAULT_SETTINGS.passwordMinLength),
      requireUppercase: bool('passwordRequireUppercase', DEFAULT_SETTINGS.passwordRequireUppercase),
      requireLowercase: bool('passwordRequireLowercase', DEFAULT_SETTINGS.passwordRequireLowercase),
      requireNumber: bool('passwordRequireNumber', DEFAULT_SETTINGS.passwordRequireNumber),
      requireSpecial: bool('passwordRequireSpecial', DEFAULT_SETTINGS.passwordRequireSpecial),
      historySize: num('passwordHistorySize', DEFAULT_SETTINGS.passwordHistorySize),
      resetTokenExpiryMinutes: num('passwordResetTokenExpiryMinutes', DEFAULT_SETTINGS.passwordResetTokenExpiryMinutes),
    };
  }

  async validate(newPassword: string, userId: string, currentHash?: string): Promise<string> {
    const policy = await this.getPolicy();
    const failures: string[] = [];
    if (newPassword.length < policy.minLength) failures.push('PASSWORD_TOO_SHORT');
    if (policy.requireUppercase && !/[A-Z]/.test(newPassword)) failures.push('PASSWORD_REQUIRES_UPPERCASE');
    if (policy.requireLowercase && !/[a-z]/.test(newPassword)) failures.push('PASSWORD_REQUIRES_LOWERCASE');
    if (policy.requireNumber && !/[0-9]/.test(newPassword)) failures.push('PASSWORD_REQUIRES_NUMBER');
    if (policy.requireSpecial && !/[^A-Za-z0-9]/.test(newPassword)) failures.push('PASSWORD_REQUIRES_SPECIAL');
    if (failures.length > 0) {
      throw new BadRequestException(failures.join(','));
    }
    if (currentHash && (await this.passwordService.verify(newPassword, currentHash))) {
      throw new BadRequestException(ERROR_CODES.SAME_PASSWORD);
    }
    if (policy.historySize > 0) {
      const history = await this.resetDao.listHistory(userId, policy.historySize);
      for (const hash of history) {
        if (await this.passwordService.verify(newPassword, hash)) {
          throw new BadRequestException(ERROR_CODES.PASSWORD_REUSE_DETECTED);
        }
      }
    }
    return 'OK';
  }

  async recordPassword(userId: string, passwordHash: string): Promise<void> {
    const policy = await this.getPolicy();
    await this.resetDao.addHistory(userId, passwordHash);
    if (policy.historySize > 0) {
      await this.resetDao.pruneHistory(userId, policy.historySize);
    }
  }
}
