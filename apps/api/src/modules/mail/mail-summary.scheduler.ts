import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

import { EMAIL_QUEUE } from '../../common/queue/queue.module';
import { MailSummaryService } from './mail-summary.service';

function cronFromTime(time: string): string {
  const [hour, minute] = time.split(':').map((part) => Number(part));
  return `${minute ?? 0} ${hour ?? 8} * * *`;
}

@Injectable()
export class MailSummaryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailSummaryScheduler.name);

  constructor(
    @Inject(EMAIL_QUEUE) private readonly queue: Queue,
    private readonly summaryService: MailSummaryService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.upsertRepeatJob();
  }

  async upsertRepeatJob(): Promise<void> {
    try {
      const settingsData = await this.summaryService.getSettings();
      await this.queue.upsertJobScheduler(
        'daily-summary',
        { pattern: cronFromTime(settingsData.time), tz: 'Africa/Cairo' },
        { name: 'daily-summary', data: {}, opts: { removeOnComplete: 100, attempts: 1 } },
      );
    } catch (error) {
      this.logger.warn(`Failed to schedule daily summary: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.queue.removeJobScheduler('daily-summary');
    } catch {
      // ignore
    }
  }
}
