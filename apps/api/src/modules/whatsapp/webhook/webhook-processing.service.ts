import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

import { WEBHOOK_QUEUE, WHATSAPP_STATUS_RECONCILIATION_QUEUE, INBOX_QUEUE } from '../../../common/queue/queue.module';
import { WebhookEventsDao } from './webhook-events.dao';
import { eventTypeSummary, parseWebhookPayload } from './webhook-parser';
import type { WebhookEventRow } from '../../../db/schema';
import type { NormalizedWebhookResult } from '@wa/shared';

const MAX_EVENT_TYPE_LENGTH = 255;

@Injectable()
export class WebhookProcessingService {
  private readonly logger = new Logger(WebhookProcessingService.name);

  constructor(
    @Inject(WEBHOOK_QUEUE) private readonly webhookQueue: Queue,
    @Inject(WHATSAPP_STATUS_RECONCILIATION_QUEUE) private readonly statusQueue: Queue,
    @Inject(INBOX_QUEUE) private readonly inboxQueue: Queue,
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

      // Publish each normalized status/inbound event to the campaign status-reconciliation
      // queue. The campaigns module consumes these to update messages, campaign recipients,
      // reply attribution, and opt-out handling. The webhook module stays decoupled.
      await this.publishStatusEvents(event.id, result);
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

  private async publishStatusEvents(webhookEventId: string, result: NormalizedWebhookResult): Promise<void> {
    for (const [index, event] of result.events.entries()) {
      const kind = event.kind === 'status' ? 'status' : 'message';
      const payload = event.kind === 'status' ? event.status : event.message;
      // Campaign pipeline: recipient status mirroring and reply attribution.
      try {
        await this.statusQueue.add(
          'reconcile',
          { kind, payload, webhookEventId },
          {
            jobId: `recon:${webhookEventId}:${index}`,
            attempts: 5,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: { count: 5000 },
            removeOnFail: { count: 5000 },
          },
        );
      } catch (error) {
        this.logger.warn(
          `Failed to enqueue status event for webhook ${webhookEventId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      // Inbox pipeline: conversation store, unread/service-window, media, opt-out, realtime.
      try {
        await this.inboxQueue.add(
          'inbox',
          { kind, payload, webhookEventId },
          {
            jobId: `inbox:${webhookEventId}:${index}`,
            attempts: 5,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: { count: 5000 },
            removeOnFail: { count: 5000 },
          },
        );
      } catch (error) {
        this.logger.warn(
          `Failed to enqueue inbox event for webhook ${webhookEventId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
