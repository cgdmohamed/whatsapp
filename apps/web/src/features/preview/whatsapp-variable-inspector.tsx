import { useTranslation } from 'react-i18next';
import type { WhatsAppPreviewVariable } from '@wa/shared';
import { Badge } from '@wa/ui';
import { cn } from '@wa/ui';

const STATUS_BADGE: Record<string, 'success' | 'secondary' | 'destructive' | 'warning' | 'outline'> = {
  RESOLVED: 'success',
  FALLBACK_USED: 'secondary',
  MISSING: 'destructive',
  INVALID: 'destructive',
  TOO_LONG: 'warning',
};

export function WhatsAppVariableInspector({
  variables,
  activeVariableKey,
  onVariableClick,
}: {
  variables: WhatsAppPreviewVariable[];
  activeVariableKey?: string | null;
  onVariableClick?: (variable: WhatsAppPreviewVariable) => void;
}) {
  const { t } = useTranslation();

  return (
    <section className="rounded-lg border bg-card p-3" aria-label={t('preview.inspector.title')}>
      <h3 className="mb-2 text-sm font-semibold">{t('preview.inspector.title')}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="p-1.5 text-start font-medium">{t('preview.inspector.position')}</th>
              <th className="p-1.5 text-start font-medium">{t('preview.inspector.component')}</th>
              <th className="p-1.5 text-start font-medium">{t('preview.inspector.placeholder')}</th>
              <th className="p-1.5 text-start font-medium">{t('preview.inspector.source')}</th>
              <th className="p-1.5 text-start font-medium">{t('preview.inspector.resolvedValue')}</th>
              <th className="p-1.5 text-start font-medium">{t('preview.inspector.status')}</th>
            </tr>
          </thead>
          <tbody>
            {variables.map((variable) => {
              const key = `${variable.component}:${variable.position}`;
              const active = activeVariableKey === key;
              return (
                <tr
                  key={key}
                  className={cn('border-b last:border-0', active && 'bg-accent')}
                >
                  <td className="p-1.5">{variable.position}</td>
                  <td className="p-1.5 text-muted-foreground">{variable.component}</td>
                  <td className="p-1.5 font-mono text-xs">{variable.placeholder}</td>
                  <td className="p-1.5 text-muted-foreground">{variable.source ?? '—'}</td>
                  <td className="p-1.5">
                    <button
                      type="button"
                      onClick={() => onVariableClick?.(variable)}
                      className={cn('max-w-40 truncate rounded text-start', variable.isMissing && 'font-medium text-destructive')}
                      title={variable.resolvedValue}
                    >
                      {variable.resolvedValue ?? '—'}
                    </button>
                  </td>
                  <td className="p-1.5">
                    <Badge variant={STATUS_BADGE[variable.status] ?? 'outline'}>{t(`preview.inspector.status.${variable.status}`)}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
