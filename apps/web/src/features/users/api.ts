import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateUserInput, PaginatedUsers, ResetPasswordInput, UpdateUserInput, UserDto, UserQuery } from '@wa/shared';

import { apiFetch } from '../../lib/api';

export const usersKeys = {
  all: ['users'] as const,
  list: (query: UserQuery) => [...usersKeys.all, 'list', query] as const,
};

function buildUserQuery(query: UserQuery): string {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  if (query.search) {
    params.set('search', query.search);
  }
  if (query.role) {
    params.set('role', query.role);
  }
  if (query.status) {
    params.set('status', query.status);
  }
  if (query.sortBy) {
    params.set('sortBy', query.sortBy);
  }
  if (query.sortOrder) {
    params.set('sortOrder', query.sortOrder);
  }
  return params.toString();
}

export function useUsers(query: UserQuery) {
  return useQuery({
    queryKey: usersKeys.list(query),
    queryFn: () => apiFetch<PaginatedUsers>(`/users?${buildUserQuery(query)}`),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) =>
      apiFetch<UserDto>('/users', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKeys.all }),
  });
}

export function useUpdateUser(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateUserInput) =>
      apiFetch<UserDto>(`/users/${userId}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKeys.all }),
  });
}

export function useUserAction(action: 'suspend' | 'activate' | 'archive' | 'revoke-sessions') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<UserDto | void>(`/users/${userId}/${action}`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKeys.all }),
  });
}

export function useResetPassword(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ResetPasswordInput) =>
      apiFetch<UserDto>(`/users/${userId}/reset-password`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKeys.all }),
  });
}
