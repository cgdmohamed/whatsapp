import { Injectable } from '@nestjs/common';
import { argon2id, argon2Verify } from 'hash-wasm';
import { randomBytes } from 'node:crypto';

const ARGON2_OPTIONS = {
  parallelism: 1,
  iterations: 2,
  memorySize: 19456, // 19 MiB (OWASP recommended for Argon2id)
  hashLength: 32,
} as const;

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    return argon2id({
      password,
      salt,
      ...ARGON2_OPTIONS,
      outputType: 'encoded',
    });
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    try {
      return await argon2Verify({ password, hash: encodedHash });
    } catch {
      return false;
    }
  }
}
