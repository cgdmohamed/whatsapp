import { createHmac } from 'node:crypto';

import {
  computeWebhookSignature,
  timingSafeCompareStrings,
  timingSafeVerifyToken,
  verifyWebhookSignature,
} from '../src/modules/whatsapp/webhook/webhook-signature';

describe('webhook-signature', () => {
  const secret = 'test_app_secret_123';
  const rawBody = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account' }));

  describe('computeWebhookSignature', () => {
    it('computes an HMAC-SHA256 signature in the sha256=hex format', () => {
      const signature = computeWebhookSignature(secret, rawBody);
      expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);

      const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
      expect(signature).toBe(`sha256=${expected}`);
    });
  });

  describe('verifyWebhookSignature', () => {
    it('accepts a valid signature', () => {
      const signature = computeWebhookSignature(secret, rawBody);
      expect(verifyWebhookSignature(secret, rawBody, signature)).toBe(true);
    });

    it('rejects a signature computed with a different secret', () => {
      const signature = computeWebhookSignature('other_secret', rawBody);
      expect(verifyWebhookSignature(secret, rawBody, signature)).toBe(false);
    });

    it('rejects a tampered body', () => {
      const signature = computeWebhookSignature(secret, rawBody);
      const tampered = Buffer.from(`${rawBody.toString('utf8')}x`);
      expect(verifyWebhookSignature(secret, tampered, signature)).toBe(false);
    });

    it('rejects a missing signature header', () => {
      expect(verifyWebhookSignature(secret, rawBody, undefined)).toBe(false);
    });

    it('rejects a malformed signature header', () => {
      expect(verifyWebhookSignature(secret, rawBody, 'not-a-signature')).toBe(false);
      expect(verifyWebhookSignature(secret, rawBody, 'hmac=abc')).toBe(false);
      expect(verifyWebhookSignature(secret, rawBody, 'sha256=ZZ')).toBe(false);
    });

    it('rejects signatures of an unexpected length', () => {
      expect(verifyWebhookSignature(secret, rawBody, `sha256=${'a'.repeat(63)}`)).toBe(false);
      expect(verifyWebhookSignature(secret, rawBody, `sha256=${'a'.repeat(65)}`)).toBe(false);
    });
  });

  describe('timingSafeVerifyToken', () => {
    it('accepts a matching token', () => {
      expect(timingSafeVerifyToken('verify_token_123', 'verify_token_123')).toBe(true);
    });

    it('rejects a mismatching token', () => {
      expect(timingSafeVerifyToken('verify_token_123', 'verify_token_456')).toBe(false);
    });

    it('rejects tokens of different lengths', () => {
      expect(timingSafeVerifyToken('short', 'a'.repeat(200))).toBe(false);
    });
  });

  describe('timingSafeCompareStrings', () => {
    it('returns true for equal strings', () => {
      expect(timingSafeCompareStrings('abc', 'abc')).toBe(true);
    });

    it('returns false for different strings', () => {
      expect(timingSafeCompareStrings('abc', 'abd')).toBe(false);
    });
  });
});
