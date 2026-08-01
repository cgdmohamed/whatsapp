import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@wa/ui';
import { Activity, RefreshCw, Trash2 } from 'lucide-react';

import { PageHeader } from '../components/page-header';
import { formatDateTime } from '../lib/format';
import { useDrainFailed, useOperationsStatus, useRetryFailed } from '../features/reports/api';

function QueueRow({ name, queue }: { name: string; queue: import('@wa/shared').QueueStatusDto }) {
  const { t } = useTranslation();
  const retry = useRetryFailed();
  const drain = useDrainFailed();
  const [pending, setPending] = React.useState(false);

  const busy = retry.isPending || drain.isPending || pending;

  const run = async (fn: () => Promise<unknown>, successKey: string) => {
    setPending(true);
    try {
      const result = await fn();
      const summary = result as { retried?: number; removed?: number; errors: string[] };
      const count = summary.retried ?? summary.removed ?? 0;
      if (summary.errors.length > 0) {
        toast.error(t('operations.partialError', { count: summary.errors.length }));
      } else {
        toast.success(t(successKey, { count }));
      }
    } catch {
      toast.error(t('operations.actionFailed'));
    } finally {
      setPending(false);
    }
  };

  return (
    <TableRow key={queue.name}>
      <TableCell>
        <span className="font-mono text-xs" dir="ltr">{name}</span>
      </TableCell>
      <TableCell>{queue.waiting}</TableCell>
      <TableCell>{queue.active}</TableCell>
      <TableCell>{queue.delayed}</TableCell>
      <TableCell>
        <Badge variant={queue.failed > 0 ? 'destructive' : 'secondary'}>{queue.failed}</Badge>
      </TableCell>
      <TableCell className="hidden lg:table-cell">{queue.completed}</TableCell>
      <TableCell className="hidden lg:table-cell">
        {queue.paused ? <Badge variant="warning">{t('operations.paused')}</Badge> : <Badge variant="success">{t('operations.active')}</Badge>}
      </TableCell>
      <TableCell className="hidden md:table-cell">{queue.workers}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('operations.retry')}
            disabled={busy || queue.failed === 0}
            onClick={() => void run(() => retry.mutateAsync({ queue: queue.name }), 'operations.retried')}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('operations.drain')}
            disabled={busy || queue.failed === 0}
            onClick={() => void run(() => drain.mutateAsync({ queue: queue.name }), 'operations.drained')}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export function OperationsPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch, isFetching } = useOperationsStatus();

  return (
    <div className="space-y-6">
      <PageHeader title={t('operations.title')} description={t('operations.description')} />

      {isError ? (
        <ErrorState title={t('common.error')} retryLabel={t('common.retry')} onRetry={() => void refetch()} loading={isFetching} />
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Activity className="h-4 w-4" />
                  {t('operations.uptime')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{formatUptime(data?.uptimeSeconds ?? 0)}</div>
                <p className="mt-1 text-xs text-muted-foreground">v{data?.version}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t('operations.database')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {data?.database.up ? (
                    <Badge variant="success">{t('operations.up')}</Badge>
                  ) : (
                    <Badge variant="destructive">{t('operations.down')}</Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data?.database.latencyMs != null ? `${data.database.latencyMs}ms` : '—'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t('operations.redis')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {data?.redis.up ? (
                    <Badge variant="success">{t('operations.up')}</Badge>
                  ) : (
                    <Badge variant="destructive">{t('operations.down')}</Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data?.redis.latencyMs != null ? `${data.redis.latencyMs}ms` : '—'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t('operations.whatsapp')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {data?.whatsapp.accountStatus ? (
                    <Badge variant={data.whatsapp.accountStatus === 'CONNECTED' ? 'success' : 'warning'}>
                      {t(`operations.accountStatus.${data.whatsapp.accountStatus}`)}
                    </Badge>
                  ) : (
                    '—'
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('operations.phoneNumbers', { count: data?.whatsapp.phoneNumbers ?? 0 })}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('operations.webhooks')}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 text-sm">
                <Badge variant="secondary">{t('operations.webhookStatus.RECEIVED')}: {data?.webhooks.received ?? 0}</Badge>
                <Badge variant="secondary">{t('operations.webhookStatus.QUEUED')}: {data?.webhooks.queued ?? 0}</Badge>
                <Badge variant="warning">{t('operations.webhookStatus.PROCESSING')}: {data?.webhooks.processing ?? 0}</Badge>
                <Badge variant="success">{t('operations.webhookStatus.PROCESSED')}: {data?.webhooks.processed ?? 0}</Badge>
                <Badge variant="destructive">{t('operations.webhookStatus.FAILED')}: {data?.webhooks.failed ?? 0}</Badge>
                <Badge variant="muted">{t('operations.webhookStatus.IGNORED')}: {data?.webhooks.ignored ?? 0}</Badge>
                <span className="text-muted-foreground">
                  {t('operations.oldestPending', { seconds: data?.webhooks.oldestPendingSeconds != null ? Math.round(data.webhooks.oldestPendingSeconds) : 0 })}
                </span>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('operations.inbox')}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 text-sm">
                <Badge variant="secondary">{t('operations.inbox.open')}: {data?.inbox.openConversations ?? 0}</Badge>
                <Badge variant="warning">{t('operations.inbox.unread')}: {data?.inbox.unreadConversations ?? 0}</Badge>
                <Badge variant="muted">{t('operations.inbox.unassigned')}: {data?.inbox.unassignedConversations ?? 0}</Badge>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('operations.queues')}</CardTitle>
              <CardDescription>{t('operations.queuesDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('operations.queueName')}</TableHead>
                      <TableHead>{t('operations.waiting')}</TableHead>
                      <TableHead>{t('operations.activeJobs')}</TableHead>
                      <TableHead>{t('operations.delayed')}</TableHead>
                      <TableHead>{t('operations.failed')}</TableHead>
                      <TableHead className="hidden lg:table-cell">{t('operations.completed')}</TableHead>
                      <TableHead className="hidden lg:table-cell">{t('operations.paused')}</TableHead>
                      <TableHead className="hidden md:table-cell">{t('operations.workers')}</TableHead>
                      <TableHead className="text-right">{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.queues.map((queue) => (
                      <QueueRow key={queue.name} name={queue.name} queue={queue} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            {t('operations.generatedAt')} {data?.generatedAt ? formatDateTime(data.generatedAt) : '—'}
          </p>
        </>
      )}
    </div>
  );
}
