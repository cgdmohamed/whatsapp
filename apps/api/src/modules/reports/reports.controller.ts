import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type {
  AgentCostReport,
  CampaignPerformanceQuery,
  ContactBreakdownDto,
  ContactReportQuery,
  ConversationCostReport,
  CreateExportInput,
  DashboardQuery,
  DashboardSummaryDto,
  DashboardTrendsDto,
  ExportJobDto,
  ExportQuery,
  FailureAnalysisDto,
  FailureAnalysisQuery,
  InboxPerformanceQuery,
  PaginatedCampaignPerformance,
  PaginatedContactReport,
  PaginatedExports,
  PaginatedInboxPerformance,
  RoiReport,
  WhatsappCostsQuery,
  WhatsappCostsReport,
} from '@wa/shared';
import {
  campaignPerformanceQuerySchema,
  contactReportQuerySchema,
  createExportSchema,
  dashboardQuerySchema,
  exportQuerySchema,
  failureAnalysisQuerySchema,
  inboxPerformanceQuerySchema,
  whatsappCostsQuerySchema,
} from '@wa/shared';

import { CurrentUser, Roles } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../auth/auth.types';
import { ExportsService } from './exports.service';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly exportsService: ExportsService,
  ) {}

  @Get('dashboard-summary')
  @Roles('ADMIN', 'MANAGER')
  dashboardSummary(@Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQuery): Promise<DashboardSummaryDto> {
    return this.reportsService.dashboardSummary(query);
  }

  @Get('dashboard-trends')
  @Roles('ADMIN', 'MANAGER')
  dashboardTrends(@Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQuery): Promise<DashboardTrendsDto> {
    return this.reportsService.dashboardTrends(query);
  }

  @Get('campaign-performance')
  @Roles('ADMIN', 'MANAGER')
  campaignPerformance(
    @Query(new ZodValidationPipe(campaignPerformanceQuerySchema)) query: CampaignPerformanceQuery,
  ): Promise<PaginatedCampaignPerformance> {
    return this.reportsService.campaignPerformance(query);
  }

  @Get('failure-analysis')
  @Roles('ADMIN', 'MANAGER')
  failureAnalysis(
    @Query(new ZodValidationPipe(failureAnalysisQuerySchema)) query: FailureAnalysisQuery,
  ): Promise<FailureAnalysisDto> {
    return this.reportsService.failureAnalysis(query);
  }

  @Get('inbox-performance')
  @Roles('ADMIN', 'MANAGER')
  inboxPerformance(
    @Query(new ZodValidationPipe(inboxPerformanceQuerySchema)) query: InboxPerformanceQuery,
  ): Promise<PaginatedInboxPerformance> {
    return this.reportsService.inboxPerformance(query);
  }

  @Get('contact-report')
  @Roles('ADMIN', 'MANAGER')
  contactReport(@Query(new ZodValidationPipe(contactReportQuerySchema)) query: ContactReportQuery): Promise<PaginatedContactReport> {
    return this.reportsService.contactReport(query);
  }

  @Get('contact-breakdown')
  @Roles('ADMIN', 'MANAGER')
  contactBreakdown(): Promise<ContactBreakdownDto> {
    return this.reportsService.contactBreakdown();
  }

  @Get('whatsapp-costs')
  @Roles('ADMIN', 'MANAGER')
  whatsappCosts(@Query(new ZodValidationPipe(whatsappCostsQuerySchema)) query: WhatsappCostsQuery): Promise<WhatsappCostsReport> {
    return this.reportsService.whatsappCosts(query);
  }

  @Get('conversation-costs')
  @Roles('ADMIN', 'MANAGER')
  conversationCosts(@Query(new ZodValidationPipe(whatsappCostsQuerySchema)) query: WhatsappCostsQuery): Promise<ConversationCostReport> {
    return this.reportsService.conversationCostReport(query);
  }

  @Get('agent-costs')
  @Roles('ADMIN', 'MANAGER')
  agentCosts(@Query(new ZodValidationPipe(whatsappCostsQuerySchema)) query: WhatsappCostsQuery): Promise<AgentCostReport> {
    return this.reportsService.agentCostReport(query);
  }

  @Get('roi')
  @Roles('ADMIN', 'MANAGER')
  roi(@Query(new ZodValidationPipe(whatsappCostsQuerySchema)) query: WhatsappCostsQuery): Promise<RoiReport> {
    return this.reportsService.roiReport(query);
  }

  @Post('exports')
  @Roles('ADMIN', 'MANAGER')
  createExport(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createExportSchema)) input: CreateExportInput): Promise<ExportJobDto> {
    return this.exportsService.create(user, input);
  }

  @Get('exports')
  @Roles('ADMIN', 'MANAGER')
  listExports(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(exportQuerySchema)) query: ExportQuery): Promise<PaginatedExports> {
    return this.exportsService.list(user, query);
  }

  @Get('exports/:id')
  @Roles('ADMIN', 'MANAGER')
  getExport(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<ExportJobDto> {
    return this.exportsService.get(user, id);
  }

  @Get('exports/:id/download')
  @Roles('ADMIN', 'MANAGER')
  downloadExport(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    return this.exportsService.download(user, id, res);
  }
}
