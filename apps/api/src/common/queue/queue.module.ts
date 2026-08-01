import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

export const WEBHOOK_QUEUE = Symbol('WEBHOOK_QUEUE');
export const WHATSAPP_WEBHOOK_QUEUE_NAME = 'whatsapp-webhooks';

export const IMPORTS_QUEUE = Symbol('IMPORTS_QUEUE');
export const IMPORTS_QUEUE_NAME = 'contact-imports';

export const TEMPLATE_SYNC_QUEUE = Symbol('TEMPLATE_SYNC_QUEUE');
export const TEMPLATE_SYNC_QUEUE_NAME = 'template-sync';

export const CAMPAIGN_SCHEDULER_QUEUE = Symbol('CAMPAIGN_SCHEDULER_QUEUE');
export const CAMPAIGN_SCHEDULER_QUEUE_NAME = 'campaign-scheduler';

export const CAMPAIGN_RECIPIENT_BUILDER_QUEUE = Symbol('CAMPAIGN_RECIPIENT_BUILDER_QUEUE');
export const CAMPAIGN_RECIPIENT_BUILDER_QUEUE_NAME = 'campaign-recipient-builder';

export const WHATSAPP_MESSAGE_SEND_QUEUE = Symbol('WHATSAPP_MESSAGE_SEND_QUEUE');
export const WHATSAPP_MESSAGE_SEND_QUEUE_NAME = 'whatsapp-message-send';

export const CAMPAIGN_METRICS_QUEUE = Symbol('CAMPAIGN_METRICS_QUEUE');
export const CAMPAIGN_METRICS_QUEUE_NAME = 'campaign-metrics';

export const WHATSAPP_STATUS_RECONCILIATION_QUEUE = Symbol('WHATSAPP_STATUS_RECONCILIATION_QUEUE');
export const WHATSAPP_STATUS_RECONCILIATION_QUEUE_NAME = 'whatsapp-status-reconciliation';

export const QUEUES = [
  WEBHOOK_QUEUE,
  IMPORTS_QUEUE,
  TEMPLATE_SYNC_QUEUE,
  CAMPAIGN_SCHEDULER_QUEUE,
  CAMPAIGN_RECIPIENT_BUILDER_QUEUE,
  WHATSAPP_MESSAGE_SEND_QUEUE,
  CAMPAIGN_METRICS_QUEUE,
  WHATSAPP_STATUS_RECONCILIATION_QUEUE,
] as const;
export type QueueToken = (typeof QUEUES)[number];

@Injectable()
export class QueueManager implements OnModuleDestroy {
  constructor(
    @Inject(WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
    @Inject(IMPORTS_QUEUE) private readonly importsQueue: Queue,
    @Inject(TEMPLATE_SYNC_QUEUE) private readonly templateSyncQueue: Queue,
    @Inject(CAMPAIGN_SCHEDULER_QUEUE) private readonly campaignSchedulerQueue: Queue,
    @Inject(CAMPAIGN_RECIPIENT_BUILDER_QUEUE) private readonly campaignRecipientBuilderQueue: Queue,
    @Inject(WHATSAPP_MESSAGE_SEND_QUEUE) private readonly whatsappMessageSendQueue: Queue,
    @Inject(CAMPAIGN_METRICS_QUEUE) private readonly campaignMetricsQueue: Queue,
    @Inject(WHATSAPP_STATUS_RECONCILIATION_QUEUE) private readonly whatsappStatusReconciliationQueue: Queue,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      this.webhookQueue.close(),
      this.importsQueue.close(),
      this.templateSyncQueue.close(),
      this.campaignSchedulerQueue.close(),
      this.campaignRecipientBuilderQueue.close(),
      this.whatsappMessageSendQueue.close(),
      this.campaignMetricsQueue.close(),
      this.whatsappStatusReconciliationQueue.close(),
    ]);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: WEBHOOK_QUEUE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Queue => {
        const connection = { url: configService.getOrThrow<string>('REDIS_URL') };
        return new Queue(WHATSAPP_WEBHOOK_QUEUE_NAME, { connection });
      },
    },
    {
      provide: IMPORTS_QUEUE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Queue => {
        const connection = { url: configService.getOrThrow<string>('REDIS_URL') };
        return new Queue(IMPORTS_QUEUE_NAME, { connection });
      },
    },
    {
      provide: TEMPLATE_SYNC_QUEUE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Queue => {
        const connection = { url: configService.getOrThrow<string>('REDIS_URL') };
        return new Queue(TEMPLATE_SYNC_QUEUE_NAME, { connection });
      },
    },
    {
      provide: CAMPAIGN_SCHEDULER_QUEUE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Queue => {
        const connection = { url: configService.getOrThrow<string>('REDIS_URL') };
        return new Queue(CAMPAIGN_SCHEDULER_QUEUE_NAME, { connection });
      },
    },
    {
      provide: CAMPAIGN_RECIPIENT_BUILDER_QUEUE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Queue => {
        const connection = { url: configService.getOrThrow<string>('REDIS_URL') };
        return new Queue(CAMPAIGN_RECIPIENT_BUILDER_QUEUE_NAME, { connection });
      },
    },
    {
      provide: WHATSAPP_MESSAGE_SEND_QUEUE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Queue => {
        const connection = { url: configService.getOrThrow<string>('REDIS_URL') };
        return new Queue(WHATSAPP_MESSAGE_SEND_QUEUE_NAME, { connection });
      },
    },
    {
      provide: CAMPAIGN_METRICS_QUEUE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Queue => {
        const connection = { url: configService.getOrThrow<string>('REDIS_URL') };
        return new Queue(CAMPAIGN_METRICS_QUEUE_NAME, { connection });
      },
    },
    {
      provide: WHATSAPP_STATUS_RECONCILIATION_QUEUE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Queue => {
        const connection = { url: configService.getOrThrow<string>('REDIS_URL') };
        return new Queue(WHATSAPP_STATUS_RECONCILIATION_QUEUE_NAME, { connection });
      },
    },
    QueueManager,
  ],
  exports: [
    WEBHOOK_QUEUE,
    IMPORTS_QUEUE,
    TEMPLATE_SYNC_QUEUE,
    CAMPAIGN_SCHEDULER_QUEUE,
    CAMPAIGN_RECIPIENT_BUILDER_QUEUE,
    WHATSAPP_MESSAGE_SEND_QUEUE,
    CAMPAIGN_METRICS_QUEUE,
    WHATSAPP_STATUS_RECONCILIATION_QUEUE,
  ],
})
export class QueueModule {}
