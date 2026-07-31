import { MetaApiClient } from '../src/modules/whatsapp/meta-api/meta-api.client';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('MetaApiClient', () => {
  const config = { accessToken: 'token_123', graphApiVersion: 'v21.0' };

  it('resolves the business account on testConnection', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(200, { id: '123', name: 'My WABA' }));
    const client = new MetaApiClient(config, fetchMock as unknown as typeof fetch);

    const result = await client.testConnection('waba-1');
    expect(result).toEqual({ wabaId: 'waba-1', accountId: '123', name: 'My WABA' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/waba-1?fields=id,name');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token_123');
  });

  it('sends a text message with exactly one request', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        messaging_product: 'whatsapp',
        contacts: [{ input: '15559876543', wa_id: '15559876543' }],
        messages: [{ id: 'wamid.out' }],
      }),
    );
    const client = new MetaApiClient(config, fetchMock as unknown as typeof fetch);

    const result = await client.sendTextMessage({
      to: '15559876543',
      body: 'Hello',
      phoneNumberId: 'phone-1',
    });

    expect(result.messages[0]!.id).toBe('wamid.out');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/phone-1/messages');
    const parsed = JSON.parse(init.body as string);
    expect(parsed).toMatchObject({ to: '15559876543', type: 'text', text: { body: 'Hello', preview_url: false } });
  });

  it('retries transient failures with backoff and succeeds', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { error: { message: 'Rate limit hit', code: 130429 } }, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(jsonResponse(200, { id: '123' }));
    const client = new MetaApiClient(
      { ...config, graphApiVersion: 'v21.0' },
      fetchMock as unknown as typeof fetch,
    );

    const result = await client.testConnection();
    expect(result.accountId).toBe('123');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops retrying after the configured number of attempts', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse(429, { error: { message: 'still limited' } }, { 'Retry-After': '1' })),
      );
    const client = new MetaApiClient(
      { ...config, graphApiVersion: 'v21.0' },
      fetchMock as unknown as typeof fetch,
    );

    await expect(client.testConnection()).rejects.toMatchObject({ name: 'MetaApiError' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('normalizes Graph API errors into a MetaApiError', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(400, {
        error: { message: 'Invalid OAuth token', type: 'OAuthException', code: 190 },
      }),
    );
    const client = new MetaApiClient(config, fetchMock as unknown as typeof fetch);

    await expect(client.testConnection()).rejects.toMatchObject({
      name: 'MetaApiError',
      normalized: { error_code: 190, original_http_status: 400, is_transient: false },
    });
  });

  it('throws a normalized network error when the fetch rejects', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const client = new MetaApiClient(
      { ...config, graphApiVersion: 'v21.0' },
      fetchMock as unknown as typeof fetch,
    );

    await expect(client.testConnection()).rejects.toMatchObject({
      name: 'MetaApiError',
      normalized: { is_transient: true, original_http_status: 0 },
    });
  });

  it('lists phone numbers', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(200, { data: [{ id: 'phone-1', display_phone_number: '15551234567' }] }),
    );
    const client = new MetaApiClient(config, fetchMock as unknown as typeof fetch);

    const numbers = await client.getPhoneNumbers('waba-1');
    expect(numbers).toHaveLength(1);
    expect(numbers[0]).toMatchObject({ id: 'phone-1', display_phone_number: '15551234567' });
  });

  it('fetches media info', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(200, { id: 'media-1', mime_type: 'image/jpeg', file_size: 1024 }),
    );
    const client = new MetaApiClient(config, fetchMock as unknown as typeof fetch);

    const info = await client.getMediaInfo('media-1');
    expect(info.mime_type).toBe('image/jpeg');
  });

  it('refuses to download media from a non-fbsbx host', async () => {
    const fetchMock = jest.fn();
    const client = new MetaApiClient(config, fetchMock as unknown as typeof fetch);

    await expect(client.downloadMedia('https://evil.example.com/file')).rejects.toMatchObject({
      name: 'MetaApiError',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
