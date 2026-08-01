import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AssignConversationInput,
  ClaimConversationInput,
  ConversationDetailDto,
  ConversationMessagesQuery,
  ConversationPriorityInput,
  ConversationQuery,
  ConversationStatusInput,
  ConversationSummaryDto,
  ConversationTagsInput,
  CreateInternalNoteInput,
  CreateQuickReplyInput,
  InboxRealtimeEvent,
  InternalNoteDto,
  MediaFileDto,
  MessageDto,
  PaginatedConversationMessages,
  PaginatedConversations,
  PaginatedQuickReplies,
  QuickReplyDto,
  QuickReplyQuery,
  ReplyInput,
  UpdateInternalNoteInput,
  UpdateQuickReplyInput,
} from '@wa/shared';

import { API_URL } from '../../lib/config';
import { apiFetch } from '../../lib/api';

export const inboxKeys = {
  all: ['inbox'] as const,
  conversations: (query: ConversationQuery) => [...inboxKeys.all, 'conversations', query] as const,
  detail: (id: string) => [...inboxKeys.all, 'conversations', id] as const,
  messages: (id: string, query: ConversationMessagesQuery) => [...inboxKeys.all, 'conversations', id, 'messages', query] as const,
  quickReplies: (query: QuickReplyQuery) => [...inboxKeys.all, 'quick-replies', query] as const,
  assignableUsers: ['inbox', 'assignable-users'] as const,
};

export function buildConversationQuery(query: ConversationQuery): string {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  if (query.search) {
    params.set('search', query.search);
  }
  if (query.status) {
    params.set('status', query.status);
  }
  if (query.assignedUserId) {
    params.set('assignedUserId', query.assignedUserId);
  }
  if (query.unassigned) {
    params.set('unassigned', query.unassigned);
  }
  if (query.unread) {
    params.set('unread', query.unread);
  }
  if (query.priority) {
    params.set('priority', query.priority);
  }
  if (query.dateFrom) {
    params.set('dateFrom', query.dateFrom);
  }
  if (query.dateTo) {
    params.set('dateTo', query.dateTo);
  }
  params.set('sortBy', query.sortBy);
  params.set('sortOrder', query.sortOrder);
  return params.toString();
}

export function buildMessagesQuery(query: ConversationMessagesQuery): string {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  if (query.before) {
    params.set('before', query.before);
  }
  return params.toString();
}

export function buildQuickReplyQuery(query: QuickReplyQuery): string {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  if (query.search) {
    params.set('search', query.search);
  }
  if (query.language) {
    params.set('language', query.language);
  }
  if (query.category) {
    params.set('category', query.category);
  }
  if (query.visibility) {
    params.set('visibility', query.visibility);
  }
  if (query.includeArchived) {
    params.set('includeArchived', query.includeArchived);
  }
  return params.toString();
}

export function useConversations(query: ConversationQuery) {
  return useQuery({
    queryKey: inboxKeys.conversations(query),
    queryFn: () => apiFetch<PaginatedConversations>(`/inbox/conversations?${buildConversationQuery(query)}`),
  });
}

export function useConversationDetail(id: string | null) {
  return useQuery({
    queryKey: inboxKeys.detail(id ?? ''),
    queryFn: () => apiFetch<ConversationDetailDto>(`/inbox/conversations/${id}`),
    enabled: id !== null,
  });
}

export function useConversationMessages(id: string | null, query: ConversationMessagesQuery) {
  return useQuery({
    queryKey: inboxKeys.messages(id ?? '', query),
    queryFn: () => apiFetch<PaginatedConversationMessages>(`/inbox/conversations/${id}/messages?${buildMessagesQuery(query)}`),
    enabled: id !== null,
  });
}

export function useAssignableUsers() {
  return useQuery({
    queryKey: inboxKeys.assignableUsers,
    queryFn: () => apiFetch<Array<{ id: string; name: string; email: string; role: string }>>('/inbox/assignable-users'),
    staleTime: 60_000,
  });
}

export function useMediaSignedUrl(id: string | null) {
  return useQuery({
    queryKey: ['inbox', 'media', 'signed-url', id ?? ''] as const,
    queryFn: () => apiFetch<{ url: string; expiresAt: string }>(`/inbox/media/${id}/signed-url`),
    enabled: id !== null,
    staleTime: 120_000,
  });
}

export function useAssignConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AssignConversationInput }) =>
      apiFetch<ConversationSummaryDto>(`/inbox/conversations/${id}/assign`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['inbox', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: inboxKeys.detail(id) });
    },
  });
}

export function useClaimConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ClaimConversationInput }) =>
      apiFetch<ConversationSummaryDto>(`/inbox/conversations/${id}/claim`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['inbox', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: inboxKeys.detail(id) });
    },
  });
}

export function useSetStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ConversationStatusInput }) =>
      apiFetch<ConversationSummaryDto>(`/inbox/conversations/${id}/status`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['inbox', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: inboxKeys.detail(id) });
    },
  });
}

export function useSetPriority() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ConversationPriorityInput }) =>
      apiFetch<ConversationSummaryDto>(`/inbox/conversations/${id}/priority`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['inbox', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: inboxKeys.detail(id) });
    },
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<ConversationSummaryDto>(`/inbox/conversations/${id}/read`, { method: 'POST' }),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['inbox', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: inboxKeys.detail(id) });
    },
  });
}

export function useMarkUnread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<ConversationSummaryDto>(`/inbox/conversations/${id}/unread`, { method: 'POST' }),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['inbox', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: inboxKeys.detail(id) });
    },
  });
}

export function useCloseConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<ConversationSummaryDto>(`/inbox/conversations/${id}/close`, { method: 'POST' }),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['inbox', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: inboxKeys.detail(id) });
    },
  });
}

export function useReopenConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<ConversationSummaryDto>(`/inbox/conversations/${id}/reopen`, { method: 'POST' }),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['inbox', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: inboxKeys.detail(id) });
    },
  });
}

export function useUpdateConversationTags() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ConversationTagsInput }) =>
      apiFetch<ConversationDetailDto>(`/inbox/conversations/${id}/tags`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['inbox', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: inboxKeys.detail(id) });
    },
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateInternalNoteInput }) =>
      apiFetch<InternalNoteDto>(`/inbox/conversations/${id}/notes`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (_data, { id }) => queryClient.invalidateQueries({ queryKey: inboxKeys.detail(id) }),
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, noteId, input }: { id: string; noteId: string; input: UpdateInternalNoteInput }) =>
      apiFetch<InternalNoteDto>(`/inbox/conversations/${id}/notes/${noteId}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: (_data, { id }) => queryClient.invalidateQueries({ queryKey: inboxKeys.detail(id) }),
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, noteId }: { id: string; noteId: string }) =>
      apiFetch<{ id: string }>(`/inbox/conversations/${id}/notes/${noteId}`, { method: 'DELETE' }),
    onSuccess: (_data, { id }) => queryClient.invalidateQueries({ queryKey: inboxKeys.detail(id) }),
  });
}

export function useSendReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReplyInput }) =>
      apiFetch<MessageDto>(`/inbox/conversations/${id}/replies`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['inbox', 'conversations'] });
      queryClient.invalidateQueries({ queryKey: inboxKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: ['inbox', 'conversations', id, 'messages'] });
    },
  });
}

export function useUploadMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiFetch<MediaFileDto>(`/inbox/conversations/${id}/media`, {
        method: 'POST',
        body: formData,
      });
    },
    onSuccess: (_data, { id }) => queryClient.invalidateQueries({ queryKey: inboxKeys.detail(id) }),
  });
}

export function useRetryMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => apiFetch<MessageDto>(`/inbox/messages/${messageId}/retry`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox'] }),
  });
}

export function useQuickReplies(query: QuickReplyQuery) {
  return useQuery({
    queryKey: inboxKeys.quickReplies(query),
    queryFn: () => apiFetch<PaginatedQuickReplies>(`/inbox/quick-replies?${buildQuickReplyQuery(query)}`),
  });
}

export function useCreateQuickReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQuickReplyInput) => apiFetch<QuickReplyDto>('/inbox/quick-replies', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox', 'quick-replies'] }),
  });
}

export function useUpdateQuickReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateQuickReplyInput }) =>
      apiFetch<QuickReplyDto>(`/inbox/quick-replies/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox', 'quick-replies'] }),
  });
}

export function useArchiveQuickReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<QuickReplyDto>(`/inbox/quick-replies/${id}/archive`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox', 'quick-replies'] }),
  });
}

export function useInboxEvents(onEvent: (event: InboxRealtimeEvent) => void): void {
  React.useEffect(() => {
    const source = new EventSource(`${API_URL}/inbox/events`, { withCredentials: true });
    source.onmessage = (message) => {
      try {
        const parsed = JSON.parse(message.data) as InboxRealtimeEvent;
        onEvent(parsed);
      } catch {
        // Ignore malformed events.
      }
    };
    return () => source.close();
  }, [onEvent]);
}
