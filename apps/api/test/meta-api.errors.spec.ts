import {
  MetaApiError,
  isTransientMetaError,
  normalizeMetaError,
} from '../src/modules/whatsapp/meta-api/meta-api.errors';

describe('meta-api.errors', () => {
  it('normalizes a Graph API error response', () => {
    const normalized = normalizeMetaError(400, {
      error: {
        message: 'Invalid parameter',
        type: 'GraphMethodException',
        code: 100,
        error_subcode: 33,
        fbtrace_id: 'ABC123',
      },
    });

    expect(normalized).toEqual({
      error_code: 100,
      error_subcode: 33,
      title: 'GraphMethodException',
      message: 'Invalid parameter',
      trace_id: 'ABC123',
      is_transient: false,
      retry_after: null,
      original_http_status: 400,
    });
  });

  it('treats rate limits as transient', () => {
    const normalized = normalizeMetaError(429, { error: { message: 'Rate limit hit' } });
    expect(normalized.is_transient).toBe(true);
    expect(normalized.retry_after).toBe(60);
  });

  it('uses the retry-after header when present', () => {
    const normalized = normalizeMetaError(429, null, { retryAfterHeader: '120' });
    expect(normalized.retry_after).toBe(120);
    expect(normalized.is_transient).toBe(true);
  });

  it('treats known transient error codes as transient', () => {
    expect(normalizeMetaError(400, { error: { code: 130429 } }).is_transient).toBe(true);
    expect(normalizeMetaError(400, { error: { code: 131048 } }).is_transient).toBe(true);
    expect(normalizeMetaError(400, { error: { code: 190 } }).is_transient).toBe(false);
  });

  it('treats 5xx responses as transient', () => {
    expect(normalizeMetaError(500, null).is_transient).toBe(true);
    expect(normalizeMetaError(503, null).is_transient).toBe(true);
  });

  it('honors an explicit is_transient flag', () => {
    const normalized = normalizeMetaError(403, { error: { is_transient: true } });
    expect(normalized.is_transient).toBe(true);
  });

  it('treats network errors as transient', () => {
    const normalized = normalizeMetaError(0, null, { networkError: true });
    expect(normalized.is_transient).toBe(true);
    expect(normalized.message).toContain('Network error');
  });

  it('uses the user-facing title and message when provided', () => {
    const normalized = normalizeMetaError(403, {
      error: {
        message: 'Raw message',
        error_user_title: 'Something went wrong',
        error_user_msg: 'Try again later',
      },
    });
    expect(normalized.title).toBe('Something went wrong');
    expect(normalized.message).toBe('Try again later');
  });

  it('builds a MetaApiError that is flagged as transient when appropriate', () => {
    const error = new MetaApiError(normalizeMetaError(429, null));
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('MetaApiError');
    expect(error.isTransient).toBe(true);
    expect(isTransientMetaError(error)).toBe(true);
    expect(isTransientMetaError(new Error('nope'))).toBe(false);
  });
});
