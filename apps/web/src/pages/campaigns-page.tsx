import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { CampaignDto, CampaignStatus } from '@wa/shared';
import { CAMPAIGN_STATUSES } from '@wa/shared';
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
import { Megaphone, Plus } from 'lucide-react';

import { PageHeader } from '../components/page-header';
import { ContextualHelpButton } from '../features/help/help-drawer-provider';
import { EmptyStateHelpLink } from '../features/help/empty-state-help-link';
import { formatDateTime } from '../lib/format';
import { useCampaigns } from '../features/campaigns/api';
import { CampaignBuilderDialog } from '../features/campaigns/campaign-builder-dialog';
import { CampaignDetailDialog } from '../features/campaigns/campaign-detail-dialog';

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

export function CampaignsPage() {
  const { t } = useTranslation();
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(20);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<CampaignStatus | ''>('');

  const { data, isLoading, isError, refetch, isFetching } = useCampaigns({
    page,
    pageSize,
    search: search.trim() || undefined,
    status: statusFilter || undefined,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const [builderOpen, setBuilderOpen] = React.useState(false);
  const [detailCampaign, setDetailCampaign] = React.useState<CampaignDto | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const refresh = () => {
    setRefreshKey((key) => key + 1);
    void refetch();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('campaigns.title')}
        description={t('campaigns.description')}
        actions={
          <div className="flex items-center gap-2">
            <ContextualHelpButton featureKey="campaigns" />
            <Button onClick={() => setBuilderOpen(true)}>
              <Plus className="h-4 w-4" />
              {t('campaigns.newCampaign')}
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="w-full sm:max-w-xs"
          placeholder={t('campaigns.searchPlaceholder')}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
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
                <TableHead>{t('common.status')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('campaigns.template')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('campaigns.scheduledAtLabel')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('campaigns.createdAtShort')}</TableHead>
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
                  ? data.items.map((campaign) => (
                      <TableRow key={campaign.id} className="cursor-pointer" onClick={() => setDetailCampaign(campaign)}>
                        <TableCell>
                          <span className="font-medium">{campaign.name}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE[campaign.status]}>
                            {t(`campaigns.status.${campaign.status}`)}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="font-mono text-xs" dir="ltr">
                            {campaign.templateSnapshot?.name ?? '—'}
                          </span>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell text-sm">
                          {formatDateTime(campaign.scheduledAt)}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell text-sm">
                          {formatDateTime(campaign.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))
                  : (
                      <TableRow>
                        <TableCell colSpan={5} className="p-0">
                          <EmptyState
                            icon={Megaphone}
                            title={t('campaigns.noCampaigns')}
                            description={t('campaigns.noCampaignsDescription')}
                          >
                            <EmptyStateHelpLink categorySlug="campaigns" slug="creating-the-first-campaign" />
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

      <CampaignBuilderDialog open={builderOpen} onOpenChange={setBuilderOpen} onCreated={refresh} />
      {detailCampaign ? (
        <CampaignDetailDialog
          key={`${detailCampaign.id}-${refreshKey}`}
          campaign={detailCampaign}
          onOpenChange={(open) => !open && setDetailCampaign(null)}
          onChanged={() => {
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}