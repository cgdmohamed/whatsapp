import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  helpArticleAdminQuerySchema,
  helpArticleInputSchema,
  helpCategoryInputSchema,
  helpCategoryReorderInputSchema,
  helpFeedbackAdminQuerySchema,
  helpRestoreInputSchema,
  type HelpArticleAdminDetailDto,
  type HelpArticleInput,
  type HelpAnalyticsDto,
  type HelpCategoryDto,
  type HelpCategoryInput,
  type HelpCategoryReorderInput,
  type HelpVersionDto,
  type PaginatedHelpArticles,
  type PaginatedHelpFeedback,
} from '@wa/shared';

import { CurrentUser, Roles } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../auth/auth.types';
import { HelpService } from './help.service';

@ApiTags('admin-help')
@ApiBearerAuth()
@Controller('admin/help')
export class HelpAdminController {
  constructor(private readonly helpService: HelpService) {}

  // ---------- Categories ----------

  @Get('categories')
  @Roles('ADMIN', 'MANAGER')
  listCategories(): Promise<HelpCategoryDto[]> {
    return this.helpService.adminListCategories();
  }

  @Post('categories')
  @Roles('ADMIN')
  createCategory(@Body(new ZodValidationPipe(helpCategoryInputSchema)) input: HelpCategoryInput, @CurrentUser() actor: AuthUser): Promise<HelpCategoryDto> {
    return this.helpService.createCategory(input, actor.id);
  }

  @Patch('categories/:id')
  @Roles('ADMIN')
  updateCategory(@Param('id') id: string, @Body(new ZodValidationPipe(helpCategoryInputSchema)) input: HelpCategoryInput, @CurrentUser() actor: AuthUser): Promise<HelpCategoryDto> {
    return this.helpService.updateCategory(id, input, actor.id);
  }

  @Post('categories/:id/archive')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  archiveCategory(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<HelpCategoryDto> {
    return this.helpService.archiveCategory(id, actor.id);
  }

  @Post('categories/reorder')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  reorderCategories(@Body(new ZodValidationPipe(helpCategoryReorderInputSchema)) body: HelpCategoryReorderInput, @CurrentUser() actor: AuthUser): Promise<void> {
    return this.helpService.reorderCategories(body.items, actor.id);
  }

  // ---------- Articles ----------

  @Get('articles')
  @Roles('ADMIN', 'MANAGER')
  listArticles(@Query(new ZodValidationPipe(helpArticleAdminQuerySchema)) query: unknown): Promise<PaginatedHelpArticles> {
    const q = query as typeof helpArticleAdminQuerySchema._output;
    return this.helpService.adminListArticles({
      categorySlug: q.categorySlug,
      status: q.status,
      featureKey: q.featureKey,
      q: q.q,
      includeArchived: q.includeArchived,
      page: q.page,
      pageSize: q.pageSize,
      language: q.language,
    });
  }

  @Post('articles')
  @Roles('ADMIN')
  createArticle(@Body(new ZodValidationPipe(helpArticleInputSchema)) input: HelpArticleInput, @CurrentUser() actor: AuthUser): Promise<HelpArticleAdminDetailDto> {
    return this.helpService.createArticle(input, actor.id);
  }

  @Get('articles/:id')
  @Roles('ADMIN', 'MANAGER')
  getArticle(@Param('id') id: string): Promise<HelpArticleAdminDetailDto> {
    return this.helpService.getArticleAdmin(id);
  }

  @Patch('articles/:id')
  @Roles('ADMIN')
  updateArticle(@Param('id') id: string, @Body(new ZodValidationPipe(helpArticleInputSchema)) input: HelpArticleInput, @CurrentUser() actor: AuthUser): Promise<HelpArticleAdminDetailDto> {
    return this.helpService.updateArticle(id, input, actor.id);
  }

  @Post('articles/:id/publish')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  publishArticle(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<HelpArticleAdminDetailDto> {
    return this.helpService.publishArticle(id, actor.id);
  }

  @Post('articles/:id/unpublish')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  unpublishArticle(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<HelpArticleAdminDetailDto> {
    return this.helpService.unpublishArticle(id, actor.id);
  }

  @Post('articles/:id/duplicate')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  duplicateArticle(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<HelpArticleAdminDetailDto> {
    return this.helpService.duplicateArticle(id, actor.id);
  }

  @Post('articles/:id/archive')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  archiveArticle(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<HelpArticleAdminDetailDto> {
    return this.helpService.archiveArticle(id, actor.id);
  }

  @Get('articles/:id/versions')
  @Roles('ADMIN')
  listVersions(@Param('id') id: string): Promise<HelpVersionDto[]> {
    return this.helpService.listVersions(id);
  }

  @Post('articles/:id/restore-version')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  restoreVersion(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(helpRestoreInputSchema)) body: { versionId: string; changeSummary?: string },
    @CurrentUser() actor: AuthUser,
  ): Promise<HelpArticleAdminDetailDto> {
    return this.helpService.restoreVersion(id, body.versionId, body.changeSummary ?? undefined, actor.id);
  }

  // ---------- Feedback + analytics ----------

  @Get('feedback')
  @Roles('ADMIN')
  listFeedback(@Query(new ZodValidationPipe(helpFeedbackAdminQuerySchema)) query: { articleId?: string; page: number; pageSize: number }): Promise<PaginatedHelpFeedback> {
    return this.helpService.listFeedback(query);
  }

  @Get('analytics')
  @Roles('ADMIN')
  analytics(): Promise<HelpAnalyticsDto> {
    return this.helpService.getAnalytics();
  }
}
