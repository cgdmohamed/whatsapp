import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AgentCostReport,
  BudgetOverrideInput,
  BudgetPolicyCreateInput,
  BudgetPolicyDto,
  BudgetPolicyList,
  BudgetPolicyQuery,
  BudgetPolicyUpdateInput,
  BudgetUsage,
  ConversationCostReport,
  CostReconciliationDetail,
  CostReconciliationJobDto,
  CostReconciliationQuery,
  CostReconciliationUploadResult,
  CostReconciliationValidationSummary,
  CreateExportInput,
  ExportJobDto,
  PaginatedCostReconciliations,
  PricingCoverage,
  PricingImportPreview,
  PricingRuleList,
  PricingRuleQuery,
  PricingRuleSetCreateInput,
  PricingRuleSetDto,
  PricingRuleSetUpdateInput,
  RoiReport,
  WhatsappCostsQuery,
  WhatsappCostsReport,
} from '@wa/shared';

import { apiFetch } from '../../lib/api';
import { API_URL } from '../../lib/config';

export const pricingKeys = {
  all: ['pricing'] as const,
  ruleSets: (query: PricingRuleQuery) => [...pricingKeys.all, 'rule-sets', query] as const,
  ruleSet: (id: string) => [...pricingKeys.all, 'rule-sets', id] as const,
  coverage: () => [...pricingKeys.all, 'coverage'] as const,
  budgets: (query: BudgetPolicyQuery) => [...pricingKeys.all, 'budgets', query] as const,
  budget: (id: string) => [...pricingKeys.all, 'budgets', id] as const,
  budgetUsage: (id: string) => [...pricingKeys.all, 'budgets', id, 'usage'] as const,
  budgetOverrides: (id: string) => [...pricingKeys.all, 'budgets', id, 'overrides'] as const,
  reconciliations: (query: CostReconciliationQuery) => [...pricingKeys.all, 'reconciliations', query] as const,
  reconciliation: (id: string) => [...pricingKeys.all, 'reconciliations', id] as const,
  whatsappCosts: (query: WhatsappCostsQuery) => [...pricingKeys.all, 'reports', 'whatsapp-costs', query] as const,
  conversationCosts: (query: WhatsappCostsQuery) => [...pricingKeys.all, 'reports', 'conversation-costs', query] as const,
  agentCosts: (query: WhatsappCostsQuery) => [...pricingKeys.all, 'reports', 'agent-costs', query] as const,
  roi: (query: WhatsappCostsQuery) => [...pricingKeys.all, 'reports', 'roi', query] as const,
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

// ---------- Pricing rule sets ----------

export function usePricingRuleSets(query: PricingRuleQuery) {
  return useQuery({
    queryKey: pricingKeys.ruleSets(query),
    queryFn: () => apiFetch<PricingRuleList>(`/admin/whatsapp-pricing/rule-sets?${toQueryString(query)}`),
  });
}

export function usePricingRuleSet(id: string | null) {
  return useQuery({
    queryKey: pricingKeys.ruleSet(id ?? ''),
    queryFn: () => apiFetch<PricingRuleSetDto>(`/admin/whatsapp-pricing/rule-sets/${id}`),
    enabled: id !== null,
  });
}

export function usePricingCoverage() {
  return useQuery({
    queryKey: pricingKeys.coverage(),
    queryFn: () => apiFetch<PricingCoverage>('/admin/whatsapp-pricing/coverage'),
  });
}

function invalidateRuleSets(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: pricingKeys.all });
}

export function useCreatePricingRuleSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PricingRuleSetCreateInput) =>
      apiFetch<PricingRuleSetDto>('/admin/whatsapp-pricing/rule-sets', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => invalidateRuleSets(queryClient),
  });
}

export function useUpdatePricingRuleSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; update: PricingRuleSetUpdateInput }) =>
      apiFetch<PricingRuleSetDto>(`/admin/whatsapp-pricing/rule-sets/${input.id}`, { method: 'PATCH', body: JSON.stringify(input.update) }),
    onSuccess: () => invalidateRuleSets(queryClient),
  });
}

export function useDuplicatePricingRuleSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<PricingRuleSetDto>(`/admin/whatsapp-pricing/rule-sets/${id}/duplicate`, { method: 'POST' }),
    onSuccess: () => invalidateRuleSets(queryClient),
  });
}

export function useValidatePricingRuleSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<PricingRuleSetDto>(`/admin/whatsapp-pricing/rule-sets/${id}/validate`, { method: 'POST' }),
    onSuccess: () => invalidateRuleSets(queryClient),
  });
}

export function useActivatePricingRuleSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<PricingRuleSetDto>(`/admin/whatsapp-pricing/rule-sets/${id}/activate`, { method: 'POST' }),
    onSuccess: () => invalidateRuleSets(queryClient),
  });
}

export function useArchivePricingRuleSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<PricingRuleSetDto>(`/admin/whatsapp-pricing/rule-sets/${id}/archive`, { method: 'POST' }),
    onSuccess: () => invalidateRuleSets(queryClient),
  });
}

export function usePricingImportPreview() {
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiFetch<PricingImportPreview>('/admin/whatsapp-pricing/rule-sets/import-preview', { method: 'POST', body: formData });
    },
  });
}

export function usePricingImportCreate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiFetch<PricingRuleSetDto>('/admin/whatsapp-pricing/rule-sets/import', { method: 'POST', body: formData });
    },
    onSuccess: () => invalidateRuleSets(queryClient),
  });
}

// ---------- Budget policies ----------

export function useBudgetPolicies(query: BudgetPolicyQuery) {
  return useQuery({
    queryKey: pricingKeys.budgets(query),
    queryFn: () => apiFetch<BudgetPolicyList>(`/admin/budgets?${toQueryString(query)}`),
  });
}

export function useBudgetPolicy(id: string | null) {
  return useQuery({
    queryKey: pricingKeys.budget(id ?? ''),
    queryFn: () => apiFetch<BudgetPolicyDto>(`/admin/budgets/${id}`),
    enabled: id !== null,
  });
}

export function useBudgetUsage(id: string | null) {
  return useQuery({
    queryKey: pricingKeys.budgetUsage(id ?? ''),
    queryFn: () => apiFetch<BudgetUsage>(`/admin/budgets/${id}/usage`),
    enabled: id !== null,
  });
}

export interface BudgetOverrideRecord {
  id: string;
  amountBefore: number | null;
  amountAfter: number | null;
  currency: string | null;
  reason: string;
  createdAt: string;
}

export function useBudgetOverrides(id: string | null) {
  return useQuery({
    queryKey: pricingKeys.budgetOverrides(id ?? ''),
    queryFn: () => apiFetch<BudgetOverrideRecord[]>(`/admin/budgets/${id}/overrides`),
    enabled: id !== null,
  });
}

function invalidateBudgets(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['pricing', 'budgets'] });
}

export function useCreateBudgetPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BudgetPolicyCreateInput) =>
      apiFetch<BudgetPolicyDto>('/admin/budgets', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => invalidateBudgets(queryClient),
  });
}

export function useUpdateBudgetPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; update: BudgetPolicyUpdateInput }) =>
      apiFetch<BudgetPolicyDto>(`/admin/budgets/${input.id}`, { method: 'PATCH', body: JSON.stringify(input.update) }),
    onSuccess: () => invalidateBudgets(queryClient),
  });
}

export function useDisableBudgetPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ id: string; status: string }>(`/admin/budgets/${id}/disable`, { method: 'POST' }),
    onSuccess: () => invalidateBudgets(queryClient),
  });
}

export function useEnableBudgetPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ id: string; status: string }>(`/admin/budgets/${id}/enable`, { method: 'POST' }),
    onSuccess: () => invalidateBudgets(queryClient),
  });
}

export function useBudgetOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BudgetOverrideInput) =>
      apiFetch<BudgetUsage>(`/admin/budgets/${input.policyId}/override`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (_, input) => {
      void queryClient.invalidateQueries({ queryKey: pricingKeys.budgetUsage(input.policyId) });
      void queryClient.invalidateQueries({ queryKey: pricingKeys.budgetOverrides(input.policyId) });
    },
  });
}

// ---------- Cost reconciliation ----------

export function useReconciliations(query: CostReconciliationQuery) {
  return useQuery({
    queryKey: pricingKeys.reconciliations(query),
    queryFn: () => apiFetch<PaginatedCostReconciliations>(`/admin/whatsapp-pricing/reconciliations?${toQueryString(query)}`),
    refetchInterval: (current) =>
      (current.state.data?.items ?? []).some((job) => job.status === 'VALIDATING' || job.status === 'PROCESSING')
        ? 3000
        : false,
  });
}

export function useReconciliation(id: string | null) {
  return useQuery({
    queryKey: pricingKeys.reconciliation(id ?? ''),
    queryFn: () => apiFetch<CostReconciliationDetail>(`/admin/whatsapp-pricing/reconciliations/${id}`),
    enabled: id !== null,
  });
}

function invalidateReconciliations(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['pricing', 'reconciliations'] });
}

export function useReconciliationUpload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiFetch<CostReconciliationUploadResult>('/admin/whatsapp-pricing/reconciliations/upload', { method: 'POST', body: formData });
    },
    onSuccess: () => invalidateReconciliations(queryClient),
  });
}

export function useReconciliationValidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<CostReconciliationValidationSummary>(`/admin/whatsapp-pricing/reconciliations/${id}/validate`, { method: 'POST' }),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: pricingKeys.reconciliation(id) });
      invalidateReconciliations(queryClient);
    },
  });
}

export function useReconciliationApply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<CostReconciliationJobDto>(`/admin/whatsapp-pricing/reconciliations/${id}/apply`, { method: 'POST' }),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: pricingKeys.reconciliation(id) });
      invalidateReconciliations(queryClient);
      void queryClient.invalidateQueries({ queryKey: pricingKeys.all });
    },
  });
}

export function useReconciliationUnmatchedDownload() {
  return useMutation({
    mutationFn: async (id: string) => {
      const base = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
      const response = await fetch(`${base}/admin/whatsapp-pricing/reconciliations/${id}/unmatched`, {
        method: 'GET',
        credentials: 'include',
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
        const message = body?.message;
        throw new Error(Array.isArray(message) ? message.join('\n') : (message ?? 'Download failed'));
      }
      return response.blob();
    },
  });
}

// ---------- Cost reports ----------

export function useWhatsappCosts(query: WhatsappCostsQuery) {
  return useQuery({
    queryKey: pricingKeys.whatsappCosts(query),
    queryFn: () => apiFetch<WhatsappCostsReport>(`/reports/whatsapp-costs?${toQueryString(query)}`),
  });
}

export function useConversationCosts(query: WhatsappCostsQuery) {
  return useQuery({
    queryKey: pricingKeys.conversationCosts(query),
    queryFn: () => apiFetch<ConversationCostReport>(`/reports/conversation-costs?${toQueryString(query)}`),
  });
}

export function useAgentCosts(query: WhatsappCostsQuery) {
  return useQuery({
    queryKey: pricingKeys.agentCosts(query),
    queryFn: () => apiFetch<AgentCostReport>(`/reports/agent-costs?${toQueryString(query)}`),
  });
}

export function useRoi(query: WhatsappCostsQuery) {
  return useQuery({
    queryKey: pricingKeys.roi(query),
    queryFn: () => apiFetch<RoiReport>(`/reports/roi?${toQueryString(query)}`),
  });
}

export function useCreateCostExport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExportInput) => apiFetch<ExportJobDto>('/reports/exports', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['reports', 'exports'] }),
  });
}
