import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

import { ERROR_CODES } from '../../../common/errors';
import { Public } from '../../../common/decorators';
import { WebhookEventsDao } from './webhook-events.dao';
import { WebhookProcessingService } from './webhook-processing.service';
import { WebhookVerifierService } from './webhook-verifier.service';
import type { NewWebhookEvent } from '../../../db/schema';

interface WebhookVerifyQuery {
  'hub.mode'?: string;
  'hub.verify_token'?: string;
  'hub.challenge'?: string;
}

function computeDeduplicationKey(payload: unknown): string {
  const serialized = JSON.stringify(payload ?? null);
  return createHash('sha256').update(serialized).digest('hex');
}

@Controller('webhooks/whatsapp')
@Public()
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly verifierService: WebhookVerifierService,
    private readonly eventsDao: WebhookEventsDao,
    private readonly processingService: WebhookProcessingService,
  ) {}

  @Get()
  async verify(@Query() query: WebhookVerifyQuery): Promise<string> {
    return this.verifierService.verifyChallenge(
      query['hub.mode'],
      query['hub.verify_token'],
      query['hub.challenge'],
    );
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleEvent(
    @Req() req: RawBodyRequest<Request> & { headers: Record<string, string | string[] | undefined> },
    @Body() body: unknown,
  ): Promise<{ status: 'ok' }> {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Raw request body is required');
    }

    const signature = req.headers['x-hub-signature-256'];
    const isValid = await this.verifierService.isValidSignature(rawBody, signature);
    if (!isValid) {
      this.logger.warn('Rejecting webhook with invalid or missing signature');
      throw new UnauthorizedException(ERROR_CODES.INVALID_WEBHOOK_SIGNATURE);
    }

    const payload = (body ?? JSON.parse(rawBody.toString('utf8'))) as unknown;    const correlationId =
      (Array.isArray(req.headers['x-request-id'])
        ? req.headers['x-request-id'][0]
        : req.headers['x-request-id']) ?? randomUUID();

    const event: NewWebhookEvent = {
      provider: 'meta',
      eventType: 'whatsapp.webhook',
      payload,
      deduplicationKey: computeDeduplicationKey(payload),
      processingStatus: 'RECEIVED',
      signatureValid: true,
      correlationId,
      receivedAt: new Date(),
    };

    const inserted = await this.eventsDao.insertUnique(event);
    if (!inserted) {
      this.logger.debug('Duplicate webhook event, acknowledging without reprocessing');
      return { status: 'ok' };
    }

    await this.processingService.enqueueEvent(inserted);
    return { status: 'ok' };
  }
}
