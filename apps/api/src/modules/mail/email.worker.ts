import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';

import { EMAIL_QUEUE_NAME } from '../../common/queue/queue.module';
import type { EmailJobData } from './mail.service';
import { MailService } from './mail.service';
import { MailSummaryService } from './mail-summary.service';

@Injectable()
export class EmailWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailWorker.name);
  private worker: Worker | undefined;

  constructor(
    private readonly mailService: MailService,
    private readonly summaryService: MailSummaryService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    const connection = { url: this.configService.getOrThrow<string>('REDIS_URL') };
    const concurrency = this.configService.get<number>('MAIL_WORKER_CONCURRENCY', 3);
    this.worker = new Worker(
      EMAIL_QUEUE_NAME,
      async (job) => {
        if (job.name === 'daily-summary') {
          await this.summaryService.runFor(new Date());
          return;
        }
        const data = job.data as EmailJobData;
        await this.mailService.processEmail(data);
      },
      { connection, concurrency },
    );
    this.worker.on('failed', (job, error) => {
      const data = job?.data as EmailJobData | undefined;
      this.logger.error(
        `Email job failed after retries: logId=${data?.logId ?? '?'} template=${data?.templateKey ?? '?'} error=${error.message}`,
      );
    });
    this.worker.on('error', (error) => {
      this.logger.error(`Email queue worker error: ${error.message}`);
    });
    this.logger.log(`Transactional email worker started (concurrency=${concurrency})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
