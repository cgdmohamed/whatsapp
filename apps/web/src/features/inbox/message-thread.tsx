import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { ConversationMessagesQuery, MessageDto, MessageRowStatus } from '@wa/shared';
import { Button, Skeleton, Tooltip, TooltipContent, TooltipTrigger } from '@wa/ui';
import { Check, CheckCheck, FileText, Loader2, RotateCcw } from 'lucide-react';

import { formatDateTime } from '../../lib/format';
import { useConversationMessages, useMediaSignedUrl, useRetryMessage } from './api';

interface MessageThreadProps {
  conversationId: string | null;
}

export function MessageThread({ conversationId }: MessageThreadProps) {
  const { t } = useTranslation();
  const [page, setPage] = React.useState(1);
  const query = React.useMemo<ConversationMessagesQuery>(
    () => ({ page, pageSize: 50, before: undefined }),
    [page],
  );
  const { data, isLoading, isError, refetch, isFetching } = useConversationMessages(conversationId, query);
  const bottomRef = React.useRef<HTMLDivElement | null>(null);

  const items = data?.items ?? [];
  const hasOlder = data ? data.page > 1 : false;

  React.useEffect(() => {
    if (bottomRef.current && page === 1) {
      bottomRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [items.length, page]);

  if (!conversationId) {
    return null;
  }

  const loadOlder = () => {
    if (hasOlder) {
      setPage((value) => value + 1);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {hasOlder ? (
          <div className="mb-3 flex justify-center">
            <Button variant="outline" size="sm" onClick={loadOlder} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              {t('inbox.loadOlder')}
            </Button>
          </div>
        ) : null}

        {isError ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <p className="text-sm text-muted-foreground">{t('inbox.messagesLoadError')}</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className={index % 2 === 0 ? 'h-10 w-2/3 rounded-lg' : 'ms-auto h-10 w-1/2 rounded-lg'} />
            ))}
          </div>
        ) : items.length > 0 ? (
          <div className="space-y-2">
            {items.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={bottomRef} />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t('inbox.noMessages')}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: MessageDto }) {
  const { t } = useTranslation();
  const isOutbound = message.direction === 'OUTBOUND';

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm ${
          isOutbound ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
        }`}
      >
        {message.mediaFile ? <MediaContent message={message} /> : null}
        {message.textContent ? (
          <p className={`whitespace-pre-wrap break-words ${message.mediaFile ? 'mt-1' : ''}`}>{message.textContent}</p>
        ) : null}
        {message.type === 'TEMPLATE' && message.templateName && !message.textContent ? (
          <p className="whitespace-pre-wrap break-words">{t('inbox.templateMessage', { name: message.templateName })}</p>
        ) : null}
        <div className={`mt-1 flex items-center gap-1 text-[10px] ${isOutbound ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
          <span>{formatDateTime(message.createdAt)}</span>
          {isOutbound ? <OutboundStatus status={message.status} /> : null}
        </div>
        {isOutbound && message.status === 'FAILED' ? (
          <div className="mt-1">
            <RetryButton messageId={message.id} error={message.errorMessage} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MediaContent({ message }: { message: MessageDto }) {
  const { t } = useTranslation();
  const mediaFile = message.mediaFile;
  if (!mediaFile) {
    return null;
  }
  const isImage = mediaFile.contentType?.startsWith('image/') ?? false;
  return (
    <MediaLink mediaFileId={mediaFile.id} isImage={isImage}>
      {isImage ? (
        <span className="block max-h-64 overflow-hidden rounded-md">
          <MediaImage mediaFileId={mediaFile.id} alt={mediaFile.originalFilename ?? ''} />
        </span>
      ) : (
        <span className="flex items-center gap-2 text-xs underline">
          <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
          {mediaFile.originalFilename ?? t('inbox.file')}
        </span>
      )}
    </MediaLink>
  );
}

function MediaLink({
  mediaFileId,
  isImage,
  children,
}: {
  mediaFileId: string;
  isImage: boolean;
  children: React.ReactNode;
}) {
  const { data: signed } = useMediaSignedUrl(mediaFileId);
  if (!signed) {
    return children;
  }
  return (
    <a href={signed.url} target="_blank" rel="noreferrer" className={isImage ? 'block' : 'block cursor-pointer'}>
      {children}
    </a>
  );
}

function MediaImage({ mediaFileId, alt }: { mediaFileId: string; alt: string }) {
  const { data: signed } = useMediaSignedUrl(mediaFileId);
  return (
    <img
      src={signed?.url ?? ''}
      alt={alt}
      className={`h-auto w-full object-cover ${signed ? 'opacity-100' : 'opacity-0'}`}
      loading="lazy"
    />
  );
}

function OutboundStatus({ status }: { status: MessageRowStatus }) {
  const { t } = useTranslation();
  const delivered = status === 'DELIVERED' || status === 'READ' || status === 'REPLIED';
  const read = status === 'READ' || status === 'REPLIED';
  const pending = status === 'PENDING' || status === 'QUEUED';
  return (
    <span className="flex items-center gap-0.5" title={t(`inbox.messageStatus.${status}`)}>
      {pending ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      ) : read ? (
        <CheckCheck className="h-3 w-3" aria-hidden="true" />
      ) : delivered ? (
        <CheckCheck className="h-3 w-3" aria-hidden="true" />
      ) : status === 'FAILED' ? (
        <span className="font-medium">{t('inbox.messageStatus.FAILED')}</span>
      ) : (
        <Check className="h-3 w-3" aria-hidden="true" />
      )}
    </span>
  );
}

function RetryButton({ messageId, error }: { messageId: string; error: string | null }) {
  const { t } = useTranslation();
  const retry = useRetryMessage();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-6 gap-1 px-2 text-xs"
          onClick={() => retry.mutate(messageId)}
          disabled={retry.isPending}
        >
          <RotateCcw className="h-3 w-3" aria-hidden="true" />
          {t('inbox.retry')}
        </Button>
      </TooltipTrigger>
      {error ? <TooltipContent>{error}</TooltipContent> : null}
    </Tooltip>
  );
}
