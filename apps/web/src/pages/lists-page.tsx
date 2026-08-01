import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { LIST_TYPES, type ContactListDto } from '@wa/shared';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import { List, MoreHorizontal, Plus, Search, X } from 'lucide-react';

import { PageHeader } from '../components/page-header';
import { ContextualHelpButton } from '../features/help/help-drawer-provider';
import { useDebouncedValue } from '../hooks/use-debounce';
import { useAuth } from '../lib/auth';
import { formatDateTime } from '../lib/format';
import { useArchiveList, useLists } from '../features/contacts/api';
import { ListFormDialog } from '../features/lists/list-form-dialog';
import { ListMembersDialog } from '../features/lists/list-members-dialog';

export function ListsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isManagerOrAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(50);
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState<'' | (typeof LIST_TYPES)[number]>('');
  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading, isError, refetch, isFetching } = useLists({
    page,
    pageSize,
    search: debouncedSearch || undefined,
    type: typeFilter || undefined,
  });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editingList, setEditingList] = React.useState<ContactListDto | null>(null);
  const [archiveList, setArchiveList] = React.useState<ContactListDto | null>(null);
  const [membersList, setMembersList] = React.useState<ContactListDto | null>(null);
  const archiveMutation = useArchiveList();

  const openCreate = () => {
    setEditingList(null);
    setFormOpen(true);
  };

  const openEdit = (list: ContactListDto) => {
    setEditingList(list);
    setFormOpen(true);
  };

  const handleArchive = async () => {
    if (!archiveList) {
      return;
    }
    try {
      await archiveMutation.mutateAsync(archiveList.id);
      toast.success(t('lists.archivedSuccess'));
      setArchiveList(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('lists.title')}
        description={t('lists.description')}
        actions={
          <div className="flex items-center gap-2">
            <ContextualHelpButton featureKey="lists" />
            {isManagerOrAdmin ? (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                {t('lists.create')}
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder={t('lists.searchPlaceholder')}
            className="ps-9"
          />
        </div>
        <Select
          value={typeFilter}
          onValueChange={(value) => {
            setTypeFilter(value as typeof typeFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder={t('lists.typeFilter')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('common.all')}</SelectItem>
            {LIST_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {t(`lists.types.${type}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {search.length > 0 || typeFilter !== '' ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              setTypeFilter('');
              setPage(1);
            }}
          >
            <X className="h-4 w-4" />
            {t('common.clear')}
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
                <TableHead>{t('lists.name')}</TableHead>
                <TableHead>{t('lists.type')}</TableHead>
                <TableHead>{t('lists.contacts')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('lists.createdAt')}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={5}>
                        <Skeleton className="h-10 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : data && data.items.length > 0
                  ? data.items.map((list) => (
                      <TableRow key={list.id}>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 truncate font-medium">
                              <List className="h-3.5 w-3.5 text-muted-foreground" />
                              {list.name}
                            </p>
                            {list.description ? (
                              <p className="max-w-xs truncate text-xs text-muted-foreground">{list.description}</p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={list.type === 'STATIC' ? 'default' : 'secondary'}>{t(`lists.types.${list.type}`)}</Badge>
                        </TableCell>
                        <TableCell>{list.activeContactCount}</TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">{formatDateTime(list.createdAt)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={t('common.actions')}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => setMembersList(list)}>{t('lists.viewMembers')}</DropdownMenuItem>
                              {isManagerOrAdmin ? (
                                <>
                                  <DropdownMenuItem onClick={() => openEdit(list)}>{t('common.edit')}</DropdownMenuItem>
                                  {list.archivedAt === null ? (
                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setArchiveList(list)}>
                                      {t('lists.archive')}
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
                        <TableCell colSpan={5} className="p-0">
                          <EmptyState icon={List} title={t('lists.noLists')} description={t('lists.noListsDescription')} />
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

      <ListFormDialog open={formOpen} onOpenChange={setFormOpen} list={editingList} key={editingList?.id ?? 'create'} />
      {membersList ? <ListMembersDialog list={membersList} onOpenChange={(open) => !open && setMembersList(null)} /> : null}

      <AlertDialog open={archiveList !== null} onOpenChange={(open) => !open && setArchiveList(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('lists.archiveTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="break-all">{archiveList?.name}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveMutation.isPending}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleArchive()} disabled={archiveMutation.isPending}>
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
