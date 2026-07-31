import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike, isNull, not, or, type SQL } from 'drizzle-orm';
import type { TagQuery, TagDto } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { contactTags, tags, type TagRow } from '../../db/schema';
import { toTagSummary } from './contacts.mapper';

export interface TagListResult {
  items: TagDtoWithCount[];
  total: number;
}

export type TagDtoWithCount = TagDto & { contactCount: number };

@Injectable()
export class TagsDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  async list(query: TagQuery): Promise<TagListResult> {
    const conditions: SQL[] = [isNull(tags.archivedAt)];
    if (query.search) {
      const term = `%${query.search}%`;
      conditions.push(or(ilike(tags.name, term), ilike(tags.slug, term))!);
    }
    const where = and(...conditions);

    const rows = await this.db
      .select()
      .from(tags)
      .where(where)
      .orderBy(desc(tags.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const [totalRow] = await this.db.select({ value: count() }).from(tags).where(where);

    const ids = rows.map((row) => row.id);
    const tagIds = ids.length > 0 ? ids : [''];
    const usage = await this.db
      .select({ tagId: contactTags.tagId, value: count() })
      .from(contactTags)
      .where(and(...tagIds.map((id) => eq(contactTags.tagId, id))))
      .groupBy(contactTags.tagId);

    const usageMap = new Map(usage.map((row) => [row.tagId, row.value]));
    const items = rows.map((row) => ({
      ...toTagSummary(row),
      description: row.description,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
      contactCount: usageMap.get(row.id) ?? 0,
    }));

    return { items, total: totalRow?.value ?? 0 };
  }

  findById(id: string): Promise<TagRow | undefined> {
    return this.db.query.tags.findFirst({ where: eq(tags.id, id) });
  }

  findActiveById(id: string): Promise<TagRow | undefined> {
    return this.db.query.tags.findFirst({ where: and(eq(tags.id, id), isNull(tags.archivedAt)) });
  }

  findBySlug(slug: string): Promise<TagRow | undefined> {
    return this.db.query.tags.findFirst({ where: eq(tags.slug, slug) });
  }

  async findActiveByIds(ids: string[]): Promise<TagRow[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(tags)
      .where(and(...ids.map((id) => eq(tags.id, id)), isNull(tags.archivedAt)));
    return rows;
  }

  insert(values: { name: string; slug: string; description?: string | null }): Promise<TagRow[]> {
    return this.db.insert(tags).values(values).returning();
  }

  update(id: string, values: Partial<TagRow>): Promise<TagRow[]> {
    return this.db.update(tags).set(values).where(eq(tags.id, id)).returning();
  }

  async slugCount(slug: string, excludeId?: string): Promise<number> {
    const conditions: SQL[] = [eq(tags.slug, slug)];
    if (excludeId) {
      conditions.push(not(eq(tags.id, excludeId)));
    }
    const [row] = await this.db.select({ value: count() }).from(tags).where(and(...conditions));
    return row?.value ?? 0;
  }
}
