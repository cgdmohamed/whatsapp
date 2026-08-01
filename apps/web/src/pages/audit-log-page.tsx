import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { AuditLogQuery } from '@wa/shared';
import {
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
} from '@wa/ui';
import { ScrollText } from 'lucide-react';

import { PageHeader } from '../components/page-header';
import { formatDateTime } from '../lib/format';
import { useAuditLogs } from '../features/reports/api';

export function AuditLogPage() {
  const { t } = useTranslation();
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(20);
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const query: AuditLogQuery = {
    page,
    pageSize,
    search: debouncedSearch.trim() || undefined,
  };
  const { data, isLoading, isError, refetch, isFetching } = useAuditLogs(query);

  return (
    <div className="space-y-6">
      <PageHeader title={t('auditLog.title')} description={t('auditLog.description')} />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="w-full sm:max-w-xs"
          placeholder={t('auditLog.searchPlaceholder')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {isError ? (
        <ErrorState title={t('common.error')} retryLabel={t('common.retry')} onRetry={() => void refetch()} loading={isFetching} />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('auditLog.createdAt')}</TableHead>
                <TableHead>{t('auditLog.actor')}</TableHead>
                <TableHead>{t('auditLog.action')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('auditLog.entity')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('auditLog.details')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={5}>
                        <Skeleton className="h-10 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : data && data.items.length > 0
                  ? data.items.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDateTime(row.createdAt)}
                        </TableCell>
                        <TableCell>{row.actorName ?? '—'}</TableCell>
                        <TableCell>
                          <span className="font-mono text-xs" dir="ltr">{row.action}</span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-xs text-muted-foreground">
                            {row.entityType ?? '—'}
                            {row.entityId ? <span className="ml-1 font-mono">({row.entityId.slice(0, 8)})</span> : null}
                          </span>
                        </TableCell>
                        <TableCell className="hidden max-w-md lg:table-cell">
                          {row.metadata ? (
                            <span className="block truncate text-xs text-muted-foreground" dir="ltr">
                              {JSON.stringify(row.metadata)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  : (
                      <TableRow>
                        <TableCell colSpan={5} className="p-0">
                          <EmptyState icon={ScrollText} title={t('auditLog.noLogs')} description={t('auditLog.noLogsDescription')} />
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
    </div>
  );
}
