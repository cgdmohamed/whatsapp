import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BulkContactActionInput,
  ContactDetailDto,
  ContactDto,
  ContactListDto,
  ContactListQuery,
  ContactQuery,
  ConsentMutationInput,
  CreateContactInput,
  CreateContactListInput,
  CreateTagInput,
  IdListInput,
  PaginatedContactLists,
  PaginatedContacts,
  PaginatedTags,
  SuppressionMutationInput,
  TagDto,
  TagQuery,
  UpdateContactInput,
  UpdateContactListInput,
  UpdateTagInput,
} from '@wa/shared';

import { apiFetch } from '../../lib/api';

export const contactsKeys = {
  all: ['contacts'] as const,
  list: (query: ContactQuery) => [...contactsKeys.all, 'list', query] as const,
  detail: (id: string) => [...contactsKeys.all, 'detail', id] as const,
};

export const tagsKeys = {
  all: ['tags'] as const,
  list: (query: TagQuery) => [...tagsKeys.all, 'list', query] as const,
};

export const listsKeys = {
  all: ['lists'] as const,
  list: (query: ContactListQuery) => [...listsKeys.all, 'list', query] as const,
  members: (id: string) => [...listsKeys.all, 'members', id] as const,
};

export function buildContactQuery(query: ContactQuery): string {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  for (const key of ['search', 'status', 'country', 'language', 'source', 'tagId', 'listId', 'optInStatus', 'createdFrom', 'createdTo', 'messageFrom', 'messageTo'] as const) {
    const value = query[key];
    if (value) {
      params.set(key, value);
    }
  }
  if (query.suppressed) {
    params.set('suppressed', query.suppressed);
  }
  params.set('sortBy', query.sortBy);
  params.set('sortOrder', query.sortOrder);
  return params.toString();
}

export function buildTagQuery(query: TagQuery): string {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  if (query.search) {
    params.set('search', query.search);
  }
  return params.toString();
}

export function buildListQuery(query: ContactListQuery): string {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  if (query.search) {
    params.set('search', query.search);
  }
  if (query.type) {
    params.set('type', query.type);
  }
  return params.toString();
}

export function useContacts(query: ContactQuery) {
  return useQuery({
    queryKey: contactsKeys.list(query),
    queryFn: () => apiFetch<PaginatedContacts>(`/contacts?${buildContactQuery(query)}`),
  });
}

export function useContactDetail(id: string | null) {
  return useQuery({
    queryKey: contactsKeys.detail(id ?? ''),
    queryFn: () => apiFetch<ContactDetailDto>(`/contacts/${id}`),
    enabled: id !== null,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateContactInput) => apiFetch<ContactDto>('/contacts', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactsKeys.all }),
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateContactInput }) =>
      apiFetch<ContactDto>(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactsKeys.all }),
  });
}

export function useArchiveContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<ContactDto>(`/contacts/${id}/archive`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactsKeys.all }),
  });
}

export function useRestoreContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<ContactDto>(`/contacts/${id}/restore`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactsKeys.all }),
  });
}

export function useAddContactTags() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: IdListInput }) =>
      apiFetch<ContactDto>(`/contacts/${id}/tags`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactsKeys.all }),
  });
}

export function useRemoveContactTags() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: IdListInput }) =>
      apiFetch<ContactDto>(`/contacts/${id}/tags/remove`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactsKeys.all }),
  });
}

export function useAddContactLists() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: IdListInput }) =>
      apiFetch<ContactDto>(`/contacts/${id}/lists`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactsKeys.all }),
  });
}

export function useRemoveContactLists() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: IdListInput }) =>
      apiFetch<ContactDto>(`/contacts/${id}/lists/remove`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactsKeys.all }),
  });
}

export function useSetConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ConsentMutationInput }) =>
      apiFetch<ContactDto>(`/contacts/${id}/consent`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactsKeys.all }),
  });
}

export function useSuppressContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SuppressionMutationInput }) =>
      apiFetch<ContactDto>(`/contacts/${id}/suppress`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactsKeys.all }),
  });
}

export function useUnsuppressContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<ContactDto>(`/contacts/${id}/unsuppress`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactsKeys.all }),
  });
}

export function useBulkContactAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkContactActionInput) =>
      apiFetch<{ affected: number }>('/contacts/bulk', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contactsKeys.all }),
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ affected: number }>(`/contacts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactsKeys.all });
      queryClient.invalidateQueries({ queryKey: listsKeys.all });
    },
  });
}

export function useBulkDeleteContacts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch<{ affected: number }>('/contacts/bulk', { method: 'DELETE', body: JSON.stringify({ ids }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactsKeys.all });
      queryClient.invalidateQueries({ queryKey: listsKeys.all });
    },
  });
}

export function useTags(query: TagQuery) {
  return useQuery({
    queryKey: tagsKeys.list(query),
    queryFn: () => apiFetch<PaginatedTags>(`/tags?${buildTagQuery(query)}`),
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTagInput) => apiFetch<TagDto>('/tags', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tagsKeys.all }),
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTagInput }) =>
      apiFetch<TagDto>(`/tags/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tagsKeys.all }),
  });
}

export function useArchiveTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<TagDto>(`/tags/${id}/archive`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tagsKeys.all }),
  });
}

export function useLists(query: ContactListQuery) {
  return useQuery({
    queryKey: listsKeys.list(query),
    queryFn: () => apiFetch<PaginatedContactLists>(`/lists?${buildListQuery(query)}`),
  });
}

export function useCreateList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateContactListInput) => apiFetch<ContactListDto>('/lists', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listsKeys.all }),
  });
}

export function useUpdateList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateContactListInput }) =>
      apiFetch<ContactListDto>(`/lists/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listsKeys.all }),
  });
}

export function useArchiveList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<ContactListDto>(`/lists/${id}/archive`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listsKeys.all }),
  });
}

export function useListMembers(id: string | null) {
  return useQuery({
    queryKey: listsKeys.members(id ?? ''),
    queryFn: () => apiFetch<ContactDto[]>(`/lists/${id}/members`),
    enabled: id !== null,
  });
}
