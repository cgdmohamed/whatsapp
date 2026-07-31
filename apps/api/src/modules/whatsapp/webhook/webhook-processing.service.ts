import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

import { WEBHOOK_QUEUE } from '../../../common/queue/queue.module';
import { WebhookEventsDao } from './webhook-events.dao';
import { eventTypeSummary, parseWebhookPayload } from './webhook-parser';
import type { WebhookEventRow } from '../../../db/schema';

const MAX_EVENT_TYPE_LENGTH = 255;

@Injectable()
export class WebhookProcessingService {
  private readonly logger = new Logger(WebhookProcessingService.name);

  constructor(
    @Inject(WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
    private readonly eventsDao: WebhookEventsDao,
  ) {}

  /**
   * Enqueues a stored webhook event for asynchronous processing. Called from
   * the webhook controller, which must acknowledge the request quickly.
   */
  async enqueueEvent(event: WebhookEventRow): Promise<void> {
    await this.eventsDao.markQueued(event.id);
    await this.webhookQueue.add(
      'process',
      { eventId: event.id },
      {
        jobId: `webhook-${event.id}`,
        attempts: 4,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    );
  }

  /**
   * Processes a single webhook event: loads it, re-checks its status under the
   * DB guard, parses the raw payload into normalized events, and marks the
   * record PROCESSED / IGNORED / FAILED accordingly.
   */
  async processEvent(eventId: string): Promise<void> {
    const event = await this.eventsDao.findById(eventId);
    if (!event) {
      return;
    }
    if (event.processingStatus !== 'QUEUED') {
      return;
    }

    await this.eventsDao.markProcessing(event.id);
    await this.eventsDao.incrementAttempts(event.id);

    try {
      const { result, eventTypes } = parseWebhookPayload(event.payload);
      if (eventTypes.length === 0) {
        await this.eventsDao.markIgnored(
          event.id,
          result.ignored.map((item) => item.reason).join('; ') || 'No messages or statuses found in payload',
        );
        return;
      }

      const summary = eventTypeSummary(eventTypes);
      await this.eventsDao.markProcessed(event.id, summary.slice(0, MAX_EVENT_TYPE_LENGTH));
    } catch (error) {
      this.logger.warn(`Failed to process webhook event ${event.id}`, error instanceof Error ? error.stack : String(error));
      await this.eventsDao.markFailed(
        event.id,
        error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      );
    }
  }

  /**
   * BullMQ job handler used by the worker.
   */
  async handleJob(job: Job<{ eventId: string }>): Promise<void> {
    await this.processEvent(job.data.eventId);
  }
}
