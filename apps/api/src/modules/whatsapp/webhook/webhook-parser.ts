import type {
  NormalizedInboundMessage,
  NormalizedStatusUpdate,
  NormalizedWebhookResult,
} from '@wa/shared';

interface MetaWebhookChange {
  field?: string;
  value?: unknown;
}

interface MetaWebhookEntry {
  id?: string;
  changes?: MetaWebhookChange[];
}

interface MetaWebhookPayload {
  object?: string;
  entry?: MetaWebhookEntry[];
}

interface MessageValueMetadata {
  display_phone_number?: string;
  phone_number_id?: string;
}

interface RawInboundMessage {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: {
    id?: string;
    link?: string;
    mime_type?: string;
    sha256?: string;
    caption?: string;
  };
  document?: {
    id?: string;
    link?: string;
    filename?: string;
    mime_type?: string;
    sha256?: string;
    caption?: string;
  };
  interactive?: {
    type?: string;
    body?: { text?: string };
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
}

interface RawStatusUpdate {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
}

export interface ParsedWebhook {
  result: NormalizedWebhookResult;
  eventTypes: string[];
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return null;
}

function normalizeStatus(status: string | undefined): NormalizedStatusUpdate['status'] {
  switch (status) {
    case 'sent':
    case 'delivered':
    case 'read':
    case 'failed':
      return status;
    default:
      return 'failed';
  }
}

function parseInboundMessage(message: RawInboundMessage, metadata: MessageValueMetadata | undefined): NormalizedInboundMessage {
  const base = {
    waMessageId: message.id ?? 'unknown',
    waPhoneNumberId: metadata?.phone_number_id ?? 'unknown',
    from: message.from ?? 'unknown',
    timestamp: message.timestamp ?? String(Date.now()),
  };

  switch (message.type) {
    case 'text':
      return { ...base, type: 'TEXT', body: message.text?.body ?? '' };
    case 'image':
      return {
        ...base,
        type: 'IMAGE',
        mediaId: firstNonEmpty(message.image?.id, message.image?.link),
        mimeType: message.image?.mime_type ?? null,
        sha256: message.image?.sha256 ?? null,
        caption: message.image?.caption ?? null,
      };
    case 'document':
      return {
        ...base,
        type: 'DOCUMENT',
        mediaId: firstNonEmpty(message.document?.id, message.document?.link),
        mimeType: message.document?.mime_type ?? null,
        sha256: message.document?.sha256 ?? null,
        filename: message.document?.filename ?? null,
        caption: message.document?.caption ?? null,
      };
    case 'interactive': {
      const interactiveType = message.interactive?.type;
      if (interactiveType === 'button_reply') {
        return {
          ...base,
          type: 'INTERACTIVE_BUTTON',
          buttonId: message.interactive?.button_reply?.id ?? null,
          buttonText: message.interactive?.button_reply?.title ?? null,
        };
      }
      if (interactiveType === 'list_reply') {
        return {
          ...base,
          type: 'INTERACTIVE_LIST',
          listItemId: message.interactive?.list_reply?.id ?? null,
          listTitle: message.interactive?.list_reply?.title ?? null,
          listDescription: message.interactive?.list_reply?.description ?? null,
        };
      }
      return { ...base, type: 'UNKNOWN' };
    }
    default:
      return { ...base, type: 'UNKNOWN' };
  }
}

function parseStatusUpdate(status: RawStatusUpdate, metadata: MessageValueMetadata | undefined): NormalizedStatusUpdate {
  const error = Array.isArray(status.errors) && status.errors.length > 0 ? status.errors[0] : undefined;
  return {
    waMessageId: status.id ?? 'unknown',
    waPhoneNumberId: metadata?.phone_number_id ?? 'unknown',
    status: normalizeStatus(status.status),
    timestamp: status.timestamp ?? String(Date.now()),
    error:
      error === undefined
        ? null
        : {
            code: typeof error.code === 'number' ? error.code : null,
            title: error.title ?? null,
            message: error.message ?? null,
          },
  };
}

/**
 * Parses a raw Meta WhatsApp Cloud API webhook payload into normalized
 * internal event types. Unknown or malformed content never throws: it is
 * collected into `result.ignored` so the caller can store the event as IGNORED.
 */
export function parseWebhookPayload(payload: unknown): ParsedWebhook {
  const result: NormalizedWebhookResult = { events: [], ignored: [] };
  const eventTypes: string[] = [];

  if (payload === null || typeof payload !== 'object') {
    result.ignored.push({ reason: 'Webhook payload is not an object' });
    return { result, eventTypes };
  }

  const webhook = payload as MetaWebhookPayload;
  if (webhook.object !== 'whatsapp_business_account' || !Array.isArray(webhook.entry)) {
    result.ignored.push({ reason: 'Webhook payload is not a WhatsApp Business Account event' });
    return { result, eventTypes };
  }

  for (const entry of webhook.entry) {
    if (!Array.isArray(entry.changes)) {
      continue;
    }
    for (const change of entry.changes) {
      const field = change.field;
      const value = change.value as
        | {
            metadata?: MessageValueMetadata;
            messages?: RawInboundMessage[];
            statuses?: RawStatusUpdate[];
          }
        | undefined;

      if (field !== 'messages' || value === null || typeof value !== 'object') {
        result.ignored.push({ reason: `Unsupported webhook change field '${field ?? 'unknown'}'` });
        continue;
      }

      if (Array.isArray(value.messages)) {
        for (const rawMessage of value.messages) {
          const message = parseInboundMessage(rawMessage, value.metadata);
          eventTypes.push(`message.${message.type.toLowerCase()}`);
          result.events.push({ kind: 'message', message });
        }
      }

      if (Array.isArray(value.statuses)) {
        for (const rawStatus of value.statuses) {
          const status = parseStatusUpdate(rawStatus, value.metadata);
          eventTypes.push(`status.${status.status}`);
          result.events.push({ kind: 'status', status });
        }
      }

      if (!Array.isArray(value.messages) && !Array.isArray(value.statuses)) {
        result.ignored.push({ reason: 'Change contains neither messages nor statuses' });
      }
    }
  }

  return { result, eventTypes };
}

export function eventTypeSummary(eventTypes: string[]): string {
  if (eventTypes.length === 0) {
    return 'unknown';
  }
  return eventTypes.join(',');
}
