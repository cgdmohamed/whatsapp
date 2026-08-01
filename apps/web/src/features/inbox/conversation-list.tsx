import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  CONVERSATION_STATUSES,
  type ConversationQuery,
  type ConversationStatus,
  type ConversationSummaryDto,
} from '@wa/shared';
import { Avatar, AvatarFallback, Badge, Button, Input, Skeleton } from '@wa/ui';
import { Inbox, Search, X } from 'lucide-react';

import { useAuth } from '../../lib/auth';
import { formatTime } from '../../lib/format';
import { useDebouncedValue } from '../../hooks/use-debounce';
import { useConversations } from './api';
import { contactDisplayName } from './format';

const STATUS_VARIANT: Record<ConversationStatus, 'success' | 'warning' | 'muted' | 'outline' | 'secondary'> = {
  NEW: 'secondary',
  OPEN: 'success',
  WAITING_FOR_CUSTOMER: 'warning',
  FOLLOW_UP: 'outline',
  CLOSED: 'muted',
};

interface ConversationListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ConversationList({ selectedId, onSelect }: ConversationListProps) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState<ConversationStatus | ''>('');
  const [unassigned, setUnassigned] = React.useState<'yes' | ''>('');
  const [unread, setUnread] = React.useState<'yes' | ''>('');
  const debouncedSearch = useDebouncedValue(search);

  const query = React.useMemo<ConversationQuery>(
    () => ({
      page,
      pageSize: 30,
      search: debouncedSearch || undefined,
      status: status || undefined,
      unassigned: unassigned || undefined,
      unread: unread || undefined,
      sortBy: 'lastMessageAt',
      sortOrder: 'desc',
    }),
    [page, debouncedSearch, status, unassigned, unread],
  );

  const { data, isLoading, isError, refetch } = useConversations(query);

  const hasFilters = search.length > 0 || status !== '' || unassigned !== '' || unread !== '';

  const resetFilters = () => {
    setSearch('');
    setStatus('');
    setUnassigned('');
    setUnread('');
    setPage(1);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b p-3">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder={t('inbox.searchPlaceholder')}
            className="ps-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ConversationStatus | '');
              setPage(1);
            }}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
            aria-label={t('inbox.statusFilter')}
          >
            <option value="">{t('inbox.statusFilterAll')}</option>
            {CONVERSATION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`inbox.status.${value}`)}
              </option>
            ))}
          </select>
          <Button
            variant={unassigned === 'yes' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => {
              setUnassigned(unassigned === 'yes' ? '' : 'yes');
              setPage(1);
            }}
          >
            {t('inbox.unassigned')}
          </Button>
          <Button
            variant={unread === 'yes' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => {
              setUnread(unread === 'yes' ? '' : 'yes');
              setPage(1);
            }}
          >
            {t('inbox.unread')}
          </Button>
          {hasFilters ? (
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={resetFilters}>
              <X className="h-3 w-3" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <p className="text-sm text-muted-foreground">{t('inbox.loadError')}</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : isLoading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 rounded-md p-2">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : data && data.items.length > 0 ? (
          <ul className="p-2">
            {data.items.map((conversation) => (
              <ConversationListItem
                key={conversation.id}
                conversation={conversation}
                selected={conversation.id === selectedId}
                isMe={user?.id === conversation.assignedUserId}
                onClick={() => onSelect(conversation.id)}
              />
            ))}
          </ul>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{t('inbox.noConversations')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationListItem({
  conversation,
  selected,
  isMe,
  onClick,
}: {
  conversation: ConversationSummaryDto;
  selected: boolean;
  isMe: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const name = contactDisplayName(conversation.contact);
  const lastMessage = conversation.lastMessagePreview ?? conversation.contact.phoneE164;

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-start gap-3 rounded-md p-2 text-start transition-colors hover:bg-accent ${
          selected ? 'bg-accent' : ''
        }`}
      >
        <Avatar className="mt-0.5 h-9 w-9">
          <AvatarFallback>{initials(name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-medium">{name}</p>
            <span className="shrink-0 text-xs text-muted-foreground">{formatTime(conversation.lastMessageAt)}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className="truncate text-xs text-muted-foreground">{lastMessage}</p>
            <div className="flex shrink-0 items-center gap-1">
              <Badge variant={STATUS_VARIANT[conversation.status]} className="text-[10px]">
                {t(`inbox.status.${conversation.status}`)}
              </Badge>
              {conversation.unreadCount > 0 ? (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {conversation.unreadCount}
                </span>
              ) : null}
            </div>
          </div>
          {conversation.assignedUserName ? (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {t('inbox.assignedTo', { name: conversation.assignedUserName })}
              {isMe ? ` (${t('inbox.you')})` : ''}
            </p>
          ) : null}
          {conversation.priority !== 'NORMAL' ? (
            <div className="mt-1 flex gap-1">
              <PriorityTag priority={conversation.priority} />
            </div>
          ) : null}
        </div>
      </button>
    </li>
  );
}

function PriorityTag({ priority }: { priority: ConversationSummaryDto['priority'] }) {
  const { t } = useTranslation();
  if (priority === 'URGENT') {
    return <Badge variant="destructive">{t('inbox.priority.URGENT')}</Badge>;
  }
  if (priority === 'HIGH') {
    return <Badge variant="warning">{t('inbox.priority.HIGH')}</Badge>;
  }
  if (priority === 'LOW') {
    return <Badge variant="outline">{t('inbox.priority.LOW')}</Badge>;
  }
  return null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? '';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';
  return `${first}${second}`.toUpperCase();
}
