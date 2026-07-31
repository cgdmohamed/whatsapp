import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';

import { TEMPLATE_SYNC_QUEUE, TEMPLATE_SYNC_QUEUE_NAME } from '../../../common/queue/queue.module';
import { MessageTemplatesService } from './message-templates.service';

const TEMPLATE_SYNC_JOB = 'sync';
const TEMPLATE_SYNC_CRON_PATTERN = '0 * * * *';

@Injectable()
export class TemplateSyncWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TemplateSyncWorker.name);
  private readonly worker: Worker;

  constructor(
    configService: ConfigService,
    @Inject(TEMPLATE_SYNC_QUEUE) private readonly queue: Queue,
    private readonly templatesService: MessageTemplatesService,
  ) {
    const redisUrl = configService.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    this.worker = new Worker(
      TEMPLATE_SYNC_QUEUE_NAME,
      async () => {
        const result = await this.templatesService.syncFromMeta();
        return { status: 'completed', result };
      },
      {
        connection: { url: redisUrl },
        concurrency: 1,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`Template sync job ${job.id} completed`);
    });
    this.worker.on('failed', (job, error) => {
      this.logger.warn(`Template sync job ${job?.id ?? 'unknown'} failed: ${error.message}`);
    });
    this.worker.on('error', (error) => {
      this.logger.warn(`Template sync worker error: ${error.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        TEMPLATE_SYNC_JOB,
        { pattern: TEMPLATE_SYNC_CRON_PATTERN },
        { name: TEMPLATE_SYNC_JOB, opts: { removeOnComplete: true, removeOnFail: true } },
      );
      this.logger.log(`Scheduled template sync job (${TEMPLATE_SYNC_CRON_PATTERN})`);
    } catch (error) {
      this.logger.warn(
        `Failed to schedule template sync job: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}
