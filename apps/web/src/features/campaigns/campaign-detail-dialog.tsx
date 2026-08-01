import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { CampaignDto, CampaignRecipientStatus } from '@wa/shared';
import { CAMPAIGN_RECIPIENT_STATUSES } from '@wa/shared';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@wa/ui';
import { AlertTriangle, Ban, Copy, Download, Pause, Play, Send, Trash } from 'lucide-react';

import { formatDateTime } from '../../lib/format';
import {
  useCampaignAction,
  useCampaignMetrics,
  useCampaignRecipients,
  useRecipientsCsv,
  useTestSend,
} from './api';

const STATUS_BADGE: Record<string, 'success' | 'secondary' | 'outline' | 'warning' | 'destructive' | 'muted'> = {
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

const RECIPIENT_BADGE: Record<string, 'success' | 'secondary' | 'outline' | 'warning' | 'destructive' | 'muted'> = {
  PENDING: 'muted',
  INELIGIBLE: 'muted',
  QUEUED: 'warning',
  SENDING: 'warning',
  SENT: 'secondary',
  DELIVERED: 'outline',
  READ: 'success',
  REPLIED: 'success',
  FAILED: 'destructive',
  CANCELLED: 'muted',
  OPTED_OUT: 'destructive',
};

interface DetailProps {
  campaign: CampaignDto;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

export function CampaignDetailDialog({ campaign, onOpenChange, onChanged }: DetailProps) {
  const { t } = useTranslation();
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(50);
  const [statusFilter, setStatusFilter] = React.useState<CampaignRecipientStatus | ''>('');
  const [failureCode, setFailureCode] = React.useState('');

  const metrics = useCampaignMetrics(campaign.id);
  const recipients = useCampaignRecipients(campaign.id, {
    page,
    pageSize,
    status: statusFilter || undefined,
    failureCode: failureCode || undefined,
    sortBy: 'createdAt',
    sortOrder: 'asc',
  });

  const startMutation = useCampaignAction('start');
  const pauseMutation = useCampaignAction('pause');
  const resumeMutation = useCampaignAction('resume');
  const cancelMutation = useCampaignAction('cancel');
  const duplicateMutation = useCampaignAction('duplicate');
  const archiveMutation = useCampaignAction('archive');
  const testSendMutation = useTestSend();
  const csvMutation = useRecipientsCsv();

  const [testNumbers, setTestNumbers] = React.useState('');

  const runAction = async (action: ReturnType<typeof useCampaignAction>, label: string) => {
    try {
      await action.mutateAsync(campaign.id);
      toast.success(label);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleTestSend = async () => {
    const numbers = testNumbers.split(',').map((value) => value.trim()).filter(Boolean).slice(0, 5);
    if (numbers.length === 0) {
      toast.error(t('campaigns.testNumbersRequired'));
      return;
    }
    try {
      const results = await testSendMutation.mutateAsync({ id: campaign.id, input: { testNumbers: numbers } });
      const failed = results.filter((result) => !result.success);
      if (failed.length === 0) {
        toast.success(t('campaigns.testSendSuccess'));
      } else {
        toast.error(t('campaigns.testSendPartial', { failed: failed.length }));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleDownloadCsv = async () => {
    try {
      const blob = await csvMutation.mutateAsync(campaign.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `campaign-${campaign.id}-recipients.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const metricsData = metrics.data ?? {};

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="truncate">{campaign.name}</span>
            <Badge variant={STATUS_BADGE[campaign.status] ?? 'outline'}>{t(`campaigns.status.${campaign.status}`)}</Badge>
            {campaign.templateSnapshot ? (
              <Badge variant="outline" className="font-mono" dir="ltr">
                {campaign.templateSnapshot.name}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {t('campaigns.createdAt', { time: formatDateTime(campaign.createdAt) })} · {t('campaigns.totalRecipients', { count: campaign.totalRecipients })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          <MetricCard label={t('campaigns.metrics.sent')} value={metricsData.sent ?? 0} />
          <MetricCard label={t('campaigns.metrics.delivered')} value={metricsData.delivered ?? 0} />
          <MetricCard label={t('campaigns.metrics.read')} value={metricsData.read ?? 0} />
          <MetricCard label={t('campaigns.metrics.replied')} value={metricsData.replied ?? 0} />
          <MetricCard label={t('campaigns.metrics.failed')} value={metricsData.failed ?? 0} destructive />
          <MetricCard label={t('campaigns.metrics.queued')} value={metricsData.queued ?? 0} />
          <MetricCard label={t('campaigns.metrics.optedOut')} value={metricsData.optedOut ?? 0} destructive />
        </div>

        {campaign.status === 'SCHEDULED' && campaign.scheduledAt ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t('campaigns.scheduledAtLabel')}</AlertTitle>
            <AlertDescription>{formatDateTime(campaign.scheduledAt)}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {campaign.status === 'READY' ? (
            <Button onClick={() => void runAction(startMutation, t('campaigns.started'))}>
              <Play className="h-4 w-4" />
              {t('campaigns.startNow')}
            </Button>
          ) : null}
          {['QUEUING', 'RUNNING'].includes(campaign.status) ? (
            <Button variant="outline" onClick={() => void runAction(pauseMutation, t('campaigns.paused'))}>
              <Pause className="h-4 w-4" />
              {t('campaigns.pause')}
            </Button>
          ) : null}
          {campaign.status === 'PAUSED' ? (
            <Button onClick={() => void runAction(resumeMutation, t('campaigns.resumed'))}>
              <Play className="h-4 w-4" />
              {t('campaigns.resume')}
            </Button>
          ) : null}
          {!['COMPLETED', 'CANCELLED', 'FAILED'].includes(campaign.status) ? (
            <Button variant="outline" onClick={() => void runAction(cancelMutation, t('campaigns.cancelled'))}>
              <Ban className="h-4 w-4" />
              {t('campaigns.cancel')}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => void runAction(duplicateMutation, t('campaigns.duplicated'))}>
            <Copy className="h-4 w-4" />
            {t('campaigns.duplicate')}
          </Button>
          {['COMPLETED', 'CANCELLED', 'FAILED'].includes(campaign.status) ? (
            <Button variant="outline" onClick={() => void runAction(archiveMutation, t('campaigns.archived'))}>
              <Trash className="h-4 w-4" />
              {t('campaigns.archive')}
            </Button>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t('campaigns.testSend')}</label>
              <Input dir="ltr" placeholder="+15551234567,+15557654321" value={testNumbers} onChange={(event) => setTestNumbers(event.target.value)} />
            </div>
            <Button variant="outline" onClick={() => void handleTestSend()} disabled={testSendMutation.isPending}>
              {testSendMutation.isPending ? <Spinner size="sm" /> : <Send className="h-4 w-4" />}
              {t('campaigns.testSendButton')}
            </Button>
            <Button variant="outline" onClick={() => void handleDownloadCsv()} disabled={csvMutation.isPending}>
              <Download className="h-4 w-4" />
              {t('campaigns.downloadCsv')}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value as CampaignRecipientStatus | ''); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder={t('campaigns.recipientStatusFilter')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t('common.all')}</SelectItem>
              {CAMPAIGN_RECIPIENT_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>{t(`campaigns.recipientStatus.${status}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            dir="ltr"
            className="w-full sm:w-56"
            placeholder={t('campaigns.failureCodePlaceholder')}
            value={failureCode}
            onChange={(event) => { setFailureCode(event.target.value); setPage(1); }}
          />
        </div>

        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('campaigns.phone')}</TableHead>
                <TableHead>{t('campaigns.status')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('campaigns.sentAt')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('campaigns.failure')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(recipients.data?.items ?? []).map((recipient) => (
                <TableRow key={recipient.id}>
                  <TableCell className="font-mono text-xs" dir="ltr">{recipient.phoneE164}</TableCell>
                  <TableCell>
                    <Badge variant={RECIPIENT_BADGE[recipient.status] ?? 'outline'}>
                      {t(`campaigns.recipientStatus.${recipient.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {formatDateTime(recipient.sentAt)}
                  </TableCell>
                  <TableCell className="hidden max-w-[220px] truncate lg:table-cell text-xs text-muted-foreground" dir="auto">
                    {recipient.failureCode ? (
                      <>
                        {recipient.failureCode}
                        {recipient.failureMessage ? `: ${recipient.failureMessage}` : ''}
                      </>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {recipients.data && recipients.data.totalPages > 0 ? (
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-sm text-muted-foreground">
              {t('common.showingXOfY', { count: recipients.data.items.length, total: recipients.data.total })}
            </p>
            <Pagination
              page={recipients.data.page}
              totalPages={recipients.data.totalPages}
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
      </DialogContent>
    </Dialog>
  );
}

function MetricCard({ label, value, destructive }: { label: string; value: number; destructive?: boolean }) {
  return (
    <div className={`rounded-md border p-2 text-center ${destructive && value > 0 ? 'border-destructive/40 text-destructive' : ''}`}>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}