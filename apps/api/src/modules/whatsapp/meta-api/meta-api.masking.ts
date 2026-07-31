const SENSITIVE_KEY_PATTERN = /(access_token|token|secret|password|authorization|credential|app_secret|verify_token)/i;

const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_ITEMS = 100;

export function maskToken(token: string): string {
  const value = (token ?? '').trim();
  if (value.length === 0) {
    return '';
  }
  if (value.length <= 8) {
    return '****';
  }
  return `****${value.slice(-4)}`;
}

export function maskValue(value: string): string {
  if (value.length === 0) {
    return '';
  }
  if (value.length <= 8) {
    return '****';
  }
  return `${value.slice(0, 2)}****${value.slice(-4)}`;
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

/**
 * Recursively replaces values whose keys look sensitive with a masked placeholder.
 * Used for logs and error surfaces. Never reveals the original value.
 */
export function maskSensitive(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((item) => maskSensitive(item));
  }
  if (input !== null && typeof input === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (isSensitiveKey(key) && typeof value === 'string') {
        output[key] = maskValue(value);
      } else if (isSensitiveKey(key) && value !== null && typeof value === 'object') {
        output[key] = maskSensitive(value);
      } else {
        output[key] = maskSensitive(value);
      }
    }
    return output;
  }
  return input;
}

/**
 * Recursively removes sensitive values and caps the size of the result.
 * Used before exposing stored payloads to admins in the integration logs UI.
 */
export function sanitizePayload(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizePayload(item));
  }
  if (input !== null && typeof input === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (isSensitiveKey(key)) {
        continue;
      }
      output[key] = sanitizePayload(value);
    }
    return output;
  }
  if (typeof input === 'string' && input.length > MAX_STRING_LENGTH) {
    return `${input.slice(0, MAX_STRING_LENGTH)}...`;
  }
  return input;
}
