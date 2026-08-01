import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  HelpAnalyticsDto,
  HelpArticleAdminDetailDto,
  HelpArticleDetailDto,
  HelpArticleInput,
  HelpCategoryDto,
  HelpCategoryInput,
  HelpContextDto,
  HelpOnboardingDto,
  HelpVersionDto,
  PaginatedHelpArticles,
  PaginatedHelpFeedback,
  HelpSearchResponseDto,
  HelpArticleSummaryDto,
} from '@wa/shared';

import { apiFetch } from '../../lib/api';

export const helpKeys = {
  all: ['help'] as const,
  categories: ['help', 'categories'] as const,
  articles: (query: string) => ['help', 'articles', query] as const,
  context: (route: string, featureKey: string | undefined) => ['help', 'context', route, featureKey] as const,
  search: (query: string) => ['help', 'search', query] as const,
  detail: (categorySlug: string, articleSlug: string) => ['help', 'article', categorySlug, articleSlug] as const,
  onboarding: ['help', 'onboarding'] as const,
};

export const helpAdminKeys = {
  all: ['admin', 'help'] as const,
  categories: ['admin', 'help', 'categories'] as const,
  articles: (query: string) => ['admin', 'help', 'articles', query] as const,
  detail: (id: string) => ['admin', 'help', 'articles', id] as const,
  versions: (id: string) => ['admin', 'help', 'versions', id] as const,
  feedback: (query: string) => ['admin', 'help', 'feedback', query] as const,
  analytics: ['admin', 'help', 'analytics'] as const,
};

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

// ---------- Public ----------

export function useHelpCategories() {
  return useQuery({ queryKey: helpKeys.categories, queryFn: () => apiFetch<HelpCategoryDto[]>('/help/categories') });
}

export function useHelpArticles(query: { categorySlug?: string; page?: number; pageSize?: number; language?: string }) {
  const key = buildQuery({ ...query, language: query.language ?? undefined });
  return useQuery({
    queryKey: helpKeys.articles(key),
    queryFn: () => apiFetch<PaginatedHelpArticles>(`/help/articles?${key}`),
  });
}

export function useHelpContext(route: string, featureKey?: string, language: string = 'ar') {
  const key = buildQuery({ route, featureKey, language });
  return useQuery({
    queryKey: helpKeys.context(route, featureKey),
    queryFn: () => apiFetch<HelpContextDto>(`/help/context?${key}`),
    enabled: route.length > 0,
  });
}

export function useHelpSearch(q: string, language: string) {
  const key = buildQuery({ q, language });
  return useQuery({
    queryKey: helpKeys.search(key),
    queryFn: () => apiFetch<HelpSearchResponseDto>(`/help/search?${key}`),
    enabled: q.trim().length > 0,
  });
}

export function useHelpArticle(categorySlug: string, articleSlug: string, language: string) {
  const params = buildQuery({ language, route: window.location.pathname });
  return useQuery({
    queryKey: helpKeys.detail(categorySlug, articleSlug),
    queryFn: () => apiFetch<HelpArticleDetailDto>(`/help/articles/${categorySlug}/${articleSlug}?${params}`),
  });
}

export function useRecordHelpView() {
  return useMutation({
    mutationFn: ({ id, route }: { id: string; route?: string }) =>
      apiFetch<void>(`/help/articles/${id}/view`, { method: 'POST', body: JSON.stringify({ route }) }),
  });
}

export function useHelpFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ articleId, wasHelpful, comment }: { articleId: string; wasHelpful: boolean; comment?: string }) =>
      apiFetch<void>(`/help/articles/${articleId}/feedback`, { method: 'POST', body: JSON.stringify({ articleId, wasHelpful, comment }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: helpKeys.all });
    },
  });
}

// ---------- Onboarding ----------

export function useOnboarding() {
  return useQuery({ queryKey: helpKeys.onboarding, queryFn: () => apiFetch<HelpOnboardingDto>('/help/onboarding') });
}

export function useToggleOnboardingStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, completed }: { key: string; completed: boolean }) =>
      apiFetch<void>('/help/onboarding/toggle', { method: 'POST', body: JSON.stringify({ key, completed }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: helpKeys.onboarding }),
  });
}

export function useSetOnboardingVisibility() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hidden: boolean) => apiFetch<void>('/help/onboarding/visibility', { method: 'POST', body: JSON.stringify({ hidden }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: helpKeys.onboarding }),
  });
}

// ---------- Admin ----------

export function useAdminHelpCategories() {
  return useQuery({ queryKey: helpAdminKeys.categories, queryFn: () => apiFetch<HelpCategoryDto[]>('/admin/help/categories') });
}

export function useAdminHelpArticles(query: { page?: number; pageSize?: number; status?: string; language?: string; includeArchived?: boolean }) {
  const key = buildQuery({ ...query, language: query.language ?? undefined });
  return useQuery({
    queryKey: helpAdminKeys.articles(key),
    queryFn: () => apiFetch<PaginatedHelpArticles>(`/admin/help/articles?${key}`),
  });
}

export function useAdminHelpArticle(id: string | null) {
  return useQuery({
    queryKey: helpAdminKeys.detail(id ?? ''),
    queryFn: () => apiFetch<HelpArticleAdminDetailDto>(`/admin/help/articles/${id}`),
    enabled: id !== null,
  });
}

export function useAdminHelpVersions(id: string) {
  return useQuery({ queryKey: helpAdminKeys.versions(id), queryFn: () => apiFetch<HelpVersionDto[]>(`/admin/help/articles/${id}/versions`) });
}

export function useAdminHelpFeedback(query: { page?: number; pageSize?: number }) {
  const key = buildQuery(query);
  return useQuery({
    queryKey: helpAdminKeys.feedback(key),
    queryFn: () => apiFetch<PaginatedHelpFeedback>(`/admin/help/feedback?${key}`),
  });
}

export function useAdminHelpAnalytics() {
  return useQuery({ queryKey: helpAdminKeys.analytics, queryFn: () => apiFetch<HelpAnalyticsDto>('/admin/help/analytics') });
}

export function useCreateHelpCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: HelpCategoryInput) => apiFetch<HelpCategoryDto>('/admin/help/categories', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: helpAdminKeys.categories });
      queryClient.invalidateQueries({ queryKey: helpKeys.categories });
    },
  });
}

export function useUpdateHelpCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: HelpCategoryInput }) =>
      apiFetch<HelpCategoryDto>(`/admin/help/categories/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: helpAdminKeys.categories });
      queryClient.invalidateQueries({ queryKey: helpKeys.categories });
    },
  });
}

export function useArchiveHelpCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<HelpCategoryDto>(`/admin/help/categories/${id}/archive`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: helpAdminKeys.categories });
      queryClient.invalidateQueries({ queryKey: helpKeys.categories });
    },
  });
}

export function useCreateHelpArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: HelpArticleInput) => apiFetch<HelpArticleAdminDetailDto>('/admin/help/articles', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: helpAdminKeys.all });
      queryClient.invalidateQueries({ queryKey: helpKeys.all });
    },
  });
}

export function useUpdateHelpArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: HelpArticleInput }) =>
      apiFetch<HelpArticleAdminDetailDto>(`/admin/help/articles/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: helpAdminKeys.all });
      queryClient.invalidateQueries({ queryKey: helpKeys.all });
    },
  });
}

export function usePublishHelpArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<HelpArticleAdminDetailDto>(`/admin/help/articles/${id}/publish`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: helpAdminKeys.all });
      queryClient.invalidateQueries({ queryKey: helpKeys.all });
    },
  });
}

export function useUnpublishHelpArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<HelpArticleAdminDetailDto>(`/admin/help/articles/${id}/unpublish`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: helpAdminKeys.all });
      queryClient.invalidateQueries({ queryKey: helpKeys.all });
    },
  });
}

export function useDuplicateHelpArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<HelpArticleAdminDetailDto>(`/admin/help/articles/${id}/duplicate`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: helpAdminKeys.all }),
  });
}

export function useArchiveHelpArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<HelpArticleAdminDetailDto>(`/admin/help/articles/${id}/archive`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: helpAdminKeys.all });
      queryClient.invalidateQueries({ queryKey: helpKeys.all });
    },
  });
}

export function useRestoreHelpVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ articleId, versionId }: { articleId: string; versionId: string }) =>
      apiFetch<HelpArticleAdminDetailDto>(`/admin/help/articles/${articleId}/restore-version`, {
        method: 'POST',
        body: JSON.stringify({ versionId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: helpAdminKeys.all });
      queryClient.invalidateQueries({ queryKey: helpKeys.all });
    },
  });
}

export type { HelpArticleSummaryDto, HelpArticleDetailDto };
