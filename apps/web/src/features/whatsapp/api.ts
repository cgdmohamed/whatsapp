import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  PaginatedWebhookEvents,
  ReplaceTokenInput,
  WebhookEventDetailDto,
  WebhookEventsQuery,
  WhatsAppCredentialsInput,
  WhatsAppStatusDto,
} from '@wa/shared';

import { apiFetch } from '../../lib/api';

export const whatsappKeys = {
  all: ['whatsapp'] as const,
  status: ['whatsapp', 'status'] as const,
  webhookEvents: (query: WebhookEventsQuery) => ['whatsapp', 'webhook-events', query] as const,
  webhookEventDetail: (id: string) => ['whatsapp', 'webhook-events', id] as const,
};

export function useWhatsAppStatus() {
  return useQuery({
    queryKey: whatsappKeys.status,
    queryFn: () => apiFetch<WhatsAppStatusDto>('/whatsapp'),
    refetchInterval: 60_000,
  });
}

export function useSaveWhatsAppCredentials() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WhatsAppCredentialsInput) =>
      apiFetch<WhatsAppStatusDto>('/whatsapp/credentials', { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: (status) => {
      queryClient.setQueryData(whatsappKeys.status, status);
      queryClient.invalidateQueries({ queryKey: whatsappKeys.status });
    },
  });
}

export function useReplaceWhatsAppToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReplaceTokenInput) =>
      apiFetch<WhatsAppStatusDto>('/whatsapp/token', { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: (status) => {
      queryClient.setQueryData(whatsappKeys.status, status);
      queryClient.invalidateQueries({ queryKey: whatsappKeys.status });
    },
  });
}

export function useTestWhatsAppConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<WhatsAppStatusDto>('/whatsapp/test-connection', { method: 'POST' }),
    onSuccess: (status) => queryClient.setQueryData(whatsappKeys.status, status),
  });
}

export function useSyncWhatsAppAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<WhatsAppStatusDto>('/whatsapp/sync', { method: 'POST' }),
    onSuccess: (status) => {
      queryClient.setQueryData(whatsappKeys.status, status);
      queryClient.invalidateQueries({ queryKey: whatsappKeys.status });
    },
  });
}

export function useDisconnectWhatsApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<WhatsAppStatusDto>('/whatsapp/disconnect', { method: 'POST' }),
    onSuccess: (status) => queryClient.setQueryData(whatsappKeys.status, status),
  });
}

export function useWebhookEvents(query: WebhookEventsQuery) {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  if (query.eventType) {
    params.set('eventType', query.eventType);
  }
  if (query.status) {
    params.set('status', query.status);
  }
  return useQuery({
    queryKey: whatsappKeys.webhookEvents(query),
    queryFn: () => apiFetch<PaginatedWebhookEvents>(`/integration-logs/webhooks?${params.toString()}`),
  });
}

export function useWebhookEventDetail(id: string | null) {
  return useQuery({
    queryKey: whatsappKeys.webhookEventDetail(id ?? ''),
    queryFn: () => apiFetch<WebhookEventDetailDto>(`/integration-logs/webhooks/${id}`),
    enabled: id !== null,
  });
}
