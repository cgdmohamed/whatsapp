import { Injectable, NotFoundException } from '@nestjs/common';
import type { PaginatedWebhookEvents, WebhookEventDetailDto, WebhookEventsQuery } from '@wa/shared';

import { ERROR_CODES } from '../../../common/errors';
import { sanitizePayload } from '../meta-api/meta-api.masking';
import { WebhookEventsDao } from './webhook-events.dao';
import type { WebhookEventRow } from '../../../db/schema';

@Injectable()
export class WebhookEventsService {
  constructor(private readonly eventsDao: WebhookEventsDao) {}

  async list(query: WebhookEventsQuery): Promise<PaginatedWebhookEvents> {
    const { items, total } = await this.eventsDao.list(query);
    return {
      items: items.map((event) => this.toDto(event)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async detail(id: string): Promise<WebhookEventDetailDto> {
    const event = await this.eventsDao.findById(id);
    if (!event) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    return {
      ...this.toDto(event),
      sanitizedPayload: sanitizePayload(event.payload) as Record<string, unknown>,
    };
  }

  private toDto(event: WebhookEventRow) {
    const rawPreview = typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload ?? null);
    return {
      id: event.id,
      provider: event.provider,
      eventType: event.eventType,
      deduplicationKey: event.deduplicationKey,
      processingStatus: event.processingStatus,
      signatureValid: event.signatureValid,
      correlationId: event.correlationId,
      processingAttempts: event.processingAttempts,
      failureReason: event.failureReason,
      payloadPreview: rawPreview.slice(0, 500),
      receivedAt: event.receivedAt.toISOString(),
      processedAt: event.processedAt?.toISOString() ?? null,
      failedAt: event.failedAt?.toISOString() ?? null,
    };
  }
}
