import { CryptoService } from '../src/common/crypto/crypto.module';

const HEX_KEY = 'c0dec0dec0dec0dec0dec0dec0dec0dec0dec0dec0dec0dec0dec0dec0dec0de';

function createCryptoService(): CryptoService {
  const config = {
    getOrThrow: (key: string): string => {
      if (key === 'APP_ENCRYPTION_KEY') {
        return HEX_KEY;
      }
      throw new Error(`Missing env ${key}`);
    },
  } as { getOrThrow: (key: string) => string };
  return new CryptoService(config as never);
}

describe('CryptoService', () => {
  it('encrypts and decrypts a token without leaking the plaintext', () => {
    const service = createCryptoService();
    const token = 'EAAG_super_secret_access_token_value_42';

    const encrypted = service.encrypt(token);
    expect(encrypted).not.toContain(token);
    expect(encrypted.split('.')).toHaveLength(4);

    expect(service.decrypt(encrypted)).toBe(token);
  });

  it('produces a unique ciphertext per call (random IV)', () => {
    const service = createCryptoService();
    const first = service.encrypt('same value');
    const second = service.encrypt('same value');
    expect(first).not.toBe(second);
    expect(service.decrypt(first)).toBe('same value');
    expect(service.decrypt(second)).toBe('same value');
  });

  it('rejects malformed encrypted payloads', () => {
    const service = createCryptoService();
    expect(() => service.decrypt('not-valid')).toThrow();
  });
});
