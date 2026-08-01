import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { ConversationDetailDto, TagQuery } from '@wa/shared';
import { Badge, Button, Skeleton } from '@wa/ui';
import { CalendarClock, Megaphone, ShieldAlert, Tags as TagsIcon } from 'lucide-react';

import { formatDate } from '../../lib/format';
import { useTags } from '../contacts/api';
import { useUpdateConversationTags } from './api';

interface ConversationSidebarProps {
  conversation: ConversationDetailDto | undefined;
  loading: boolean;
}

export function ConversationSidebar({ conversation, loading }: ConversationSidebarProps) {
  const { t } = useTranslation();
  const [tagsOpen, setTagsOpen] = React.useState(false);
  const tagsQuery = React.useMemo<TagQuery>(() => ({ page: 1, pageSize: 100 }), []);
  const { data: availableTags } = useTags(tagsQuery);
  const updateTagsMutation = useUpdateConversationTags();

  const selectedTagIds = conversation?.tags.map((tag) => tag.id) ?? [];

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (!conversation) {
    return null;
  }

  const toggleTag = (tagId: string) => {
    const next = selectedTagIds.includes(tagId) ? selectedTagIds.filter((id) => id !== tagId) : [...selectedTagIds, tagId];
    updateTagsMutation.mutate({ id: conversation.id, input: { tagIds: next.length > 0 ? next : [tagId] } });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="space-y-4 p-4">
        <section>
          <div className="mb-2 flex items-center gap-2">
            <TagsIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-sm font-semibold">{t('contacts.tags')}</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {conversation.tags.length === 0 ? (
              <span className="text-xs text-muted-foreground">{t('contacts.noTags')}</span>
            ) : (
              conversation.tags.map((tag) => (
                <Badge key={tag.id} variant="outline" className="text-xs">
                  {tag.name}
                </Badge>
              ))
            )}
          </div>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setTagsOpen((value) => !value)}>
            {t('inbox.editTags')}
          </Button>
          {tagsOpen ? (
            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
              {availableTags && availableTags.items.length > 0 ? (
                availableTags.items.map((tag) => (
                  <label key={tag.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent">
                    <input
                      type="checkbox"
                      checked={selectedTagIds.includes(tag.id)}
                      onChange={() => toggleTag(tag.id)}
                      className="h-4 w-4"
                    />
                    {tag.name}
                  </label>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">{t('contacts.noTags')}</span>
              )}
            </div>
          ) : null}
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-sm font-semibold">{t('inbox.conversationInfo')}</h3>
          </div>
          <dl className="space-y-2 text-sm">
            <InfoRow label={t('inbox.optInStatus')}>
              <Badge variant={conversation.contact.optInStatus === 'OPTED_IN' ? 'success' : conversation.contact.optInStatus === 'OPTED_OUT' ? 'destructive' : 'muted'}>
                {t(`contacts.optIn.${conversation.contact.optInStatus}`)}
              </Badge>
            </InfoRow>
            <InfoRow label={t('contacts.suppressed')}>
              {conversation.contact.suppressed ? (
                <Badge variant="destructive">
                  <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                  {t('common.yes')}
                </Badge>
              ) : (
                <span className="text-muted-foreground">{t('common.no')}</span>
              )}
            </InfoRow>
            <InfoRow label={t('inbox.createdAt')}>{formatDate(conversation.createdAt)}</InfoRow>
            <InfoRow label={t('inbox.serviceWindow')}>
              {conversation.serviceWindowExpiresAt ? formatDate(conversation.serviceWindowExpiresAt) : t('inbox.noWindow')}
            </InfoRow>
          </dl>
        </section>

        {conversation.recentCampaigns.length > 0 ? (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h3 className="text-sm font-semibold">{t('inbox.recentCampaigns')}</h3>
            </div>
            <ul className="space-y-1.5">
              {conversation.recentCampaigns.map((campaign) => (
                <li key={campaign.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{campaign.name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {t(`campaigns.status.${campaign.status}`)}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1 text-end">{children}</dd>
    </div>
  );
}
