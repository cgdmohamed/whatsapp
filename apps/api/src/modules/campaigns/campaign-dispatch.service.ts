import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';

import {
  CAMPAIGN_RECIPIENT_BUILDER_QUEUE,
  CAMPAIGN_SCHEDULER_QUEUE,
  WHATSAPP_MESSAGE_SEND_QUEUE,
} from '../../common/queue/queue.module';

const SCHEDULER_JOB = 'campaign-schedule';
const RECIPIENT_BUILD_JOB = 'build-recipients';

@Injectable()
export class CampaignDispatchService {
  private readonly logger = new Logger(CampaignDispatchService.name);

  constructor(
    @Inject(CAMPAIGN_SCHEDULER_QUEUE) private readonly schedulerQueue: Queue,
    @Inject(CAMPAIGN_RECIPIENT_BUILDER_QUEUE) private readonly recipientBuilderQueue: Queue,
    @Inject(WHATSAPP_MESSAGE_SEND_QUEUE) private readonly messageSendQueue: Queue,
  ) {}

  async scheduleCampaignDispatch(campaignId: string, when: Date): Promise<void> {
    const delay = Math.max(0, when.getTime() - Date.now());
    await this.schedulerQueue.add(
      SCHEDULER_JOB,
      { campaignId },
      {
        jobId: `${SCHEDULER_JOB}-${campaignId}`,
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: { count: 100 },
      },
    );
  }

  async dispatchCampaign(campaignId: string): Promise<void> {
    await this.recipientBuilderQueue.add(
      RECIPIENT_BUILD_JOB,
      { campaignId },
      {
        jobId: `${RECIPIENT_BUILD_JOB}-${campaignId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: { count: 100 },
      },
    );
  }

  async enqueueRecipientSend(
    recipientId: string,
    idempotencyKey: string,
  ): Promise<string | null> {
    const job = await this.messageSendQueue.add(
      'send',
      { recipientId },
      {
        jobId: idempotencyKey, // idempotent: one job per recipient
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 5000 },
        removeOnFail: { count: 5000 },
      },
    );
    return job.id ?? null;
  }

  async pauseCampaign(campaignId: string): Promise<void> {
    // The campaign status flag gates sending. We do not remove queued jobs; the send worker
    // re-checks the campaign status and reschedules when paused, so in-flight sends complete
    // but no new sends execute.
    this.logger.log(`Campaign ${campaignId} paused; send worker will gate on status.`);
  }

  async resumeCampaign(campaignId: string): Promise<void> {
    this.logger.log(`Campaign ${campaignId} resumed; queued send jobs will execute.`);
  }

  async cancelCampaign(campaignId: string): Promise<void> {
    // Queued jobs remain; the send worker marks recipients CANCELLED without sending.
    this.logger.log(`Campaign ${campaignId} cancelled; send worker will skip unsent recipients.`);
  }
}