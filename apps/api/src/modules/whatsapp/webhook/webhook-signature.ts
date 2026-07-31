import { createHmac, timingSafeEqual } from 'node:crypto';

export function computeWebhookSignature(appSecret: string, rawBody: Buffer | string): string {
  const hmac = createHmac('sha256', appSecret);
  hmac.update(rawBody);
  return `sha256=${hmac.digest('hex')}`;
}

export function timingSafeCompareStrings(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

/**
 * Verifies the X-Hub-Signature-256 header against the raw request body using
 * a timing-safe comparison. Malformed signatures are always rejected.
 */
export function verifyWebhookSignature(appSecret: string, rawBody: Buffer | string, signatureHeader: unknown): boolean {
  if (typeof signatureHeader !== 'string' || signatureHeader.length === 0) {
    return false;
  }
  const trimmed = signatureHeader.trim();
  if (!/^sha256=[0-9a-f]{64}$/i.test(trimmed)) {
    return false;
  }
  const expected = computeWebhookSignature(appSecret, rawBody);
  return timingSafeCompareStrings(trimmed, expected);
}

export function timingSafeVerifyToken(actual: string, expected: string): boolean {
  return timingSafeCompareStrings(actual, expected);
}
