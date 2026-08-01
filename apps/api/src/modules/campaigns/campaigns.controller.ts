import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type {
  CampaignDto,
  CampaignQuery,
  CampaignRecipientQuery,
  CreateCampaignInput,
  PaginatedCampaignRecipients,
  PaginatedCampaigns,
  PreflightReport,
  TestSendInput,
  TestSendResult,
  UpdateCampaignInput,
} from '@wa/shared';
import {
  campaignQuerySchema,
  campaignRecipientQuerySchema,
  createCampaignSchema,
  testSendSchema,
  updateCampaignSchema,
} from '@wa/shared';

import { CurrentUser, Roles } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../auth/auth.types';
import { CampaignsService } from './campaigns.service';

@ApiTags('campaigns')
@ApiBearerAuth()
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER')
  list(@Query(new ZodValidationPipe(campaignQuerySchema)) query: CampaignQuery): Promise<PaginatedCampaigns> {
    return this.campaignsService.list(query);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(
    @Body(new ZodValidationPipe(createCampaignSchema)) input: CreateCampaignInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<CampaignDto> {
    return this.campaignsService.create(input, actor);
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER')
  get(@Param('id') id: string): Promise<CampaignDto> {
    return this.campaignsService.get(id);
  }

  @Put(':id')
  @Roles('ADMIN', 'MANAGER')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCampaignSchema)) input: UpdateCampaignInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<CampaignDto> {
    return this.campaignsService.update(id, input, actor);
  }

  @Post(':id/validate')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  validate(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<PreflightReport> {
    return this.campaignsService.validate(id, actor);
  }

  @Post(':id/schedule')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  schedule(
    @Param('id') id: string,
    @Body() body: { scheduledAt: string },
    @CurrentUser() actor: AuthUser,
  ): Promise<CampaignDto> {
    return this.campaignsService.schedule(id, body.scheduledAt, actor);
  }

  @Post(':id/start')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  start(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<CampaignDto> {
    return this.campaignsService.start(id, actor);
  }

  @Post(':id/pause')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  pause(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<CampaignDto> {
    return this.campaignsService.pause(id, actor);
  }

  @Post(':id/resume')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  resume(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<CampaignDto> {
    return this.campaignsService.resume(id, actor);
  }

  @Post(':id/cancel')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<CampaignDto> {
    return this.campaignsService.cancel(id, actor);
  }

  @Post(':id/duplicate')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  duplicate(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<CampaignDto> {
    return this.campaignsService.duplicate(id, actor);
  }

  @Post(':id/archive')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  archive(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<CampaignDto> {
    return this.campaignsService.archive(id, actor);
  }

  @Post(':id/test-send')
  @Roles('ADMIN', 'MANAGER')
  @HttpCode(HttpStatus.OK)
  testSend(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(testSendSchema)) input: TestSendInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<TestSendResult[]> {
    return this.campaignsService.testSend(id, input, actor);
  }

  @Get(':id/recipients')
  @Roles('ADMIN', 'MANAGER')
  recipients(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(campaignRecipientQuerySchema)) query: CampaignRecipientQuery,
  ): Promise<PaginatedCampaignRecipients> {
    return this.campaignsService.recipients(id, query);
  }

  @Get(':id/recipients.csv')
  @Roles('ADMIN', 'MANAGER')
  async recipientsCsv(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const csv = await this.campaignsService.downloadRecipientsCsv(id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="campaign-${id}-recipients.csv"`);
    return new StreamableFile(Buffer.from(csv, 'utf-8'));
  }

  @Get(':id/metrics')
  @Roles('ADMIN', 'MANAGER')
  metrics(@Param('id') id: string): Promise<unknown> {
    return this.campaignsService.aggregateMetrics(id);
  }
}