import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { ContactListSummaryDto, ContactDto, TagSummaryDto } from '@wa/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  toast,
} from '@wa/ui';

import { useAddContactLists, useAddContactTags, useRemoveContactLists, useRemoveContactTags, useTags } from './api';
import { useLists } from './api';

interface AddTagDialogProps {
  contact: ContactDto;
  tags: TagSummaryDto[];
  onOpenChange: (open: boolean) => void;
}

export function AddTagDialog({ contact, tags, onOpenChange }: AddTagDialogProps) {
  const { t } = useTranslation();
  const mutation = useAddContactTags();
  const [tagId, setTagId] = React.useState('');
  const available = tags.filter((tag) => !contact.tags.some((existing) => existing.id === tag.id));

  const handleAdd = async () => {
    if (!tagId) {
      return;
    }
    try {
      await mutation.mutateAsync({ id: contact.id, input: { ids: [tagId] } });
      toast.success(t('contacts.tagAdded'));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('contacts.addTagTitle')}</DialogTitle>
          <DialogDescription className="break-all" dir="ltr">
            {contact.phoneE164}
          </DialogDescription>
        </DialogHeader>
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('contacts.noTagsToAdd')}</p>
        ) : (
          <Select value={tagId} onValueChange={setTagId}>
            <SelectTrigger>
              <SelectValue placeholder={t('contacts.selectTag')} />
            </SelectTrigger>
            <SelectContent>
              {available.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  {tag.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void handleAdd()} disabled={mutation.isPending || !tagId}>
            {mutation.isPending ? <Spinner size="sm" /> : null}
            {t('common.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AddListDialogProps {
  contact: ContactDto & { lists: ContactListSummaryDto[] };
  lists: ContactListSummaryDto[];
  onOpenChange: (open: boolean) => void;
}

export function AddListDialog({ contact, lists, onOpenChange }: AddListDialogProps) {
  const { t } = useTranslation();
  const mutation = useAddContactLists();
  const [listId, setListId] = React.useState('');
  const available = lists.filter((list) => !contact.lists.some((existing) => existing.id === list.id));

  const handleAdd = async () => {
    if (!listId) {
      return;
    }
    try {
      await mutation.mutateAsync({ id: contact.id, input: { ids: [listId] } });
      toast.success(t('contacts.listAdded'));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('contacts.addListTitle')}</DialogTitle>
          <DialogDescription className="break-all" dir="ltr">
            {contact.phoneE164}
          </DialogDescription>
        </DialogHeader>
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('contacts.noListsToAdd')}</p>
        ) : (
          <Select value={listId} onValueChange={setListId}>
            <SelectTrigger>
              <SelectValue placeholder={t('contacts.selectList')} />
            </SelectTrigger>
            <SelectContent>
              {available.map((list) => (
                <SelectItem key={list.id} value={list.id}>
                  {list.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void handleAdd()} disabled={mutation.isPending || !listId}>
            {mutation.isPending ? <Spinner size="sm" /> : null}
            {t('common.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RemoveTagDialogProps {
  tag: TagSummaryDto;
  contactId: string;
  onOpenChange: (open: boolean) => void;
}

export function RemoveTagDialog({ tag, contactId, onOpenChange }: RemoveTagDialogProps) {
  const { t } = useTranslation();
  const mutation = useRemoveContactTags();

  const handleRemove = async () => {
    try {
      await mutation.mutateAsync({ id: contactId, input: { ids: [tag.id] } });
      toast.success(t('contacts.tagRemoved'));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('contacts.removeTagTitle')}</DialogTitle>
          <DialogDescription className="break-all">{tag.name}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={() => void handleRemove()} disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner size="sm" /> : null}
            {t('common.remove')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RemoveListDialogProps {
  list: ContactListSummaryDto;
  contactId: string;
  onOpenChange: (open: boolean) => void;
}

export function RemoveListDialog({ list, contactId, onOpenChange }: RemoveListDialogProps) {
  const { t } = useTranslation();
  const mutation = useRemoveContactLists();

  const handleRemove = async () => {
    try {
      await mutation.mutateAsync({ id: contactId, input: { ids: [list.id] } });
      toast.success(t('contacts.listRemoved'));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('contacts.removeListTitle')}</DialogTitle>
          <DialogDescription className="break-all">{list.name}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={() => void handleRemove()} disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner size="sm" /> : null}
            {t('common.remove')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useTagOptions() {
  return useTags({ page: 1, pageSize: 100 });
}

export function useListOptions() {
  return useLists({ page: 1, pageSize: 100 });
}
