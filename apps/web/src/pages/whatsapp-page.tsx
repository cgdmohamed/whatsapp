import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { WhatsAppAccountStatus, WhatsAppPhoneNumberDto, WhatsAppQualityRating } from '@wa/shared';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@wa/ui';
import { Phone, PlugZap } from 'lucide-react';

import { PageHeader } from '../components/page-header';
import { formatDateTime } from '../lib/format';
import { ConnectionActions } from '../features/whatsapp/connection-actions';
import { CredentialsForm } from '../features/whatsapp/credentials-form';
import { TemplatesPanel } from '../features/whatsapp/templates-panel';
import { useWhatsAppStatus } from '../features/whatsapp/api';

const ACCOUNT_STATUS_BADGE: Record<WhatsAppAccountStatus, 'success' | 'warning' | 'muted'> = {
  CONNECTED: 'success',
  DISCONNECTED: 'muted',
  ERROR: 'warning',
} as const;

const QUALITY_BADGE: Record<WhatsAppQualityRating, 'success' | 'warning' | 'destructive' | 'muted'> = {
  GREEN: 'success',
  YELLOW: 'warning',
  RED: 'destructive',
  UNKNOWN: 'muted',
} as const;

function AccountStatusCard() {
  const { t } = useTranslation();
  const { data } = useWhatsAppStatus();
  const account = data?.account ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          {t('whatsapp.accountStatusTitle')}
          {account ? (
            <Badge variant={ACCOUNT_STATUS_BADGE[account.status]}>{t(`whatsapp.accountStatus.${account.status}`)}</Badge>
          ) : (
            <Badge variant="muted">{t('whatsapp.notConfigured')}</Badge>
          )}
        </CardTitle>
        <CardDescription>{t('whatsapp.accountStatusDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {account ? (
          <>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <PlugZap className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium">{account.name ?? account.wabaId}</p>
                <p className="truncate text-sm text-muted-foreground" dir="ltr">
                  WABA {account.wabaId}
                </p>
              </div>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">{t('whatsapp.appId')}</dt>
                <dd className="font-mono text-xs" dir="ltr">
                  {account.appId ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('whatsapp.accessToken')}</dt>
                <dd className="font-mono text-xs" dir="ltr">
                  …{account.accessTokenLastFour || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('whatsapp.tokenUpdatedAt')}</dt>
                <dd>{formatDateTime(account.tokenUpdatedAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('whatsapp.lastConnectionTest')}</dt>
                <dd>{formatDateTime(account.lastConnectionTestAt)}</dd>
              </div>
            </dl>
            {account.lastConnectionError ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" dir="auto">
                {account.lastConnectionError}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('whatsapp.notConfiguredDescription')}</p>
        )}
      </CardContent>
    </Card>
  );
}

function PhoneNumbersCard({ phoneNumbers }: { phoneNumbers: WhatsAppPhoneNumberDto[] }) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('whatsapp.phoneNumbersTitle')}</CardTitle>
        <CardDescription>{t('whatsapp.phoneNumbersDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('whatsapp.displayPhoneNumber')}</TableHead>
              <TableHead>{t('whatsapp.verifiedName')}</TableHead>
              <TableHead>{t('whatsapp.qualityRating')}</TableHead>
              <TableHead className="hidden md:table-cell">{t('whatsapp.messagingLimitTier')}</TableHead>
              <TableHead>{t('whatsapp.status')}</TableHead>
              <TableHead className="hidden lg:table-cell">{t('whatsapp.lastSyncedAt')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {phoneNumbers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="p-0">
                  <EmptyState
                    icon={Phone}
                    title={t('whatsapp.noPhoneNumbers')}
                    description={t('whatsapp.noPhoneNumbersDescription')}
                  />
                </TableCell>
              </TableRow>
            ) : (
              phoneNumbers.map((phone) => (
                <TableRow key={phone.id}>
                  <TableCell className="font-mono text-xs" dir="ltr">
                    {phone.displayPhoneNumber ?? phone.phoneNumberId}
                    {phone.isDefault ? (
                      <span className="ms-2 text-muted-foreground">{t('whatsapp.default')}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>{phone.verifiedName ?? '—'}</TableCell>
                  <TableCell>
                    {phone.qualityRating ? (
                      <Badge variant={QUALITY_BADGE[phone.qualityRating]}>
                        {t(`whatsapp.quality.${phone.qualityRating}`)}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{phone.messagingLimitTier ?? '—'}</TableCell>
                  <TableCell>{phone.status ?? '—'}</TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {formatDateTime(phone.lastSyncedAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function WhatsAppPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch, isFetching } = useWhatsAppStatus();
  const [tab, setTab] = React.useState<'overview' | 'templates'>('overview');

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('whatsapp.title')} description={t('whatsapp.description')} />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('whatsapp.title')} description={t('whatsapp.description')} />
        <ErrorState
          title={t('whatsapp.loadError')}
          retryLabel={t('common.retry')}
          onRetry={() => void refetch()}
          loading={isFetching}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('whatsapp.title')} description={t('whatsapp.description')} actions={<ConnectionActions status={data} />} />

      <div className="inline-flex rounded-lg border p-1">
        <button
          type="button"
          onClick={() => setTab('overview')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tab === 'overview' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {t('whatsapp.tabOverview')}
        </button>
        <button
          type="button"
          onClick={() => setTab('templates')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${tab === 'templates' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {t('whatsapp.tabTemplates')}
        </button>
      </div>

      {tab === 'templates' ? (
        <TemplatesPanel />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <AccountStatusCard />
            <CredentialsForm status={data} />
          </div>

          <PhoneNumbersCard phoneNumbers={data.phoneNumbers} />
        </>
      )}
    </div>
  );
}
