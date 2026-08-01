import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import type { InboxRealtimeEvent } from '@wa/shared';
import { Button } from '@wa/ui';
import { ChevronLeft } from 'lucide-react';

import { useConversationDetail, useInboxEvents, useMarkRead } from '../features/inbox/api';
import { ContextualHelpButton } from '../features/help/help-drawer-provider';
import { Composer } from '../features/inbox/composer';
import { ConversationHeader } from '../features/inbox/conversation-header';
import { ConversationList } from '../features/inbox/conversation-list';
import { ConversationSidebar } from '../features/inbox/conversation-sidebar';
import { MessageThread } from '../features/inbox/message-thread';
import { NotesPanel } from '../features/inbox/notes-panel';

export function InboxPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [mobileView, setMobileView] = React.useState<'list' | 'thread'>('list');

  const { data: detail, isLoading: detailLoading } = useConversationDetail(selectedId);
  const markRead = useMarkRead();

  const handleEvent = React.useCallback(
    (event: InboxRealtimeEvent) => {
      const conversationId = event.conversationId;
      if (event.type === 'message' || event.type === 'status') {
        queryClient.invalidateQueries({ queryKey: ['inbox', 'conversations', conversationId, 'messages'] });
        queryClient.invalidateQueries({ queryKey: ['inbox', 'conversations'] });
      }
      if (event.type === 'conversation' || event.type === 'read') {
        queryClient.invalidateQueries({ queryKey: ['inbox', 'conversations'] });
        if (conversationId) {
          queryClient.invalidateQueries({ queryKey: ['inbox', 'conversations', conversationId] });
        }
      }
      if (event.type === 'note') {
        if (conversationId) {
          queryClient.invalidateQueries({ queryKey: ['inbox', 'conversations', conversationId] });
        }
      }
    },
    [queryClient],
  );

  useInboxEvents(handleEvent);

  React.useEffect(() => {
    if (selectedId && detail && detail.unreadCount > 0) {
      markRead.mutate(selectedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, detail?.unreadCount]);

  const selectConversation = (id: string) => {
    setSelectedId(id);
    setMobileView('thread');
  };

  return (
    <div className="relative flex h-[calc(100vh-6.5rem)] flex-col gap-3">
      <ContextualHelpButton featureKey="inbox" className="absolute end-3 -top-1 z-10" />
      <div className="flex flex-1 min-h-0 overflow-hidden rounded-lg border bg-card">
        <div className={`h-full w-full shrink-0 flex-col border-e md:flex md:w-80 ${mobileView === 'list' ? 'flex' : 'hidden md:flex'}`}>
          <ConversationList selectedId={selectedId} onSelect={selectConversation} />
        </div>

        <div className={`flex min-w-0 flex-1 flex-col ${mobileView === 'thread' ? 'flex' : 'hidden md:flex'}`}>
          {selectedId ? (
            <>
              <div className="flex items-center gap-2 border-b p-2 md:hidden">
                <Button variant="ghost" size="icon" onClick={() => setMobileView('list')} aria-label={t('common.back')}>
                  <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                </Button>
                <span className="text-sm font-medium">{t('inbox.title')}</span>
              </div>
              {detail ? <ConversationHeader conversation={detail} /> : null}
              <MessageThread conversationId={selectedId} />
              <Composer conversationId={selectedId} />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
              <p className="text-sm text-muted-foreground">{t('inbox.selectConversation')}</p>
            </div>
          )}
        </div>

        <div className="hidden w-72 shrink-0 flex-col border-s lg:flex xl:w-80">
          {selectedId ? (
            <>
              <ConversationSidebar conversation={detail} loading={detailLoading} />
              <div className="flex max-h-72 flex-col border-t">
                <NotesPanel conversation={detail} loading={detailLoading} />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center">
              <p className="text-sm text-muted-foreground">{t('inbox.selectConversation')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
