import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { CONTACT_STATUSES, OPT_IN_STATUSES, type ContactDto, type ContactStatus, type OptInStatus } from '@wa/shared';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  Input,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@wa/ui';
import { Download, MoreHorizontal, Plus, Search, UserRound, X } from 'lucide-react';

import { PageHeader } from '../components/page-header';
import { useDebouncedValue } from '../hooks/use-debounce';
import { useAuth } from '../lib/auth';
import { formatDateTime } from '../lib/format';
import { useBulkContactAction, useContacts } from '../features/contacts/api';
import { ContactFormDialog } from '../features/contacts/contact-form-dialog';
import { ContactDetailSheet } from '../features/contacts/contact-detail-sheet';
import { ArchiveDialog, ConsentDialog, SuppressDialog } from '../features/contacts/contact-action-dialogs';

const STATUS_BADGE: Record<ContactStatus, 'success' | 'warning' | 'muted' | 'destructive' | 'outline'> = {
  ACTIVE: 'success',
  INVALID: 'destructive',
  UNSUBSCRIBED: 'warning',
  BLOCKED: 'destructive',
  ARCHIVED: 'muted',
};

const OPT_IN_BADGE: Record<OptInStatus, 'success' | 'destructive' | 'muted'> = {
  OPTED_IN: 'success',
  OPTED_OUT: 'destructive',
  UNKNOWN: 'muted',
};

type ActiveDialog = { type: 'create' | 'consent' | 'suppress' | 'archive' } | null;

export function ContactsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isManagerOrAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(20);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<ContactStatus | ''>('');
  const [optInFilter, setOptInFilter] = React.useState<OptInStatus | ''>('');
  const [suppressedFilter, setSuppressedFilter] = React.useState<'yes' | 'no' | ''>('');
  const debouncedSearch = useDebouncedValue(search);

  const query = {
    page,
    pageSize,
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    optInStatus: optInFilter || undefined,
    suppressed: suppressedFilter || undefined,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  } as const;

  const { data, isLoading, isError, refetch, isFetching } = useContacts(query);

  const [selected, setSelected] = React.useState<ContactDto | null>(null);
  const [dialog, setDialog] = React.useState<ActiveDialog>(null);
  const bulkExport = useBulkContactAction();

  const hasFilters = search.length > 0 || statusFilter !== '' || optInFilter !== '' || suppressedFilter !== '';

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setOptInFilter('');
    setSuppressedFilter('');
    setPage(1);
  };

  const handleExport = async () => {
    if (!data || data.items.length === 0) {
      return;
    }
    try {
      await bulkExport.mutateAsync({
        action: 'export',
        contactIds: data.items.map((contact) => contact.id),
      });
      toast.info(t('contacts.exportHint'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('contacts.title')}
        description={t('contacts.description')}
        actions={
          isManagerOrAdmin ? (
            <Button onClick={() => setDialog({ type: 'create' })}>
              <Plus className="h-4 w-4" />
              {t('contacts.create')}
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:max-w-xs sm:flex-1">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder={t('contacts.searchPlaceholder')}
              className="ps-9"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value as ContactStatus | '');
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder={t('contacts.statusFilter')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t('common.all')}</SelectItem>
              {CONTACT_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {t(`contacts.status.${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={optInFilter}
            onValueChange={(value) => {
              setOptInFilter(value as OptInStatus | '');
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder={t('contacts.optInFilter')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t('common.all')}</SelectItem>
              {OPT_IN_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {t(`contacts.optIn.${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={suppressedFilter}
            onValueChange={(value) => {
              setSuppressedFilter(value as 'yes' | 'no' | '');
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder={t('contacts.suppressedFilter')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t('common.all')}</SelectItem>
              <SelectItem value="yes">{t('common.yes')}</SelectItem>
              <SelectItem value="no">{t('common.no')}</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="h-4 w-4" />
              {t('common.clear')}
            </Button>
          ) : null}
        </div>
        {isManagerOrAdmin ? (
          <Button variant="outline" size="sm" onClick={() => void handleExport()} disabled={bulkExport.isPending || (data?.items.length ?? 0) === 0}>
            <Download className="h-4 w-4" />
            {t('contacts.exportCsv')}
          </Button>
        ) : null}
      </div>

      {isError ? (
        <ErrorState title={t('common.error')} retryLabel={t('common.retry')} onRetry={() => void refetch()} loading={isFetching} />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('contacts.contact')}</TableHead>
                <TableHead>{t('contacts.status')}</TableHead>
                <TableHead>{t('contacts.optInStatus')}</TableHead>
                <TableHead>{t('contacts.tags')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('contacts.lastActivity')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('contacts.createdAt')}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-10 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : data && data.items.length > 0
                  ? data.items.map((contact) => (
                      <TableRow key={contact.id} className="cursor-pointer" onClick={() => setSelected(contact)}>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {(contact.displayName ?? [contact.firstName, contact.lastName].filter(Boolean).join(' ')) || t('contacts.unnamed')}
                            </p>
                            <p className="truncate text-xs text-muted-foreground" dir="ltr">
                              {contact.phoneE164}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE[contact.status]}>{t(`contacts.status.${contact.status}`)}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant={OPT_IN_BADGE[contact.optInStatus]}>{t(`contacts.optIn.${contact.optInStatus}`)}</Badge>
                            {contact.suppressed ? (
                              <Badge variant="destructive">{t('contacts.suppressed')}</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex max-w-48 flex-wrap gap-1">
                            {contact.tags.slice(0, 3).map((tag) => (
                              <Badge key={tag.id} variant="outline" className="text-xs">
                                {tag.name}
                              </Badge>
                            ))}
                            {contact.tags.length > 3 ? <Badge variant="outline">+{contact.tags.length - 3}</Badge> : null}
                          </div>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">
                          {formatDateTime(contact.lastInboundMessageAt ?? contact.lastOutboundMessageAt)}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell">{formatDateTime(contact.createdAt)}</TableCell>
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={t('common.actions')}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => setSelected(contact)}>{t('contacts.view')}</DropdownMenuItem>
                              {isManagerOrAdmin ? (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelected(contact);
                                      setDialog({ type: 'consent' });
                                    }}
                                  >
                                    {t('contacts.setConsent')}
                                  </DropdownMenuItem>
                                  {contact.status !== 'ARCHIVED' ? (
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setSelected(contact);
                                        setDialog({ type: 'archive' });
                                      }}
                                    >
                                      {t('contacts.archive')}
                                    </DropdownMenuItem>
                                  ) : null}
                                  {!contact.suppressed ? (
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => {
                                        setSelected(contact);
                                        setDialog({ type: 'suppress' });
                                      }}
                                    >
                                      {t('contacts.suppress')}
                                    </DropdownMenuItem>
                                  ) : null}
                                </>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  : (
                      <TableRow>
                        <TableCell colSpan={7} className="p-0">
                          <EmptyState icon={UserRound} title={t('contacts.noContacts')} description={t('contacts.noContactsDescription')} />
                        </TableCell>
                      </TableRow>
                    )}
            </TableBody>
          </Table>
        </div>
      )}

      {data && data.totalPages > 0 ? (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-muted-foreground">{t('common.showingXOfY', { count: data.items.length, total: data.total })}</p>
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            onPageChange={setPage}
            labels={{
              firstPage: t('common.firstPage'),
              lastPage: t('common.lastPage'),
              prevPage: t('common.previousPage'),
              nextPage: t('common.nextPage'),
            }}
          />
        </div>
      ) : null}

      {selected ? <ContactDetailSheet contact={selected} onOpenChange={(open) => !open && setSelected(null)} /> : null}

      {dialog?.type === 'create' ? <ContactFormDialog open onOpenChange={(open) => !open && setDialog(null)} contact={null} /> : null}
      {dialog?.type === 'consent' && selected ? <ConsentDialog contact={selected} onOpenChange={() => setDialog(null)} /> : null}
      {dialog?.type === 'suppress' && selected ? <SuppressDialog contact={selected} onOpenChange={() => setDialog(null)} /> : null}
      {dialog?.type === 'archive' && selected ? <ArchiveDialog contact={selected} onOpenChange={() => setDialog(null)} /> : null}
    </div>
  );
}
