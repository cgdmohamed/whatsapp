import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, count, eq, inArray, isNull, not, sql } from 'drizzle-orm';
import type {
  HelpAnalyticsDto,
  HelpArticleInput,
  HelpCategoryDto,
  HelpCategoryInput,
  HelpContextDto,
  HelpFeedbackInput,
  HelpLanguage,
  HelpOnboardingDto,
  HelpOnboardingStep,
  HelpArticleAdminDetailDto,
  HelpArticleStatus,
  PaginatedHelpArticles,
  PaginatedHelpFeedback,
  HelpArticleSummaryDto,
  HelpVersionDto,
  Role,
} from '@wa/shared';
import { AUDIT_ACTIONS, ID_SCHEMA, ROLES } from '@wa/shared';
import { randomUUID } from 'node:crypto';

import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { AuditService } from '../../common/audit/audit.module';
import { ERROR_CODES } from '../../common/errors';
import { sanitizeHelpHtml } from './help-sanitize';
import { HelpDao, type ArticleWithCategory } from './help.dao';
import {
  campaigns,
  contactLists,
  contacts,
  helpArticleFeedback,
  messageTemplates,
  settings,
  users,
  whatsappAccounts,
  whatsappPhoneNumbers,
  type HelpArticleRow,
  type HelpCategoryRow,
} from '../../db/schema';

const CONTEXT_LIMIT = 4;

export function normalizeArabic(text: string): string {
  return text
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ًٌٍَُِّْ]/g, '');
}

function routeToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:[^/]+/g, '[^/]+');
  return new RegExp(`^${escaped}$`);
}

function routeMatchScore(pattern: string, path: string): number {
  try {
    return routeToRegExp(pattern).test(path) ? (pattern.includes(':') ? 50 : 100) : 0;
  } catch {
    return 0;
  }
}

interface OnboardingStepDef {
  key: string;
  link: string | null;
  articleSlug: string | null;
  autoDetectable: boolean;
}

@Injectable()
export class HelpService {
  constructor(
    private readonly dao: HelpDao,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    @Inject(DATABASE) private readonly db: DrizzleDB,
  ) {}

  // ---------- Localization helpers ----------

  private pick(ar: string | null | undefined, en: string | null | undefined, language: HelpLanguage): string {
    return language === 'ar' ? (ar ?? en ?? '') : (en ?? ar ?? '');
  }

  private pickNullable(ar: string | null | undefined, en: string | null | undefined, language: HelpLanguage): string | null {
    const value = language === 'ar' ? ar : en;
    return value ?? (language === 'ar' ? en : ar) ?? null;
  }

  private isVisible(row: HelpArticleRow, role: Role | undefined): boolean {
    if (!row.allowedRoles || row.allowedRoles.length === 0) {
      return true;
    }
    return role ? row.allowedRoles.includes(role) : false;
  }

  private summarize(row: ArticleWithCategory, language: HelpLanguage): HelpArticleSummaryDto {
    return {
      id: row.id,
      categoryId: row.categoryId,
      categorySlug: row.categorySlug,
      categoryName: this.pick(row.categoryNameAr, row.categoryNameEn, language),
      title: this.pick(row.titleAr, row.titleEn, language),
      summary: this.pickNullable(row.summaryAr, row.summaryEn, language),
      slug: row.slug,
      articleType: row.articleType,
      difficulty: row.difficulty,
      estimatedReadingMinutes: row.estimatedReadingMinutes,
      keywords: row.keywords ?? undefined,
      isFeatured: row.isFeatured,
      isContextual: row.isContextual,
      status: row.status,
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private contextualArticle(row: ArticleWithCategory, language: HelpLanguage) {
    const hasAr = Boolean(row.contentAr?.trim());
    const hasEn = Boolean(row.contentEn?.trim());
    const fallback = (language === 'ar' && !hasAr) || (language === 'en' && !hasEn);
    return {
      ...this.summarize(row, language),
      content: this.pick(row.contentAr, row.contentEn, language),
      allowedRoles: row.allowedRoles ?? undefined,
      fallbackLanguage: fallback || undefined,
    };
  }

  // ---------- Public: categories ----------

  private categoryToDto(row: HelpCategoryRow, articleCount?: number): HelpCategoryDto {
    return {
      id: row.id,
      parentCategoryId: row.parentCategoryId,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      slug: row.slug,
      descriptionAr: row.descriptionAr,
      descriptionEn: row.descriptionEn,
      icon: row.icon,
      sortOrder: row.sortOrder,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
      articleCount,
    };
  }

  async getCategories(): Promise<HelpCategoryDto[]> {
    const rows = await this.dao.listCategories({ status: 'PUBLISHED' });
    const ids = rows.map((row) => row.id);
    const countMap = await this.dao.countArticlesByCategory(ids);
    const out: HelpCategoryDto[] = [];
    for (const row of rows) {
      if (row.archivedAt) continue;
      out.push(this.categoryToDto(row, countMap.get(row.id) ?? 0));
    }
    return out;
  }

  // ---------- Public: articles ----------

  async listArticles(query: {
    categorySlug?: string;
    language: HelpLanguage;
    role?: Role;
    page: number;
    pageSize: number;
    featureKey?: string;
    q?: string;
  }): Promise<PaginatedHelpArticles> {
    let categoryId: string | undefined;
    if (query.categorySlug) {
      const category = await this.dao.findCategoryBySlug(query.categorySlug);
      if (!category) {
        return { items: [], total: 0, page: query.page, pageSize: query.pageSize, totalPages: 0 };
      }
      categoryId = category.id;
    }
    const { items, total } = await this.dao.listArticles({
      categoryId,
      featureKey: query.featureKey,
      q: query.q,
      role: query.role,
      publishedOnly: true,
      includeArchived: false,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });
    return {
      items: items.map((row) => this.summarize(row, query.language)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    };
  }

  async getArticle(
    categorySlug: string,
    articleSlug: string,
    language: HelpLanguage,
    role: Role | undefined,
    userId: string | undefined,
    route?: string,
  ) {
    const article = await this.dao.findArticleBySlug(articleSlug);
    if (!article || article.status !== 'PUBLISHED' || article.archivedAt || !this.isVisible(article, role)) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    if (article.categoryId) {
      const category = await this.dao.findCategoryById(article.categoryId);
      if (!category || category.slug !== categorySlug) {
        throw new NotFoundException(ERROR_CODES.NOT_FOUND);
      }
    }

    await this.dao.insertView({ articleId: article.id, userId: userId ?? null, route: route ?? null });

    const withCategory: ArticleWithCategory = await this.loadWithCategory(article);

    const links = await this.dao.findLinkedArticles(article.id);
    const relatedIds = links.filter((link) => link.relationType === 'RELATED').map((link) => link.targetArticleId);
    const previousIds = links.filter((link) => link.relationType === 'PREVIOUS').map((link) => link.targetArticleId);
    const nextIds = links.filter((link) => link.relationType === 'NEXT').map((link) => link.targetArticleId);

    const categoryArticles = await this.dao.listArticles({
      categoryId: article.categoryId,
      publishedOnly: true,
      includeArchived: false,
      role,
      limit: 100,
      offset: 0,
    });

    const ordered = categoryArticles.items
      .filter((row) => row.id !== article.id && this.isVisible(row, role))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const resolveTarget = async (id: string | undefined): Promise<HelpArticleSummaryDto | null> => {
      if (!id) return null;
      const target = await this.dao.findArticleById(id);
      if (!target || target.status !== 'PUBLISHED' || target.archivedAt || !this.isVisible(target, role)) return null;
      return this.summarize(await this.loadWithCategory(target), language);
    };

    const [previous, next] = await Promise.all([
      resolveTarget(previousIds[0]),
      resolveTarget(nextIds[0]),
    ]);

    let related: HelpArticleSummaryDto[] = [];
    if (relatedIds.length > 0) {
      const rows = await this.dao.listArticles({
        categoryId: undefined,
        publishedOnly: true,
        includeArchived: false,
        role,
        limit: 50,
        offset: 0,
      });
      const map = new Map(rows.items.map((row) => [row.id, row]));
      related = relatedIds
        .map((id) => map.get(id))
        .filter((row): row is ArticleWithCategory => Boolean(row) && this.isVisible(row as HelpArticleRow, role))
        .slice(0, CONTEXT_LIMIT)
        .map((row) => this.summarize(row, language));
    }
    if (related.length === 0) {
      related = ordered.slice(0, CONTEXT_LIMIT).map((row) => this.summarize(row, language));
    }

    return {
      ...this.contextualArticle(withCategory, language),
      allowedRoles: article.allowedRoles ?? undefined,
      routePatterns: article.routePatterns ?? undefined,
      featureKey: article.featureKey ?? undefined,
      createdAt: article.createdAt.toISOString(),
      previous,
      next,
      related,
    };
  }

  // ---------- Public: context ----------

  async getContext(
    route: string,
    featureKey: string | undefined,
    language: HelpLanguage,
    role: Role | undefined,
  ): Promise<HelpContextDto> {
    const candidates = await this.dao.findContextualCandidates(role);
    const matches: Array<{ row: ArticleWithCategory; score: number }> = [];

    for (const candidate of candidates) {
      let score = 0;
      for (const pattern of candidate.routePatterns ?? []) {
        score = Math.max(score, routeMatchScore(pattern, route));
      }
      if (featureKey && candidate.featureKey === featureKey) {
        score = Math.max(score, 30);
      }
      if (score > 0) {
        matches.push({ row: candidate, score });
      }
    }

    matches.sort((a, b) => b.score - a.score || a.row.sortOrder - b.row.sortOrder);

    const primary = matches[0] ? this.contextualArticle(matches[0].row, language) : null;
    const related = matches
      .slice(1, CONTEXT_LIMIT + 1)
      .map((match) => this.summarize(match.row, language));

    return { primary, related, featureKey: featureKey ?? null, route };
  }

  // ---------- Public: search ----------

  async search(
    query: { q: string; language: HelpLanguage; categorySlug?: string; role?: Role },
    userId: string | undefined,
  ): Promise<{ items: Array<HelpArticleSummaryDto & { score?: number }>; total: number; query: string; noResults: boolean }> {
    const term = normalizeArabic(query.q.trim());
    const items = await this.dao.searchArticles({
      term,
      language: query.language,
      role: query.role,
      categorySlug: query.categorySlug,
      limit: 50,
    });

    await this.dao.insertSearchLog({
      userId: userId ?? null,
      query: query.q.trim().slice(0, 200),
      language: query.language,
      resultCount: items.length,
    });

    const mapped = items.map((row) => ({
      ...this.summarize(row, query.language),
      score: row.score,
      highlight: this.buildHighlight(
        query.language === 'ar' ? (row.summaryAr ?? row.summaryEn ?? row.titleAr) : (row.summaryEn ?? row.summaryAr ?? row.titleEn),
        query.q.trim(),
      ),
    }));

    return { items: mapped, total: mapped.length, query: query.q, noResults: mapped.length === 0 };
  }

  private buildHighlight(text: string, rawTerm: string): string | undefined {
    if (!text) return undefined;
    const normalized = normalizeArabic(rawTerm);
    const index = normalizeArabic(text).indexOf(normalized);
    if (index < 0) return undefined;
    const start = Math.max(0, index - 40);
    const end = Math.min(text.length, index + normalized.length + 80);
    const snippet = (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
    return snippet;
  }

  // ---------- Public: feedback / views ----------

  async recordView(articleId: string, userId: string | undefined, route: string | undefined): Promise<void> {
    if (!ID_SCHEMA.safeParse(articleId).success) {
      return;
    }
    const article = await this.dao.findArticleById(articleId);
    if (!article || article.status !== 'PUBLISHED') {
      return;
    }
    await this.dao.insertView({ articleId, userId: userId ?? null, route: route ?? null });
  }

  async recordFeedback(input: HelpFeedbackInput, userId: string): Promise<void> {
    const article = await this.dao.findArticleById(input.articleId);
    if (!article || article.status !== 'PUBLISHED') {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    await this.dao.insertFeedback({
      articleId: input.articleId,
      userId,
      wasHelpful: input.wasHelpful,
      comment: input.comment?.trim() ? input.comment.slice(0, 1000) : undefined,
    });
  }

  // ---------- Onboarding ----------

  async getOnboarding(userId: string, role: Role): Promise<HelpOnboardingDto> {
    const steps = await this.buildOnboardingSteps();
    const manual = new Set(await this.dao.listManualSteps(userId));
    const hidden = await this.dao.getOnboardingHidden(userId);

    const rendered: HelpOnboardingStep[] = [];
    for (const step of steps) {
      const auto = step.autoDetectable ? await this.detectStep(step.key, role) : false;
      const completed = auto || manual.has(step.key);
      rendered.push({
        key: step.key,
        label: step.key,
        description: '',
        link: step.link,
        articleSlug: step.articleSlug,
        completed,
        autoDetectable: step.autoDetectable,
        completedAt: completed ? new Date().toISOString() : null,
      });
    }

    const completedCount = rendered.filter((step) => step.completed).length;
    return {
      steps: rendered,
      completedCount,
      total: rendered.length,
      allCompleted: completedCount === rendered.length,
      hidden,
    };
  }

  async toggleOnboardingStep(userId: string, key: string, completed: boolean): Promise<void> {
    const steps = await this.buildOnboardingSteps();
    if (!steps.some((step) => step.key === key)) {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }
    await this.dao.upsertManualStep(userId, key, completed);
  }

  async setOnboardingVisibility(userId: string, hidden: boolean): Promise<void> {
    await this.dao.setOnboardingHidden(userId, hidden);
  }

  private async buildOnboardingSteps(): Promise<OnboardingStepDef[]> {
    return [
      { key: 'company-settings', link: '/settings', articleSlug: null, autoDetectable: true },
      { key: 'meta-credentials', link: '/whatsapp', articleSlug: 'connecting-meta-whatsapp-cloud-api', autoDetectable: true },
      { key: 'test-connection', link: '/whatsapp', articleSlug: 'connecting-meta-whatsapp-cloud-api', autoDetectable: true },
      { key: 'configure-webhook', link: '/whatsapp', articleSlug: null, autoDetectable: true },
      { key: 'sync-phone-number', link: '/whatsapp', articleSlug: null, autoDetectable: true },
      { key: 'sync-templates', link: '/templates', articleSlug: 'synchronizing-message-templates', autoDetectable: true },
      { key: 'import-contacts', link: '/contacts', articleSlug: 'importing-contacts-from-excel', autoDetectable: true },
      { key: 'review-consent', link: '/contacts', articleSlug: 'understanding-consent-and-suppression', autoDetectable: false },
      { key: 'create-test-list', link: '/lists', articleSlug: null, autoDetectable: true },
      { key: 'send-test-campaign', link: '/campaigns', articleSlug: 'creating-the-first-campaign', autoDetectable: true },
      { key: 'add-team-users', link: '/users', articleSlug: 'managing-users-and-permissions', autoDetectable: true },
      { key: 'review-security', link: '/settings', articleSlug: null, autoDetectable: false },
    ];
  }

  private async detectStep(key: string, role: Role): Promise<boolean> {
    const config = this.configService;
    switch (key) {
      case 'company-settings': {
        const [row] = await this.db.select({ value: count() }).from(settings).where(sql`${settings.namespace} = 'company'`);
        return (row?.value ?? 0) > 0;
      }
      case 'meta-credentials': {
        const [row] = await this.db.select({ value: count() }).from(settings).where(
          and(eq(settings.namespace, 'whatsapp'), eq(settings.key, 'app_secret')),
        );
        return Boolean(config.get<string>('META_APP_SECRET')) || Boolean(row && (row.value ?? 0) > 0);
      }
      case 'test-connection': {
        const [row] = await this.db.select({ value: count() }).from(whatsappAccounts);
        return (row?.value ?? 0) > 0;
      }
      case 'configure-webhook': {
        const [row] = await this.db.select({ value: count() }).from(settings).where(
          and(eq(settings.namespace, 'whatsapp'), eq(settings.key, 'verify_token')),
        );
        return Boolean(config.get<string>('META_VERIFY_TOKEN')) || Boolean(row && (row.value ?? 0) > 0);
      }
      case 'sync-phone-number': {
        const [row] = await this.db.select({ value: count() }).from(whatsappPhoneNumbers);
        return (row?.value ?? 0) > 0;
      }
      case 'sync-templates': {
        const [row] = await this.db.select({ value: count() }).from(messageTemplates);
        return (row?.value ?? 0) > 0;
      }
      case 'import-contacts': {
        const [row] = await this.db.select({ value: count() }).from(contacts).where(isNull(contacts.archivedAt));
        return (row?.value ?? 0) > 0;
      }
      case 'create-test-list': {
        const [row] = await this.db.select({ value: count() }).from(contactLists).where(isNull(contactLists.archivedAt));
        return (row?.value ?? 0) > 0;
      }
      case 'send-test-campaign': {
        const [row] = await this.db.select({ value: count() }).from(campaigns).where(
          and(isNull(campaigns.archivedAt), not(inArray(campaigns.status, ['DRAFT', 'VALIDATING', 'READY'] as never))),
        );
        return (row?.value ?? 0) > 0;
      }
      case 'add-team-users': {
        const [row] = await this.db.select({ value: count() }).from(users).where(eq(users.status, 'ACTIVE'));
        return (row?.value ?? 0) > 1;
      }
      default:
        return role === 'ADMIN';
    }
  }

  // ---------- Admin: categories ----------

  async adminListCategories(): Promise<HelpCategoryDto[]> {
    const rows = await this.dao.listCategories({ includeArchived: true });
    const countMap = await this.dao.countArticlesByCategory(rows.map((row) => row.id));
    return rows.map((row) => ({
      id: row.id,
      parentCategoryId: row.parentCategoryId,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      slug: row.slug,
      descriptionAr: row.descriptionAr,
      descriptionEn: row.descriptionEn,
      icon: row.icon,
      sortOrder: row.sortOrder,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
      articleCount: countMap.get(row.id) ?? 0,
    }));
  }

  async createCategory(input: HelpCategoryInput, actorId: string): Promise<HelpCategoryDto> {
    if (input.slug && (await this.dao.categorySlugCount(input.slug)) > 0) {
      throw new ConflictException(ERROR_CODES.CONFLICT);
    }
    const row = await this.dao.insertCategory({
      parentCategoryId: input.parentCategoryId ?? null,
      nameAr: input.nameAr,
      nameEn: input.nameEn,
      slug: input.slug,
      descriptionAr: input.descriptionAr ?? null,
      descriptionEn: input.descriptionEn ?? null,
      icon: input.icon ?? null,
      sortOrder: input.sortOrder ?? 0,
      status: input.status ?? 'PUBLISHED',
    });
    await this.auditService.record({
      actorUserId: actorId,
      action: AUDIT_ACTIONS.HELP_CATEGORY_CREATE,
      entityType: 'help_category',
      entityId: row.id,
      metadata: { slug: row.slug },
    });
    return this.categoryToDto(row);
  }

  async updateCategory(id: string, input: HelpCategoryInput, actorId: string): Promise<HelpCategoryDto> {
    const existing = await this.dao.findCategoryById(id);
    if (!existing) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    if (input.slug && (await this.dao.categorySlugCount(input.slug, id)) > 0) {
      throw new ConflictException(ERROR_CODES.CONFLICT);
    }
    const row = (await this.dao.updateCategory(id, {
      parentCategoryId: input.parentCategoryId !== undefined ? input.parentCategoryId : existing.parentCategoryId,
      nameAr: input.nameAr ?? existing.nameAr,
      nameEn: input.nameEn ?? existing.nameEn,
      slug: input.slug ?? existing.slug,
      descriptionAr: input.descriptionAr !== undefined ? input.descriptionAr : existing.descriptionAr,
      descriptionEn: input.descriptionEn !== undefined ? input.descriptionEn : existing.descriptionEn,
      icon: input.icon !== undefined ? input.icon : existing.icon,
      sortOrder: input.sortOrder ?? existing.sortOrder,
      status: input.status ?? existing.status,
    }))!;
    await this.auditService.record({
      actorUserId: actorId,
      action: AUDIT_ACTIONS.HELP_CATEGORY_UPDATE,
      entityType: 'help_category',
      entityId: id,
      metadata: { slug: row.slug },
    });
    return this.categoryToDto(row);
  }

  async archiveCategory(id: string, actorId: string): Promise<HelpCategoryDto> {
    const existing = await this.dao.findCategoryById(id);
    if (!existing) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    const row = (await this.dao.updateCategory(id, { archivedAt: new Date(), status: 'ARCHIVED' }))!;
    await this.auditService.record({
      actorUserId: actorId,
      action: AUDIT_ACTIONS.HELP_CATEGORY_ARCHIVE,
      entityType: 'help_category',
      entityId: id,
      metadata: { slug: row.slug },
    });
    return this.categoryToDto(row);
  }

  async reorderCategories(items: Array<{ id: string; sortOrder: number }>, actorId: string): Promise<void> {
    for (const item of items) {
      await this.dao.updateCategory(item.id, { sortOrder: item.sortOrder });
    }
    await this.auditService.record({
      actorUserId: actorId,
      action: AUDIT_ACTIONS.HELP_CATEGORY_REORDER,
      entityType: 'help_category',
      metadata: { count: items.length },
    });
  }

  // ---------- Admin: articles ----------

  async adminListArticles(query: {
    categorySlug?: string;
    status?: HelpArticleStatus;
    featureKey?: string;
    q?: string;
    includeArchived?: boolean;
    page: number;
    pageSize: number;
    language: HelpLanguage;
  }): Promise<PaginatedHelpArticles> {
    let categoryId: string | undefined;
    if (query.categorySlug) {
      const category = await this.dao.findCategoryBySlug(query.categorySlug);
      categoryId = category?.id;
    }
    const { items, total } = await this.dao.listArticles({
      categoryId,
      status: query.status,
      featureKey: query.featureKey,
      q: query.q,
      includeArchived: query.includeArchived,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });
    return {
      items: items.map((row) => this.summarize(row, query.language)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    };
  }

  async getArticleAdmin(id: string): Promise<HelpArticleAdminDetailDto> {
    const article = await this.dao.findArticleById(id);
    if (!article) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    return this.toAdminDetail(article);
  }

  private toAdminDetail(row: HelpArticleRow): HelpArticleAdminDetailDto {
    return {
      id: row.id,
      categoryId: row.categoryId,
      categoryName: '',
      slug: row.slug,
      titleAr: row.titleAr,
      titleEn: row.titleEn,
      summaryAr: row.summaryAr,
      summaryEn: row.summaryEn,
      contentAr: row.contentAr ?? '',
      contentEn: row.contentEn ?? '',
      status: row.status,
      articleType: row.articleType,
      difficulty: row.difficulty,
      estimatedReadingMinutes: row.estimatedReadingMinutes,
      allowedRoles: row.allowedRoles ?? ROLES.slice(),
      routePatterns: row.routePatterns ?? [],
      featureKey: row.featureKey ?? null,
      keywords: row.keywords ?? [],
      sortOrder: row.sortOrder,
      isFeatured: row.isFeatured,
      isContextual: row.isContextual,
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
      createdByUserId: row.createdByUserId ?? null,
      updatedByUserId: row.updatedByUserId ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async createArticle(input: HelpArticleInput, actorId: string): Promise<HelpArticleAdminDetailDto> {
    if (await this.dao.articleSlugCount(input.slug)) {
      throw new ConflictException(ERROR_CODES.CONFLICT);
    }
    const category = await this.dao.findCategoryById(input.categoryId);
    if (!category) {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }
    const row = await this.dao.insertArticle({
      categoryId: input.categoryId,
      titleAr: input.titleAr,
      titleEn: input.titleEn,
      slug: input.slug,
      summaryAr: input.summaryAr ?? null,
      summaryEn: input.summaryEn ?? null,
      contentAr: sanitizeHelpHtml(input.contentAr),
      contentEn: sanitizeHelpHtml(input.contentEn),
      status: input.status ?? 'DRAFT',
      articleType: input.articleType,
      difficulty: input.difficulty,
      estimatedReadingMinutes: input.estimatedReadingMinutes ?? this.estimateReadingMinutes(input.contentAr, input.contentEn),
      allowedRoles: input.allowedRoles ?? null,
      routePatterns: input.routePatterns ?? null,
      featureKey: input.featureKey ?? null,
      keywords: input.keywords ?? null,
      sortOrder: input.sortOrder ?? 0,
      isFeatured: input.isFeatured ?? false,
      isContextual: input.isContextual ?? true,
      publishedAt: input.status === 'PUBLISHED' ? new Date() : null,
      createdByUserId: actorId,
      updatedByUserId: actorId,
    });
    if (input.routePatterns?.length) {
      await this.dao.replaceLinks(row.id, []);
    }
    await this.auditService.record({
      actorUserId: actorId,
      action: AUDIT_ACTIONS.HELP_ARTICLE_CREATE,
      entityType: 'help_article',
      entityId: row.id,
      metadata: { slug: row.slug },
    });
    return this.toAdminDetail(row);
  }

  async updateArticle(id: string, input: HelpArticleInput, actorId: string): Promise<HelpArticleAdminDetailDto> {
    const existing = await this.dao.findArticleById(id);
    if (!existing) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    if (input.slug && (await this.dao.articleSlugCount(input.slug, id)) > 0) {
      throw new ConflictException(ERROR_CODES.CONFLICT);
    }

    const previousVersion = this.snapshot(existing);
    const patch: Partial<HelpArticleRow> = {
      categoryId: input.categoryId ?? existing.categoryId,
      titleAr: input.titleAr ?? existing.titleAr,
      titleEn: input.titleEn ?? existing.titleEn,
      slug: input.slug ?? existing.slug,
      summaryAr: input.summaryAr !== undefined ? input.summaryAr : existing.summaryAr,
      summaryEn: input.summaryEn !== undefined ? input.summaryEn : existing.summaryEn,
      contentAr: input.contentAr !== undefined ? sanitizeHelpHtml(input.contentAr) : existing.contentAr,
      contentEn: input.contentEn !== undefined ? sanitizeHelpHtml(input.contentEn) : existing.contentEn,
      articleType: input.articleType ?? existing.articleType,
      difficulty: input.difficulty ?? existing.difficulty,
      estimatedReadingMinutes:
        input.estimatedReadingMinutes ??
        (input.contentAr !== undefined || input.contentEn !== undefined
          ? this.estimateReadingMinutes(input.contentAr, input.contentEn)
          : existing.estimatedReadingMinutes),
      allowedRoles: input.allowedRoles !== undefined ? input.allowedRoles : existing.allowedRoles,
      routePatterns: input.routePatterns !== undefined ? input.routePatterns : existing.routePatterns,
      featureKey: input.featureKey !== undefined ? input.featureKey : existing.featureKey,
      keywords: input.keywords !== undefined ? input.keywords : existing.keywords,
      sortOrder: input.sortOrder ?? existing.sortOrder,
      isFeatured: input.isFeatured ?? existing.isFeatured,
      isContextual: input.isContextual ?? existing.isContextual,
      updatedByUserId: actorId,
    };
    if (input.status && input.status !== existing.status) {
      if (input.status === 'PUBLISHED') {
        patch.status = 'PUBLISHED';
        patch.publishedAt = existing.publishedAt ?? new Date();
        patch.archivedAt = null;
      } else if (input.status === 'ARCHIVED') {
        patch.status = 'ARCHIVED';
        patch.archivedAt = new Date();
      } else {
        patch.status = 'DRAFT';
        patch.archivedAt = null;
      }
    }
    const updated = (await this.dao.updateArticle(id, patch))!;
    await this.dao.insertChangeLog({
      articleId: id,
      changedByUserId: actorId,
      changeSummary: input.changeSummary ?? null,
      previousVersion,
      newVersion: this.snapshot(updated),
    });
    await this.auditService.record({
      actorUserId: actorId,
      action: AUDIT_ACTIONS.HELP_ARTICLE_UPDATE,
      entityType: 'help_article',
      entityId: id,
      metadata: { slug: updated.slug },
    });
    return this.toAdminDetail(updated);
  }

  async publishArticle(id: string, actorId: string): Promise<HelpArticleAdminDetailDto> {
    const existing = await this.dao.findArticleById(id);
    if (!existing) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    if (!existing.contentAr?.trim() && !existing.contentEn?.trim()) {
      throw new BadRequestException(ERROR_CODES.INVALID_OPERATION);
    }
    const previous = this.snapshot(existing);
    const updated = (await this.dao.updateArticle(id, {
      status: 'PUBLISHED',
      publishedAt: existing.publishedAt ?? new Date(),
      archivedAt: null,
      updatedByUserId: actorId,
    }))!;
    await this.dao.insertChangeLog({
      articleId: id,
      changedByUserId: actorId,
      changeSummary: 'Published',
      previousVersion: previous,
      newVersion: this.snapshot(updated),
    });
    await this.auditService.record({
      actorUserId: actorId,
      action: AUDIT_ACTIONS.HELP_ARTICLE_PUBLISH,
      entityType: 'help_article',
      entityId: id,
      metadata: { slug: updated.slug },
    });
    return this.toAdminDetail(updated);
  }

  async unpublishArticle(id: string, actorId: string): Promise<HelpArticleAdminDetailDto> {
    const existing = await this.dao.findArticleById(id);
    if (!existing) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    const previous = this.snapshot(existing);
    const updated = (await this.dao.updateArticle(id, {
      status: 'DRAFT',
      publishedAt: null,
      updatedByUserId: actorId,
    }))!;
    await this.dao.insertChangeLog({
      articleId: id,
      changedByUserId: actorId,
      changeSummary: 'Unpublished',
      previousVersion: previous,
      newVersion: this.snapshot(updated),
    });
    await this.auditService.record({
      actorUserId: actorId,
      action: AUDIT_ACTIONS.HELP_ARTICLE_UNPUBLISH,
      entityType: 'help_article',
      entityId: id,
      metadata: { slug: updated.slug },
    });
    return this.toAdminDetail(updated);
  }

  async duplicateArticle(id: string, actorId: string): Promise<HelpArticleAdminDetailDto> {
    const existing = await this.dao.findArticleById(id);
    if (!existing) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    const suffix = randomUUID().slice(0, 8);
    const slug = `${existing.slug}-copy-${suffix}`;
    const row = await this.dao.insertArticle({
      categoryId: existing.categoryId,
      titleAr: `${existing.titleAr} (copy)`,
      titleEn: `${existing.titleEn} (copy)`,
      slug,
      summaryAr: existing.summaryAr,
      summaryEn: existing.summaryEn,
      contentAr: existing.contentAr,
      contentEn: existing.contentEn,
      status: 'DRAFT',
      articleType: existing.articleType,
      difficulty: existing.difficulty,
      estimatedReadingMinutes: existing.estimatedReadingMinutes,
      allowedRoles: existing.allowedRoles,
      routePatterns: existing.routePatterns,
      featureKey: existing.featureKey,
      keywords: existing.keywords,
      sortOrder: existing.sortOrder,
      isFeatured: false,
      isContextual: existing.isContextual,
      publishedAt: null,
      createdByUserId: actorId,
      updatedByUserId: actorId,
    });
    await this.auditService.record({
      actorUserId: actorId,
      action: AUDIT_ACTIONS.HELP_ARTICLE_DUPLICATE,
      entityType: 'help_article',
      entityId: row.id,
      metadata: { sourceId: id },
    });
    return this.toAdminDetail(row);
  }

  async archiveArticle(id: string, actorId: string): Promise<HelpArticleAdminDetailDto> {
    const existing = await this.dao.findArticleById(id);
    if (!existing) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    const previous = this.snapshot(existing);
    const updated = (await this.dao.updateArticle(id, { status: 'ARCHIVED', archivedAt: new Date(), updatedByUserId: actorId }))!;
    await this.dao.insertChangeLog({
      articleId: id,
      changedByUserId: actorId,
      changeSummary: 'Archived',
      previousVersion: previous,
      newVersion: this.snapshot(updated),
    });
    await this.auditService.record({
      actorUserId: actorId,
      action: AUDIT_ACTIONS.HELP_ARTICLE_ARCHIVE,
      entityType: 'help_article',
      entityId: id,
      metadata: { slug: updated.slug },
    });
    return this.toAdminDetail(updated);
  }

  async listVersions(id: string): Promise<HelpVersionDto[]> {
    const logs = await this.dao.listChangeLogs(id);
    return logs.map((log) => ({
      id: log.id,
      articleId: log.articleId,
      changedByUserId: log.changedByUserId ?? null,
      changeSummary: log.changeSummary ?? null,
      createdAt: log.createdAt.toISOString(),
      titleAr: (log.newVersion as { titleAr?: string } | null)?.titleAr ?? null,
      titleEn: (log.newVersion as { titleEn?: string } | null)?.titleEn ?? null,
      contentAr: (log.newVersion as { contentAr?: string } | null)?.contentAr ?? null,
      contentEn: (log.newVersion as { contentEn?: string } | null)?.contentEn ?? null,
    }));
  }

  async restoreVersion(articleId: string, versionId: string, changeSummary: string | undefined, actorId: string): Promise<HelpArticleAdminDetailDto> {
    const existing = await this.dao.findArticleById(articleId);
    if (!existing) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    const log = await this.dao.findChangeLog(versionId);
    if (!log || log.articleId !== articleId) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    const previous = (log.previousVersion ?? log.newVersion ?? {}) as Record<string, unknown>;
    const slug = `${existing.slug}-restored-${randomUUID().slice(0, 6)}`;
    const row = await this.dao.insertArticle({
      categoryId: existing.categoryId,
      titleAr: String(previous.titleAr ?? existing.titleAr),
      titleEn: String(previous.titleEn ?? existing.titleEn),
      slug,
      summaryAr: (previous.summaryAr as string) ?? existing.summaryAr,
      summaryEn: (previous.summaryEn as string) ?? existing.summaryEn,
      contentAr: sanitizeHelpHtml((previous.contentAr as string) ?? existing.contentAr),
      contentEn: sanitizeHelpHtml((previous.contentEn as string) ?? existing.contentEn),
      status: 'DRAFT',
      articleType: existing.articleType,
      difficulty: existing.difficulty,
      estimatedReadingMinutes: existing.estimatedReadingMinutes,
      allowedRoles: existing.allowedRoles,
      routePatterns: existing.routePatterns,
      featureKey: existing.featureKey,
      keywords: existing.keywords,
      sortOrder: existing.sortOrder,
      isFeatured: false,
      isContextual: existing.isContextual,
      publishedAt: null,
      createdByUserId: actorId,
      updatedByUserId: actorId,
    });
    await this.dao.insertChangeLog({
      articleId: row.id,
      changedByUserId: actorId,
      changeSummary: changeSummary ?? `Restored from version ${versionId}`,
      previousVersion: null,
      newVersion: this.snapshot(row),
    });
    await this.auditService.record({
      actorUserId: actorId,
      action: AUDIT_ACTIONS.HELP_ARTICLE_RESTORE,
      entityType: 'help_article',
      entityId: row.id,
      metadata: { sourceId: articleId },
    });
    return this.toAdminDetail(row);
  }

  // ---------- Admin: feedback + analytics ----------

  async listFeedback(query: { articleId?: string; page: number; pageSize: number }): Promise<PaginatedHelpFeedback> {
    const { items, total } = await this.dao.listFeedback({
      articleId: query.articleId,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });
    return {
      items: items.map((item) => ({
        id: item.id,
        articleId: item.articleId,
        articleTitle: item.articleTitle,
        userId: item.userId,
        wasHelpful: item.wasHelpful,
        comment: item.comment,
        createdAt: item.createdAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    };
  }

  async getAnalytics(): Promise<HelpAnalyticsDto> {
    const [searchStats, topRows, worstRows, recentNoResults] = await Promise.all([
      this.dao.searchLogStats(),
      this.dao.topArticles(10),
      this.dao.worstArticles(10),
      this.dao.recentNoResultSearches(10),
    ]);

    const topIds = topRows.map((row) => row.articleId);
    const worstIds = worstRows.map((row) => row.articleId);
    const allIds = [...new Set([...topIds, ...worstIds])];

    const articles = allIds.length > 0 ? await this.dao.listArticles({ limit: allIds.length, offset: 0, includeArchived: true }) : { items: [] as ArticleWithCategory[] };
    const articleMap = new Map(articles.items.map((row) => [row.id, row]));
    const viewMap = await this.dao.countViewsByArticle(allIds);
    const [feedbackTotal] = await this.db
      .select({ value: count() })
      .from(helpArticleFeedback);

    const topArticles = topRows.map((row) => {
      const article = articleMap.get(row.articleId);
      return {
        articleId: row.articleId,
        title: article ? article.titleAr : '—',
        views: row.views,
        helpful: 0,
        notHelpful: 0,
        helpfulPercent: null,
      };
    });

    const worstArticles = worstRows.map((row) => {
      const article = articleMap.get(row.articleId);
      return {
        articleId: row.articleId,
        title: article ? article.titleAr : '—',
        views: viewMap.get(row.articleId) ?? 0,
        helpful: 0,
        notHelpful: row.notHelpful,
        helpfulPercent: 0,
      };
    });

    return {
      totalViews: topRows.reduce((sum, row) => sum + row.views, 0),
      totalFeedback: feedbackTotal?.value ?? 0,
      searchQueries: searchStats.total,
      noResultQueries: searchStats.noResults,
      topArticles,
      worstArticles,
      recentNoResultSearches: recentNoResults.map((row) => ({
        query: row.query,
        count: Number(row.count),
        lastAt: row.lastAt.toISOString(),
      })),
    };
  }

  // ---------- Helpers ----------

  private async loadWithCategory(article: HelpArticleRow): Promise<ArticleWithCategory> {
    const category = article.categoryId ? await this.dao.findCategoryById(article.categoryId) : undefined;
    return {
      ...article,
      categorySlug: category?.slug ?? '',
      categoryNameAr: category?.nameAr ?? '',
      categoryNameEn: category?.nameEn ?? '',
    };
  }

  private snapshot(row: HelpArticleRow): Record<string, unknown> {
    return {
      categoryId: row.categoryId,
      titleAr: row.titleAr,
      titleEn: row.titleEn,
      summaryAr: row.summaryAr,
      summaryEn: row.summaryEn,
      contentAr: row.contentAr,
      contentEn: row.contentEn,
      status: row.status,
      articleType: row.articleType,
      difficulty: row.difficulty,
      estimatedReadingMinutes: row.estimatedReadingMinutes,
      allowedRoles: row.allowedRoles,
      routePatterns: row.routePatterns,
      featureKey: row.featureKey,
      keywords: row.keywords,
      sortOrder: row.sortOrder,
      isFeatured: row.isFeatured,
      isContextual: row.isContextual,
    };
  }

  private estimateReadingMinutes(contentAr?: string | null, contentEn?: string | null): number {
    const text = `${contentAr ?? ''} ${contentEn ?? ''}`.replace(/<[^>]*>/g, ' ').trim();
    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.min(120, Math.round(words / 200)));
  }
}
