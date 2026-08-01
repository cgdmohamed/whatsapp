import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { CampaignStatus, ContactReportQuery, ExportJobType } from '@wa/shared';
import { CAMPAIGN_STATUSES } from '@wa/shared';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
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
import { BarChart3, Download, Megaphone } from 'lucide-react';

import { PageHeader } from '../components/page-header';
import { formatDateTime } from '../lib/format';
import {
  useCampaignPerformance,
  useContactBreakdown,
  useContactReport,
  useDownloadExport,
  useExports,
  useFailureAnalysis,
  useInboxPerformance,
  useCreateExport,
} from '../features/reports/api';

const STATUS_BADGE: Record<CampaignStatus, 'success' | 'secondary' | 'outline' | 'warning' | 'destructive' | 'muted'> = {
  DRAFT: 'muted',
  VALIDATING: 'secondary',
  READY: 'secondary',
  SCHEDULED: 'outline',
  QUEUING: 'warning',
  RUNNING: 'warning',
  PAUSED: 'outline',
  COMPLETED: 'success',
  CANCELLED: 'muted',
  FAILED: 'destructive',
};

const EXPORT_STATUS_BADGE: Record<string, 'success' | 'secondary' | 'warning' | 'destructive' | 'muted'> = {
  PENDING: 'secondary',
  RUNNING: 'warning',
  COMPLETED: 'success',
  FAILED: 'destructive',
};

type Tab = 'campaigns' | 'failures' | 'inbox' | 'contacts' | 'exports';

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function CampaignsTab() {
  const { t } = useTranslation();
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(10);
  const [statusFilter, setStatusFilter] = React.useState<CampaignStatus | ''>('');
  const { data, isLoading, isError, refetch, isFetching } = useCampaignPerformance({
    page,
    pageSize,
    status: statusFilter || undefined,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value as CampaignStatus | '');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('campaigns.statusFilter')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('common.all')}</SelectItem>
            {CAMPAIGN_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {t(`campaigns.status.${status}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <ErrorState title={t('common.error')} retryLabel={t('common.retry')} onRetry={() => void refetch()} loading={isFetching} />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('campaigns.name')}</TableHead>
                <TableHead>{t('campaigns.status')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('reports.performance.recipients')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('reports.performance.sent')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('reports.performance.delivered')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('reports.performance.deliveryRate')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('reports.performance.readRate')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('campaigns.createdAtShort')}</TableHead>
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
                  ? data.items.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <span className="font-medium">{row.name}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE[row.status]}>
                            {t(`campaigns.status.${row.status}`)}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{row.totalRecipients}</TableCell>
                        <TableCell className="hidden md:table-cell">{row.sentRecipients}</TableCell>
                        <TableCell className="hidden lg:table-cell">{row.deliveredRecipients}</TableCell>
                        <TableCell className="hidden lg:table-cell">{Math.round(row.deliveryRate * 100)}%</TableCell>
                        <TableCell className="hidden lg:table-cell">{Math.round(row.readRate * 100)}%</TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell text-sm">
                          {formatDateTime(row.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))
                  : (
                      <TableRow>
                        <TableCell colSpan={8} className="p-0">
                          <EmptyState
                            icon={Megaphone}
                            title={t('reports.performance.noData')}
                            description={t('reports.performance.noDataDescription')}
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

function FailuresTab() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch, isFetching } = useFailureAnalysis({ limit: 10 });
  return (
    <div className="space-y-4">
      {isError ? (
        <ErrorState title={t('common.error')} retryLabel={t('common.retry')} onRetry={() => void refetch()} loading={isFetching} />
      ) : isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t('reports.failures.total')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{data?.totalFailures ?? 0}</div>
              </CardContent>
            </Card>
          </div>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('reports.failures.code')}</TableHead>
                  <TableHead>{t('reports.failures.message')}</TableHead>
                  <TableHead>{t('reports.failures.count')}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t('reports.failures.lastOccurredAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.buckets.length ? (
                  data.buckets.map((bucket) => (
                    <TableRow key={bucket.code}>
                      <TableCell>
                        <span className="font-mono text-xs" dir="ltr">{bucket.code}</span>
                      </TableCell>
                      <TableCell>{bucket.message}</TableCell>
                      <TableCell>{bucket.count}</TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell text-sm">
                        {formatDateTime(bucket.lastOccurredAt)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="p-0">
                      <EmptyState icon={BarChart3} title={t('reports.failures.none')} />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

function InboxTab() {
  const { t } = useTranslation();
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(10);
  const { data, isLoading, isError, refetch, isFetching } = useInboxPerformance({
    page,
    pageSize,
    sortBy: 'conversationsAssigned',
    sortOrder: 'desc',
  });

  return (
    <div className="space-y-4">
      {isError ? (
        <ErrorState title={t('common.error')} retryLabel={t('common.retry')} onRetry={() => void refetch()} loading={isFetching} />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('reports.inbox.agent')}</TableHead>
                <TableHead>{t('reports.inbox.conversationsAssigned')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('reports.inbox.conversationsClosed')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('reports.inbox.messagesSent')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('reports.inbox.firstResponse')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('reports.inbox.handle')}</TableHead>
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
                  ? data.items.map((row) => (
                      <TableRow key={row.userId}>
                        <TableCell>
                          <span className="font-medium">{row.name}</span>
                          <span className="block text-xs text-muted-foreground">{row.email}</span>
                        </TableCell>
                        <TableCell>{row.conversationsAssigned}</TableCell>
                        <TableCell className="hidden md:table-cell">{row.conversationsClosed}</TableCell>
                        <TableCell className="hidden md:table-cell">{row.messagesSent}</TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {row.avgFirstResponseMinutes != null ? `${Math.round(row.avgFirstResponseMinutes)} ${t('reports.inbox.minutesShort')}` : '—'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {row.avgHandleMinutes != null ? `${Math.round(row.avgHandleMinutes)} ${t('reports.inbox.minutesShort')}` : '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  : (
                      <TableRow>
                        <TableCell colSpan={6} className="p-0">
                          <EmptyState icon={BarChart3} title={t('reports.inbox.noData')} />
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

function ContactsTab() {
  const { t } = useTranslation();
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(10);
  const query: ContactReportQuery = {
    page,
    pageSize,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  };
  const { data, isLoading, isError, refetch, isFetching } = useContactReport(query);
  const breakdown = useContactBreakdown();

  const breakdownItems = [
    { label: t('reports.contacts.breakdown.byStatus'), value: breakdown.data?.byStatus },
    { label: t('reports.contacts.breakdown.byCountry'), value: breakdown.data?.byCountry },
    { label: t('reports.contacts.breakdown.byLanguage'), value: breakdown.data?.byLanguage },
  ].filter((item) => item.value && Object.keys(item.value).length > 0);

  return (
    <div className="space-y-4">
      {isError ? (
        <ErrorState title={t('common.error')} retryLabel={t('common.retry')} onRetry={() => void refetch()} loading={isFetching} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t('reports.contacts.total')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{breakdown.data?.totalContacts ?? 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t('reports.contacts.optedIn')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{breakdown.data?.optedIn ?? 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t('reports.contacts.suppressed')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{breakdown.data?.suppressed ?? 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t('reports.contacts.optedOut')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{breakdown.data?.optedOut ?? 0}</div>
              </CardContent>
            </Card>
          </div>

          {breakdownItems.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {breakdownItems.map((item) => (
                <Card key={item.label}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{item.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {Object.entries(item.value ?? {}).slice(0, 8).map(([key, count]) => (
                      <Badge key={key} variant="secondary" className="text-xs">
                        {key}: {count}
                      </Badge>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}

          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('contacts.contact')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('contacts.phone')}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t('contacts.statusFilter')}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t('contacts.createdAt')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: 6 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell colSpan={4}>
                          <Skeleton className="h-10 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  : data && data.items.length > 0
                    ? data.items.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <span className="font-medium">{row.displayName ?? row.phoneE164}</span>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <span className="font-mono text-xs" dir="ltr">{row.phoneE164}</span>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <Badge variant="secondary">{row.status}</Badge>
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground lg:table-cell text-sm">
                            {formatDateTime(row.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))
                    : (
                        <TableRow>
                          <TableCell colSpan={4} className="p-0">
                            <EmptyState icon={BarChart3} title={t('reports.contacts.noData')} />
                          </TableCell>
                        </TableRow>
                      )}
              </TableBody>
            </Table>
          </div>
        </>
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

function ExportsTab() {
  const { t } = useTranslation();
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(10);
  const [typeFilter, setTypeFilter] = React.useState<ExportJobType | ''>('');
  const { data, isLoading, isError, refetch, isFetching } = useExports({
    page,
    pageSize,
    type: typeFilter || undefined,
  });
  const createExport = useCreateExport();
  const downloadExport = useDownloadExport();

  const createJob = async (type: ExportJobType) => {
    try {
      await createExport.mutateAsync({ type, filters: null });
      toast.success(t('exports.created'));
    } catch {
      toast.error(t('exports.createFailed'));
    }
  };

  const download = async (id: string, filename: string) => {
    try {
      const blob = await downloadExport.mutateAsync(id);
      saveBlob(blob, filename);
    } catch {
      toast.error(t('exports.downloadFailed'));
    }
  };

  const exportOptions: Array<{ type: ExportJobType; label: string }> = [
    { type: 'contacts', label: t('exports.types.contacts') },
    { type: 'campaign-performance', label: t('exports.types.campaign-performance') },
    { type: 'inbox-performance', label: t('exports.types.inbox-performance') },
    { type: 'failure-analysis', label: t('exports.types.failure-analysis') },
    { type: 'audit-log', label: t('exports.types.audit-log') },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={typeFilter}
          onValueChange={(value) => {
            setTypeFilter(value as ExportJobType | '');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder={t('exports.filterType')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('common.all')}</SelectItem>
            {exportOptions.map((option) => (
              <SelectItem key={option.type} value={option.type}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {exportOptions.map((option) => (
          <Button
            key={option.type}
            variant="outline"
            size="sm"
            onClick={() => void createJob(option.type)}
            disabled={createExport.isPending}
          >
            <Download className="h-4 w-4" />
            {option.label}
          </Button>
        ))}
      </div>

      {isError ? (
        <ErrorState title={t('common.error')} retryLabel={t('common.retry')} onRetry={() => void refetch()} loading={isFetching} />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('exports.type')}</TableHead>
                <TableHead>{t('exports.status')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('exports.rows')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('exports.createdAt')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
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
                  ? data.items.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell>{t(`exports.types.${job.type}`)}</TableCell>
                        <TableCell>
                          <Badge variant={EXPORT_STATUS_BADGE[job.status]}>{t(`exports.status.${job.status}`)}</Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{job.totalRows}</TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell text-sm">
                          {formatDateTime(job.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          {job.status === 'COMPLETED' && job.downloadUrl ? (
                            <Button variant="ghost" size="sm" onClick={() => void download(job.id, job.fileName ?? 'export.csv')}>
                              <Download className="h-4 w-4" />
                              {t('exports.download')}
                            </Button>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  : (
                      <TableRow>
                        <TableCell colSpan={5} className="p-0">
                          <EmptyState icon={Download} title={t('exports.none')} />
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

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'campaigns', label: 'reports.tabs.campaigns' },
  { id: 'failures', label: 'reports.tabs.failures' },
  { id: 'inbox', label: 'reports.tabs.inbox' },
  { id: 'contacts', label: 'reports.tabs.contacts' },
  { id: 'exports', label: 'reports.tabs.exports' },
];

export function ReportsPage() {
  const { t } = useTranslation();
  const [active, setActive] = React.useState<Tab>('campaigns');

  return (
    <div className="space-y-6">
      <PageHeader title={t('reports.title')} description={t('reports.description')} />
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Button key={tab.id} variant={active === tab.id ? 'default' : 'outline'} size="sm" onClick={() => setActive(tab.id)}>
            {t(tab.label)}
          </Button>
        ))}
      </div>
      {active === 'campaigns' ? <CampaignsTab /> : null}
      {active === 'failures' ? <FailuresTab /> : null}
      {active === 'inbox' ? <InboxTab /> : null}
      {active === 'contacts' ? <ContactsTab /> : null}
      {active === 'exports' ? <ExportsTab /> : null}
    </div>
  );
}
