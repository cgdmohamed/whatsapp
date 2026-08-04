import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ConfigureImportInput,
  ImportJobDetailDto,
  ImportJobDto,
  ImportJobQuery,
  ImportUploadDto,
  ImportValidationSummaryDto,
  PaginatedImportJobs,
} from '@wa/shared';

import { apiFetch } from '../../lib/api';
import { API_URL } from '../../lib/config';

export const importsKeys = {
  all: ['imports'] as const,
  list: (query: ImportJobQuery) => [...importsKeys.all, 'list', query] as const,
  detail: (id: string) => [...importsKeys.all, 'detail', id] as const,
};

export interface ImportUploadFile {
  file: File;
}

function buildImportQuery(query: ImportJobQuery): string {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  if (query.status) {
    params.set('status', query.status);
  }
  return params.toString();
}

const IN_PROGRESS = ['VALIDATING', 'PROCESSING'] as const;

export function useImportJobs(query: ImportJobQuery) {
  return useQuery({
    queryKey: importsKeys.list(query),
    queryFn: () => apiFetch<PaginatedImportJobs>(`/imports?${buildImportQuery(query)}`),
    refetchInterval: (current) =>
      (current.state.data?.items ?? []).some((job) => (IN_PROGRESS as readonly string[]).includes(job.status))
        ? 3000
        : false,
  });
}

export function useImportDetail(id: string | null) {
  return useQuery({
    queryKey: importsKeys.detail(id ?? ''),
    queryFn: () => apiFetch<ImportJobDetailDto>(`/imports/${id}`),
    enabled: id !== null,
  });
}

export function useUploadImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file }: ImportUploadFile) => {
      const base = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${base}/imports/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
        const message = body?.message;
        const text = Array.isArray(message) ? message.join('\n') : (message ?? `Request failed with status ${response.status}`);
        throw new Error(text);
      }
      return (await response.json()) as ImportUploadDto;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: importsKeys.all }),
  });
}

export function useConfigureImport() {
  return useMutation({
    mutationFn: ({ jobId, input }: { jobId: string; input: ConfigureImportInput }) =>
      apiFetch<ImportValidationSummaryDto>(`/imports/${jobId}/configure`, { method: 'POST', body: JSON.stringify(input) }),
  });
}

export function useStartImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => apiFetch<ImportJobDto>(`/imports/${jobId}/start`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: importsKeys.all }),
  });
}

export function useDeleteImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) =>
      apiFetch<{ deletedRows: number; deletedContacts: number }>(`/imports/${jobId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: importsKeys.all }),
  });
}

export function useImportRejectedCsv() {
  return useMutation({
    mutationFn: async (jobId: string) => {
      const base = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
      const response = await fetch(`${base}/imports/${jobId}/rejected`, { method: 'GET', credentials: 'include' });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
        const message = body?.message;
        throw new Error(Array.isArray(message) ? message.join('\n') : (message ?? 'Download failed'));
      }
      return response.blob();
    },
  });
}
