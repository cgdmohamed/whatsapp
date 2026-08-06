import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

import { BUDGET_ALERTS_QUEUE } from '../../common/queue/queue.module';

const SCHEDULER_ID = 'budget-alert-check';

@Injectable()
export class BudgetAlertsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BudgetAlertsScheduler.name);

  constructor(@Inject(BUDGET_ALERTS_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        SCHEDULER_ID,
        { pattern: '*/15 * * * *' },
        { name: SCHEDULER_ID, data: {}, opts: { removeOnComplete: 100, attempts: 1 } },
      );
    } catch (error) {
      this.logger.warn(`Failed to schedule budget alerts: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.queue.removeJobScheduler(SCHEDULER_ID);
    } catch {
      // ignore
    }
  }
}
