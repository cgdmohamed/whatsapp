import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DailySummarySettings, MailConfigDto, PaginatedEmailLogs, SaveMailConfigInput, SaveDailySummarySettingsInput } from '@wa/shared';

import { apiFetch } from '../../lib/api';

export const mailKeys = {
  all: ['mail'] as const,
  settings: ['mail', 'settings'] as const,
  logs: (status: string) => ['mail', 'logs', status] as const,
};

export function useMailSettings() {
  return useQuery({
    queryKey: mailKeys.settings,
    queryFn: () =>
      apiFetch<{ email: MailConfigDto; dailySummary: DailySummarySettings }>('/admin/email/settings'),
  });
}

export function useSaveMailSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveMailConfigInput) =>
      apiFetch<MailConfigDto>('/admin/email/settings', { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mailKeys.all }),
  });
}

export function useTestSmtpConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; error?: string }>('/admin/email/settings/test', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mailKeys.settings }),
  });
}

export function useSendTestEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ to, language }: { to: string; language: string }) =>
      apiFetch<{ queued: boolean; status: string }>('/admin/email/test', {
        method: 'POST',
        body: JSON.stringify({ to, language }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mailKeys.all }),
  });
}

export function useEmailLogs(status = 'FAILED') {
  return useQuery({
    queryKey: mailKeys.logs(status),
    queryFn: () => apiFetch<PaginatedEmailLogs>(`/admin/email/logs?status=${status}&page=1&pageSize=50`),
  });
}

export function useRetryEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ queued: boolean }>(`/admin/email/logs/${id}/retry`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mailKeys.all }),
  });
}

export function useSaveDailySummary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveDailySummarySettingsInput) =>
      apiFetch<DailySummarySettings>('/admin/email/daily-summary', { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mailKeys.settings }),
  });
}
