import type { GraphApiErrorResponse } from './meta-api.types';

export interface NormalizedMetaError {
  error_code: number | null;
  error_subcode: number | null;
  title: string;
  message: string;
  trace_id: string | null;
  is_transient: boolean;
  retry_after: number | null;
  original_http_status: number;
}

export class MetaApiError extends Error {
  readonly normalized: NormalizedMetaError;
  readonly isTransient: boolean;

  constructor(normalized: NormalizedMetaError) {
    super(normalized.message);
    this.name = 'MetaApiError';
    this.normalized = normalized;
    this.isTransient = normalized.is_transient;
  }
}

/**
 * Graph API error codes that represent temporary conditions (rate limits, throttling,
 * resource temporarily unavailable). Permanent errors like invalid OAuth tokens,
 * permission failures or invalid parameters are NOT listed here.
 */
const TRANSIENT_ERROR_CODES = new Set<number>([
  2, // Service temporarily unavailable
  17, // API temporarily blocked by rate limits
  32, // Temporary server error (OAuth)
  130429, // Rate limit hit
  131042, // Message undeliverable (temporary)
  131048, // Service temporarily unavailable
  131056, // Business resource not accessible right now
  80003, // Message failed to send because more than 24 hours passed
  80004, // Account in payment downgrade state (temporary)
]);

const NETWORK_HTTP_STATUS = 0;

function isTransientHttpStatus(status: number): boolean {
  return status === NETWORK_HTTP_STATUS || status === 408 || status === 425 || status === 429 || status >= 500;
}

function readRetryAfter(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export interface NormalizeMetaErrorOptions {
  retryAfterHeader?: string | null;
  networkError?: boolean;
}

export function normalizeMetaError(
  httpStatus: number,
  body: unknown,
  options: NormalizeMetaErrorOptions = {},
): NormalizedMetaError {
  const error = (body as GraphApiErrorResponse)?.error;

  const errorCode = typeof error?.code === 'number' ? error.code : null;
  const errorSubcode = typeof error?.error_subcode === 'number' ? error.error_subcode : null;
  const traceId = typeof error?.fbtrace_id === 'string' && error.fbtrace_id.length > 0 ? error.fbtrace_id : null;

  const title = error?.error_user_title ?? error?.type ?? (errorCode !== null ? `Meta API error ${errorCode}` : 'Meta API error');

  const message =
    error?.error_user_msg ??
    error?.error_data?.details ??
    error?.message ??
    (options.networkError ? 'Network error while calling the Meta Graph API' : `Meta Graph API responded with HTTP ${httpStatus}`);

  const explicitTransient = typeof error?.is_transient === 'boolean' ? error.is_transient : undefined;
  const retryAfterHeader = readRetryAfter(options.retryAfterHeader ?? null);
  const retryAfter = retryAfterHeader ?? (httpStatus === 429 ? 60 : null);

  const isTransient =
    options.networkError === true ||
    explicitTransient === true ||
    isTransientHttpStatus(httpStatus) ||
    (errorCode !== null && TRANSIENT_ERROR_CODES.has(errorCode));

  return {
    error_code: errorCode,
    error_subcode: errorSubcode,
    title,
    message,
    trace_id: traceId,
    is_transient: isTransient,
    retry_after: retryAfter,
    original_http_status: httpStatus,
  };
}

export function isTransientMetaError(error: unknown): boolean {
  return error instanceof MetaApiError && error.isTransient;
}
