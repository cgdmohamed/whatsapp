import { useTranslation } from 'react-i18next';
import { CONVERSATION_PRIORITIES, CONVERSATION_STATUSES, type ConversationDetailDto } from '@wa/shared';
import { Avatar, AvatarFallback, Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@wa/ui';
import { Check, UserRound, XCircle } from 'lucide-react';

import { useAuth } from '../../lib/auth';
import {
  useAssignableUsers,
  useAssignConversation,
  useClaimConversation,
  useCloseConversation,
  useReopenConversation,
  useSetPriority,
  useSetStatus,
} from './api';
import { contactDisplayName } from './format';

interface ConversationHeaderProps {
  conversation: ConversationDetailDto;
}

export function ConversationHeader({ conversation }: ConversationHeaderProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: assignableUsers } = useAssignableUsers();

  const assignMutation = useAssignConversation();
  const claimMutation = useClaimConversation();
  const closeMutation = useCloseConversation();
  const reopenMutation = useReopenConversation();
  const statusMutation = useSetStatus();
  const priorityMutation = useSetPriority();

  const name = contactDisplayName(conversation.contact);
  const isManagerOrAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const assignedToMe = conversation.assignedUserId === user?.id;
  const isClosed = conversation.status === 'CLOSED';

  const assignable = assignableUsers ?? [];

  return (
    <div className="flex items-center justify-between gap-3 border-b p-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarFallback>{initials(name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{name}</p>
            {conversation.contact.suppressed ? <Badge variant="destructive">{t('contacts.suppressed')}</Badge> : null}
          </div>
          <p className="truncate text-xs text-muted-foreground" dir="ltr">
            {conversation.contact.phoneE164}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {conversation.assignedUserId ? (
          <Badge variant={assignedToMe ? 'success' : 'secondary'}>
            <UserRound className="h-3 w-3" aria-hidden="true" />
            {conversation.assignedUser?.name ?? t('inbox.assigned')}
            {assignedToMe ? ` (${t('inbox.you')})` : ''}
          </Badge>
        ) : isManagerOrAdmin ? (
          <Select
            value={''}
            onValueChange={(userId) => {
              if (userId) {
                assignMutation.mutate({ id: conversation.id, input: { userId } });
              }
            }}
          >
            <SelectTrigger className="h-8 w-auto gap-1 px-2 text-xs" aria-label={t('inbox.assign')}>
              <SelectValue placeholder={t('inbox.assign')} />
            </SelectTrigger>
            <SelectContent>
              {assignable.map((userItem) => (
                <SelectItem key={userItem.id} value={userItem.id}>
                  {userItem.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Button variant="outline" size="sm" onClick={() => claimMutation.mutate({ id: conversation.id, input: {} })} disabled={claimMutation.isPending}>
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            {t('inbox.claim')}
          </Button>
        )}

        <Select value={conversation.status} onValueChange={(value) => statusMutation.mutate({ id: conversation.id, input: { status: value as ConversationDetailDto['status'] } })}>
          <SelectTrigger className="h-8 w-auto gap-1 px-2 text-xs" aria-label={t('inbox.statusFilter')}>
            <SelectValue placeholder={t('inbox.statusFilterAll')} />
          </SelectTrigger>
          <SelectContent>
            {CONVERSATION_STATUSES.map((value) => (
              <SelectItem key={value} value={value} disabled={value === 'CLOSED' && isClosed}>
                {t(`inbox.status.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={conversation.priority} onValueChange={(value) => priorityMutation.mutate({ id: conversation.id, input: { priority: value as ConversationDetailDto['priority'] } })}>
          <SelectTrigger className="h-8 w-auto gap-1 px-2 text-xs" aria-label={t('inbox.priorityLabel')}>
            <SelectValue placeholder={t('inbox.priority')} />
          </SelectTrigger>
          <SelectContent>
            {CONVERSATION_PRIORITIES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`inbox.priority.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isClosed ? (
          <Button variant="outline" size="sm" onClick={() => reopenMutation.mutate(conversation.id)} disabled={reopenMutation.isPending}>
            {t('inbox.reopen')}
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => closeMutation.mutate(conversation.id)} disabled={closeMutation.isPending}>
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {t('inbox.close')}
          </Button>
        )}
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? '';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';
  return `${first}${second}`.toUpperCase();
}
