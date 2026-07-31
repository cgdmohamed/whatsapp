import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateMessageTemplateInput,
  MessageTemplateDto,
  MessageTemplateQuery,
  PaginatedMessageTemplates,
  TemplateCreateResultDto,
  TemplatePreviewDto,
  TemplatePreviewInput,
  TemplateSyncResultDto,
  TemplateSyncStatusDto,
} from '@wa/shared';

import { apiFetch } from '../../lib/api';
import { whatsappKeys } from './api';

export const templatesKeys = {
  all: ['whatsapp', 'templates'] as const,
  list: (query: MessageTemplateQuery) => ['whatsapp', 'templates', 'list', query] as const,
  detail: (id: string) => ['whatsapp', 'templates', 'detail', id] as const,
  syncStatus: ['whatsapp', 'templates', 'sync-status'] as const,
};

function buildTemplateQuery(query: MessageTemplateQuery): string {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  if (query.search) {
    params.set('search', query.search);
  }
  if (query.category) {
    params.set('category', query.category);
  }
  if (query.status) {
    params.set('status', query.status);
  }
  if (query.language) {
    params.set('language', query.language);
  }
  params.set('sortBy', query.sortBy);
  params.set('sortOrder', query.sortOrder);
  return params.toString();
}

export function useMessageTemplates(query: MessageTemplateQuery) {
  return useQuery({
    queryKey: templatesKeys.list(query),
    queryFn: () => apiFetch<PaginatedMessageTemplates>(`/whatsapp/templates?${buildTemplateQuery(query)}`),
  });
}

export function useTemplateDetail(id: string | null) {
  return useQuery({
    queryKey: templatesKeys.detail(id ?? ''),
    queryFn: () => apiFetch<MessageTemplateDto>(`/whatsapp/templates/${id}`),
    enabled: id !== null,
  });
}

export function useTemplateSyncStatus() {
  return useQuery({
    queryKey: templatesKeys.syncStatus,
    queryFn: () => apiFetch<TemplateSyncStatusDto>('/whatsapp/templates/sync-status'),
  });
}

export function useSyncTemplates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<TemplateSyncResultDto>('/whatsapp/templates/sync', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: templatesKeys.all });
      queryClient.invalidateQueries({ queryKey: whatsappKeys.status });
    },
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMessageTemplateInput) =>
      apiFetch<TemplateCreateResultDto>('/whatsapp/templates', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templatesKeys.all }),
  });
}

export function useTemplatePreview() {
  return useMutation({
    mutationFn: (input: TemplatePreviewInput) =>
      apiFetch<TemplatePreviewDto>('/whatsapp/templates/preview', { method: 'POST', body: JSON.stringify(input) }),
  });
}