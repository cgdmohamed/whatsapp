import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';

import { HelpService, normalizeArabic } from '../src/modules/help/help.service';
import { sanitizeHelpHtml } from '../src/modules/help/help-sanitize';
import type { HelpDao, ArticleWithCategory } from '../src/modules/help/help.dao';
import type { HelpArticleRow, HelpCategoryRow } from '../src/db/schema';

function makeArticle(overrides: Partial<HelpArticleRow> = {}): ArticleWithCategory {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    categoryId: '22222222-2222-2222-2222-222222222222',
    titleAr: 'عنوان',
    titleEn: 'Title',
    slug: 'test-article',
    summaryAr: null,
    summaryEn: null,
    contentAr: '<p>محتوى</p>',
    contentEn: '<p>content</p>',
    status: 'PUBLISHED',
    articleType: 'OVERVIEW',
    difficulty: 'BASIC',
    estimatedReadingMinutes: 2,
    allowedRoles: null,
    routePatterns: ['/campaigns/:id'],
    featureKey: 'campaigns',
    keywords: ['campaign'],
    sortOrder: 0,
    isFeatured: false,
    isContextual: true,
    publishedAt: new Date('2026-01-01T00:00:00Z'),
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    archivedAt: null,
    categorySlug: 'campaigns',
    categoryNameAr: 'الحملات',
    categoryNameEn: 'Campaigns',
    ...overrides,
  };
}

function makeCategory(overrides: Partial<HelpCategoryRow> = {}): HelpCategoryRow {
  return {
    id: '22222222-2222-2222-2222-222222222222',
    parentCategoryId: null,
    nameAr: 'الحملات',
    nameEn: 'Campaigns',
    slug: 'campaigns',
    descriptionAr: null,
    descriptionEn: null,
    icon: null,
    sortOrder: 1,
    status: 'PUBLISHED',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    archivedAt: null,
    ...overrides,
  };
}

function buildService(daoOverrides: Partial<HelpDao> = {}) {
  const dao = {
    listCategories: jest.fn().mockResolvedValue([makeCategory()]),
    findCategoryBySlug: jest.fn().mockResolvedValue(makeCategory()),
    findCategoryById: jest.fn().mockResolvedValue(makeCategory()),
    countArticlesByCategory: jest.fn().mockResolvedValue(new Map([['22222222-2222-2222-2222-222222222222', 1]])),
    listArticles: jest.fn().mockResolvedValue({ items: [makeArticle()], total: 1 }),
    findArticleById: jest.fn().mockResolvedValue(makeArticle()),
    findArticleBySlug: jest.fn().mockResolvedValue(makeArticle()),
    insertArticle: jest.fn().mockImplementation((input) => Promise.resolve(makeArticle(input as never))),
    updateArticle: jest.fn().mockImplementation((_id, patch) => Promise.resolve(makeArticle(patch as never))),
    insertFeedback: jest.fn().mockResolvedValue(undefined),
    insertView: jest.fn().mockResolvedValue(undefined),
    insertChangeLog: jest.fn().mockResolvedValue(undefined),
    insertSearchLog: jest.fn().mockResolvedValue(undefined),
    listManualSteps: jest.fn().mockResolvedValue([]),
    getOnboardingHidden: jest.fn().mockResolvedValue(false),
    findContextualCandidates: jest.fn().mockResolvedValue([makeArticle()]),
    searchArticles: jest.fn().mockResolvedValue([{ ...makeArticle(), score: 50 }]),
    findLinkedArticles: jest.fn().mockResolvedValue([]),
    articleSlugCount: jest.fn().mockResolvedValue(0),
    categorySlugCount: jest.fn().mockResolvedValue(0),
    replaceLinks: jest.fn().mockResolvedValue(undefined),
    listChangeLogs: jest.fn().mockResolvedValue([]),
    findChangeLog: jest.fn().mockResolvedValue(undefined),
    ...daoOverrides,
  } as unknown as HelpDao;

  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn().mockReturnValue(undefined) };

  const service = new HelpService(dao, audit as never, config as never, {} as never);
  return { service, dao: dao as jest.Mocked<HelpDao>, audit };
}

describe('HelpService', () => {
  describe('normalizeArabic', () => {
    it('normalizes alef variants to plain alef', () => {
      expect(normalizeArabic('أحمد إبراهيم آدم')).toBe('احمد ابراهيم ادم');
    });
    it('strips diacritics', () => {
      expect(normalizeArabic('قَابِل')).toBe('قابل');
    });
    it('lowercases latin input', () => {
      expect(normalizeArabic('Campaign')).toBe('campaign');
    });
  });

  describe('route matching (context)', () => {
    it('matches dynamic route patterns and ranks exact routes higher', async () => {
      const { service, dao } = buildService();
      const paramArticle = makeArticle({ slug: 'param', routePatterns: ['/campaigns/:id'], sortOrder: 2 });
      const exactArticle = makeArticle({ id: '33333333-3333-3333-3333-333333333333', slug: 'exact', routePatterns: ['/campaigns'], sortOrder: 1 });
      dao.findContextualCandidates.mockResolvedValue([paramArticle, exactArticle]);

      const result = await service.getContext('/campaigns', 'campaigns', 'en', 'AGENT');
      expect(result.primary?.slug).toBe('exact');
      expect(result.related.map((r) => r.slug)).toContain('param');
    });

    it('matches a parameterized route like /campaigns/abc-123', async () => {
      const { service, dao } = buildService();
      dao.findContextualCandidates.mockResolvedValue([makeArticle({ routePatterns: ['/campaigns/:id'] })]);

      const result = await service.getContext('/campaigns/abc-123', undefined, 'en', 'AGENT');
      expect(result.primary?.slug).toBe('test-article');
    });

    it('returns null primary when nothing matches', async () => {
      const { service, dao } = buildService();
      dao.findContextualCandidates.mockResolvedValue([makeArticle({ routePatterns: ['/reports'] })]);

      const result = await service.getContext('/campaigns', 'other-feature', 'en', 'AGENT');
      expect(result.primary).toBeNull();
      expect(result.related).toHaveLength(0);
    });
  });

  describe('role-based access', () => {
    it('passes the current role to the context candidate query', async () => {
      const { service, dao } = buildService();
      dao.findContextualCandidates.mockResolvedValue([makeArticle({ routePatterns: ['/campaigns'], featureKey: 'campaigns' })]);

      const result = await service.getContext('/campaigns', 'campaigns', 'en', 'AGENT');
      expect(dao.findContextualCandidates).toHaveBeenCalledWith('AGENT');
      expect(result.primary?.slug).toBe('test-article');
    });

    it('throws NotFound for unpublished articles', async () => {
      const { service, dao } = buildService();
      dao.findArticleBySlug.mockResolvedValue(makeArticle({ status: 'DRAFT' }));
      await expect(service.getArticle('campaigns', 'test-article', 'en', 'AGENT', undefined)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('search', () => {
    it('passes a normalized term to the DAO and returns ranked results', async () => {
      const { service, dao } = buildService();
      const result = await service.search({ q: 'إحم د', language: 'ar', role: 'AGENT' }, 'user-1');
      expect(dao.searchArticles).toHaveBeenCalledWith(
        expect.objectContaining({ term: 'احم د', role: 'AGENT' }),
      );
      expect(result.noResults).toBe(false);
      expect(result.total).toBe(1);
      expect(dao.insertSearchLog).toHaveBeenCalledWith(expect.objectContaining({ resultCount: 1, userId: 'user-1' }));
    });

    it('marks searches without results', async () => {
      const { service, dao } = buildService();
      dao.searchArticles.mockResolvedValue([]);
      const result = await service.search({ q: 'zzzz', language: 'en' }, undefined);
      expect(result.noResults).toBe(true);
      expect(dao.insertSearchLog).toHaveBeenCalledWith(expect.objectContaining({ resultCount: 0 }));
    });
  });

  describe('feedback and views', () => {
    it('records feedback only for published articles', async () => {
      const { service, dao } = buildService();
      await service.recordFeedback({ articleId: '11111111-1111-1111-1111-111111111111', wasHelpful: true }, 'user-1');
      expect(dao.insertFeedback).toHaveBeenCalledWith(expect.objectContaining({ wasHelpful: true, userId: 'user-1' }));
    });

    it('ignores invalid uuids when recording views', async () => {
      const { service, dao } = buildService();
      await service.recordView('not-a-uuid', 'user-1', '/campaigns');
      expect(dao.insertView).not.toHaveBeenCalled();
    });
  });

  describe('admin article lifecycle', () => {
    it('publishes an article and records a change log', async () => {
      const { service, dao } = buildService();
      const result = await service.publishArticle('11111111-1111-1111-1111-111111111111', 'user-1');
      expect(result.status).toBe('PUBLISHED');
      expect(dao.insertChangeLog).toHaveBeenCalledWith(expect.objectContaining({ changeSummary: 'Published' }));
      expect(dao.updateArticle).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        expect.objectContaining({ status: 'PUBLISHED' }),
      );
    });

    it('rejects publishing an article without content', async () => {
      const { service, dao } = buildService();
      dao.findArticleById.mockResolvedValue(makeArticle({ contentAr: '', contentEn: '' }));
      await expect(service.publishArticle('11111111-1111-1111-1111-111111111111', 'user-1')).rejects.toThrow();
    });

    it('sanitizes content on create', async () => {
      const { service, dao } = buildService();
      await service.createArticle(
        {
          categoryId: '22222222-2222-2222-2222-222222222222',
          titleAr: 'أ',
          titleEn: 'a',
          slug: 'new',
          contentAr: '<p>ok</p><script>alert(1)</script>',
          contentEn: '<p>ok</p>',
          articleType: 'OVERVIEW',
          difficulty: 'BASIC',
        },
        'user-1',
      );
      const inserted = dao.insertArticle.mock.calls[0]?.[0] as { contentAr: string } | undefined;
      expect(inserted?.contentAr).not.toContain('<script>');
      expect(inserted?.contentAr).toContain('<p>ok</p>');
    });

    it('duplicates an article as a draft', async () => {
      const { service, dao } = buildService();
      dao.insertArticle.mockImplementation((input) => Promise.resolve(makeArticle({ ...(input as HelpArticleRow), status: 'DRAFT' })));
      const result = await service.duplicateArticle('11111111-1111-1111-1111-111111111111', 'user-1');
      expect(result.status).toBe('DRAFT');
      expect(result.slug).toContain('-copy-');
    });
  });
});

describe('sanitizeHelpHtml', () => {
  it('strips scripts and event handlers', () => {
    const out = sanitizeHelpHtml('<p>hello</p><script>alert(1)</script><img src="x" onerror="alert(1)">');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('onerror');
    expect(out).toContain('<p>hello</p>');
  });

  it('allows internal links and images', () => {
    const out = sanitizeHelpHtml('<a href="/campaigns">link</a><img src="https://x/y.png" alt="alt">');
    expect(out).toContain('href="/campaigns"');
    expect(out).toContain('<img');
  });

  it('rejects javascript: URLs', () => {
    const out = sanitizeHelpHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain('javascript:');
  });
});
