import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input } from '@wa/ui';
import { Dices, Search, Users } from 'lucide-react';
import type { PreviewSampleValues } from '@wa/shared';
import { maskPhoneNumber } from '@wa/shared';
import { cn } from '@wa/ui';

export interface RecipientPreviewItem {
  id: string;
  name: string;
  phone: string;
  eligible: boolean;
  suppressed: boolean;
  consent?: string;
  variableResolved: number;
  variableTotal: number;
  values?: PreviewSampleValues;
}

export interface RecipientPreviewSelectorProps {
  items: RecipientPreviewItem[];
  selectedId: string | null;
  canViewPhone: boolean;
  onSelect: (item: RecipientPreviewItem) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onRandom?: () => void;
  onFirstEligible?: () => void;
  onFirstIneligible?: () => void;
  className?: string;
}

export function RecipientPreviewSelector({
  items,
  selectedId,
  canViewPhone,
  onSelect,
  onPrevious,
  onNext,
  onRandom,
  onFirstEligible,
  onFirstIneligible,
  className,
}: RecipientPreviewSelectorProps) {
  const { t } = useTranslation();
  const [query, setQuery] = React.useState('');
  const filtered = query.trim()
    ? items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()) || item.phone.includes(query))
    : items;
  const selected = items.find((item) => item.id === selectedId);

  return (
    <section className={cn('rounded-lg border bg-card p-3', className)} aria-label={t('preview.recipient.title')}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('preview.recipient.title')}
        </h3>
        <div className="flex flex-wrap gap-1">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onPrevious} disabled={!onPrevious || !selected}>{t('preview.recipient.previous')}</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onNext} disabled={!onNext || !selected}>{t('preview.recipient.next')}</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onRandom} disabled={!onRandom || items.length === 0}><Dices className="h-3.5 w-3.5" /> {t('preview.recipient.random')}</Button>
          {onFirstEligible ? <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onFirstEligible}>{t('preview.recipient.eligible')}</Button> : null}
          {onFirstIneligible ? <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onFirstIneligible}>{t('preview.recipient.ineligible')}</Button> : null}
        </div>
      </div>

      <div className="relative mb-2">
        <Search className="absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          className="h-8 ps-8 text-xs"
          placeholder={t('preview.recipient.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="max-h-56 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">—</p>
        ) : (
          <ul className="divide-y">
            {filtered.slice(0, 30).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item)}
                  className={cn('flex w-full items-center justify-between gap-2 px-2 py-2 text-start text-sm hover:bg-accent', selectedId === item.id && 'bg-accent')}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{item.name}</span>
                    <span className="block truncate text-xs text-muted-foreground" dir="ltr">
                      {maskPhoneNumber(item.phone, canViewPhone)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs">
                    {item.eligible ? (
                      <span className="text-success">{t('preview.recipient.eligible')}</span>
                    ) : (
                      <span className="text-destructive">{t('preview.recipient.ineligible')}</span>
                    )}
                    <span className="text-muted-foreground">{item.variableResolved}/{item.variableTotal}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function buildRecipientPreviewItems(
  rows: Array<{ id: string; name: string; phone: string; eligible: boolean; suppressed: boolean; consent?: string; values?: PreviewSampleValues; variablesTotal?: number }>,
  canViewPhone: boolean,
): RecipientPreviewItem[] {
  return rows.map((row) => {
    const values = row.values ?? {};
    const resolved = Object.keys(values).filter((key) => {
      const value = values[Number(key)];
      return value !== undefined && String(value).trim().length > 0;
    }).length;
    return {
      id: row.id,
      name: row.name || '—',
      phone: maskPhoneNumber(row.phone, canViewPhone),
      eligible: row.eligible,
      suppressed: row.suppressed,
      consent: row.consent,
      variableResolved: resolved,
      variableTotal: row.variablesTotal ?? 0,
      values,
    };
  });
}
