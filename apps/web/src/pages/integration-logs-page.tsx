import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { WEBHOOK_PROCESSING_STATUSES, type WebhookProcessingStatus } from '@wa/shared';
import {
  Badge,
  Button,
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
} from '@wa/ui';
import { Inbox, Search, X } from 'lucide-react';

import { PageHeader } from '../components/page-header';
import { formatDateTime } from '../lib/format';
import { useWebhookEvents } from '../features/whatsapp/api';
import { WebhookEventDetailSheet } from '../features/whatsapp/webhook-event-detail-sheet';
import type { WebhookEventDto } from '@wa/shared';

const STATUS_BADGE: Record<WebhookProcessingStatus, 'success' | 'destructive' | 'warning' | 'secondary' | 'muted' | 'outline'> = {
  RECEIVED: 'muted',
  QUEUED: 'outline',
  PROCESSING: 'secondary',
  PROCESSED: 'success',
  FAILED: 'destructive',
  IGNORED: 'muted',
} as const;

function StatusBadge({ status }: { status: WebhookProcessingStatus }) {
  const { t } = useTranslation();
  return <Badge variant={STATUS_BADGE[status]}>{t(`webhookEvents.status.${status}`)}</Badge>;
}

export function IntegrationLogsPage() {
  const { t } = useTranslation();
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(20);
  const [eventTypeFilter, setEventTypeFilter] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<WebhookProcessingStatus | ''>('');
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);

  const query = {
    page,
    pageSize,
    eventType: eventTypeFilter.trim() || undefined,
    status: statusFilter || undefined,
  };

  const { data, isLoading, isError, refetch, isFetching } = useWebhookEvents(query);

  const hasFilters = eventTypeFilter.length > 0 || statusFilter !== '';

  const resetFilters = () => {
    setEventTypeFilter('');
    setStatusFilter('');
    setPage(1);
  };

  const openDetail = (event: WebhookEventDto) => {
    setSelectedId(event.id);
    setDetailOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('integrationLogs.title')} description={t('integrationLogs.description')} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={eventTypeFilter}
            onChange={(event) => {
              setEventTypeFilter(event.target.value);
              setPage(1);
            }}
            placeholder={t('integrationLogs.eventTypeFilter')}
            className="ps-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value as WebhookProcessingStatus | '');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder={t('integrationLogs.statusFilter')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('common.all')}</SelectItem>
            {WEBHOOK_PROCESSING_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {t(`webhookEvents.status.${status}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <X className="h-4 w-4" />
            {t('common.clear')}
          </Button>
        ) : null}
      </div>

      {isError ? (
        <ErrorState
          title={t('integrationLogs.loadError')}
          retryLabel={t('common.retry')}
          onRetry={() => void refetch()}
          loading={isFetching}
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('webhookEvents.receivedAt')}</TableHead>
                <TableHead>{t('webhookEvents.eventType')}</TableHead>
                <TableHead>{t('webhookEvents.statusLabel')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('webhookEvents.signature')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('webhookEvents.payloadPreview')}</TableHead>
                <TableHead className="hidden sm:table-cell">{t('webhookEvents.attempts')}</TableHead>
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
                  ? data.items.map((event) => (
                      <TableRow key={event.id} className="cursor-pointer" onClick={() => openDetail(event)}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDateTime(event.receivedAt)}
                        </TableCell>
                        <TableCell className="max-w-52 truncate font-mono text-xs" dir="ltr">
                          {event.eventType}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={event.processingStatus} />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {event.signatureValid ? (
                            <Badge variant="success">{t('yesNo.true')}</Badge>
                          ) : (
                            <Badge variant="destructive">{t('yesNo.false')}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden max-w-xs truncate text-muted-foreground lg:table-cell" dir="auto">
                          {event.payloadPreview}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">{event.processingAttempts}</TableCell>
                      </TableRow>
                    ))
                  : (
                      <TableRow>
                        <TableCell colSpan={6} className="p-0">
                          <EmptyState
                            icon={Inbox}
                            title={t('integrationLogs.noEvents')}
                            description={t('integrationLogs.noEventsDescription')}
                          />
                        </TableCell>
                      </TableRow>
                    )}
            </TableBody>
          </Table>
        </div>
      )}

      {data && data.totalPages > 0 ? (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            {t('common.showingXOfY', { count: data.items.length, total: data.total })}
          </p>
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

      <WebhookEventDetailSheet id={selectedId} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
}
