import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuditLogQuery,
  CampaignPerformanceQuery,
  ContactBreakdownDto,
  ContactReportQuery,
  CreateExportInput,
  DashboardQuery,
  DashboardSummaryDto,
  DashboardTrendsDto,
  ExportJobDto,
  ExportQuery,
  FailureAnalysisDto,
  FailureAnalysisQuery,
  InboxPerformanceQuery,
  PaginatedAuditLogs,
  PaginatedCampaignPerformance,
  PaginatedContactReport,
  PaginatedExports,
  PaginatedInboxPerformance,
  QueueOperationInput,
  QueueOperationResultDto,
  SystemStatusDto,
} from '@wa/shared';

import { apiFetch } from '../../lib/api';
import { API_URL } from '../../lib/config';

export const reportsKeys = {
  all: ['reports'] as const,
  summary: (query: DashboardQuery) => [...reportsKeys.all, 'summary', query] as const,
  trends: (query: DashboardQuery) => [...reportsKeys.all, 'trends', query] as const,
  campaignPerformance: (query: CampaignPerformanceQuery) => [...reportsKeys.all, 'campaign-performance', query] as const,
  failureAnalysis: (query: FailureAnalysisQuery) => [...reportsKeys.all, 'failure-analysis', query] as const,
  inboxPerformance: (query: InboxPerformanceQuery) => [...reportsKeys.all, 'inbox-performance', query] as const,
  contactReport: (query: ContactReportQuery) => [...reportsKeys.all, 'contact-report', query] as const,
  contactBreakdown: () => [...reportsKeys.all, 'contact-breakdown'] as const,
  exports: (query: ExportQuery) => [...reportsKeys.all, 'exports', query] as const,
  auditLogs: (query: AuditLogQuery) => ['audit-logs', query] as const,
  operationsStatus: () => ['operations', 'status'] as const,
};

function toQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

const EXPORT_IN_PROGRESS = ['PENDING', 'RUNNING'] as const;

export function useDashboardSummary(query: DashboardQuery) {
  return useQuery({
    queryKey: reportsKeys.summary(query),
    queryFn: () => apiFetch<DashboardSummaryDto>(`/reports/dashboard-summary?${toQueryString(query)}`),
  });
}

export function useDashboardTrends(query: DashboardQuery) {
  return useQuery({
    queryKey: reportsKeys.trends(query),
    queryFn: () => apiFetch<DashboardTrendsDto>(`/reports/dashboard-trends?${toQueryString(query)}`),
  });
}

export function useCampaignPerformance(query: CampaignPerformanceQuery) {
  return useQuery({
    queryKey: reportsKeys.campaignPerformance(query),
    queryFn: () => apiFetch<PaginatedCampaignPerformance>(`/reports/campaign-performance?${toQueryString(query)}`),
  });
}

export function useFailureAnalysis(query: FailureAnalysisQuery) {
  return useQuery({
    queryKey: reportsKeys.failureAnalysis(query),
    queryFn: () => apiFetch<FailureAnalysisDto>(`/reports/failure-analysis?${toQueryString(query)}`),
  });
}

export function useInboxPerformance(query: InboxPerformanceQuery) {
  return useQuery({
    queryKey: reportsKeys.inboxPerformance(query),
    queryFn: () => apiFetch<PaginatedInboxPerformance>(`/reports/inbox-performance?${toQueryString(query)}`),
  });
}

export function useContactReport(query: ContactReportQuery) {
  return useQuery({
    queryKey: reportsKeys.contactReport(query),
    queryFn: () => apiFetch<PaginatedContactReport>(`/reports/contact-report?${toQueryString(query)}`),
  });
}

export function useContactBreakdown() {
  return useQuery({
    queryKey: reportsKeys.contactBreakdown(),
    queryFn: () => apiFetch<ContactBreakdownDto>('/reports/contact-breakdown'),
  });
}

export function useExports(query: ExportQuery) {
  return useQuery({
    queryKey: reportsKeys.exports(query),
    queryFn: () => apiFetch<PaginatedExports>(`/reports/exports?${toQueryString(query)}`),
    refetchInterval: (current) =>
      (current.state.data?.items ?? []).some((job) => (EXPORT_IN_PROGRESS as readonly string[]).includes(job.status))
        ? 3000
        : false,
  });
}

export function useCreateExport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExportInput) => apiFetch<ExportJobDto>('/reports/exports', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reportsKeys.all }),
  });
}

export function useDownloadExport() {
  return useMutation({
    mutationFn: async (id: string) => {
      const base = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
      const response = await fetch(`${base}/reports/exports/${id}/download`, { method: 'GET', credentials: 'include' });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
        const message = body?.message;
        throw new Error(Array.isArray(message) ? message.join('\n') : (message ?? 'Download failed'));
      }
      return response.blob();
    },
  });
}

export function useAuditLogs(query: AuditLogQuery) {
  return useQuery({
    queryKey: reportsKeys.auditLogs(query),
    queryFn: () => apiFetch<PaginatedAuditLogs>(`/audit-logs?${toQueryString(query)}`),
  });
}

export function useOperationsStatus() {
  return useQuery({
    queryKey: reportsKeys.operationsStatus(),
    queryFn: () => apiFetch<SystemStatusDto>('/operations/status'),
    refetchInterval: 15_000,
  });
}

export function useRetryFailed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: QueueOperationInput) => apiFetch<QueueOperationResultDto>('/operations/retry-failed', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reportsKeys.operationsStatus() }),
  });
}

export function useDrainFailed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: QueueOperationInput) => apiFetch<QueueOperationResultDto>('/operations/drain-failed', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reportsKeys.operationsStatus() }),
  });
}
