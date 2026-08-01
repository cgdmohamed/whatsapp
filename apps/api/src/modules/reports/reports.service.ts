import { Injectable } from '@nestjs/common';
import type {
  CampaignPerformanceQuery,
  ContactBreakdownDto,
  ContactReportQuery,
  DashboardQuery,
  DashboardSummaryDto,
  DashboardTrendsDto,
  FailureAnalysisDto,
  FailureAnalysisQuery,
  InboxPerformanceQuery,
  PaginatedCampaignPerformance,
  PaginatedContactReport,
  PaginatedInboxPerformance,
} from '@wa/shared';

import { ReportsDao } from './reports-dao';

@Injectable()
export class ReportsService {
  constructor(private readonly dao: ReportsDao) {}

  dashboardSummary(query: DashboardQuery): Promise<DashboardSummaryDto> {
    return this.dao.dashboardSummary(query);
  }

  dashboardTrends(query: DashboardQuery): Promise<DashboardTrendsDto> {
    return this.dao.dashboardTrends(query);
  }

  async campaignPerformance(query: CampaignPerformanceQuery): Promise<PaginatedCampaignPerformance> {
    const { items, total } = await this.dao.campaignPerformance(query);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  failureAnalysis(query: FailureAnalysisQuery): Promise<FailureAnalysisDto> {
    return this.dao.failureAnalysis(query);
  }

  async inboxPerformance(query: InboxPerformanceQuery): Promise<PaginatedInboxPerformance> {
    const { items, total } = await this.dao.inboxPerformance(query);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async contactReport(query: ContactReportQuery): Promise<PaginatedContactReport> {
    const { items, total } = await this.dao.contactReport(query);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  contactBreakdown(): Promise<ContactBreakdownDto> {
    return this.dao.contactBreakdown();
  }
}
