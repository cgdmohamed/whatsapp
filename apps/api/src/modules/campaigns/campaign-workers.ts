import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';

import {
  CAMPAIGN_METRICS_QUEUE,
  CAMPAIGN_METRICS_QUEUE_NAME,
  CAMPAIGN_RECIPIENT_BUILDER_QUEUE_NAME,
  CAMPAIGN_SCHEDULER_QUEUE_NAME,
  WHATSAPP_MESSAGE_SEND_QUEUE_NAME,
  WHATSAPP_STATUS_RECONCILIATION_QUEUE_NAME,
} from '../../common/queue/queue.module';
import { CampaignDispatchService } from './campaign-dispatch.service';
import { CampaignProcessor } from './campaign-processor';
import { CampaignStatusService } from './campaign-status.service';

interface BuildJobData { campaignId: string; }
interface StatusJobData {
  kind: 'status' | 'message';
  payload: unknown;
  webhookEventId: string;
}
interface MetricsJobData { campaignId: string; }

function redisFromConfig(configService: ConfigService): { url: string } {
  return { url: configService.get<string>('REDIS_URL') ?? 'redis://localhost:6379' };
}

@Injectable()
export class CampaignSchedulerWorker implements OnModuleDestroy {
  private readonly logger = new Logger(CampaignSchedulerWorker.name);
  private readonly worker: Worker;

  constructor(
    configService: ConfigService,
    private readonly dispatchService: CampaignDispatchService,
  ) {
    this.worker = new Worker(
      CAMPAIGN_SCHEDULER_QUEUE_NAME,
      async (job) => {
        const data = job.data as BuildJobData;
        this.logger.log(`Scheduler triggered dispatch for campaign ${data.campaignId}`);
        await this.dispatchService.dispatchCampaign(data.campaignId);
      },
      { connection: redisFromConfig(configService), concurrency: 1 },
    );
    this.worker.on('failed', (job, error) => this.logger.warn(`Scheduler job ${job?.id ?? '?'} failed: ${error.message}`));
    this.worker.on('error', (error) => this.logger.warn(`Scheduler worker error: ${error.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}

@Injectable()
export class CampaignRecipientBuilderWorker implements OnModuleDestroy {
  private readonly logger = new Logger(CampaignRecipientBuilderWorker.name);
  private readonly worker: Worker;

  constructor(
    configService: ConfigService,
    private readonly processor: CampaignProcessor,
  ) {
    this.worker = new Worker(
      CAMPAIGN_RECIPIENT_BUILDER_QUEUE_NAME,
      async (job) => {
        await this.processor.buildRecipients(job as never);
      },
      { connection: redisFromConfig(configService), concurrency: 1 },
    );
    this.worker.on('failed', (job, error) => this.logger.warn(`Recipient builder ${job?.id ?? '?'} failed: ${error.message}`));
    this.worker.on('error', (error) => this.logger.warn(`Recipient builder worker error: ${error.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}

@Injectable()
export class WhatsappMessageSendWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappMessageSendWorker.name);
  private readonly worker: Worker;

  constructor(
    configService: ConfigService,
    private readonly processor: CampaignProcessor,
  ) {
    const connection = redisFromConfig(configService);
    this.worker = new Worker(
      WHATSAPP_MESSAGE_SEND_QUEUE_NAME,
      async (job) => {
        await this.processor.sendRecipientMessage(job as never);
      },
      // Graceful per-worker pause/resume (maintenance) is available via worker.pause()/resume().
      { connection, concurrency: Number(configService.get<string>('CAMPAIGN_SENDING_CONCURRENCY') ?? '5'), limiter: { max: Number(configService.get<string>('CAMPAIGN_MESSAGES_PER_MINUTE') ?? '60'), duration: 60_000 } },
    );
    this.worker.on('failed', (job, error) => this.logger.warn(`Send job ${job?.id ?? '?'} failed: ${error.message}`));
    this.worker.on('error', (error) => this.logger.warn(`Send worker error: ${error.message}`));
  }

  onModuleInit(): void {
    this.logger.log(`Message send worker ready (concurrency ${this.worker.opts.concurrency}).`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}

@Injectable()
export class CampaignMetricsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignMetricsWorker.name);
  private readonly worker: Worker;

  constructor(
    configService: ConfigService,
    @Inject(CAMPAIGN_METRICS_QUEUE) private readonly queue: Queue,
    private readonly processor: CampaignProcessor,
  ) {
    this.worker = new Worker(
      CAMPAIGN_METRICS_QUEUE_NAME,
      async (job) => {
        const data = job.data as MetricsJobData;
        if (data.campaignId === '__all__') {
          await this.processor.aggregateAllActiveCampaignMetrics();
        } else {
          await this.processor.aggregateMetricsForCampaign(data.campaignId);
        }
      },
      { connection: redisFromConfig(configService), concurrency: 1 },
    );
    this.worker.on('failed', (job, error) => this.logger.warn(`Metrics job ${job?.id ?? '?'} failed: ${error.message}`));
    this.worker.on('error', (error) => this.logger.warn(`Metrics worker error: ${error.message}`));
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        'metrics-rollup',
        { pattern: '*/5 * * * *' },
        { name: 'metrics-rollup', data: { campaignId: '__all__' }, opts: { removeOnComplete: true, removeOnFail: true } },
      );
    } catch (error) {
      this.logger.warn(`Failed to schedule metrics rollup: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}

@Injectable()
export class WhatsappStatusReconciliationWorker implements OnModuleDestroy {
  private readonly logger = new Logger(WhatsappStatusReconciliationWorker.name);
  private readonly worker: Worker;

  constructor(
    configService: ConfigService,
    private readonly statusService: CampaignStatusService,
  ) {
    this.worker = new Worker(
      WHATSAPP_STATUS_RECONCILIATION_QUEUE_NAME,
      async (job) => {
        const data = job.data as StatusJobData;
        if (data.kind === 'status') {
          await this.statusService.applyStatusUpdate(data.payload as never, data.webhookEventId);
        } else if (data.kind === 'message') {
          await this.statusService.handleInboundMessage(data.payload as never, data.webhookEventId);
        }
      },
      { connection: redisFromConfig(configService), concurrency: 5 },
    );
    this.worker.on('failed', (job, error) => this.logger.warn(`Status reconciliation ${job?.id ?? '?'} failed: ${error.message}`));
    this.worker.on('error', (error) => this.logger.warn(`Status reconciliation worker error: ${error.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}