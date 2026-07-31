import { maskSensitive, maskToken, maskValue, sanitizePayload } from '../src/modules/whatsapp/meta-api/meta-api.masking';

describe('meta-api.masking', () => {
  describe('maskToken', () => {
    it('returns the last four characters prefixed with asterisks', () => {
      expect(maskToken('EAAG_some_access_token_1234')).toBe('****1234');
    });

    it('masks short tokens entirely', () => {
      expect(maskToken('abc')).toBe('****');
    });

    it('handles empty input', () => {
      expect(maskToken('')).toBe('');
      expect(maskToken('   ')).toBe('');
    });
  });

  describe('maskValue', () => {
    it('keeps the first two and last four characters', () => {
      expect(maskValue('super_secret_value_9876')).toBe('su****9876');
    });

    it('masks short values entirely', () => {
      expect(maskValue('short')).toBe('****');
    });
  });

  describe('maskSensitive', () => {
    it('masks values under sensitive keys', () => {
      const masked = maskSensitive({ access_token: 'super_secret_token_abcd', ok: 'visible' });
      expect(masked).toEqual({ access_token: 'su****abcd', ok: 'visible' });
    });

    it('does not reveal the original sensitive value', () => {
      const masked = maskSensitive({ access_token: 'super_secret_token_abcd' }) as Record<string, string>;
      expect(masked.access_token).not.toContain('super_secret_token');
    });

    it('recurses into nested objects and arrays', () => {
      const masked = maskSensitive({
        level1: { app_secret: 'very_long_secret_0001', items: [{ password: 'p@ssw0rd_123456' }] },
      }) as Record<string, unknown>;
      expect(masked).toMatchObject({
        level1: { app_secret: 've****0001', items: [{ password: 'p@****3456' }] },
      });
    });
  });

  describe('sanitizePayload', () => {
    it('removes sensitive keys entirely', () => {
      const sanitized = sanitizePayload({ access_token: 'secret', verify_token: 'secret', body: 'hello' });
      expect(sanitized).toEqual({ body: 'hello' });
    });

    it('caps long strings', () => {
      const sanitized = sanitizePayload({ text: 'x'.repeat(1000) }) as { text: string };
      expect(sanitized.text.length).toBeLessThan(600);
      expect(sanitized.text.endsWith('...')).toBe(true);
    });

    it('caps large arrays', () => {
      const sanitized = sanitizePayload({ items: Array.from({ length: 500 }, (_, i) => i) }) as {
        items: number[];
      };
      expect(sanitized.items.length).toBe(100);
    });
  });
});
