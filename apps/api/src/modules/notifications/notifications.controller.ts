import { Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, Patch, Post, Query, Req, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { finalize, map, Observable } from 'rxjs';
import type {
  NotificationDto,
  NotificationQuery,
  NotificationPreferencesDto,
  NotificationPreferencesInput,
  PaginatedNotifications,
} from '@wa/shared';
import { notificationPreferencesInputSchema, notificationQuerySchema } from '@wa/shared';

import { CurrentUser, Roles } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ERROR_CODES } from '../../common/errors';
import type { AuthUser } from '../auth/auth.types';
import { NotificationsDao } from './notifications.dao';
import { NotificationsRealtimeService } from './notifications-realtime.service';
import { NotificationsService } from './notifications.service';

function toDto(row: import('../../db/schema').NotificationRow, language: 'ar' | 'en'): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    title: language === 'ar' ? row.titleAr : row.titleEn,
    message: (language === 'ar' ? row.messageAr : row.messageEn) ?? null,
    actionUrl: row.actionUrl,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    read: Boolean(row.readAt),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly dao: NotificationsDao,
    private readonly service: NotificationsService,
    private readonly realtime: NotificationsRealtimeService,
  ) {}

  @Get()
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  async list(@Query(new ZodValidationPipe(notificationQuerySchema)) query: NotificationQuery, @CurrentUser() actor: AuthUser): Promise<PaginatedNotifications> {
    const language = actor.preferredLanguage === 'en' ? 'en' : 'ar';
    const { items, total, unread } = await this.dao.list(actor.id, query.page, query.pageSize);
    return {
      items: items.map((row) => toDto(row, language)),
      total,
      unread,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    };
  }

  @Get('unread-count')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  async unreadCount(@CurrentUser() actor: AuthUser): Promise<{ count: number }> {
    return { count: await this.dao.unreadCount(actor.id) };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  async markRead(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<void> {
    const row = await this.dao.findOwned(id, actor.id);
    if (!row) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    await this.dao.markRead(id, actor.id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  async markAllRead(@CurrentUser() actor: AuthUser): Promise<void> {
    await this.dao.markAllRead(actor.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  async remove(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<void> {
    const row = await this.dao.findOwned(id, actor.id);
    if (!row) {
      throw new NotFoundException(ERROR_CODES.NOT_FOUND);
    }
    await this.dao.remove(id, actor.id);
  }

  @Get('stream')
  @Sse()
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  stream(@Req() req: Request): Observable<MessageEvent> {
    const userId = (req as unknown as { user?: { id: string } }).user?.id ?? '';
    const subject = this.realtime.connect(userId);
    return subject.pipe(
      map((event) => ({ data: JSON.stringify(event) }) as MessageEvent),
      finalize(() => this.realtime.disconnect(userId)),
    );
  }

  @Get('preferences')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  preferences(@CurrentUser() actor: AuthUser): Promise<NotificationPreferencesDto> {
    return this.service.getPreferences(actor.id);
  }

  @Patch('preferences')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  updatePreferences(
    @Body(new ZodValidationPipe(notificationPreferencesInputSchema)) input: NotificationPreferencesInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<NotificationPreferencesDto> {
    return this.service.updatePreferences(actor.id, input, actor.id);
  }
}
