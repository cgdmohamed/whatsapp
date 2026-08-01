import { randomUUID } from 'node:crypto';

import { MetaApiError, normalizeMetaError } from './meta-api.errors';
import { maskSensitive } from './meta-api.masking';
import type {
  CreateTemplateInput,
  CreateTemplateResult,
  DownloadMediaResult,
  MediaDownloadInfo,
  MediaInfo,
  MessageResponse,
  MetaMessageTemplate,
  PhoneNumberInfo,
  SendMediaMessageInput,
  SendTemplateMessageInput,
  SendTextMessageInput,
  TestConnectionResult,
  UploadMediaInput,
  UploadMediaResult,
  WabaInfo,
} from './meta-api.types';

export interface MetaClientConfig {
  accessToken: string;
  graphApiVersion: string;
}

export interface MetaRequestOptions {
  timeoutMs?: number;
  retries?: number;
  retryBackoffMs?: number;
  maxRetryDelayMs?: number;
  body?: Record<string, unknown> | FormData;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_BACKOFF_MS = 750;
const DEFAULT_MAX_RETRY_DELAY_MS = 15_000;
const GRAPH_API_BASE_URL = 'https://graph.facebook.com';

const MEDIA_DOWNLOAD_MAX_SIZE_BYTES = 25 * 1024 * 1024;
const MEDIA_MIME_TYPE_PATTERN = /^(image\/|video\/|audio\/|application\/pdf|text\/)/;

/**
 * Minimal, typed client for the Meta WhatsApp Business Cloud API.
 * Each method issues exactly one HTTP request for one message operation.
 */
export class MetaApiClient {
  private readonly accessToken: string;
  private readonly graphApiVersion: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: MetaClientConfig, fetchImpl: typeof fetch = fetch) {
    this.accessToken = config.accessToken;
    this.graphApiVersion = config.graphApiVersion;
    this.fetchImpl = fetchImpl;
  }

  async testConnection(wabaId?: string): Promise<TestConnectionResult> {
    const path = wabaId ? `${wabaId}?fields=id,name` : 'me?fields=id,name';
    const result = await this.request<{ id?: string; name?: string }>('GET', path);
    if (wabaId) {
      return { wabaId, accountId: result.id, name: result.name };
    }
    return { accountId: result.id, name: result.name };
  }

  async getBusinessAccount(wabaId: string): Promise<WabaInfo> {
    return this.request<WabaInfo>('GET', `${wabaId}?fields=id,name,display_name,verified_name,currency,timezone_id,account_review_status,messaging_limit_tier`);
  }

  async getPhoneNumbers(wabaId: string): Promise<PhoneNumberInfo[]> {
    const result = await this.request<{ data?: PhoneNumberInfo[] }>(
      'GET',
      `${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,messaging_limit_tier,status,code_verification_status,platform_type,throughput,last_onboarded_time`,
    );
    return result.data ?? [];
  }

  async listTemplates(wabaId: string): Promise<MetaMessageTemplate[]> {
    const result = await this.request<{ data?: MetaMessageTemplate[] }>(
      'GET',
      `${wabaId}/message_templates?fields=id,name,status,category,language,components,quality_score,rejected_reason,previous_category,created_time,updated_time,message_send_ttl_seconds`,
    );
    return result.data ?? [];
  }

  async createTemplate(wabaId: string, input: CreateTemplateInput): Promise<CreateTemplateResult> {
    return this.request<CreateTemplateResult>('POST', `${wabaId}/message_templates`, { body: { ...input } });
  }

  async sendTextMessage(input: SendTextMessageInput): Promise<MessageResponse> {
    return this.sendMessage(input.phoneNumberId, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to,
      type: 'text',
      text: { preview_url: input.previewUrl ?? false, body: input.body },
    });
  }

  async sendTemplateMessage(input: SendTemplateMessageInput): Promise<MessageResponse> {
    return this.sendMessage(input.phoneNumberId, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to,
      type: 'template',
      template: {
        name: input.templateName,
        language: { code: input.languageCode },
        components: input.components ?? [],
      },
    });
  }

  async sendImageMessage(input: SendMediaMessageInput): Promise<MessageResponse> {
    return this.sendMessage(input.phoneNumberId, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to,
      type: 'image',
      image: this.buildMediaBody(input),
    });
  }

  async sendDocumentMessage(input: SendMediaMessageInput): Promise<MessageResponse> {
    return this.sendMessage(input.phoneNumberId, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to,
      type: 'document',
      document: {
        ...this.buildMediaBody(input),
        filename: input.filename,
      },
    });
  }

  async markMessageAsRead(messageId: string, phoneNumberId: string): Promise<MessageResponse> {
    return this.sendMessage(phoneNumberId, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  }

  async getMediaInfo(mediaId: string): Promise<MediaInfo> {
    return this.request<MediaInfo>('GET', `${mediaId}?fields=id,mime_type,sha256,file_size,filename`);
  }

  async getMedia(mediaId: string): Promise<MediaDownloadInfo> {
    return this.request<MediaDownloadInfo>('GET', `${mediaId}`);
  }

  async uploadMedia(input: UploadMediaInput): Promise<UploadMediaResult> {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', input.mimeType);
    form.append('filename', input.filename);
    form.append('file', new Blob([input.file], { type: input.mimeType }), input.filename);
    return this.request<UploadMediaResult>('POST', `${input.phoneNumberId}/media`, { body: form });
  }

  async downloadMedia(url: string): Promise<DownloadMediaResult> {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('fbsbx.com')) {
      throw new MetaApiError(
        normalizeMetaError(403, { error: { message: 'Media download URL host is not allowed' } }),
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(parsed.toString(), {
        headers: { Authorization: `Bearer ${this.accessToken}` },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new MetaApiError(normalizeMetaError(response.status, null));
      }

      const contentLength = response.headers.get('content-length');
      const declaredSize = contentLength ? Number.parseInt(contentLength, 10) : Number.NaN;
      if (Number.isFinite(declaredSize) && declaredSize > MEDIA_DOWNLOAD_MAX_SIZE_BYTES) {
        throw new MetaApiError(
          normalizeMetaError(400, { error: { message: 'Media payload exceeds the maximum allowed size' } }),
        );
      }

      const mimeType = response.headers.get('content-type');
      if (mimeType && !MEDIA_MIME_TYPE_PATTERN.test(mimeType)) {
        throw new MetaApiError(
          normalizeMetaError(400, { error: { message: `Media type '${mimeType}' is not allowed` } }),
        );
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > MEDIA_DOWNLOAD_MAX_SIZE_BYTES) {
        throw new MetaApiError(
          normalizeMetaError(400, { error: { message: 'Media payload exceeds the maximum allowed size' } }),
        );
      }

      return {
        data: buffer,
        mimeType,
        size: buffer.byteLength,
        filename: this.extractFilename(parsed),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private buildMediaBody(input: SendMediaMessageInput): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (input.mediaId) {
      body.id = input.mediaId;
    } else if (input.link) {
      body.link = input.link;
    } else {
      throw new Error('Either mediaId or link is required');
    }
    if (input.caption !== undefined) {
      body.caption = input.caption;
    }
    return body;
  }

  private sendMessage(phoneNumberId: string, body: Record<string, unknown>): Promise<MessageResponse> {
    return this.request<MessageResponse>('POST', `${phoneNumberId}/messages`, { body });
  }

  private async request<T>(method: string, path: string, options: MetaRequestOptions = {}, attempt = 0): Promise<T> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const retries = options.retries ?? DEFAULT_RETRIES;
    const retryBackoffMs = options.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS;
    const maxRetryDelayMs = options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;

    const requestId = randomUUID();
    const url = `${GRAPH_API_BASE_URL}/${this.graphApiVersion}/${path}`;
    const isFormData = options.body instanceof FormData;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      'X-Request-Id': requestId,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: method === 'GET' ? undefined : isFormData ? (options.body as FormData) : JSON.stringify(options.body ?? {}),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      const aborted = error instanceof Error && error.name === 'AbortError';
      const normalized = normalizeMetaError(0, null, { networkError: true });
      const metaError = new MetaApiError(normalized);
      if (aborted || (normalized.is_transient && attempt < retries)) {
        await this.sleep(aborted ? maxRetryDelayMs : this.backoffDelay(attempt, retryBackoffMs, maxRetryDelayMs));
        return this.request<T>(method, path, options, attempt + 1);
      }
      throw metaError;
    }
    clearTimeout(timer);

    const retryAfterHeader = response.headers.get('retry-after');
    const rawBody = await response.text();
    let body: unknown = null;
    try {
      body = rawBody.length > 0 ? JSON.parse(rawBody) : null;
    } catch {
      body = rawBody;
    }

    if (!response.ok) {
      const normalized = normalizeMetaError(response.status, body, { retryAfterHeader });
      if (normalized.is_transient && attempt < retries) {
        const delay = normalized.retry_after
          ? Math.min(normalized.retry_after * 1000, maxRetryDelayMs)
          : this.backoffDelay(attempt, retryBackoffMs, maxRetryDelayMs);
        await this.sleep(delay);
        return this.request<T>(method, path, options, attempt + 1);
      }
      // Log only masked values; never the raw token or request body.
      console.error('[meta-api] request failed', {
        method,
        path,
        requestId,
        maskedError: maskSensitive(body),
        normalized: { ...normalized, trace_id: normalized.trace_id },
      });
      throw new MetaApiError(normalized);
    }

    return body as T;
  }

  private backoffDelay(attempt: number, baseMs: number, maxMs: number): number {
    return Math.min(baseMs * 2 ** attempt, maxMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private extractFilename(url: URL): string | null {
    const pathSegment = url.pathname.split('/').filter(Boolean).pop();
    if (!pathSegment) {
      return null;
    }
    return pathSegment.length <= 200 ? pathSegment : null;
  }
}
