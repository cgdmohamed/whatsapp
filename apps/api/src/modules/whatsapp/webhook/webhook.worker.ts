import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';

import { WHATSAPP_WEBHOOK_QUEUE_NAME } from '../../../common/queue/queue.module';
import { WebhookProcessingService } from './webhook-processing.service';

@Injectable()
export class WebhookProcessor implements OnModuleDestroy {
  private readonly logger = new Logger(WebhookProcessor.name);
  private readonly worker: Worker;

  constructor(
    configService: ConfigService,
    processingService: WebhookProcessingService,
  ) {
    const redisUrl = configService.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    this.worker = new Worker(
      WHATSAPP_WEBHOOK_QUEUE_NAME,
      async (job) => {
        await processingService.handleJob(job);
      },
      {
        connection: { url: redisUrl },
        concurrency: 5,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.debug(`Webhook job ${job.id} completed`);
    });
    this.worker.on('failed', (job, error) => {
      this.logger.warn(`Webhook job ${job?.id ?? 'unknown'} failed: ${error.message}`);
    });
    this.worker.on('error', (error) => {
      this.logger.error(`Webhook worker error: ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}
