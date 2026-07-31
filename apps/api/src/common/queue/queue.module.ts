import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

export const WEBHOOK_QUEUE = Symbol('WEBHOOK_QUEUE');
export const WHATSAPP_WEBHOOK_QUEUE_NAME = 'whatsapp-webhooks';

export const IMPORTS_QUEUE = Symbol('IMPORTS_QUEUE');
export const IMPORTS_QUEUE_NAME = 'contact-imports';

export const TEMPLATE_SYNC_QUEUE = Symbol('TEMPLATE_SYNC_QUEUE');
export const TEMPLATE_SYNC_QUEUE_NAME = 'template-sync';

export const QUEUES = [WEBHOOK_QUEUE, IMPORTS_QUEUE, TEMPLATE_SYNC_QUEUE] as const;
export type QueueToken = (typeof QUEUES)[number];

@Injectable()
export class QueueManager implements OnModuleDestroy {
  constructor(
    @Inject(WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
    @Inject(IMPORTS_QUEUE) private readonly importsQueue: Queue,
    @Inject(TEMPLATE_SYNC_QUEUE) private readonly templateSyncQueue: Queue,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.webhookQueue.close(), this.importsQueue.close(), this.templateSyncQueue.close()]);
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
    QueueManager,
  ],
  exports: [WEBHOOK_QUEUE, IMPORTS_QUEUE, TEMPLATE_SYNC_QUEUE],
})
export class QueueModule {}
