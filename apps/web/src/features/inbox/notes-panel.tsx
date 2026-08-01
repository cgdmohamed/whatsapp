import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { ConversationDetailDto } from '@wa/shared';
import { Button, Input, Skeleton } from '@wa/ui';
import { MessageSquareOff, PenLine, Plus, Trash2 } from 'lucide-react';

import { formatDateTime } from '../../lib/format';
import { useCreateNote, useDeleteNote, useUpdateNote } from './api';

interface NotesPanelProps {
  conversation: ConversationDetailDto | undefined;
  loading: boolean;
}

export function NotesPanel({ conversation, loading }: NotesPanelProps) {
  const { t } = useTranslation();
  const [content, setContent] = React.useState('');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editContent, setEditContent] = React.useState('');

  const createMutation = useCreateNote();
  const updateMutation = useUpdateNote();
  const deleteMutation = useDeleteNote();

  const notes = conversation?.internalNotes ?? [];
  const conversationId = conversation?.id ?? null;

  const submitCreate = () => {
    const value = content.trim();
    if (!value || !conversationId) {
      return;
    }
    createMutation.mutate(
      { id: conversationId, input: { content: value } },
      { onSuccess: () => setContent('') },
    );
  };

  const submitEdit = () => {
    const value = editContent.trim();
    if (!value || !conversationId || !editingId) {
      return;
    }
    updateMutation.mutate({ id: conversationId, noteId: editingId, input: { content: value } });
    setEditingId(null);
    setEditContent('');
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b p-3">
        <PenLine className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-sm font-semibold">{t('inbox.internalNotes')}</h3>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <MessageSquareOff className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{t('inbox.noNotes')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => {
              const isEditing = editingId === note.id;
              return (
                <div key={note.id} className="rounded-md border p-3">
                  {isEditing ? (
                    <div className="space-y-2">
                      <Input value={editContent} onChange={(event) => setEditContent(event.target.value)} />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={submitEdit} disabled={updateMutation.isPending}>
                          {t('common.save')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(null);
                            setEditContent('');
                          }}
                        >
                          {t('common.cancel')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap text-sm">{note.content}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-[11px] text-muted-foreground">
                          {note.userName} · {formatDateTime(note.createdAt)}
                        </p>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              setEditingId(note.id);
                              setEditContent(note.content);
                            }}
                            aria-label={t('common.edit')}
                          >
                            <PenLine className="h-3 w-3" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={() => {
                              if (conversationId) {
                                deleteMutation.mutate({ id: conversationId, noteId: note.id });
                              }
                            }}
                            aria-label={t('common.remove')}
                          >
                            <Trash2 className="h-3 w-3" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {conversationId ? (
        <div className="border-t p-3">
          <div className="flex gap-2">
            <Input
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={t('inbox.notePlaceholder')}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitCreate();
                }
              }}
            />
            <Button onClick={submitCreate} disabled={createMutation.isPending || content.trim().length === 0} aria-label={t('inbox.addNote')}>
              <Plus className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
