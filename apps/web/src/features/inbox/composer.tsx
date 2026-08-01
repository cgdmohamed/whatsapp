import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { QuickReplyQuery } from '@wa/shared';
import { Button, Textarea, toast } from '@wa/ui';
import { FileText, Paperclip, Send, Sparkles } from 'lucide-react';

import { useAuth } from '../../lib/auth';
import { useQuickReplies, useSendReply, useUploadMedia } from './api';
import { TemplatePicker } from './template-picker';

interface ComposerProps {
  conversationId: string;
}

export function Composer({ conversationId }: ComposerProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [text, setText] = React.useState('');
  const [quickReplyOpen, setQuickReplyOpen] = React.useState(false);
  const [templateOpen, setTemplateOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const query = React.useMemo<QuickReplyQuery>(
    () => ({ page: 1, pageSize: 50, language: user?.preferredLanguage === 'en' ? 'en' : 'ar' }),
    [user?.preferredLanguage],
  );
  const { data: quickReplies } = useQuickReplies(query);

  const sendMutation = useSendReply();
  const uploadMutation = useUploadMedia();

  const canSend = !sendMutation.isPending && !uploadMutation.isPending;

  const sendText = () => {
    const content = text.trim();
    if (!content || !canSend) {
      return;
    }
    sendMutation.mutate(
      { id: conversationId, input: { type: 'TEXT', textContent: content } },
      {
        onSuccess: () => setText(''),
        onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
      },
    );
  };

  const handleFile = (file: File | null) => {
    if (!file || !canSend) {
      return;
    }
    const caption = text.trim();
    uploadMutation.mutate(
      { id: conversationId, file },
      {
        onSuccess: (mediaFile) => {
          const isImage = mediaFile.contentType?.startsWith('image/') ?? false;
          sendMutation.mutate(
            { id: conversationId, input: { type: isImage ? 'IMAGE' : 'DOCUMENT', mediaFileId: mediaFile.id, caption: caption || undefined } },
            {
              onSuccess: () => {
                setText('');
                toast.success(t('inbox.mediaSent'));
              },
              onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
            },
          );
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
      },
    );
  };

  const insertQuickReply = (content: string) => {
    setText((current) => {
      const base = current.trimEnd();
      return base.length > 0 ? `${base}\n${content}` : content;
    });
    setQuickReplyOpen(false);
  };

  return (
    <div className="border-t p-3">
      {quickReplyOpen && (quickReplies?.items.length ?? 0) > 0 ? (
        <div className="mb-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-md border p-2">
          {quickReplies?.items.map((reply) => (
            <button
              key={reply.id}
              type="button"
              onClick={() => insertQuickReply(reply.content)}
              className="rounded-md border bg-muted px-2 py-1 text-xs hover:bg-accent"
              title={reply.content}
            >
              {reply.title}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setQuickReplyOpen((value) => !value)}
          aria-label={t('inbox.quickReplies')}
          title={t('inbox.quickReplies')}
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={!canSend}
          aria-label={t('inbox.attach')}
          title={t('inbox.attach')}
        >
          <Paperclip className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTemplateOpen(true)}
          aria-label={t('inbox.templates')}
          title={t('inbox.templates')}
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
          onChange={(event) => {
            handleFile(event.target.files?.[0] ?? null);
            event.target.value = '';
          }}
        />
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              sendText();
            }
          }}
          placeholder={t('inbox.replyPlaceholder')}
          className="max-h-32 min-h-10 flex-1 resize-none"
          rows={1}
        />
        <Button onClick={sendText} disabled={!canSend || text.trim().length === 0} aria-label={t('inbox.send')}>
          <Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
          {t('inbox.send')}
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{t('inbox.enterHint')}</p>
      <TemplatePicker open={templateOpen} onOpenChange={setTemplateOpen} onUse={(content) => setText(content)} />
    </div>
  );
}
