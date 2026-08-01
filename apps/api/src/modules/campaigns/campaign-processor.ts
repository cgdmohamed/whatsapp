import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { TemplateSnapshot } from '@wa/shared';

import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { MessageTemplatesDao } from '../whatsapp/templates/message-templates.dao';
import { WhatsAppPhoneNumbersDao } from '../whatsapp/whatsapp-phone-numbers.dao';
import { MetaApiError } from '../whatsapp/meta-api/meta-api.errors';
import { CampaignDispatchService } from './campaign-dispatch.service';
import { CampaignRecipientsDao } from './campaign-recipients.dao';
import { CampaignsDao } from './campaigns.dao';
import { MessagesDao } from './messages.dao';

interface SendJobData {
  recipientId: string;
}
interface BuildJobData {
  campaignId: string;
}

function buildSendComponents(components: TemplateSnapshot['components'], resolved: string[]): Record<string, unknown>[] {
  const params = [...resolved];
  const result: Record<string, unknown>[] = [];
  for (const component of components) {
    if (component.type === 'BODY') {
      const count = component.variables.length;
      const parameters = params.splice(0, count).map((text) => ({ type: 'text', text }));
      if (parameters.length > 0) {
        result.push({ type: 'body', parameters });
      }
    } else if (component.type === 'HEADER' && component.text) {
      const count = component.variables.length;
      const parameters = params.splice(0, count).map((text) => ({ type: 'text', text }));
      if (parameters.length > 0) {
        result.push({ type: 'header', parameters });
      }
    } else if (component.type === 'BUTTONS' && component.buttons) {
      component.buttons.forEach((button, index) => {
        if (button.type === 'URL' && button.url) {
          const matches = Array.from(button.url.matchAll(/\{\{(\d+)\}\}/g));
          const count = matches.length;
          const parameters = params.splice(0, count).map((text) => ({ type: 'text', text }));
          if (parameters.length > 0) {
            result.push({ type: 'button', sub_type: 'url', index, parameters });
          }
        }
      });
    }
  }
  return result;
}

@Injectable()
export class CampaignProcessor {
  private readonly logger = new Logger(CampaignProcessor.name);

  constructor(
    private readonly campaignsDao: CampaignsDao,
    private readonly recipientsDao: CampaignRecipientsDao,
    private readonly templatesDao: MessageTemplatesDao,
    private readonly phoneNumbersDao: WhatsAppPhoneNumbersDao,
    private readonly whatsappService: WhatsAppService,
    private readonly messagesDao: MessagesDao,
    private readonly dispatchService: CampaignDispatchService,
  ) {}

  async buildRecipients(job: Job<BuildJobData>): Promise<void> {
    const { campaignId } = job.data;
    const campaign = await this.campaignsDao.findById(campaignId);
    if (!campaign) {
      return;
    }
    if (['CANCELLED', 'PAUSED', 'FAILED', 'COMPLETED'].includes(campaign.status)) {
      this.logger.log(`Campaign ${campaignId} is ${campaign.status}; skipping recipient build.`);
      return;
    }

    const recipients = await this.recipientsDao.findEligibleForCampaign(campaignId);
    let queued = 0;
    for (const recipient of recipients) {
      const jobId = await this.dispatchService.enqueueRecipientSend(
        recipient.id,
        recipient.idempotencyKey,
      );
      if (jobId) {
        await this.recipientsDao.setQueueJobId(recipient.id, jobId, new Date());
        queued += 1;
      }
    }

    if (queued === 0) {
      await this.campaignsDao.update(campaignId, { status: 'COMPLETED', completedAt: new Date() });
      this.logger.log(`Campaign ${campaignId} has no recipients to send; completed.`);
    } else {
      await this.campaignsDao.update(campaignId, { status: 'RUNNING', queuedRecipients: campaign.queuedRecipients + queued });
      this.logger.log(`Queued ${queued} recipient send jobs for campaign ${campaignId}.`);
    }
  }

  async sendRecipientMessage(job: Job<SendJobData>): Promise<void> {
    const { recipientId } = job.data;
    const recipient = await this.recipientsDao.findById(recipientId);
    if (!recipient) {
      return;
    }
    if (!['QUEUED', 'SENDING'].includes(recipient.status)) {
      // Already handled (sent/failed/cancelled/opted out) — idempotent skip.
      return;
    }

    const campaign = await this.campaignsDao.findById(recipient.campaignId);
    if (!campaign) {
      return;
    }

    // Gate on campaign lifecycle.
    if (campaign.status === 'PAUSED') {
      const rescheduleAt = Date.now() + 60_000;
      if (typeof job.moveToDelayed === 'function') {
        await job.moveToDelayed(rescheduleAt, job.token);
      }
      return;
    }
    if (campaign.status === 'CANCELLED' || campaign.status === 'FAILED') {
      await this.recipientsDao.setStatus(recipientId, 'CANCELLED');
      return;
    }
    if (campaign.status === 'COMPLETED') {
      return;
    }

    // Re-check the template is still approved (status has not changed since validation).
    const template = campaign.messageTemplateId ? await this.templatesDao.findById(campaign.messageTemplateId) : null;
    if (!template || template.status !== 'APPROVED' || template.blockedAt) {
      await this.recipientsDao.update(recipientId, {
        status: 'FAILED',
        failedAt: new Date(),
        failureCode: 'TEMPLATE_NOT_APPROVED',
        failureMessage: 'Template no longer approved',
      });
      return;
    }

    // Load the campaign's phone number row to resolve Meta's phone_number_id.
    const phoneNumberRow = campaign.whatsappPhoneNumberId
      ? await this.phoneNumbersDao.findById(campaign.whatsappPhoneNumberId)
      : null;
    const metaPhoneNumberId = phoneNumberRow?.phoneNumberId;

    await this.recipientsDao.update(recipientId, {
      status: 'SENDING',
      sendAttemptedAt: new Date(),
      attemptCount: recipient.attemptCount + 1,
    });

    const snapshot = (campaign.templateSnapshot as unknown as TemplateSnapshot) ?? null;
    const components = buildSendComponents(snapshot?.components ?? [], recipient.resolvedTemplateParameters as string[]);

    const client = await this.whatsappService.buildClient();
    try {
      const response = await client.sendTemplateMessage({
        to: recipient.phoneE164,
        templateName: template.name,
        languageCode: template.language,
        components,
        phoneNumberId: metaPhoneNumberId ?? '',
      });
      const metaMessageId = response.messages[0]?.id ?? null;
      await this.messagesDao.insert({
        contactId: recipient.contactId,
        conversationId: null,
        campaignId: campaign.id,
        campaignRecipientId: recipient.id,
        whatsappPhoneNumberId: campaign.whatsappPhoneNumberId,
        direction: 'OUTBOUND',
        type: 'template',
        status: 'SENT',
        metaMessageId,
        templateName: template.name,
        templateLanguage: template.language,
        templateParameters: recipient.resolvedTemplateParameters as string[] | null,
        isTest: false,
        sentAt: new Date(),
      } as never);
      await this.recipientsDao.update(recipientId, {
        status: 'SENT',
        metaMessageId,
        sentAt: new Date(),
      });
    } catch (error) {
      if (error instanceof MetaApiError) {
        const transient = error.normalized.is_transient;
        if (transient && job.attemptsMade < (job.opts.attempts ?? 1)) {
          // BullMQ will retry with backoff; respect retry-after if provided.
          throw error;
        }
        // Permanent failure (or out of retries): mark recipient failed, no further retry.
        await this.recipientsDao.update(recipientId, {
          status: 'FAILED',
          failedAt: new Date(),
          failureCode: String(error.normalized.error_code ?? 'UNKNOWN'),
          failureMessage: [error.normalized.title, error.normalized.message].filter(Boolean).join(': '),
        });
        await this.messagesDao.insert({
          contactId: recipient.contactId,
          campaignId: campaign.id,
          campaignRecipientId: recipient.id,
          whatsappPhoneNumberId: campaign.whatsappPhoneNumberId,
          direction: 'OUTBOUND',
          type: 'template',
          status: 'FAILED',
          templateName: template.name,
          templateLanguage: template.language,
          templateParameters: recipient.resolvedTemplateParameters as string[] | null,
          errorCode: String(error.normalized.error_code ?? 'UNKNOWN'),
          errorMessage: [error.normalized.title, error.normalized.message].filter(Boolean).join(': '),
          failedAt: new Date(),
          isTest: false,
        } as never);
        return;
      }
      throw error;
    }
  }

  async aggregateMetricsForCampaign(campaignId: string): Promise<void> {
    const metrics = await this.messagesDao.aggregateCampaignMetrics(campaignId);
    await this.campaignsDao.update(campaignId, {
      queuedRecipients: metrics.queued,
      sentRecipients: metrics.sent,
      deliveredRecipients: metrics.delivered,
      readRecipients: metrics.read,
      repliedRecipients: metrics.replied,
      failedRecipients: metrics.failed,
      optedOutRecipients: metrics.optedOut,
    });
    const campaign = await this.campaignsDao.findById(campaignId);
    if (campaign && ['RUNNING', 'QUEUING'].includes(campaign.status)) {
      const pendingLeft = await this.recipientsDao.countByStatus(campaignId, 'PENDING')
        + await this.recipientsDao.countByStatus(campaignId, 'QUEUED')
        + await this.recipientsDao.countByStatus(campaignId, 'SENDING');
      if (pendingLeft === 0) {
        await this.campaignsDao.update(campaignId, { status: 'COMPLETED', completedAt: campaign.completedAt ?? new Date() });
      }
    }
  }

  async aggregateAllActiveCampaignMetrics(): Promise<void> {
    const ids = await this.campaignsDao.listActiveIds();
    for (const id of ids) {
      try {
        await this.aggregateMetricsForCampaign(id);
      } catch (error) {
        this.logger.warn(`Metrics aggregation failed for campaign ${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}