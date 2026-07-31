import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import Redis from 'ioredis';
import type { Request, Response } from 'express';

import { ERROR_CODES } from '../errors';
import { RATE_LIMIT_KEY, type RateLimitOptions } from '../decorators';
import { REDIS } from '../redis/redis.module';

const DEFAULT_LIMIT = 300;
const DEFAULT_TTL_SECONDS = 60;

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.configService.get<boolean>('RATE_LIMIT_DISABLED')) {
      return true;
    }

    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const limit = options?.limit ?? DEFAULT_LIMIT;
    const ttlSeconds = options?.ttlSeconds ?? DEFAULT_TTL_SECONDS;

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    const route = `${request.method}:${request.route?.path ?? request.path}`;
    const key = `rl:${ip}:${route}`;

    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, ttlSeconds);
    }

    response.setHeader('X-RateLimit-Limit', String(limit));
    response.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - count)));

    if (count > limit) {
      throw new HttpException(
        {
          message: ERROR_CODES.RATE_LIMITED,
          error: 'Too Many Requests',
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
