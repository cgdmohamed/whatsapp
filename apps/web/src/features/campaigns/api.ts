import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CampaignDto,
  CampaignQuery,
  CampaignRecipientQuery,
  CreateCampaignInput,
  PaginatedCampaignRecipients,
  PaginatedCampaigns,
  PreflightReport,
  TestSendInput,
  TestSendResult,
  UpdateCampaignInput,
} from '@wa/shared';

import { apiFetch } from '../../lib/api';
import { API_URL } from '../../lib/config';

export const campaignKeys = {
  all: ['campaigns'] as const,
  list: (query: CampaignQuery) => ['campaigns', 'list', query] as const,
  detail: (id: string) => ['campaigns', 'detail', id] as const,
  recipients: (id: string, query: CampaignRecipientQuery) => ['campaigns', 'recipients', id, query] as const,
  metrics: (id: string) => ['campaigns', 'metrics', id] as const,
};

function buildCampaignQuery(query: CampaignQuery): string {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  if (query.search) {
    params.set('search', query.search);
  }
  if (query.status) {
    params.set('status', query.status);
  }
  if (query.templateId) {
    params.set('templateId', query.templateId);
  }
  if (query.createdByUserId) {
    params.set('createdByUserId', query.createdByUserId);
  }
  if (query.createdFrom) {
    params.set('createdFrom', query.createdFrom);
  }
  if (query.createdTo) {
    params.set('createdTo', query.createdTo);
  }
  params.set('sortBy', query.sortBy);
  params.set('sortOrder', query.sortOrder);
  return params.toString();
}

function buildRecipientQuery(query: CampaignRecipientQuery): string {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  if (query.status) {
    params.set('status', query.status);
  }
  if (query.failureCode) {
    params.set('failureCode', query.failureCode);
  }
  if (query.search) {
    params.set('search', query.search);
  }
  params.set('sortBy', query.sortBy);
  params.set('sortOrder', query.sortOrder);
  return params.toString();
}

export function useCampaigns(query: CampaignQuery) {
  return useQuery({
    queryKey: campaignKeys.list(query),
    queryFn: () => apiFetch<PaginatedCampaigns>(`/campaigns?${buildCampaignQuery(query)}`),
  });
}

export function useCampaign(id: string | null) {
  return useQuery({
    queryKey: campaignKeys.detail(id ?? ''),
    queryFn: () => apiFetch<CampaignDto>(`/campaigns/${id}`),
    enabled: id !== null,
  });
}

export function useCampaignRecipients(id: string, query: CampaignRecipientQuery) {
  return useQuery({
    queryKey: campaignKeys.recipients(id, query),
    queryFn: () => apiFetch<PaginatedCampaignRecipients>(`/campaigns/${id}/recipients?${buildRecipientQuery(query)}`),
  });
}

export function useCampaignMetrics(id: string | null) {
  return useQuery({
    queryKey: campaignKeys.metrics(id ?? ''),
    queryFn: () => apiFetch<Record<string, number>>(`/campaigns/${id}/metrics`),
    enabled: id !== null,
    refetchInterval: 15_000,
  });
}

function invalidateCampaigns(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: ['campaigns'] });
  if (id) {
    queryClient.invalidateQueries({ queryKey: ['campaigns', 'detail', id] });
    queryClient.invalidateQueries({ queryKey: ['campaigns', 'metrics', id] });
  }
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCampaignInput) =>
      apiFetch<CampaignDto>('/campaigns', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => invalidateCampaigns(queryClient),
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCampaignInput }) =>
      apiFetch<CampaignDto>(`/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: (_data, variables) => invalidateCampaigns(queryClient, variables.id),
  });
}

export function useValidateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<PreflightReport>(`/campaigns/${id}/validate`, { method: 'POST' }),
    onSuccess: (_data, id) => invalidateCampaigns(queryClient, id),
  });
}

export function useScheduleCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt: string }) =>
      apiFetch<CampaignDto>(`/campaigns/${id}/schedule`, { method: 'POST', body: JSON.stringify({ scheduledAt }) }),
    onSuccess: (_data, variables) => invalidateCampaigns(queryClient, variables.id),
  });
}

export function useCampaignAction(action: 'start' | 'pause' | 'resume' | 'cancel' | 'duplicate' | 'archive') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<CampaignDto>(`/campaigns/${id}/${action}`, { method: 'POST' }),
    onSuccess: (_data, id) => invalidateCampaigns(queryClient, id),
  });
}

export function useTestSend() {
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TestSendInput }) =>
      apiFetch<TestSendResult[]>(`/campaigns/${id}/test-send`, { method: 'POST', body: JSON.stringify(input) }),
  });
}

export function useRecipientsCsv() {
  return useMutation({
    mutationFn: async (id: string) => {
      const base = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
      const response = await fetch(`${base}/campaigns/${id}/recipients.csv`, { method: 'GET', credentials: 'include' });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
        const message = body?.message;
        throw new Error(Array.isArray(message) ? message.join('\n') : (message ?? 'Download failed'));
      }
      return response.blob();
    },
  });
}