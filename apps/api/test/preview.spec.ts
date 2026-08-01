import 'reflect-metadata';
import {
  applyVariableValuesToText,
  buildPreviewAccessibilityText,
  detectTextDirection,
  generatePreviewSampleValue,
  maskPhoneNumber,
  previewStatusMeta,
  resolvePreviewDynamicUrl,
  resolvePreviewVariables,
  validatePreviewDynamicUrl,
} from '@wa/shared';

describe('WhatsApp preview logic', () => {
  describe('resolvePreviewVariables', () => {
    it('resolves provided values', () => {
      const variables = resolvePreviewVariables('Hello {{1}}, order {{2}}', { 1: 'محمد', 2: 'A-100' });
      expect(variables).toHaveLength(2);
      expect(variables[0]).toMatchObject({ position: 1, resolvedValue: 'محمد', status: 'RESOLVED', isMissing: false });
      expect(variables[1]).toMatchObject({ position: 2, resolvedValue: 'A-100', status: 'RESOLVED' });
    });

    it('marks missing variables and keeps them highlighted', () => {
      const variables = resolvePreviewVariables('Hello {{1}}', {});
      expect(variables[0]).toMatchObject({ status: 'MISSING', isMissing: true, resolvedValue: undefined });
      const text = applyVariableValuesToText('Hello {{1}}', variables);
      expect(text).toContain('{{1}}');
    });

    it('uses a fallback when the value is empty', () => {
      const variables = resolvePreviewVariables('Hello {{1}}', { 1: '   ' }, { fallbacks: { 1: 'Customer' } });
      expect(variables[0]).toMatchObject({ status: 'FALLBACK_USED', resolvedValue: 'Customer' });
    });

    it('flags excessively long values', () => {
      const variables = resolvePreviewVariables('Hello {{1}}', { 1: 'x'.repeat(200) });
      expect(variables[0]?.status).toBe('TOO_LONG');
    });
  });

  describe('dynamic URL validation', () => {
    it('accepts a fully resolved https url', () => {
      expect(validatePreviewDynamicUrl('https://example.com/offer').valid).toBe(true);
    });

    it('rejects unresolved variables', () => {
      const result = validatePreviewDynamicUrl('https://example.com/{{1}}');
      expect(result.valid).toBe(false);
      expect(result.missingVariables).toEqual([1]);
    });

    it('rejects invalid and unsafe urls', () => {
      expect(validatePreviewDynamicUrl('not a url').valid).toBe(false);
      expect(validatePreviewDynamicUrl('javascript:alert(1)').valid).toBe(false);
    });

    it('resolves dynamic urls from variables', () => {
      const variables = resolvePreviewVariables('https://example.com/{{1}}', { 1: 'offer' });
      const { url, validation } = resolvePreviewDynamicUrl('https://example.com/{{1}}', variables);
      expect(url).toBe('https://example.com/offer');
      expect(validation.valid).toBe(true);
    });
  });

  describe('permission-based masking', () => {
    it('masks phone numbers when the viewer lacks permission', () => {
      expect(maskPhoneNumber('201012345678', false)).toBe('20••••78');
      expect(maskPhoneNumber('201012345678', true)).toBe('201012345678');
    });
  });

  describe('direction detection', () => {
    it('detects RTL for Arabic and LTR for English', () => {
      expect(detectTextDirection('مرحبا بك')).toBe('rtl');
      expect(detectTextDirection('Hello world')).toBe('ltr');
      expect(detectTextDirection('Hello مرحبا')).toBe('rtl');
    });
  });

  describe('status meta', () => {
    it('maps message states to readable labels', () => {
      expect(previewStatusMeta('DELIVERED').ariaLabel).toBe('Delivered');
      expect(previewStatusMeta('FAILED').color).toBe('destructive');
      expect(previewStatusMeta(undefined).ariaLabel).toBe('');
    });
  });

  describe('sample generation', () => {
    it('generates safe placeholder samples', () => {
      expect(generatePreviewSampleValue(1)).toBe('محمد');
      expect(generatePreviewSampleValue(5)).toBeTruthy();
    });
  });

  describe('accessibility text', () => {
    it('builds a linear textual description of the message', () => {
      const model = {
        account: { displayName: 'Support', phoneNumber: '+201000000000', verified: true },
        message: {
          direction: 'OUTBOUND' as const,
          language: 'en',
          header: { type: 'TEXT' as const, text: 'Order update' },
          body: 'Your order is ready.',
          footer: 'Reply STOP to opt out.',
          buttons: [{ type: 'QUICK_REPLY' as const, text: 'View' }],
        },
        variables: [],
      };
      const text = buildPreviewAccessibilityText(model, 'en');
      expect(text.heading).toBe('Message to Support');
      expect(text.paragraphs).toContain('Your order is ready.');
      expect(text.paragraphs.join(' ')).toContain('Button: View');
    });
  });
});
