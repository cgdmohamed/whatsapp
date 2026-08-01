import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { ContactDetailDto, ContactDto, ContactListSummaryDto, TagSummaryDto } from '@wa/shared';
import {
  Badge,
  Button,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
} from '@wa/ui';
import { Ban, Plus, ShieldAlert, ShieldCheck, Trash2, UserRound } from 'lucide-react';

import { useAuth } from '../../lib/auth';
import { formatDateTime } from '../../lib/format';
import { useContactDetail } from './api';
import { ArchiveDialog, ConsentDialog, SuppressDialog, UnsuppressDialog } from './contact-action-dialogs';
import {
  AddListDialog,
  AddTagDialog,
  RemoveListDialog,
  RemoveTagDialog,
  useListOptions,
  useTagOptions,
} from './contact-manage-dialogs';
import { ContactFormDialog } from './contact-form-dialog';

type ActiveDialog =
  | { type: 'edit' }
  | { type: 'consent' }
  | { type: 'suppress' }
  | { type: 'unsuppress' }
  | { type: 'archive' }
  | { type: 'addTag' }
  | { type: 'addList' }
  | { type: 'removeTag'; tag: TagSummaryDto }
  | { type: 'removeList'; list: ContactListSummaryDto };

interface ContactDetailSheetProps {
  contact: ContactDto;
  onOpenChange: (open: boolean) => void;
}

export function ContactDetailSheet({ contact, onOpenChange }: ContactDetailSheetProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data, isLoading } = useContactDetail(contact.id);
  const tags = useTagOptions();
  const lists = useListOptions();
  const [dialog, setDialog] = React.useState<ActiveDialog | null>(null);

  const isManagerOrAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const isAdmin = user?.role === 'ADMIN';
  const isArchived = contact.status === 'ARCHIVED';
  const canRemoveSuppression = isAdmin;

  const detail: ContactDetailDto = data ?? {
    ...contact,
    lists: [],
    consentHistory: [],
    suppressionEntries: [],
    importHistory: [],
    auditEvents: [],
  };

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t('contacts.detailTitle')}</SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            <span dir="ltr">{contact.phoneE164}</span>
            <Badge variant={contact.suppressed ? 'destructive' : 'secondary'}>
              {contact.suppressed ? t('contacts.suppressed') : t('contacts.active')}
            </Badge>
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : null}

          <div className="space-y-1">
            <h3 className="text-sm font-medium">{t('contacts.contactInfo')}</h3>
            <dl className="space-y-1 text-sm">
              <Row label={t('contacts.displayName')}>{detail.displayName ?? '—'}</Row>
              <Row label={t('contacts.firstName')}>{detail.firstName ?? '—'}</Row>
              <Row label={t('contacts.lastName')}>{detail.lastName ?? '—'}</Row>
              <Row label={t('contacts.email')}>
                {detail.email ? (
                  <span dir="ltr">{detail.email}</span>
                ) : (
                  '—'
                )}
              </Row>
              <Row label={t('contacts.company')}>{detail.company ?? '—'}</Row>
              <Row label={t('contacts.country')}>{detail.phoneCountry ?? '—'}</Row>
              <Row label={t('contacts.language')}>{detail.language ? t(`languages.${detail.language}`) : '—'}</Row>
              <Row label={t('common.source')}>
                {detail.source ? t(`contacts.source.${detail.source}`, { defaultValue: detail.source }) : '—'}
              </Row>
              <Row label={t('common.status')}>{t(`contacts.status.${detail.status}`)}</Row>
              <Row label={t('contacts.optInStatus')}>{t(`contacts.optIn.${detail.optInStatus}`)}</Row>
              <Row label={t('contacts.createdAt')}>{formatDateTime(detail.createdAt)}</Row>
            </dl>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">{t('contacts.tags')}</h3>
              {isManagerOrAdmin ? (
                <Button variant="ghost" size="sm" onClick={() => setDialog({ type: 'addTag' })}>
                  <Plus className="h-4 w-4" />
                  {t('common.add')}
                </Button>
              ) : null}
            </div>
            {detail.tags.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('contacts.noTags')}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {detail.tags.map((tag) => (
                  <Badge key={tag.id} variant="outline" className="gap-1">
                    {tag.name}
                    {isManagerOrAdmin ? (
                      <button
                        type="button"
                        aria-label={t('common.remove')}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDialog({ type: 'removeTag', tag })}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    ) : null}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">{t('contacts.lists')}</h3>
              {isManagerOrAdmin ? (
                <Button variant="ghost" size="sm" onClick={() => setDialog({ type: 'addList' })}>
                  <Plus className="h-4 w-4" />
                  {t('common.add')}
                </Button>
              ) : null}
            </div>
            {detail.lists.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('contacts.noLists')}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {detail.lists.map((list) => (
                  <Badge key={list.id} variant="secondary" className="gap-1">
                    {list.name}
                    {isManagerOrAdmin ? (
                      <button
                        type="button"
                        aria-label={t('common.remove')}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDialog({ type: 'removeList', list })}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    ) : null}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t('contacts.suppression')}</h3>
            {detail.suppressionEntries.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4" />
                {t('contacts.notSuppressed')}
              </p>
            ) : (
              <div className="space-y-2">
                {detail.suppressionEntries.map((entry) => (
                  <div key={entry.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-medium">
                        <ShieldAlert className="h-4 w-4 text-destructive" />
                        {t(`contacts.reasons.${entry.reason}`)}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</span>
                    </div>
                    {entry.source ? <p className="mt-1 text-xs text-muted-foreground">{entry.source}</p> : null}
                    {entry.removedAt ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('contacts.removedAt')} {formatDateTime(entry.removedAt)}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {!contact.suppressed ? (
                isManagerOrAdmin ? (
                  <Button size="sm" variant="destructive" onClick={() => setDialog({ type: 'suppress' })}>
                    <Ban className="h-4 w-4" />
                    {t('contacts.suppress')}
                  </Button>
                ) : null
              ) : canRemoveSuppression ? (
                <Button size="sm" variant="outline" onClick={() => setDialog({ type: 'unsuppress' })}>
                  {t('contacts.unsuppress')}
                </Button>
              ) : null}
              {isManagerOrAdmin ? (
                <Button size="sm" variant="outline" onClick={() => setDialog({ type: 'consent' })}>
                  {t('contacts.setConsent')}
                </Button>
              ) : null}
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t('contacts.consentHistory')}</h3>
            {detail.consentHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('contacts.noConsentHistory')}</p>
            ) : (
              <div className="space-y-2">
                {detail.consentHistory.map((record) => (
                  <div key={record.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={record.status === 'OPTED_IN' ? 'success' : 'secondary'}>
                        {t(`contacts.optIn.${record.status}`)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatDateTime(record.obtainedAt)}</span>
                    </div>
                    {record.source ? <p className="mt-1 text-xs text-muted-foreground">{record.source}</p> : null}
                    {record.expiresAt ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('contacts.expiresAt')} {formatDateTime(record.expiresAt)}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          {detail.importHistory.length > 0 ? (
            <>
              <Separator />
              <div className="space-y-2">
                <h3 className="text-sm font-medium">{t('contacts.importHistory')}</h3>
                <div className="space-y-2">
                  {detail.importHistory.map((entry) => (
                    <div key={entry.importJobId} className="flex items-center justify-between rounded-md border p-3 text-sm">
                      <span className="truncate">{entry.fileName}</span>
                      <span className="text-xs text-muted-foreground">
                        {t(`contacts.importRowStatus.${entry.status}`)} · {formatDateTime(entry.importedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {detail.auditEvents.length > 0 ? (
            <>
              <Separator />
              <div className="space-y-2">
                <h3 className="text-sm font-medium">{t('contacts.auditHistory')}</h3>
                <div className="space-y-2">
                  {detail.auditEvents.map((event) => (
                    <div key={event.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                      <span className="truncate">{event.action}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {event.actorName ?? '—'} · {formatDateTime(event.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {isManagerOrAdmin ? (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={() => setDialog({ type: 'edit' })}>{t('common.edit')}</Button>
              <Button variant="outline" onClick={() => setDialog({ type: 'archive' })}>
                {isArchived ? t('contacts.restore') : t('contacts.archive')}
              </Button>
            </div>
          ) : null}

          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <UserRound className="h-3 w-3" />
            {t('contacts.updatedAt')} {formatDateTime(detail.updatedAt)}
          </p>
        </div>

        {dialog?.type === 'edit' ? (
          <ContactFormDialog open onOpenChange={() => setDialog(null)} contact={contact} />
        ) : null}
        {dialog?.type === 'consent' ? (
          <ConsentDialog contact={contact} onOpenChange={() => setDialog(null)} />
        ) : null}
        {dialog?.type === 'suppress' ? (
          <SuppressDialog contact={contact} onOpenChange={() => setDialog(null)} />
        ) : null}
        {dialog?.type === 'unsuppress' ? (
          <UnsuppressDialog contact={contact} onOpenChange={() => setDialog(null)} />
        ) : null}
        {dialog?.type === 'archive' ? <ArchiveDialog contact={contact} onOpenChange={() => setDialog(null)} /> : null}
        {dialog?.type === 'addTag' ? (
          <AddTagDialog
            contact={contact}
            tags={(tags.data?.items ?? []) as TagSummaryDto[]}
            onOpenChange={() => setDialog(null)}
          />
        ) : null}
        {dialog?.type === 'removeTag' ? (
          <RemoveTagDialog tag={dialog.tag} contactId={contact.id} onOpenChange={() => setDialog(null)} />
        ) : null}
        {dialog?.type === 'addList' ? (
          <AddListDialog
            contact={detail}
            lists={(lists.data?.items ?? []) as ContactListSummaryDto[]}
            onOpenChange={() => setDialog(null)}
          />
        ) : null}
        {dialog?.type === 'removeList' ? (
          <RemoveListDialog list={dialog.list} contactId={contact.id} onOpenChange={() => setDialog(null)} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[60%] truncate text-end">{children}</dd>
    </div>
  );
}
