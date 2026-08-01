import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { passwordHistory, passwordResetTokens, type PasswordResetTokenRow } from '../../db/schema';

@Injectable()
export class PasswordResetDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  async createToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    requestedIp?: string | null;
    requestedUserAgent?: string | null;
  }): Promise<PasswordResetTokenRow> {
    const [row] = await this.db
      .insert(passwordResetTokens)
      .values({
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        requestedIp: input.requestedIp ?? null,
        requestedUserAgent: input.requestedUserAgent ?? null,
      })
      .returning();
    return row!;
  }

  findByTokenHash(tokenHash: string): Promise<PasswordResetTokenRow | undefined> {
    return this.db.query.passwordResetTokens.findFirst({ where: eq(passwordResetTokens.tokenHash, tokenHash) });
  }

  async revokeForUser(userId: string, exceptId?: string): Promise<void> {
    const conditions = [and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt), isNull(passwordResetTokens.revokedAt))];
    const where = exceptId ? and(conditions[0]!, ne(passwordResetTokens.id, exceptId)) : conditions[0];
    await this.db.update(passwordResetTokens).set({ revokedAt: new Date() }).where(where);
  }

  async markUsed(id: string): Promise<void> {
    await this.db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, id));
  }

  async addHistory(userId: string, passwordHash: string): Promise<void> {
    await this.db.insert(passwordHistory).values({ userId, passwordHash });
  }

  async listHistory(userId: string, limit: number): Promise<string[]> {
    const rows = await this.db
      .select({ passwordHash: passwordHistory.passwordHash })
      .from(passwordHistory)
      .where(eq(passwordHistory.userId, userId))
      .orderBy(desc(passwordHistory.createdAt))
      .limit(limit);
    return rows.map((row) => row.passwordHash);
  }

  async pruneHistory(userId: string, keep: number): Promise<void> {
    const rows = await this.db
      .select({ id: passwordHistory.id })
      .from(passwordHistory)
      .where(eq(passwordHistory.userId, userId))
      .orderBy(desc(passwordHistory.createdAt))
      .offset(keep);
    const ids = rows.map((row) => row.id);
    if (ids.length > 0) {
      await this.db.delete(passwordHistory).where(inArray(passwordHistory.id, ids));
    }
  }
}
