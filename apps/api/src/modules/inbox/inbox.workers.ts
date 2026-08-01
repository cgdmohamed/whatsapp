import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';

import {
  INBOX_MEDIA_QUEUE_NAME,
  INBOX_QUEUE_NAME,
  INBOX_SEND_QUEUE_NAME,
} from '../../common/queue/queue.module';
import { InboxInboundService } from './inbox-inbound.service';
import { InboxStatusService } from './inbox-status.service';
import { InboxSendService } from './inbox-send.service';
import { InboxMediaService } from './inbox-media.service';

interface InboxJobData {
  kind: 'status' | 'message';
  payload: unknown;
  webhookEventId: string;
}

function redisFromConfig(configService: ConfigService): { url: string } {
  return { url: configService.get<string>('REDIS_URL') ?? 'redis://localhost:6379' };
}

@Injectable()
export class InboxWorker implements OnModuleDestroy {
  private readonly logger = new Logger(InboxWorker.name);
  private readonly worker: Worker;

  constructor(
    configService: ConfigService,
    private readonly inboundService: InboxInboundService,
    private readonly statusService: InboxStatusService,
  ) {
    this.worker = new Worker(
      INBOX_QUEUE_NAME,
      async (job) => {
        const data = job.data as InboxJobData;
        if (data.kind === 'message') {
          await this.inboundService.handleInboundMessage(data.payload as never, data.webhookEventId);
        } else if (data.kind === 'status') {
          await this.statusService.applyStatusUpdate(data.payload as never, data.webhookEventId);
        }
      },
      { connection: redisFromConfig(configService), concurrency: 5 },
    );
    this.worker.on('failed', (job, error) => this.logger.warn(`Inbox job ${job?.id ?? '?'} failed: ${error.message}`));
    this.worker.on('error', (error) => this.logger.warn(`Inbox worker error: ${error.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}

@Injectable()
export class InboxSendWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InboxSendWorker.name);
  private readonly worker: Worker;

  constructor(
    configService: ConfigService,
    private readonly sendService: InboxSendService,
  ) {
    this.worker = new Worker(
      INBOX_SEND_QUEUE_NAME,
      async (job) => {
        await this.sendService.processSendJob(job as never);
      },
      { connection: redisFromConfig(configService), concurrency: 5 },
    );
    this.worker.on('failed', (job, error) => this.logger.warn(`Inbox send ${job?.id ?? '?'} failed: ${error.message}`));
    this.worker.on('error', (error) => this.logger.warn(`Inbox send worker error: ${error.message}`));
  }

  onModuleInit(): void {
    this.logger.log('Inbox send worker ready.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}

@Injectable()
export class InboxMediaWorker implements OnModuleDestroy {
  private readonly logger = new Logger(InboxMediaWorker.name);
  private readonly worker: Worker;

  constructor(
    configService: ConfigService,
    private readonly mediaService: InboxMediaService,
  ) {
    this.worker = new Worker(
      INBOX_MEDIA_QUEUE_NAME,
      async (job) => {
        const data = job.data as { mediaFileId: string };
        await this.mediaService.processDownload(data.mediaFileId);
      },
      { connection: redisFromConfig(configService), concurrency: 2 },
    );
    this.worker.on('failed', (job, error) => this.logger.warn(`Inbox media ${job?.id ?? '?'} failed: ${error.message}`));
    this.worker.on('error', (error) => this.logger.warn(`Inbox media worker error: ${error.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}
