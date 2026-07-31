import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  replaceTokenSchema,
  whatsappCredentialsSchema,
  type ReplaceTokenInput,
  type WhatsAppCredentialsInput,
} from '@wa/shared';
import { AUDIT_ACTIONS } from '@wa/shared';

import { CurrentUser, Roles } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditService } from '../../common/audit/audit.module';
import type { AuthUser } from '../auth/auth.types';
import { WhatsAppService, type WhatsAppStatusDto } from './whatsapp.service';

@ApiTags('whatsapp')
@Controller('whatsapp')
export class WhatsAppController {
  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly auditService: AuditService,
  ) {}

  @ApiBearerAuth()
  @Get()
  @Roles('ADMIN')
  getStatus(): Promise<WhatsAppStatusDto> {
    return this.whatsappService.getStatus();
  }

  @ApiBearerAuth()
  @Put('credentials')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async saveCredentials(
    @Body(new ZodValidationPipe(whatsappCredentialsSchema)) dto: WhatsAppCredentialsInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<WhatsAppStatusDto> {
    const result = await this.whatsappService.saveCredentials(dto);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.WHATSAPP_CREDENTIALS_UPDATE,
      entityType: 'whatsapp-account',
      metadata: {
        fields: Object.keys(dto),
        hasAccessToken: dto.accessToken !== undefined,
        hasAppSecret: dto.appSecret !== undefined,
        hasVerifyToken: dto.verifyToken !== undefined,
      },
    });
    return result;
  }

  @ApiBearerAuth()
  @Post('test-connection')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async testConnection(@CurrentUser() actor: AuthUser): Promise<WhatsAppStatusDto> {
    const result = await this.whatsappService.testConnection();
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.WHATSAPP_TEST_CONNECTION,
      entityType: 'whatsapp-account',
    });
    return result;
  }

  @ApiBearerAuth()
  @Post('sync')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async sync(@CurrentUser() actor: AuthUser): Promise<WhatsAppStatusDto> {
    const result = await this.whatsappService.syncAccountInfo();
    await this.whatsappService.syncPhoneNumbers();
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.WHATSAPP_ACCOUNT_SYNC,
      entityType: 'whatsapp-account',
      metadata: { syncedPhoneNumbers: result.phoneNumbers.length },
    });
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.WHATSAPP_PHONE_NUMBERS_SYNC,
      entityType: 'whatsapp-account',
    });
    return result;
  }

  @ApiBearerAuth()
  @Put('token')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async replaceToken(
    @Body(new ZodValidationPipe(replaceTokenSchema)) dto: ReplaceTokenInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<WhatsAppStatusDto> {
    const result = await this.whatsappService.replaceToken(dto.accessToken);
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.WHATSAPP_TOKEN_REPLACE,
      entityType: 'whatsapp-account',
      metadata: { hasAccessToken: true },
    });
    return result;
  }

  @ApiBearerAuth()
  @Post('disconnect')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  async disconnect(@CurrentUser() actor: AuthUser): Promise<WhatsAppStatusDto> {
    const result = await this.whatsappService.disconnect();
    await this.auditService.record({
      actorUserId: actor.id,
      action: AUDIT_ACTIONS.WHATSAPP_DISCONNECT,
      entityType: 'whatsapp-account',
    });
    return result;
  }
}
