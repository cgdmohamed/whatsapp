import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';

import type { DrizzleDB } from '../../common/database/database.module';
import { refreshTokens, type NewRefreshToken, type UserRow } from '../../db/schema';
import type { AccessTokenPayload } from '../../common/guards/jwt-auth.guard';

export interface TokenMeta {
  ipAddress: string;
  userAgent: string;
}

type InsertableDb = Pick<DrizzleDB, 'insert'>;

@Injectable()
export class TokensService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async createAccessToken(user: UserRow): Promise<string> {
    const payload: Omit<AccessTokenPayload, 'iat' | 'exp'> = {
      sub: user.id,
      role: user.role,
      name: user.name,
      lang: user.preferredLanguage,
    };
    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('ACCESS_TOKEN_SECRET'),
      expiresIn: this.configService.getOrThrow<string>('ACCESS_TOKEN_TTL'),
    });
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwtService.verifyAsync<AccessTokenPayload>(token, {
      secret: this.configService.getOrThrow<string>('ACCESS_TOKEN_SECRET'),
    });
  }

  async issueRefreshToken(userId: string, meta: TokenMeta, db: InsertableDb): Promise<{ token: string; recordId: string }> {
    const token = randomBytes(48).toString('base64url');
    const tokenHash = this.hashToken(token);
    const ttlDays = this.configService.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS');
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    const row: NewRefreshToken = {
      userId,
      tokenHash,
      expiresAt,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    };

    const [record] = await db.insert(refreshTokens).values(row).returning({ id: refreshTokens.id });
    if (!record) {
      throw new Error('Failed to persist refresh token');
    }
    return { token, recordId: record.id };
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
