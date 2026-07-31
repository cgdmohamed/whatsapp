import { Body, Controller, Get, HttpCode, HttpStatus, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { settingsSchema, type SettingsDto, type PublicSettingsDto } from '@wa/shared';
import { AUDIT_ACTIONS } from '@wa/shared';

import { CurrentUser, Public, Roles } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditService } from '../../common/audit/audit.module';
import type { AuthUser } from '../auth/auth.types';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly auditService: AuditService,
  ) {}

  @Get('public')
  @Public()
  getPublic(): Promise<PublicSettingsDto> {
    return this.settingsService.getPublic();
  }

  @ApiBearerAuth()
  @Get()
  @Roles('ADMIN')
  getAll(): Promise<SettingsDto> {
    return this.settingsService.getAll();
  }

  @ApiBearerAuth()
  @Put()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async updateAll(
    @Body(new ZodValidationPipe(settingsSchema)) dto: SettingsDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<SettingsDto> {
    await this.settingsService.updateAll(dto);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.SETTINGS_UPDATE,
      entityType: 'settings',
      metadata: { fields: Object.keys(dto) },
    });
    return this.settingsService.getAll();
  }
}
