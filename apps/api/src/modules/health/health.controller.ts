import { Controller, Get, HttpStatus, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import Redis from 'ioredis';
import type { HealthDto, ReadinessDto } from '@wa/shared';

import { Public } from '../../common/decorators';
import { DATABASE, type DrizzleDB } from '../../common/database/database.module';
import { REDIS } from '../../common/redis/redis.module';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly db: DrizzleDB,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get('health')
  @Public()
  health(): HealthDto {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @Public()
  async ready(): Promise<ReadinessDto> {
    const checks: ReadinessDto['checks'] = {
      database: 'up',
      redis: 'up',
    };

    try {
      await this.db.execute(sql`select 1`);
    } catch {
      checks.database = 'down';
    }

    try {
      await this.redis.ping();
    } catch {
      checks.redis = 'down';
    }

    const ready = checks.database === 'up' && checks.redis === 'up';
    if (!ready) {
      throw new ServiceUnavailableException({
        message: 'SERVICE_UNAVAILABLE',
        details: checks,
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      });
    }
    return { status: 'ok', checks };
  }
}
