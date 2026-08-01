import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  configureImportSchema,
  importJobQuerySchema,
  type ConfigureImportInput,
  type ImportJobDetailDto,
  type ImportJobDto,
  type ImportJobQuery,
  type ImportUploadDto,
  type ImportValidationSummaryDto,
  type PaginatedImportJobs,
} from '@wa/shared';

import { CurrentUser, Roles } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../auth/auth.types';
import { ImportsService, type UploadedFileLike } from './imports.service';

@ApiTags('imports')
@ApiBearerAuth()
@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('upload')
  @Roles('ADMIN', 'MANAGER')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024, files: 1 } }))
  upload(
    @UploadedFile() file: UploadedFileLike,
    @CurrentUser() actor: AuthUser,
  ): Promise<ImportUploadDto> {
    return this.importsService.upload(file, actor);
  }

  @Post(':id/configure')
  @Roles('ADMIN', 'MANAGER')
  configure(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(configureImportSchema)) input: ConfigureImportInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<ImportValidationSummaryDto> {
    return this.importsService.configure(id, input, actor);
  }

  @Post(':id/start')
  @Roles('ADMIN', 'MANAGER')
  start(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<ImportJobDto> {
    return this.importsService.start(id, actor);
  }

  @Get()
  @Roles('ADMIN', 'MANAGER')
  list(
    @Query(new ZodValidationPipe(importJobQuerySchema)) query: ImportJobQuery,
    @CurrentUser() actor: AuthUser,
  ): Promise<PaginatedImportJobs> {
    return this.importsService.list(query, actor);
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER')
  get(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<ImportJobDetailDto> {
    return this.importsService.get(id, actor);
  }

  @Get(':id/rejected')
  @Roles('ADMIN', 'MANAGER')
  async rejected(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buffer = await this.importsService.rejectedCsv(id, actor);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="import-${id}-rejected.csv"`);
    return new StreamableFile(buffer);
  }
}
