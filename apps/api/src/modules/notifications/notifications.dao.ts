import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, isNull } from 'drizzle-orm';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { notificationPreferences, notifications, type NewNotification, type NotificationPreferencesRow, type NotificationRow } from '../../db/schema';

@Injectable()
export class NotificationsDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  async insert(input: NewNotification): Promise<NotificationRow> {
    const [row] = await this.db.insert(notifications).values(input).returning();
    return row!;
  }

  async list(userId: string, page: number, pageSize: number): Promise<{ items: NotificationRow[]; total: number; unread: number }> {
    const conditions = [eq(notifications.userId, userId)];
    const [unreadRow] = await this.db
      .select({ value: count() })
      .from(notifications)
      .where(and(...conditions, isNull(notifications.readAt)));
    const items = await this.db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const [totalRow] = await this.db.select({ value: count() }).from(notifications).where(and(...conditions));
    return { items, total: totalRow?.value ?? 0, unread: unreadRow?.value ?? 0 };
  }

  async unreadCount(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return row?.value ?? 0;
  }

  async findOwned(id: string, userId: string): Promise<NotificationRow | undefined> {
    return this.db.query.notifications.findFirst({ where: and(eq(notifications.id, id), eq(notifications.userId, userId)) });
  }

  async markRead(id: string, userId: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }

  async markAllRead(userId: string): Promise<void> {
    await this.db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.db.delete(notifications).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }

  async getPreferences(userId: string): Promise<NotificationPreferencesRow | null> {
    return this.getPrefs(userId);
  }

  private async getPrefs(userId: string): Promise<NotificationPreferencesRow | null> {
    const row = await this.db.query.notificationPreferences.findFirst({ where: eq(notificationPreferences.userId, userId) });
    return row ?? null;
  }

  async ensurePreferences(userId: string): Promise<void> {
    const existing = await this.db.query.notificationPreferences.findFirst({ where: eq(notificationPreferences.userId, userId) });
    if (!existing) {
      await this.db.insert(notificationPreferences).values({ userId });
    }
  }

  async updatePreferences(userId: string, patch: Record<string, boolean>): Promise<void> {
    await this.ensurePreferences(userId);
    await this.db.update(notificationPreferences).set(patch).where(eq(notificationPreferences.userId, userId));
  }
}
