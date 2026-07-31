import { parseWebhookPayload } from '../src/modules/whatsapp/webhook/webhook-parser';

describe('webhook-parser', () => {
  it('parses a text message', () => {
    const { result, eventTypes } = parseWebhookPayload({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'waba-1',
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { display_phone_number: '15551234567', phone_number_id: 'phone-1' },
                messages: [{ from: '15559876543', id: 'wamid.1', timestamp: '1720000000', type: 'text', text: { body: 'hello' } }],
              },
            },
          ],
        },
      ],
    });

    expect(eventTypes).toEqual(['message.text']);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      kind: 'message',
      message: {
        type: 'TEXT',
        body: 'hello',
        waMessageId: 'wamid.1',
        waPhoneNumberId: 'phone-1',
        from: '15559876543',
      },
    });
  });

  it('parses an image message', () => {
    const { result } = parseWebhookPayload({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: 'phone-1' },
                messages: [{ from: '15559876543', id: 'wamid.2', timestamp: '1720000000', type: 'image', image: { id: 'media-1', mime_type: 'image/jpeg' } }],
              },
            },
          ],
        },
      ],
    });

    const message = result.events[0]!;
    if (message.kind === 'message') {
      expect(message.message).toMatchObject({ type: 'IMAGE', mediaId: 'media-1', mimeType: 'image/jpeg' });
    }
  });

  it('parses a document message', () => {
    const { result } = parseWebhookPayload({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: 'phone-1' },
                messages: [{ from: '15559876543', id: 'wamid.3', timestamp: '1720000000', type: 'document', document: { filename: 'report.pdf' } }],
              },
            },
          ],
        },
      ],
    });

    const message = result.events[0]!;
    if (message.kind === 'message') {
      expect(message.message).toMatchObject({ type: 'DOCUMENT', filename: 'report.pdf' });
    }
  });

  it('parses an interactive button reply', () => {
    const { result } = parseWebhookPayload({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: 'phone-1' },
                messages: [{ from: '15559876543', id: 'wamid.4', timestamp: '1720000000', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'btn-1', title: 'Yes' } } }],
              },
            },
          ],
        },
      ],
    });

    const message = result.events[0]!;
    if (message.kind === 'message') {
      expect(message.message).toMatchObject({ type: 'INTERACTIVE_BUTTON', buttonId: 'btn-1', buttonText: 'Yes' });
    }
  });

  it('parses an interactive list reply', () => {
    const { result } = parseWebhookPayload({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: 'phone-1' },
                messages: [{ from: '15559876543', id: 'wamid.5', timestamp: '1720000000', type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'item-1', title: 'Option A', description: 'desc' } } }],
              },
            },
          ],
        },
      ],
    });

    const message = result.events[0]!;
    if (message.kind === 'message') {
      expect(message.message).toMatchObject({ type: 'INTERACTIVE_LIST', listItemId: 'item-1', listTitle: 'Option A' });
    }
  });

  it('normalizes a delivered status update', () => {
    const { result, eventTypes } = parseWebhookPayload({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: 'phone-1' },
                statuses: [{ id: 'wamid.6', status: 'delivered', timestamp: '1720000100', recipient_id: '15559876543' }],
              },
            },
          ],
        },
      ],
    });

    expect(eventTypes).toEqual(['status.delivered']);
    const status = result.events[0]!;
    expect(status.kind).toBe('status');
    if (status.kind === 'status') {
      expect(status.status).toMatchObject({ waMessageId: 'wamid.6', status: 'delivered', error: null });
    }
  });

  it('normalizes a failed status update with error details', () => {
    const { result } = parseWebhookPayload({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: 'phone-1' },
                statuses: [{ id: 'wamid.7', status: 'failed', timestamp: '1720000100', errors: [{ code: 131026, title: 'Message undeliverable' }] }],
              },
            },
          ],
        },
      ],
    });

    const status = result.events[0]!;
    if (status.kind === 'status') {
      expect(status.status).toMatchObject({ status: 'failed', error: { code: 131026, title: 'Message undeliverable' } });
    }
  });

  it('marks an unknown change field as ignored instead of throwing', () => {
    const { result, eventTypes } = parseWebhookPayload({
      object: 'whatsapp_business_account',
      entry: [{ id: 'waba-1', changes: [{ field: 'unknown_field', value: { anything: true } }] }],
    });

    expect(eventTypes).toEqual([]);
    expect(result.events).toHaveLength(0);
    expect(result.ignored).toHaveLength(1);
    expect(result.ignored[0]!.reason).toContain('unknown_field');
  });

  it('marks a payload for the wrong object type as ignored', () => {
    const { result, eventTypes } = parseWebhookPayload({ object: 'not_whatsapp', entry: [] });
    expect(eventTypes).toEqual([]);
    expect(result.ignored).toHaveLength(1);
  });

  it('marks a non-object payload as ignored', () => {
    const { result, eventTypes } = parseWebhookPayload(null);
    expect(eventTypes).toEqual([]);
    expect(result.ignored).toHaveLength(1);
  });

  it('marks a message with an unknown type as UNKNOWN without throwing', () => {
    const { result } = parseWebhookPayload({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: 'phone-1' },
                messages: [{ from: '15559876543', id: 'wamid.8', timestamp: '1720000000', type: 'video' }],
              },
            },
          ],
        },
      ],
    });

    const message = result.events[0]!;
    if (message.kind === 'message') {
      expect(message.message.type).toBe('UNKNOWN');
    }
  });
});
