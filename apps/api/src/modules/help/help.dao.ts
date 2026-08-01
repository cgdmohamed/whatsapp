import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { HelpArticleStatus, Role } from '@wa/shared';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import {
  helpArticleFeedback,
  helpArticleLinks,
  helpArticleViews,
  helpArticles,
  helpCategories,
  helpChangeLogs,
  helpOnboardingState,
  helpOnboardingSteps,
  helpSearchLogs,
  type HelpArticleLinkRow,
  type HelpArticleRow,
  type HelpCategoryRow,
  type HelpChangeLogRow,
} from '../../db/schema';

export interface ArticleWithCategory extends HelpArticleRow {
  categorySlug: string;
  categoryNameAr: string;
  categoryNameEn: string;
}

export interface ArticleListFilter {
  categoryId?: string;
  status?: HelpArticleStatus;
  featureKey?: string;
  q?: string;
  role?: Role;
  publishedOnly?: boolean;
  includeArchived?: boolean;
  limit: number;
  offset: number;
}

function norm(col: unknown): SQL {
  return sql`regexp_replace(translate(lower(${col as never}), 'أإآ', 'ااا'), '[ًٌٍَُِّْ]', '', 'g')`;
}

function roleAllowed(role: Role | undefined): SQL | undefined {
  if (!role) {
    return undefined;
  }
  return sql`(${helpArticles.allowedRoles} IS NULL OR COALESCE(jsonb_exists(${helpArticles.allowedRoles}, ${role}), false))`;
}

@Injectable()
export class HelpDao {
  constructor(@Inject(DATABASE) private readonly db: DrizzleDB) {}

  // ---------- Categories ----------

  async listCategories(opts: { includeArchived?: boolean; status?: string } = {}): Promise<HelpCategoryRow[]> {
    const conditions: SQL[] = [];
    if (!opts.includeArchived) {
      conditions.push(isNull(helpCategories.archivedAt));
    }
    if (opts.status) {
      conditions.push(eq(helpCategories.status, opts.status as never));
    }
    const rows = await this.db
      .select()
      .from(helpCategories)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(helpCategories.sortOrder), asc(helpCategories.nameAr));
    return rows;
  }

  findCategoryBySlug(slug: string): Promise<HelpCategoryRow | undefined> {
    return this.db.query.helpCategories.findFirst({ where: eq(helpCategories.slug, slug) });
  }

  findCategoryById(id: string): Promise<HelpCategoryRow | undefined> {
    return this.db.query.helpCategories.findFirst({ where: eq(helpCategories.id, id) });
  }

  async insertCategory(input: Partial<HelpCategoryRow>): Promise<HelpCategoryRow> {
    const [row] = await this.db.insert(helpCategories).values(input as never).returning();
    return row!;
  }

  async updateCategory(id: string, patch: Partial<HelpCategoryRow>): Promise<HelpCategoryRow | undefined> {
    const [row] = await this.db
      .update(helpCategories)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(helpCategories.id, id))
      .returning();
    return row;
  }

  async categorySlugCount(slug: string, excludeId?: string): Promise<number> {
    const conditions: SQL[] = [eq(helpCategories.slug, slug)];
    if (excludeId) {
      conditions.push(sql`${helpCategories.id} <> ${excludeId}`);
    }
    const [row] = await this.db.select({ value: count() }).from(helpCategories).where(and(...conditions));
    return row?.value ?? 0;
  }

  async countArticlesByCategory(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .select({ categoryId: helpArticles.categoryId, value: count() })
      .from(helpArticles)
      .where(
        and(
          inArray(helpArticles.categoryId, ids),
          eq(helpArticles.status, 'PUBLISHED' as never),
          isNull(helpArticles.archivedAt),
        ),
      )
      .groupBy(helpArticles.categoryId);
    return new Map(rows.map((row) => [row.categoryId, row.value]));
  }

  // ---------- Articles ----------

  async listArticles(filter: ArticleListFilter): Promise<{ items: ArticleWithCategory[]; total: number }> {
    const conditions = this.buildArticleConditions(filter);
    const base = this.db
      .select({
        article: helpArticles,
        categorySlug: helpCategories.slug,
        categoryNameAr: helpCategories.nameAr,
        categoryNameEn: helpCategories.nameEn,
      })
      .from(helpArticles)
      .innerJoin(helpCategories, eq(helpArticles.categoryId, helpCategories.id));

    const items = await base.where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(helpArticles.sortOrder), desc(helpArticles.publishedAt))
      .limit(filter.limit)
      .offset(filter.offset);

    const [totalRow] = await this.db
      .select({ value: count() })
      .from(helpArticles)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return {
      items: items.map((row) => ({ ...row.article, categorySlug: row.categorySlug, categoryNameAr: row.categoryNameAr, categoryNameEn: row.categoryNameEn })),
      total: totalRow?.value ?? 0,
    };
  }

  findArticleById(id: string): Promise<HelpArticleRow | undefined> {
    return this.db.query.helpArticles.findFirst({ where: eq(helpArticles.id, id) });
  }

  findArticleBySlug(slug: string): Promise<HelpArticleRow | undefined> {
    return this.db.query.helpArticles.findFirst({ where: eq(helpArticles.slug, slug) });
  }

  async insertArticle(input: Partial<HelpArticleRow>): Promise<HelpArticleRow> {
    const [row] = await this.db.insert(helpArticles).values(input as never).returning();
    return row!;
  }

  async updateArticle(id: string, patch: Partial<HelpArticleRow>): Promise<HelpArticleRow | undefined> {
    const [row] = await this.db
      .update(helpArticles)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(helpArticles.id, id))
      .returning();
    return row;
  }

  async articleSlugCount(slug: string, excludeId?: string): Promise<number> {
    const conditions: SQL[] = [eq(helpArticles.slug, slug)];
    if (excludeId) {
      conditions.push(sql`${helpArticles.id} <> ${excludeId}`);
    }
    const [row] = await this.db.select({ value: count() }).from(helpArticles).where(and(...conditions));
    return row?.value ?? 0;
  }

  async findContextualCandidates(role?: Role): Promise<ArticleWithCategory[]> {
    const conditions: SQL[] = [eq(helpArticles.status, 'PUBLISHED' as never), isNull(helpArticles.archivedAt)];
    const roleCond = roleAllowed(role);
    if (roleCond) {
      conditions.push(roleCond);
    }
    const rows = await this.db
      .select({
        article: helpArticles,
        categorySlug: helpCategories.slug,
        categoryNameAr: helpCategories.nameAr,
        categoryNameEn: helpCategories.nameEn,
      })
      .from(helpArticles)
      .innerJoin(helpCategories, eq(helpArticles.categoryId, helpCategories.id))
      .where(and(...conditions));
    return rows.map((row) => ({ ...row.article, categorySlug: row.categorySlug, categoryNameAr: row.categoryNameAr, categoryNameEn: row.categoryNameEn }));
  }

  // ---------- Search ----------

  async searchArticles(opts: {
    term: string;
    language: 'ar' | 'en';
    role?: Role;
    categorySlug?: string;
    limit: number;
  }): Promise<Array<ArticleWithCategory & { score: number }>> {
    const term = opts.term;
    const prefix = `${term}%`;
    const infix = `%${term}%`;
    const titleAr = norm(helpArticles.titleAr);
    const titleEn = norm(helpArticles.titleEn);
    const summaryAr = norm(helpArticles.summaryAr);
    const summaryEn = norm(helpArticles.summaryEn);
    const contentAr = norm(helpArticles.contentAr);
    const contentEn = norm(helpArticles.contentEn);
    const keywords = norm(sql`${helpArticles.keywords}::text`);
    const categoryName = norm(opts.language === 'ar' ? helpCategories.nameAr : helpCategories.nameEn);
    const featureKey = norm(helpArticles.featureKey);

    const titleScore = sql`(
      CASE
        WHEN ${titleAr} = ${term} OR ${titleEn} = ${term} THEN 120
        WHEN ${titleAr} LIKE ${prefix} OR ${titleEn} LIKE ${prefix} THEN 80
        WHEN ${titleAr} LIKE ${infix} OR ${titleEn} LIKE ${infix} THEN 50
        ELSE 0
      END
    )`;
    const summaryScore = sql`(
      CASE WHEN ${opts.language === 'ar' ? summaryAr : summaryEn} LIKE ${infix} THEN 20 ELSE 0 END
    )`;
    const contentScore = sql`(
      CASE WHEN ${opts.language === 'ar' ? contentAr : contentEn} LIKE ${infix} THEN 10 ELSE 0 END
    )`;
    const keywordScore = sql`(
      CASE WHEN ${keywords} LIKE ${infix} THEN 15 ELSE 0 END
    )`;
    const categoryScore = sql`(
      CASE WHEN ${categoryName} LIKE ${infix} OR ${featureKey} LIKE ${infix} THEN 5 ELSE 0 END
    )`;

    const score = sql`(${titleScore} + ${summaryScore} + ${contentScore} + ${keywordScore} + ${categoryScore})`;

    const conditions: SQL[] = [
      eq(helpArticles.status, 'PUBLISHED' as never),
      isNull(helpArticles.archivedAt),
      sql`${score} > 0`,
    ];
    const roleCond = roleAllowed(opts.role);
    if (roleCond) {
      conditions.push(roleCond);
    }
    if (opts.categorySlug) {
      conditions.push(eq(helpCategories.slug, opts.categorySlug));
    }

    const rows = await this.db
      .select({
        article: helpArticles,
        categorySlug: helpCategories.slug,
        categoryNameAr: helpCategories.nameAr,
        categoryNameEn: helpCategories.nameEn,
        score,
      })
      .from(helpArticles)
      .innerJoin(helpCategories, eq(helpArticles.categoryId, helpCategories.id))
      .where(and(...conditions))
      .orderBy(desc(score), asc(helpArticles.sortOrder))
      .limit(opts.limit);

    return rows.map((row) => ({
      ...row.article,
      categorySlug: row.categorySlug,
      categoryNameAr: row.categoryNameAr,
      categoryNameEn: row.categoryNameEn,
      score: Number(row.score) || 0,
    }));
  }

  // ---------- Feedback / Views / Search logs ----------

  async insertFeedback(input: { articleId: string; userId?: string | null; wasHelpful: boolean; comment?: string }): Promise<void> {
    await this.db.insert(helpArticleFeedback).values(input as never);
  }

  async listFeedback(opts: { articleId?: string; limit: number; offset: number }): Promise<{
    items: Array<{ id: string; articleId: string; userId: string | null; wasHelpful: boolean; comment: string | null; createdAt: Date; articleTitle: string }>;
    total: number;
  }> {
    const conditions: SQL[] = [];
    if (opts.articleId) {
      conditions.push(eq(helpArticleFeedback.articleId, opts.articleId));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await this.db
      .select({
        id: helpArticleFeedback.id,
        articleId: helpArticleFeedback.articleId,
        userId: helpArticleFeedback.userId,
        wasHelpful: helpArticleFeedback.wasHelpful,
        comment: helpArticleFeedback.comment,
        createdAt: helpArticleFeedback.createdAt,
        articleTitle: helpArticles.titleAr,
      })
      .from(helpArticleFeedback)
      .innerJoin(helpArticles, eq(helpArticleFeedback.articleId, helpArticles.id))
      .where(where)
      .orderBy(desc(helpArticleFeedback.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);
    const [totalRow] = await this.db.select({ value: count() }).from(helpArticleFeedback).where(where);
    return { items: rows, total: totalRow?.value ?? 0 };
  }

  async feedbackStats(articleId: string): Promise<{ helpful: number; notHelpful: number }> {
    const rows = await this.db
      .select({ wasHelpful: helpArticleFeedback.wasHelpful, value: count() })
      .from(helpArticleFeedback)
      .where(eq(helpArticleFeedback.articleId, articleId))
      .groupBy(helpArticleFeedback.wasHelpful);
    return {
      helpful: rows.find((row) => row.wasHelpful)?.value ?? 0,
      notHelpful: rows.find((row) => !row.wasHelpful)?.value ?? 0,
    };
  }

  async insertView(input: { articleId: string; userId?: string | null; route?: string | null }): Promise<void> {
    await this.db.insert(helpArticleViews).values(input as never);
  }

  async countViews(articleId: string): Promise<number> {
    const [row] = await this.db.select({ value: count() }).from(helpArticleViews).where(eq(helpArticleViews.articleId, articleId));
    return row?.value ?? 0;
  }

  async countViewsByArticle(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .select({ articleId: helpArticleViews.articleId, value: count() })
      .from(helpArticleViews)
      .where(inArray(helpArticleViews.articleId, ids))
      .groupBy(helpArticleViews.articleId);
    return new Map(rows.map((row) => [row.articleId, row.value]));
  }

  async insertSearchLog(input: { userId?: string | null; query: string; language: string; resultCount: number }): Promise<void> {
    await this.db.insert(helpSearchLogs).values(input as never);
  }

  async searchLogStats(): Promise<{ total: number; noResults: number }> {
    const [total] = await this.db.select({ value: count() }).from(helpSearchLogs);
    const [noResults] = await this.db.select({ value: count() }).from(helpSearchLogs).where(eq(helpSearchLogs.resultCount, 0));
    return { total: total?.value ?? 0, noResults: noResults?.value ?? 0 };
  }

  async recentNoResultSearches(limit: number): Promise<Array<{ query: string; count: number; lastAt: Date }>> {
    const rows = await this.db
      .select({
        query: helpSearchLogs.query,
        count: count(),
        lastAt: sql<Date>`max(${helpSearchLogs.createdAt})`,
      })
      .from(helpSearchLogs)
      .where(eq(helpSearchLogs.resultCount, 0))
      .groupBy(helpSearchLogs.query)
      .orderBy(desc(sql`max(${helpSearchLogs.createdAt})`))
      .limit(limit);
    return rows;
  }

  // ---------- Change logs ----------

  async insertChangeLog(input: {
    articleId: string;
    changedByUserId?: string | null;
    changeSummary?: string | null;
    previousVersion?: Record<string, unknown> | null;
    newVersion?: Record<string, unknown> | null;
  }): Promise<void> {
    await this.db.insert(helpChangeLogs).values(input as never);
  }

  listChangeLogs(articleId: string): Promise<HelpChangeLogRow[]> {
    return this.db
      .select()
      .from(helpChangeLogs)
      .where(eq(helpChangeLogs.articleId, articleId))
      .orderBy(desc(helpChangeLogs.createdAt));
  }

  findChangeLog(id: string): Promise<HelpChangeLogRow | undefined> {
    return this.db.query.helpChangeLogs.findFirst({ where: eq(helpChangeLogs.id, id) });
  }

  // ---------- Article links ----------

  async replaceLinks(sourceId: string, links: Array<{ targetArticleId: string; relationType: string; sortOrder: number }>): Promise<void> {
    await this.db.delete(helpArticleLinks).where(eq(helpArticleLinks.sourceArticleId, sourceId));
    if (links.length > 0) {
      await this.db.insert(helpArticleLinks).values(links.map((link) => ({ ...link, sourceArticleId: sourceId }) as never));
    }
  }

  async listLinks(sourceId: string): Promise<HelpArticleLinkRow[]> {
    return this.db
      .select()
      .from(helpArticleLinks)
      .where(eq(helpArticleLinks.sourceArticleId, sourceId))
      .orderBy(asc(helpArticleLinks.relationType), asc(helpArticleLinks.sortOrder));
  }

  async findLinkedArticles(sourceId: string): Promise<HelpArticleLinkRow[]> {
    return this.db
      .select()
      .from(helpArticleLinks)
      .where(eq(helpArticleLinks.sourceArticleId, sourceId))
      .orderBy(asc(helpArticleLinks.sortOrder));
  }

  // ---------- Onboarding ----------

  async listManualSteps(userId: string): Promise<string[]> {
    const rows = await this.db.select({ stepKey: helpOnboardingSteps.stepKey }).from(helpOnboardingSteps).where(eq(helpOnboardingSteps.userId, userId));
    return rows.map((row) => row.stepKey);
  }

  async upsertManualStep(userId: string, stepKey: string, completed: boolean): Promise<void> {
    if (completed) {
      await this.db
        .insert(helpOnboardingSteps)
        .values({ userId, stepKey })
        .onConflictDoNothing({ target: [helpOnboardingSteps.userId, helpOnboardingSteps.stepKey] });
    } else {
      await this.db
        .delete(helpOnboardingSteps)
        .where(and(eq(helpOnboardingSteps.userId, userId), eq(helpOnboardingSteps.stepKey, stepKey)));
    }
  }

  async getOnboardingHidden(userId: string): Promise<boolean> {
    const row = await this.db.query.helpOnboardingState.findFirst({ where: eq(helpOnboardingState.userId, userId) });
    return row?.hidden ?? false;
  }

  async setOnboardingHidden(userId: string, hidden: boolean): Promise<void> {
    const existing = await this.db.query.helpOnboardingState.findFirst({ where: eq(helpOnboardingState.userId, userId) });
    if (existing) {
      await this.db.update(helpOnboardingState).set({ hidden, updatedAt: new Date() }).where(eq(helpOnboardingState.userId, userId));
    } else {
      await this.db.insert(helpOnboardingState).values({ userId, hidden });
    }
  }

  // ---------- Analytics ----------

  async topArticles(limit: number): Promise<Array<{ articleId: string; views: number }>> {
    const rows = await this.db
      .select({ articleId: helpArticleViews.articleId, views: count() })
      .from(helpArticleViews)
      .groupBy(helpArticleViews.articleId)
      .orderBy(desc(count()))
      .limit(limit);
    return rows;
  }

  async worstArticles(limit: number): Promise<Array<{ articleId: string; notHelpful: number }>> {
    const rows = await this.db
      .select({ articleId: helpArticleFeedback.articleId, notHelpful: count() })
      .from(helpArticleFeedback)
      .where(eq(helpArticleFeedback.wasHelpful, false))
      .groupBy(helpArticleFeedback.articleId)
      .orderBy(desc(count()))
      .limit(limit);
    return rows;
  }

  // ---------- Helpers ----------

  private buildArticleConditions(filter: ArticleListFilter): SQL[] {
    const conditions: SQL[] = [];
    if (filter.categoryId) {
      conditions.push(eq(helpArticles.categoryId, filter.categoryId));
    }
    if (filter.status) {
      conditions.push(eq(helpArticles.status, filter.status as never));
    }
    if (filter.featureKey) {
      conditions.push(eq(helpArticles.featureKey, filter.featureKey));
    }
    if (!filter.includeArchived) {
      conditions.push(isNull(helpArticles.archivedAt));
    }
    if (filter.publishedOnly) {
      conditions.push(eq(helpArticles.status, 'PUBLISHED' as never));
    }
    if (filter.q) {
      const term = `%${filter.q}%`;
      conditions.push(
        or(
          ilike(helpArticles.titleAr, term),
          ilike(helpArticles.titleEn, term),
          ilike(helpArticles.summaryAr, term),
          ilike(helpArticles.summaryEn, term),
        )!,
      );
    }
    const roleCond = roleAllowed(filter.role);
    if (roleCond) {
      conditions.push(roleCond);
    }
    return conditions;
  }
}
