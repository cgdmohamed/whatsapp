import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';

import { IMPORTS_QUEUE_NAME } from '../../common/queue/queue.module';
import { ImportsProcessor } from './imports.processor';

@Injectable()
export class ImportsWorker implements OnModuleDestroy {
  private readonly logger = new Logger(ImportsWorker.name);
  private readonly worker: Worker;

  constructor(
    configService: ConfigService,
    importsProcessor: ImportsProcessor,
  ) {
    const redisUrl = configService.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    this.worker = new Worker(
      IMPORTS_QUEUE_NAME,
      async (job) => {
        const result = await importsProcessor.run(job.data.jobId);
        return { status: 'completed', counts: result };
      },
      {
        connection: { url: redisUrl },
        concurrency: 2,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`Import job ${job.id} completed`);
    });
    this.worker.on('failed', (job, error) => {
      this.logger.warn(`Import job ${job?.id ?? 'unknown'} failed: ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}
