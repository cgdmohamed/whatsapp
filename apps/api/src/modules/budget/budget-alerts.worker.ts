import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';

import { BUDGET_ALERTS_QUEUE_NAME } from '../../common/queue/queue.module';
import { BudgetAlertsService } from './budget-alerts.service';

@Injectable()
export class BudgetAlertsWorker implements OnModuleDestroy {
  private readonly logger = new Logger(BudgetAlertsWorker.name);
  private readonly worker: Worker;

  constructor(
    configService: ConfigService,
    private readonly alertsService: BudgetAlertsService,
  ) {
    const connection = { url: configService.getOrThrow<string>('REDIS_URL') };
    this.worker = new Worker(
      BUDGET_ALERTS_QUEUE_NAME,
      async () => {
        await this.alertsService.checkAll(new Date());
      },
      { connection, concurrency: 1 },
    );
    this.worker.on('failed', (job, error) => this.logger.warn(`Budget alert job ${job?.id ?? '?'} failed: ${error.message}`));
    this.worker.on('error', (error) => this.logger.warn(`Budget alerts worker error: ${error.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}
