import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type {
  PreviewMessageStatus,
  WhatsAppPreviewModel,
} from '@wa/shared';
import {
  buildPreviewAccessibilityText,
  previewStatusMeta,
} from '@wa/shared';
import { Badge, cn, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@wa/ui';

import { WhatsAppDevicePreview, type PreviewTheme, type PreviewWidth } from './whatsapp-preview';
import { WhatsAppVariableInspector } from './whatsapp-variable-inspector';

export type PreviewMode = 'mobile' | 'compact' | 'full';
export type PreviewDirection = 'rtl' | 'ltr';

export interface PreviewShellProps {
  mode: PreviewMode;
  theme: PreviewTheme;
  direction: PreviewDirection;
  onModeChange: (mode: PreviewMode) => void;
  onThemeChange: (theme: PreviewTheme) => void;
  onDirectionChange: (direction: PreviewDirection) => void;
  children: React.ReactNode;
  className?: string;
}

export function PreviewShell({ mode, theme, direction, onModeChange, onThemeChange, onDirectionChange, children, className }: PreviewShellProps) {
  const { t } = useTranslation();
  const control = (label: string) => <span className="text-xs font-medium text-muted-foreground">{label}</span>;
  return (
    <div className={cn('rounded-lg border bg-card p-4', className)}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {control(t('preview.deviceTitle'))}
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <Select value={mode} onValueChange={(value) => onModeChange(value as PreviewMode)}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mobile">{t('preview.mode.mobile')}</SelectItem>
              <SelectItem value="compact">{t('preview.mode.compact')}</SelectItem>
              <SelectItem value="full">{t('preview.mode.full')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={theme} onValueChange={(value) => onThemeChange(value as PreviewTheme)}>
            <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="light">{t('preview.theme.light')}</SelectItem>
              <SelectItem value="dark">{t('preview.theme.dark')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={direction} onValueChange={(value) => onDirectionChange(value as PreviewDirection)}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rtl">{t('preview.direction.ar')}</SelectItem>
              <SelectItem value="ltr">{t('preview.direction.en')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {children}
    </div>
  );
}

const STATUS_OPTIONS: PreviewMessageStatus[] = ['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED'];

export interface WhatsAppPreviewPanelProps {
  model: WhatsAppPreviewModel;
  templateStatus?: string;
  interactive?: boolean;
  activeVariableKey?: string | null;
  onVariableClick?: (variable: import('@wa/shared').WhatsAppPreviewVariable) => void;
  extraControls?: React.ReactNode;
  children?: React.ReactNode;
}

export function computePreviewWarnings(model: WhatsAppPreviewModel): string[] {
  const warnings: string[] = [];
  const body = model.message.body;
  const header = model.message.header?.text ?? '';
  if (header.length > 60) warnings.push('preview.warnings.tooLongHeader');
  if (body.length > 300) warnings.push('preview.warnings.tooLongBody');
  if ((body.match(/\n/g)?.length ?? 0) > 8) warnings.push('preview.warnings.tooManyLines');
  for (const button of model.message.buttons) {
    if (button.text.length > 25) warnings.push('preview.warnings.longButton');
    if (button.type === 'URL' && button.value && button.value.length > 100) warnings.push('preview.warnings.longUrl');
  }
  if (!model.message.footer) warnings.push('preview.warnings.emptyFooter');
  if (model.message.header && model.message.header.type !== 'TEXT' && !model.message.header.mediaUrl) warnings.push('preview.warnings.missingMedia');
  if (model.variables.some((variable) => variable.status === 'TOO_LONG')) warnings.push('preview.warnings.longValue');
  const hasAr = /[\u0600-\u06FF]/.test(body);
  const hasLat = /[A-Za-z]/.test(body);
  if (hasAr && hasLat) warnings.push('preview.warnings.mixedDirection');
  return warnings;
}

export function WhatsAppPreviewPanel({ model, templateStatus, interactive, activeVariableKey, onVariableClick, extraControls, children }: WhatsAppPreviewPanelProps) {
  const { t } = useTranslation();
  const [mode, setMode] = React.useState<PreviewMode>('mobile');
  const [theme, setTheme] = React.useState<PreviewTheme>('light');
  const [direction, setDirection] = React.useState<PreviewDirection>('rtl');
  const [simulatedStatus, setSimulatedStatus] = React.useState<PreviewMessageStatus>('SENT');

  const effectiveDirection: PreviewDirection = direction === 'rtl' ? 'rtl' : 'ltr';
  const width: PreviewWidth = mode === 'mobile' ? 'narrow' : 'wide';
  const warnings = computePreviewWarnings(model);
  const accessibility = buildPreviewAccessibilityText(model, model.message.language);
  const statusMeta = previewStatusMeta(simulatedStatus);
  void statusMeta;

  return (
    <div className="space-y-4">
      <PreviewShell
        mode={mode}
        theme={theme}
        direction={effectiveDirection}
        onModeChange={setMode}
        onThemeChange={setTheme}
        onDirectionChange={setDirection}
      >
        {templateStatus ? (
          <div className="mb-2">
            <Badge variant={templateStatus === 'APPROVED' ? 'success' : templateStatus === 'REJECTED' || templateStatus === 'DISABLED' ? 'destructive' : 'secondary'}>
              {t(`preview.templateStatus.${templateStatus}`)}
            </Badge>
            {templateStatus !== 'APPROVED' ? (
              <p className="mt-1 text-xs text-muted-foreground">{t('preview.notApprovedBlocker')}</p>
            ) : null}
          </div>
        ) : null}

        <div className={cn(mode === 'compact' && 'mx-auto max-w-sm', mode === 'full' && 'w-full')}>
          <div className={cn(mode === 'full' && 'sm:flex sm:gap-4')}>
            <div className={cn(mode === 'full' ? 'flex-1' : 'mx-auto')}>
              <WhatsAppDevicePreview
                model={model}
                theme={theme}
                dir={effectiveDirection}
                width={width}
                interactive={interactive}
                activeVariableKey={activeVariableKey}
                onVariableClick={onVariableClick}
                statusOverride={simulatedStatus}
              />
              <p className="mt-2 text-center text-[10px] text-muted-foreground">{t('preview.notice')}</p>
            </div>
            <div className={cn(mode === 'full' && 'w-full sm:w-80')}>
              {extraControls}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">{t('preview.status.PENDING')}</span>
                <Select value={simulatedStatus} onValueChange={(value) => setSimulatedStatus(value as PreviewMessageStatus)}>
                  <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status} value={status}>{t(`preview.status.${status}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">{t('preview.previewOnly')}</span>
              </div>
            </div>
          </div>
        </div>

        {warnings.length > 0 ? (
          <div className="mt-3 rounded-md border border-warning/40 bg-warning/5 p-3">
            <p className="mb-1 text-xs font-semibold">{t('preview.warnings.title')}</p>
            <ul className="list-disc space-y-0.5 ps-4 text-xs text-muted-foreground">
              {warnings.map((warning) => (
                <li key={warning}>{t(warning)}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </PreviewShell>

      {model.variables.length > 0 ? (
        <WhatsAppVariableInspector variables={model.variables} activeVariableKey={activeVariableKey} onVariableClick={onVariableClick} />
      ) : null}

      {children}

      <div className="sr-only" role="region" aria-label="Message text">
        <p>{accessibility.heading}</p>
        {accessibility.paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </div>
  );
}
