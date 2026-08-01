import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationDto, PaginatedNotifications } from '@wa/shared';

import { apiFetch } from '../../lib/api';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (page: number, pageSize: number) => ['notifications', 'list', page, pageSize] as const,
  unread: ['notifications', 'unread'] as const,
};

export function useNotifications(page = 1, pageSize = 20) {
  return useQuery({
    queryKey: notificationKeys.list(page, pageSize),
    queryFn: () => apiFetch<PaginatedNotifications>(`/notifications?page=${page}&pageSize=${pageSize}`),
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unread,
    queryFn: () => apiFetch<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 60000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/notifications/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export type { NotificationDto };
