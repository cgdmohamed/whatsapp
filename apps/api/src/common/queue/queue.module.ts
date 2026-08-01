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

export const INBOX_QUEUE = Symbol('INBOX_QUEUE');
export const INBOX_QUEUE_NAME = 'whatsapp-inbox';

export const INBOX_SEND_QUEUE = Symbol('INBOX_SEND_QUEUE');
export const INBOX_SEND_QUEUE_NAME = 'whatsapp-inbox-send';

export const INBOX_MEDIA_QUEUE = Symbol('INBOX_MEDIA_QUEUE');
export const INBOX_MEDIA_QUEUE_NAME = 'whatsapp-inbox-media';

export const EXPORTS_QUEUE = Symbol('EXPORTS_QUEUE');
export const EXPORTS_QUEUE_NAME = 'reports-exports';

export const EMAIL_QUEUE = Symbol('EMAIL_QUEUE');
export const EMAIL_QUEUE_NAME = 'transactional-email';

export const QUEUES = [
  WEBHOOK_QUEUE,
  IMPORTS_QUEUE,
  TEMPLATE_SYNC_QUEUE,
  CAMPAIGN_SCHEDULER_QUEUE,
  CAMPAIGN_RECIPIENT_BUILDER_QUEUE,
  WHATSAPP_MESSAGE_SEND_QUEUE,
  CAMPAIGN_METRICS_QUEUE,
  WHATSAPP_STATUS_RECONCILIATION_QUEUE,
  INBOX_QUEUE,
  INBOX_SEND_QUEUE,
  INBOX_MEDIA_QUEUE,
  EXPORTS_QUEUE,
  EMAIL_QUEUE,
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
    @Inject(INBOX_QUEUE) private readonly inboxQueue: Queue,
    @Inject(INBOX_SEND_QUEUE) private readonly inboxSendQueue: Queue,
    @Inject(INBOX_MEDIA_QUEUE) private readonly inboxMediaQueue: Queue,
    @Inject(EXPORTS_QUEUE) private readonly exportsQueue: Queue,
    @Inject(EMAIL_QUEUE) private readonly emailQueue: Queue,
  ) {}

  getQueueByName(name: string): Queue | undefined {
    switch (name) {
      case WHATSAPP_WEBHOOK_QUEUE_NAME:
        return this.webhookQueue;
      case IMPORTS_QUEUE_NAME:
        return this.importsQueue;
      case TEMPLATE_SYNC_QUEUE_NAME:
        return this.templateSyncQueue;
      case CAMPAIGN_SCHEDULER_QUEUE_NAME:
        return this.campaignSchedulerQueue;
      case CAMPAIGN_RECIPIENT_BUILDER_QUEUE_NAME:
        return this.campaignRecipientBuilderQueue;
      case WHATSAPP_MESSAGE_SEND_QUEUE_NAME:
        return this.whatsappMessageSendQueue;
      case CAMPAIGN_METRICS_QUEUE_NAME:
        return this.campaignMetricsQueue;
      case WHATSAPP_STATUS_RECONCILIATION_QUEUE_NAME:
        return this.whatsappStatusReconciliationQueue;
      case INBOX_QUEUE_NAME:
        return this.inboxQueue;
      case INBOX_SEND_QUEUE_NAME:
        return this.inboxSendQueue;
      case INBOX_MEDIA_QUEUE_NAME:
        return this.inboxMediaQueue;
      case EXPORTS_QUEUE_NAME:
        return this.exportsQueue;
      case EMAIL_QUEUE_NAME:
        return this.emailQueue;
      default:
        return undefined;
    }
  }

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
      this.inboxQueue.close(),
      this.inboxSendQueue.close(),
      this.inboxMediaQueue.close(),
      this.exportsQueue.close(),
      this.emailQueue.close(),
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
    {
      provide: INBOX_QUEUE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Queue => {
        const connection = { url: configService.getOrThrow<string>('REDIS_URL') };
        return new Queue(INBOX_QUEUE_NAME, { connection });
      },
    },
    {
      provide: INBOX_SEND_QUEUE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Queue => {
        const connection = { url: configService.getOrThrow<string>('REDIS_URL') };
        return new Queue(INBOX_SEND_QUEUE_NAME, { connection });
      },
    },
    {
      provide: INBOX_MEDIA_QUEUE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Queue => {
        const connection = { url: configService.getOrThrow<string>('REDIS_URL') };
        return new Queue(INBOX_MEDIA_QUEUE_NAME, { connection });
      },
    },
    {
      provide: EXPORTS_QUEUE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Queue => {
        const connection = { url: configService.getOrThrow<string>('REDIS_URL') };
        return new Queue(EXPORTS_QUEUE_NAME, { connection });
      },
    },
    {
      provide: EMAIL_QUEUE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Queue => {
        const connection = { url: configService.getOrThrow<string>('REDIS_URL') };
        return new Queue(EMAIL_QUEUE_NAME, { connection });
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
    INBOX_QUEUE,
    INBOX_SEND_QUEUE,
    INBOX_MEDIA_QUEUE,
    EXPORTS_QUEUE,
    EMAIL_QUEUE,
    QueueManager,
  ],
})
export class QueueModule {}
