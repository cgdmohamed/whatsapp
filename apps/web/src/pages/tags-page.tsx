import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { TagDto } from '@wa/shared';
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
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@wa/ui';
import { MoreHorizontal, Plus, Search, Tag, X } from 'lucide-react';

import { PageHeader } from '../components/page-header';
import { useDebouncedValue } from '../hooks/use-debounce';
import { useAuth } from '../lib/auth';
import { formatDateTime } from '../lib/format';
import { useArchiveTag, useTags } from '../features/contacts/api';
import { TagFormDialog } from '../features/tags/tag-form-dialog';

export function TagsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isManagerOrAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(50);
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading, isError, refetch, isFetching } = useTags({ page, pageSize, search: debouncedSearch || undefined });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editingTag, setEditingTag] = React.useState<TagDto | null>(null);
  const [archiveTag, setArchiveTag] = React.useState<TagDto | null>(null);
  const archiveMutation = useArchiveTag();

  const openCreate = () => {
    setEditingTag(null);
    setFormOpen(true);
  };

  const openEdit = (tag: TagDto) => {
    setEditingTag(tag);
    setFormOpen(true);
  };

  const handleArchive = async () => {
    if (!archiveTag) {
      return;
    }
    try {
      await archiveMutation.mutateAsync(archiveTag.id);
      toast.success(t('tags.archivedSuccess'));
      setArchiveTag(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('tags.title')}
        description={t('tags.description')}
        actions={
          isManagerOrAdmin ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              {t('tags.create')}
            </Button>
          ) : null
        }
      />

      <div className="relative sm:max-w-xs">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder={t('tags.searchPlaceholder')}
          className="ps-9"
        />
      </div>

      {isError ? (
        <ErrorState title={t('common.error')} retryLabel={t('common.retry')} onRetry={() => void refetch()} loading={isFetching} />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('tags.name')}</TableHead>
                <TableHead>{t('tags.slug')}</TableHead>
                <TableHead>{t('tags.description')}</TableHead>
                <TableHead>{t('tags.contacts')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('tags.createdAt')}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-10 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : data && data.items.length > 0
                  ? data.items.map((tag) => (
                      <TableRow key={tag.id}>
                        <TableCell>
                          <Badge variant="outline" className="gap-1.5">
                            <Tag className="h-3 w-3" />
                            {tag.name}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground" dir="ltr">
                          {tag.slug}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-muted-foreground">{tag.description ?? '—'}</TableCell>
                        <TableCell>{tag.contactCount}</TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">{formatDateTime(tag.createdAt)}</TableCell>
                        <TableCell>
                          {isManagerOrAdmin ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label={t('common.actions')}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => openEdit(tag)}>{t('common.edit')}</DropdownMenuItem>
                                {tag.archivedAt === null ? (
                                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setArchiveTag(tag)}>
                                    {t('tags.archive')}
                                  </DropdownMenuItem>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))
                  : (
                      <TableRow>
                        <TableCell colSpan={6} className="p-0">
                          <EmptyState icon={Tag} title={t('tags.noTags')} description={t('tags.noTagsDescription')} />
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

      <TagFormDialog open={formOpen} onOpenChange={setFormOpen} tag={editingTag} key={editingTag?.id ?? 'create'} />

      <AlertDialog open={archiveTag !== null} onOpenChange={(open) => !open && setArchiveTag(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('tags.archiveTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="break-all">{archiveTag?.name}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveMutation.isPending}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleArchive()} disabled={archiveMutation.isPending}>
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {search.length > 0 ? (
        <Button variant="ghost" size="sm" onClick={() => setSearch('')}>
          <X className="h-4 w-4" />
          {t('common.clear')}
        </Button>
      ) : null}
    </div>
  );
}
