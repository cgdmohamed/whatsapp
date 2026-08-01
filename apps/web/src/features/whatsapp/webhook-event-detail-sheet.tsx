import { useTranslation } from 'react-i18next';
import type { WebhookEventDetailDto } from '@wa/shared';
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  toast,
} from '@wa/ui';
import { Copy } from 'lucide-react';

import { formatDateTime } from '../../lib/format';
import { useWebhookEventDetail } from './api';

function CopyButton({ value, label }: { value: string; label: string }) {
  const { t } = useTranslation();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard.writeText(value);
        toast.success(t('integrationLogs.copied'));
      }}
    >
      <Copy className="h-3.5 w-3.5" />
    </Button>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 text-end ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}

export function WebhookEventDetailSheet({
  id,
  open,
  onOpenChange,
}: {
  id: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useWebhookEventDetail(open ? id : null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t('integrationLogs.detailTitle')}</SheetTitle>
          <SheetDescription>{t('integrationLogs.detailDescription')}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : isError || !data ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('integrationLogs.detailError')}</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : (
          <WebhookEventDetailView event={data} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function WebhookEventDetailView({ event }: { event: WebhookEventDetailDto }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <dl className="space-y-3">
        <div className="flex items-center gap-2">
          <dt className="sr-only">{t('webhookEvents.eventId')}</dt>
          <dd className="min-w-0 flex-1 truncate font-mono text-xs" dir="ltr">
            {event.id}
          </dd>
          <CopyButton value={event.id} label={t('integrationLogs.copyId')} />
        </div>
        <DetailRow label={t('webhookEvents.eventType')} value={event.eventType} mono />
        <DetailRow label={t('webhookEvents.provider')} value={event.provider} />
        <DetailRow label={t('webhookEvents.signatureValid')} value={t(`yesNo.${event.signatureValid}`)} />
        <DetailRow label={t('common.status')} value={t(`webhookEvents.status.${event.processingStatus}`)} />
        <DetailRow label={t('webhookEvents.attempts')} value={String(event.processingAttempts)} />
        <DetailRow label={t('webhookEvents.receivedAt')} value={formatDateTime(event.receivedAt)} />
        <DetailRow label={t('webhookEvents.processedAt')} value={formatDateTime(event.processedAt)} />
        <DetailRow label={t('webhookEvents.failedAt')} value={formatDateTime(event.failedAt)} />
        <DetailRow label={t('webhookEvents.correlationId')} value={event.correlationId ?? '—'} mono />
        {event.failureReason ? <DetailRow label={t('webhookEvents.failureReason')} value={event.failureReason} /> : null}
        <div>
          <dt className="text-sm text-muted-foreground">{t('webhookEvents.deduplicationKey')}</dt>
          <dd className="mt-1 flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs" dir="ltr">
              {event.deduplicationKey}
            </span>
            <CopyButton value={event.deduplicationKey} label={t('integrationLogs.copyKey')} />
          </dd>
        </div>
      </dl>

      <div>
        <h4 className="mb-2 text-sm font-semibold">{t('integrationLogs.sanitizedPayload')}</h4>
        <pre className="max-h-96 overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed" dir="ltr">
          {JSON.stringify(event.sanitizedPayload, null, 2)}
        </pre>
      </div>
    </div>
  );
}
