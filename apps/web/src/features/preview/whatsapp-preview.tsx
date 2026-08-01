import * as React from 'react';
import type {
  PreviewMessageStatus,
  WhatsAppPreviewButton,
  WhatsAppPreviewHeader,
  WhatsAppPreviewModel,
  WhatsAppPreviewVariable,
} from '@wa/shared';
import { previewStatusMeta } from '@wa/shared';
import { Check, ExternalLink, FileText, Image as ImageIcon, Phone, Video } from 'lucide-react';

import { cn } from '@wa/ui';

export type PreviewTheme = 'light' | 'dark';
export type PreviewWidth = 'narrow' | 'wide';

const COLORS: Record<PreviewTheme, Record<string, string>> = {
  light: {
    screenBg: '#efeae2',
    headerBg: '#ffffff',
    headerText: '#111b21',
    bubbleBg: '#d9fdd3',
    bubbleText: '#111b21',
    secondary: '#667781',
    border: '#d1d7db',
    verified: '#00a884',
    buttonBg: '#ffffff',
    buttonBorder: '#e9edef',
    buttonText: '#0b57d0',
    mediaFallback: '#e9edef',
    inputBg: '#ffffff',
  },
  dark: {
    screenBg: '#0b141a',
    headerBg: '#202c33',
    headerText: '#e9edef',
    bubbleBg: '#005c4b',
    bubbleText: '#e9edef',
    secondary: '#8696a0',
    border: '#2a3942',
    verified: '#53bdeb',
    buttonBg: '#202c33',
    buttonBorder: '#2a3942',
    buttonText: '#53bdeb',
    mediaFallback: '#182229',
    inputBg: '#202c33',
  },
};

export function WhatsAppConversationHeader({ model, theme, dir }: { model: WhatsAppPreviewModel; theme: PreviewTheme; dir: 'rtl' | 'ltr' }) {
  const c = COLORS[theme];
  return (
    <div dir={dir} className="flex items-center gap-2 border-b px-3 py-2" style={{ background: c.headerBg, borderColor: c.border }}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ background: c.mediaFallback }}>
        {model.account.avatarUrl ? (
          <img src={model.account.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-sm font-semibold" style={{ color: c.secondary }}>
            {model.account.displayName.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <span className="truncate text-sm font-medium" style={{ color: c.headerText }}>
            {model.account.displayName}
          </span>
          {model.account.verified ? (
            <Check className="h-3.5 w-3.5 shrink-0" style={{ color: c.verified }} aria-label="Verified" />
          ) : null}
        </div>
        <p className="text-xs" style={{ color: c.secondary }}>
          {model.account.phoneNumber ?? 'WhatsApp'}
        </p>
      </div>
    </div>
  );
}

export function WhatsAppMediaHeaderPreview({ header, theme }: { header: WhatsAppPreviewHeader; theme: PreviewTheme }) {
  const c = COLORS[theme];
  if (header.type === 'IMAGE') {
    if (header.mediaUrl) {
      return <img src={header.mediaUrl} alt="" className="max-h-44 w-full rounded-md object-cover" style={{ aspectRatio: '4/3' }} />;
    }
    return (
      <div className="flex max-h-44 w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed p-6" style={{ borderColor: c.border, background: c.mediaFallback }}>
        <ImageIcon className="h-6 w-6" style={{ color: c.secondary }} />
        <span className="text-xs" style={{ color: c.secondary }}>
          Image header
        </span>
      </div>
    );
  }
  if (header.type === 'VIDEO') {
    return (
      <div className="flex w-full items-center justify-between gap-3 rounded-md border p-3" style={{ borderColor: c.border, background: c.mediaFallback }}>
        <Video className="h-8 w-8 shrink-0" style={{ color: c.secondary }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" style={{ color: c.headerText }}>{header.fileName ?? 'Video header'}</p>
          <p className="text-xs" style={{ color: c.secondary }}>Video</p>
        </div>
        <span className="text-xs" style={{ color: c.secondary }}>▶</span>
      </div>
    );
  }
  if (header.type === 'DOCUMENT') {
    return (
      <div className="flex w-full items-center gap-3 rounded-md border p-3" style={{ borderColor: c.border, background: c.mediaFallback }}>
        <FileText className="h-8 w-8 shrink-0" style={{ color: c.secondary }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" style={{ color: c.headerText }}>{header.fileName ?? 'Document'}</p>
          <p className="text-xs" style={{ color: c.secondary }}>
            {header.mimeType ?? 'document'}
            {header.fileSizeBytes ? ` · ${formatBytes(header.fileSizeBytes)}` : ''}
          </p>
        </div>
      </div>
    );
  }
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function WhatsAppButtonPreview({ buttons, theme, dir, interactive }: { buttons: WhatsAppPreviewButton[]; theme: PreviewTheme; dir: 'rtl' | 'ltr'; interactive?: boolean }) {
  const c = COLORS[theme];
  if (buttons.length === 0) return null;
  return (
    <div className="mt-1 flex flex-col gap-px overflow-hidden rounded-md" dir={dir} style={{ border: `1px solid ${c.border}` }}>
      {buttons.map((button, index) => (
        <div key={index} className="border-b last:border-0" style={{ borderColor: c.border }}>
          {button.type === 'URL' && button.value ? (
            <a
              href={interactive ? button.value : undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium"
              style={{ background: c.buttonBg, color: c.buttonText }}
              onClick={interactive ? undefined : (event) => event.preventDefault()}
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              {button.text}
            </a>
          ) : (
            <div className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium" style={{ background: c.buttonBg, color: c.buttonText }}>
              {button.type === 'PHONE_NUMBER' ? <Phone className="h-3.5 w-3.5" aria-hidden="true" /> : null}
              {button.text}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export interface MessageBubbleProps {
  model: WhatsAppPreviewModel;
  theme: PreviewTheme;
  dir: 'rtl' | 'ltr';
  interactive?: boolean;
  activeVariableKey?: string | null;
  onVariableClick?: (variable: WhatsAppPreviewVariable) => void;
  statusOverride?: PreviewMessageStatus;
}

function highlightVariables(
  text: string,
  variables: WhatsAppPreviewVariable[],
  _theme: PreviewTheme,
  activeVariableKey: string | null | undefined,
  onVariableClick: ((variable: WhatsAppPreviewVariable) => void) | undefined,
): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /\{\{(\d+)\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    const position = Number(match[1]);
    const variable = variables.find((item) => item.position === position);
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const isActive = variable && activeVariableKey === `${variable.component}:${variable.position}`;
    parts.push(
      <button
        type="button"
        key={key++}
        onClick={() => variable && onVariableClick?.(variable)}
        className={cn('rounded px-0.5 font-medium underline decoration-dotted underline-offset-2', variable?.isMissing && 'bg-red-500/20')}
        style={variable?.isMissing ? { color: '#d0342c' } : isActive ? { background: 'rgba(11,87,208,0.18)' } : undefined}
      >
        {variable?.resolvedValue ?? match[0]}
      </button>,
    );
    lastIndex = regex.lastIndex;
  }
  parts.push(text.slice(lastIndex));
  return parts;
}

export function WhatsAppMessageBubble({ model, theme, dir, interactive, activeVariableKey, onVariableClick, statusOverride }: MessageBubbleProps) {
  const c = COLORS[theme];
  const status = statusOverride ?? model.message.status;
  const meta = previewStatusMeta(status);
  const message = model.message;

  return (
    <div className="flex w-full justify-end">
      <div
        className="max-w-[85%] rounded-lg p-2 shadow-sm"
        style={{
          background: c.bubbleBg,
          ...(dir === 'rtl'
            ? { borderTopRightRadius: 2, borderTopLeftRadius: 8 }
            : { borderTopLeftRadius: 2, borderTopRightRadius: 8 }),
        }}
      >
        <div dir={dir} className="flex flex-col gap-1">
          {message.header ? <WhatsAppMediaHeaderPreview header={message.header} theme={theme} /> : null}
          {message.header?.type === 'TEXT' && message.header.text ? (
            <p className="whitespace-pre-wrap text-sm font-medium" style={{ color: c.bubbleText }}>
              {highlightVariables(message.header.text, model.variables, theme, activeVariableKey, onVariableClick)}
            </p>
          ) : null}
          <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: c.bubbleText }}>
            {highlightVariables(message.body, model.variables, theme, activeVariableKey, onVariableClick)}
          </p>
          {message.footer ? (
            <p className="whitespace-pre-wrap text-xs" style={{ color: c.secondary }}>
              {highlightVariables(message.footer, model.variables, theme, activeVariableKey, onVariableClick)}
            </p>
          ) : null}
        </div>
        <div dir="ltr" className="mt-1 flex items-center justify-end gap-1" aria-hidden="true">
          <span className="text-[10px]" style={{ color: c.secondary }}>
            {message.timestamp ?? ''}
          </span>
          {status ? (
            <span
              className={cn('text-[10px]', status === 'FAILED' && 'text-red-500')}
              style={status === 'FAILED' ? { color: '#d0342c' } : { color: c.verified }}
            >
              {meta.label}
            </span>
          ) : null}
        </div>
        <WhatsAppButtonPreview buttons={message.buttons} theme={theme} dir={dir} interactive={interactive} />
      </div>
    </div>
  );
}

export function WhatsAppDevicePreview({
  model,
  theme,
  dir,
  width,
  className,
  interactive,
  activeVariableKey,
  onVariableClick,
  statusOverride,
}: {
  model: WhatsAppPreviewModel;
  theme: PreviewTheme;
  dir: 'rtl' | 'ltr';
  width?: PreviewWidth;
  className?: string;
  interactive?: boolean;
  activeVariableKey?: string | null;
  onVariableClick?: (variable: WhatsAppPreviewVariable) => void;
  statusOverride?: PreviewMessageStatus;
}) {
  const c = COLORS[theme];
  return (
    <div className={cn('mx-auto rounded-[2rem] border p-2.5 shadow-2xl transition-all', className)} style={{ background: c.headerBg, borderColor: c.border, width: width === 'narrow' ? 300 : 360, maxWidth: '100%' }}>
      <div className="overflow-hidden rounded-[1.6rem]" style={{ background: c.screenBg }}>
        <WhatsAppConversationHeader model={model} theme={theme} dir={dir} />
        <div className="min-h-48 space-y-1 px-2.5 py-3">
          <WhatsAppMessageBubble model={model} theme={theme} dir={dir} interactive={interactive} activeVariableKey={activeVariableKey} onVariableClick={onVariableClick} statusOverride={statusOverride} />
        </div>
      </div>
    </div>
  );
}

export function WhatsAppTemplateRenderer(props: Omit<React.ComponentProps<typeof WhatsAppDevicePreview>, 'className'> & { className?: string }) {
  return <WhatsAppDevicePreview {...props} />;
}
