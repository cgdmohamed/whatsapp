import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { TrendGranularity } from '@wa/shared';
import { TREND_GRANULARITIES } from '@wa/shared';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@wa/ui';
import {
  Contact,
  Database,
  Inbox,
  Megaphone,
  MessageSquare,
  Send,
  Users,
} from 'lucide-react';

import { useDashboardSummary, useDashboardTrends } from '../features/reports/api';
import { useAuth } from '../lib/auth';
import { OnboardingChecklist } from '../features/help/onboarding-checklist';
import { ContextualHelpButton } from '../features/help/help-drawer-provider';

const PRESETS: Array<{ key: string; days: number }> = [
  { key: '7d', days: 7 },
  { key: '30d', days: 30 },
  { key: '90d', days: 90 },
];

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function useDateRange() {
  const [days, setDays] = React.useState(30);
  const [granularity, setGranularity] = React.useState<TrendGranularity>('day');
  const [from, setFrom] = React.useState<string | undefined>(undefined);
  const [to, setTo] = React.useState<string | undefined>(undefined);

  const query = React.useMemo(() => {
    const range = { from, to };
    if (!range.from && !range.to) {
      const now = new Date();
      const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      return { from: start.toISOString(), to: now.toISOString(), granularity };
    }
    return { ...range, granularity };
  }, [days, from, to, granularity]);

  return { query, days, setDays, granularity, setGranularity, from, to, setFrom, setTo };
}

function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = React.useState(0);
  React.useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function AnimatedNumber({ value }: { value: number }) {
  const count = useCountUp(value);
  return <>{count}</>;
}

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
}) {
  return (
    <Card className="transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">
          {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
        </div>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function TrendsChart({
  points,
}: {
  points: Array<{ bucket: string; messagesSent: number; messagesReceived: number; conversationsOpened: number; contactsAdded: number }>;
}) {
  const { t } = useTranslation();
  const [series, setSeries] = React.useState<'sent' | 'received' | 'opened' | 'added'>('sent');

  if (points.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{t('reports.noTrendData')}</p>;
  }

  const seriesLabel: Record<typeof series, string> = {
    sent: t('reports.trend.messagesSent'),
    received: t('reports.trend.messagesReceived'),
    opened: t('reports.trend.conversationsOpened'),
    added: t('reports.trend.contactsAdded'),
  };

  const seriesKey: Record<typeof series, 'messagesSent' | 'messagesReceived' | 'conversationsOpened' | 'contactsAdded'> = {
    sent: 'messagesSent',
    received: 'messagesReceived',
    opened: 'conversationsOpened',
    added: 'contactsAdded',
  };

  const max = Math.max(1, ...points.map((point) => point[seriesKey[series]]));
  const width = 640;
  const height = 240;
  const padTop = 16;
  const padBottom = 36;
  const padX = 16;
  const innerH = height - padTop - padBottom;
  const innerW = width - padX * 2;
  const step = innerW / Math.max(1, points.length - 1);
  const coords = points.map((point, index) => ({
    x: padX + index * step,
    y: padTop + (1 - point[seriesKey[series]] / max) * innerH,
    value: point[seriesKey[series]],
  }));

  const linePath = coords.map((coord, index) => `${index === 0 ? 'M' : 'L'} ${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`).join(' ');
  const baseline = padTop + innerH;
  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
  const areaPath = `${linePath} L ${last.x.toFixed(1)} ${baseline.toFixed(1)} L ${first.x.toFixed(1)} ${baseline.toFixed(1)} Z`;
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((fraction) => ({
    y: padTop + (1 - fraction) * innerH,
    value: Math.round(max * fraction),
  }));
  const labelIndices = points.length <= 1 ? [0] : [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const gradientId = 'trend-area-gradient';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(seriesLabel) as Array<typeof series>).map((key) => (
          <Button
            key={key}
            variant={series === key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSeries(key)}
          >
            {seriesLabel[key]}
          </Button>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={seriesLabel[series]}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: 'hsl(var(--primary))', stopOpacity: 0.14 }} />
            <stop offset="100%" style={{ stopColor: 'hsl(var(--primary))', stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        {gridLines.map((grid) => (
          <line
            key={grid.value}
            x1={padX}
            y1={grid.y}
            x2={width - padX}
            y2={grid.y}
            className="stroke-border"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        ))}
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path
          d={linePath}
          className="stroke-primary"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coords.map((coord, index) => (
          <g key={index}>
            <circle cx={coord.x} cy={coord.y} r="3" className="fill-primary" />
            <title>{`${points[index]!.bucket}: ${coord.value}`}</title>
          </g>
        ))}
        {labelIndices.map((index) => (
          <text
            key={index}
            x={coords[index]!.x}
            y={height - 12}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="10"
          >
            {points[index]!.bucket.slice(0, 10)}
          </text>
        ))}
      </svg>
    </div>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { query, days, setDays, granularity, setGranularity, from, to, setFrom, setTo } = useDateRange();

  const summary = useDashboardSummary(query);
  const trends = useDashboardTrends(query);

  if (!user) {
    return null;
  }

  const totals = summary.data?.totals;
  const rates = summary.data?.rates;

  return (
    <div className="space-y-6">
      {user.role === 'ADMIN' ? <OnboardingChecklist /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('dashboard.welcome', { name: user.name })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ContextualHelpButton featureKey="dashboard" />
          <Select
            value={String(days)}
            onValueChange={(value) => {
              setDays(Number(value));
              setFrom(undefined);
              setTo(undefined);
            }}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((preset) => (
                <SelectItem key={preset.key} value={String(preset.days)}>
                  {t(`dashboard.range.${preset.key}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={granularity} onValueChange={(value) => setGranularity(value as TrendGranularity)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TREND_GRANULARITIES.map((item) => (
                <SelectItem key={item} value={item}>
                  {t(`dashboard.granularity.${item}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {summary.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : summary.isError ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">{t('dashboard.summaryError')}</CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t('dashboard.stats.contacts')} value={totals?.contacts ?? 0} icon={Contact} hint={t('dashboard.stats.newContacts', { count: totals?.newContacts ?? 0 })} />
            <StatCard label={t('dashboard.stats.conversations')} value={totals?.conversations ?? 0} icon={Inbox} hint={t('dashboard.stats.openConversations', { count: totals?.openConversations ?? 0 })} />
            <StatCard label={t('dashboard.stats.messagesSent')} value={totals?.messagesSent ?? 0} icon={Send} hint={t('dashboard.stats.messagesReceived', { count: totals?.messagesReceived ?? 0 })} />
            <StatCard label={t('dashboard.stats.campaignsRun')} value={totals?.campaignsRun ?? 0} icon={Megaphone} hint={t('dashboard.stats.recipientsDelivered', { count: totals?.recipientsDelivered ?? 0 })} />
            <StatCard label={t('dashboard.stats.failedSends')} value={totals?.failedSends ?? 0} icon={MessageSquare} hint={t('dashboard.stats.optedOut', { count: totals?.optedOut ?? 0 })} />
            <StatCard label={t('dashboard.stats.deliveryRate')} value={rates ? percent(rates.deliveryRate) : '—'} icon={Database} hint={t('dashboard.stats.failureRate', { rate: rates ? percent(rates.failureRate) : '—' })} />
            <StatCard label={t('dashboard.stats.readRate')} value={rates ? percent(rates.readRate) : '—'} icon={Users} hint={t('dashboard.stats.replyRate', { rate: rates ? percent(rates.replyRate) : '—' })} />
            <StatCard label={t('dashboard.stats.unreadConversations')} value={totals?.unreadConversations ?? 0} icon={Inbox} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">{t('dashboard.trends')}</CardTitle>
                <CardDescription>{t('dashboard.trendsDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                {trends.isLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : trends.isError ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">{t('dashboard.trendsError')}</p>
                ) : (
                  <TrendsChart points={trends.data?.points ?? []} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('dashboard.customRange')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground" htmlFor="range-from">{t('dashboard.from')}</label>
                  <Input
                    id="range-from"
                    type="date"
                    className="mt-1.5 w-full"
                    value={from?.slice(0, 10) ?? ''}
                    onChange={(event) => setFrom(event.target.value ? new Date(`${event.target.value}T00:00:00`).toISOString() : undefined)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground" htmlFor="range-to">{t('dashboard.to')}</label>
                  <Input
                    id="range-to"
                    type="date"
                    className="mt-1.5 w-full"
                    value={to?.slice(0, 10) ?? ''}
                    onChange={(event) => setTo(event.target.value ? new Date(`${event.target.value}T23:59:59`).toISOString() : undefined)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{t('dashboard.customRangeHint')}</p>
                <Badge variant="secondary" className="text-xs">{t(`dashboard.granularity.${granularity}`)}</Badge>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
