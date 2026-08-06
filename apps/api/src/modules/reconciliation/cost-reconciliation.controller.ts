import { Controller, Get, Param, Post, Query, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  costReconciliationQuerySchema,
  type CostReconciliationDetail,
  type CostReconciliationJobDto,
  type CostReconciliationQuery,
  type CostReconciliationUploadResult,
  type CostReconciliationValidationSummary,
  type PaginatedCostReconciliations,
} from '@wa/shared';

import { CurrentUser, Roles } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../auth/auth.types';
import { CostReconciliationService, type UploadedFileLike } from './cost-reconciliation.service';

@ApiTags('pricing')
@ApiBearerAuth()
@Controller('admin/whatsapp-pricing/reconciliations')
export class CostReconciliationController {
  constructor(private readonly service: CostReconciliationService) {}

  @Post('upload')
  @Roles('ADMIN')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  upload(@UploadedFile() file: UploadedFileLike, @CurrentUser() actor: AuthUser): Promise<CostReconciliationUploadResult> {
    return this.service.upload(file, actor);
  }

  @Post(':id/validate')
  @Roles('ADMIN')
  validate(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<CostReconciliationValidationSummary> {
    return this.service.validate(id, actor);
  }

  @Post(':id/apply')
  @Roles('ADMIN')
  apply(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<CostReconciliationJobDto> {
    return this.service.apply(id, actor);
  }

  @Get()
  @Roles('ADMIN')
  list(@Query(new ZodValidationPipe(costReconciliationQuerySchema)) query: CostReconciliationQuery): Promise<PaginatedCostReconciliations> {
    return this.service.list(query);
  }

  @Get(':id')
  @Roles('ADMIN')
  get(@Param('id') id: string): Promise<CostReconciliationDetail> {
    return this.service.get(id);
  }

  @Get(':id/unmatched')
  @Roles('ADMIN')
  async downloadUnmatched(@Param('id') id: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const buffer = await this.service.downloadUnmatched(id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reconciliation-${id}-unmatched.csv"`);
    return new StreamableFile(buffer);
  }
}
