import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, isNull, or, type SQL } from 'drizzle-orm';
import type { UserQuery } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { refreshTokens, users, type NewUser, type UserRow } from '../../db/schema';

export interface UsersListOptions extends UserQuery {
  managerScope?: boolean;
}

const SORT_COLUMNS = {
  name: users.name,
  email: users.email,
  role: users.role,
  status: users.status,
  createdAt: users.createdAt,
  lastLoginAt: users.lastLoginAt,
} as const;

@Injectable()
export class UsersDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  findById(id: string): Promise<UserRow | undefined> {
    return this.db.query.users.findFirst({ where: eq(users.id, id) });
  }

  findByEmail(email: string): Promise<UserRow | undefined> {
    return this.db.query.users.findFirst({ where: eq(users.email, email.toLowerCase()) });
  }

  async listActive(): Promise<UserRow[]> {
    return this.db.select().from(users).where(eq(users.status, 'ACTIVE')).orderBy(asc(users.name));
  }

  insert(data: NewUser): Promise<UserRow[]> {
    return this.db.insert(users).values(data).returning();
  }

  update(id: string, values: Partial<NewUser>): Promise<UserRow[]> {
    return this.db.update(users).set(values).where(eq(users.id, id)).returning();
  }

  async list(options: UsersListOptions): Promise<{ items: UserRow[]; total: number }> {
    const { search, role, status, page, pageSize, sortBy, sortOrder, managerScope } = options;

    const conditions: SQL[] = [];
    if (search) {
      const term = `%${search}%`;
      const searchCondition = or(ilike(users.name, term), ilike(users.email, term));
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }
    if (role) {
      conditions.push(eq(users.role, role));
    }
    if (status) {
      conditions.push(eq(users.status, status));
    }
    if (managerScope) {
      const scopeCondition = or(eq(users.status, 'ACTIVE'), eq(users.role, 'AGENT'));
      if (scopeCondition) {
        conditions.push(scopeCondition);
      }
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const orderColumn = SORT_COLUMNS[sortBy] ?? users.createdAt;
    const orderFn = sortOrder === 'asc' ? asc : desc;

    const items = await this.db
      .select()
      .from(users)
      .where(where)
      .orderBy(orderFn(orderColumn))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [totalRow] = await this.db.select({ value: count() }).from(users).where(where);

    return { items, total: totalRow?.value ?? 0 };
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }
}
