import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { REDIS } from '../redis/redis.module';

const DEFAULT_MAX_FAILED_ATTEMPTS = 5;
const DEFAULT_WINDOW_SECONDS = 15 * 60;

@Injectable()
export class LoginThrottleService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {}

  private get disabled(): boolean {
    return this.configService.get<boolean>('RATE_LIMIT_DISABLED') ?? false;
  }

  private key(email: string, ipAddress: string): string {
    return `login_fail:${email.toLowerCase()}:${ipAddress}`;
  }

  async isBlocked(email: string, ipAddress: string): Promise<boolean> {
    if (this.disabled) {
      return false;
    }
    const attempts = await this.redis.get(this.key(email, ipAddress));
    return Number(attempts ?? 0) >= DEFAULT_MAX_FAILED_ATTEMPTS;
  }

  async recordFailure(email: string, ipAddress: string): Promise<void> {
    if (this.disabled) {
      return;
    }
    const key = this.key(email, ipAddress);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, DEFAULT_WINDOW_SECONDS);
    }
  }

  async reset(email: string, ipAddress: string): Promise<void> {
    if (this.disabled) {
      return;
    }
    await this.redis.del(this.key(email, ipAddress));
  }
}
