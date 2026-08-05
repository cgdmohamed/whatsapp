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
import { Download, MoreHorizontal, Plus, Search, Trash2, UserRound, X } from 'lucide-react';

import { PageHeader } from '../components/page-header';
import { ContextualHelpButton } from '../features/help/help-drawer-provider';
import { EmptyStateHelpLink } from '../features/help/empty-state-help-link';
import { useDebouncedValue } from '../hooks/use-debounce';
import { useAuth } from '../lib/auth';
import { formatDateTime } from '../lib/format';
import { useExportContacts, useContacts } from '../features/contacts/api';
import { ContactFormDialog } from '../features/contacts/contact-form-dialog';
import { ContactDetailSheet } from '../features/contacts/contact-detail-sheet';
import { ArchiveDialog, BulkDeleteContactsDialog, ConsentDialog, DeleteContactDialog, SuppressDialog } from '../features/contacts/contact-action-dialogs';

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

type ActiveDialog = { type: 'create' | 'consent' | 'suppress' | 'archive' | 'delete' } | null;

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
  const [editContact, setEditContact] = React.useState<ContactDto | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [bulkDeleteIds, setBulkDeleteIds] = React.useState<string[]>([]);
  const selectAllRef = React.useRef<HTMLInputElement>(null);
  const exportMutation = useExportContacts();

  const hasFilters = search.length > 0 || statusFilter !== '' || optInFilter !== '' || suppressedFilter !== '';

  React.useEffect(() => {
    setSelectedIds(new Set());
  }, [page, debouncedSearch, statusFilter, optInFilter, suppressedFilter]);

  React.useEffect(() => {
    if (page > 1 && data && data.totalPages > 0 && data.items.length === 0) {
      setPage(data.totalPages);
    }
  }, [page, data]);

  React.useEffect(() => {
    if (selectAllRef.current) {
      const total = data?.items.length ?? 0;
      selectAllRef.current.indeterminate = total > 0 && selectedIds.size > 0 && selectedIds.size < total;
    }
  }, [selectedIds, data]);

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!data) {
      return;
    }
    if (data.items.length > 0 && selectedIds.size === data.items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.items.map((contact) => contact.id)));
    }
  };

  const handleBulkDeleted = () => {
    setSelectedIds(new Set());
  };

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
      await exportMutation.mutateAsync({ query });
      toast.success(t('contacts.exported'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleExportSelected = async () => {
    if (selectedIds.size === 0) {
      return;
    }
    try {
      await exportMutation.mutateAsync({ query: { page: 1, pageSize: 100, sortBy: 'createdAt', sortOrder: 'desc' }, ids: [...selectedIds] });
      toast.success(t('contacts.exported'));
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
          <div className="flex items-center gap-2">
            <ContextualHelpButton featureKey="contacts" />
            {isManagerOrAdmin ? (
              <Button onClick={() => setDialog({ type: 'create' })}>
                <Plus className="h-4 w-4" />
                {t('contacts.create')}
              </Button>
            ) : null}
          </div>
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
          <Button variant="outline" size="sm" onClick={() => void handleExport()} disabled={exportMutation.isPending || (data?.items.length ?? 0) === 0}>
            <Download className="h-4 w-4" />
            {t('contacts.exportCsv')}
          </Button>
        ) : null}
      </div>

      {isManagerOrAdmin && selectedIds.size > 0 ? (
        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
          <p className="text-sm font-medium">{t('contacts.selectedCount', { count: selectedIds.size })}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void handleExportSelected()} disabled={exportMutation.isPending}>
              <Download className="h-4 w-4" />
              {t('contacts.exportSelected')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
              {t('common.clear')}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteIds([...selectedIds])}>
              <Trash2 className="h-4 w-4" />
              {t('contacts.deleteSelected')}
            </Button>
          </div>
        </div>
      ) : null}

      {isError ? (
        <ErrorState title={t('common.error')} retryLabel={t('common.retry')} onRetry={() => void refetch()} loading={isFetching} />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  {isManagerOrAdmin ? (
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={data != null && data.items.length > 0 && selectedIds.size === data.items.length}
                      onChange={toggleSelectAll}
                      aria-label={t('contacts.selectAll')}
                      className="size-4 accent-primary"
                    />
                  ) : null}
                </TableHead>
                <TableHead>{t('contacts.contact')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
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
                      <TableCell colSpan={8}>
                        <Skeleton className="h-10 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : data && data.items.length > 0
                  ? data.items.map((contact) => (
                      <TableRow key={contact.id} className="cursor-pointer" onClick={() => setSelected(contact)}>
                        <TableCell onClick={(event) => event.stopPropagation()} className="w-10">
                          {isManagerOrAdmin ? (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(contact.id)}
                              onChange={() => toggleRow(contact.id)}
                              aria-label={contact.displayName ?? contact.phoneE164}
                              className="size-4 accent-primary"
                            />
                          ) : null}
                        </TableCell>
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
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelected(contact);
                                  setEditContact(contact);
                                }}
                              >
                                {t('common.edit')}
                              </DropdownMenuItem>
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
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => {
                                      setSelected(contact);
                                      setDialog({ type: 'delete' });
                                    }}
                                  >
                                    {t('contacts.delete')}
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  : (
                      <TableRow>
                        <TableCell colSpan={8} className="p-0">
                          <EmptyState icon={UserRound} title={t('contacts.noContacts')} description={t('contacts.noContactsDescription')}>
                            <EmptyStateHelpLink categorySlug="contacts" slug="importing-contacts-from-excel" />
                          </EmptyState>
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
      {editContact ? <ContactFormDialog open onOpenChange={(open) => !open && setEditContact(null)} contact={editContact} /> : null}
      {dialog?.type === 'consent' && selected ? <ConsentDialog contact={selected} onOpenChange={() => setDialog(null)} /> : null}
      {dialog?.type === 'suppress' && selected ? <SuppressDialog contact={selected} onOpenChange={() => setDialog(null)} /> : null}
      {dialog?.type === 'archive' && selected ? <ArchiveDialog contact={selected} onOpenChange={() => setDialog(null)} /> : null}
      {dialog?.type === 'delete' && selected ? <DeleteContactDialog contact={selected} onOpenChange={() => setDialog(null)} /> : null}
      {bulkDeleteIds.length > 0 ? (
        <BulkDeleteContactsDialog ids={bulkDeleteIds} onOpenChange={() => setBulkDeleteIds([])} onDeleted={handleBulkDeleted} />
      ) : null}
    </div>
  );
}
