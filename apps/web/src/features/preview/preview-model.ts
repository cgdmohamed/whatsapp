import type {
  PreviewMessageStatus,
  PreviewVariableComponent,
  PreviewVariableStatus,
  PreviewSampleValues,
  WhatsAppPreviewButton,
  WhatsAppPreviewModel,
  WhatsAppPreviewVariable,
} from '@wa/shared';
import {
  applyVariableValuesToText,
  resolvePreviewVariables,
} from '@wa/shared';

interface TemplateComponentLike {
  type: string;
  format?: string;
  text?: string | null;
  example?: { body_text?: string[]; header_text?: string[] } | null;
  buttons?: Array<{ type: string; text?: string | null; url?: string | null; phone_number?: string | null }> | null;
}

export interface BuildWhatsAppPreviewInput {
  account: { displayName: string; avatarUrl?: string; phoneNumber?: string; verified?: boolean };
  language: string;
  components: TemplateComponentLike[];
  sampleValues: PreviewSampleValues;
  fallbacks?: Record<number, string | undefined>;
  headerMedia?: { url?: string; fileName?: string; mimeType?: string; fileSizeBytes?: number };
  status?: PreviewMessageStatus;
  timestamp?: string;
}

function placeholdersIn(text: string): number[] {
  const out: number[] = [];
  const regex = /\{\{(\d+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    out.push(Number(match[1]));
  }
  return out;
}

export function buildWhatsAppTemplateModel(input: BuildWhatsAppPreviewInput): WhatsAppPreviewModel {
  const components = input.components;
  const headerComp = components.find((component) => component.type === 'HEADER');
  const bodyComp = components.find((component) => component.type === 'BODY');
  const footerComp = components.find((component) => component.type === 'FOOTER');
  const buttonsComp = components.find((component) => component.type === 'BUTTONS');

  const collected: Array<{ component: PreviewVariableComponent; position: number }> = [];
  for (const component of [headerComp, bodyComp, footerComp]) {
    if (component?.text) {
      for (const position of placeholdersIn(component.text)) {
        collected.push({ component: component.type === 'HEADER' ? 'HEADER' : component.type === 'FOOTER' ? 'BODY' : 'BODY', position });
      }
    }
  }
  for (const button of buttonsComp?.buttons ?? []) {
    const url = button.url ?? '';
    if (url) {
      for (const position of placeholdersIn(url)) {
        collected.push({ component: 'BUTTON', position });
      }
    }
  }

  const positions = [...new Set(collected.map((item) => item.position))].sort((a, b) => a - b);
  const bodyText = bodyComp?.text ?? '';
  const variables: WhatsAppPreviewVariable[] = positions.map((position) => {
    const entry = collected.find((item) => item.position === position);
    const source = input.sampleValues[position] !== undefined ? 'sample' : 'unset';
    const resolved = resolveSingle(input.sampleValues, input.fallbacks, position);
    return {
      component: entry?.component ?? 'BODY',
      position,
      placeholder: `{{${position}}}`,
      resolvedValue: resolved.value,
      source: resolved.value !== undefined ? source : undefined,
      isMissing: resolved.value === undefined,
      status: resolved.status,
    };
  });

  const resolvedText = (text?: string | null) => (text ? applyVariableValuesToText(text, variables) : undefined);

  let header: WhatsAppPreviewModel['message']['header'] | undefined;
  const format = headerComp?.format ?? 'TEXT';
  const headerText = resolvedText(headerComp?.text);
  if (headerComp) {
    if (format === 'IMAGE' || format === 'VIDEO' || format === 'DOCUMENT') {
      header = {
        type: format,
        mediaUrl: input.headerMedia?.url,
        fileName: input.headerMedia?.fileName,
        mimeType: input.headerMedia?.mimeType,
        fileSizeBytes: input.headerMedia?.fileSizeBytes,
        text: headerText,
      };
    } else {
      header = { type: 'TEXT', text: headerText };
    }
  }

  const buttons: WhatsAppPreviewButton[] = (buttonsComp?.buttons ?? []).map((button) => {
    if (button.type === 'URL') {
      const url = resolvedText(button.url) ?? '';
      return { type: 'URL', text: button.text ?? '', value: url };
    }
    if (button.type === 'PHONE_NUMBER') {
      return { type: 'PHONE_NUMBER', text: button.text ?? '', value: button.phone_number ?? '' };
    }
    return { type: 'QUICK_REPLY', text: button.text ?? '' };
  });

  const body = resolvedText(bodyText) ?? '';

  return {
    account: input.account,
    message: {
      direction: 'OUTBOUND',
      language: input.language,
      header,
      body,
      footer: resolvedText(footerComp?.text),
      buttons,
      timestamp: input.timestamp,
      status: input.status,
    },
    variables,
  };
}

function resolveSingle(
  values: PreviewSampleValues,
  fallbacks: Record<number, string | undefined> | undefined,
  position: number,
): { value?: string; status: PreviewVariableStatus } {
  const raw = values[position];
  const trimmed = raw !== undefined ? String(raw).trim() : '';
  if (trimmed.length > 0) {
    return { value: trimmed, status: trimmed.length > 100 ? 'TOO_LONG' : 'RESOLVED' };
  }
  const fallback = fallbacks?.[position];
  if (fallback !== undefined && String(fallback).trim().length > 0) {
    return { value: String(fallback).trim(), status: 'FALLBACK_USED' };
  }
  return { value: undefined, status: 'MISSING' };
}

export { resolvePreviewVariables };
