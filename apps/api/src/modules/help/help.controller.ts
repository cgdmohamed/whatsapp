import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  helpArticleQuerySchema,
  helpContextQuerySchema,
  helpFeedbackInputSchema,
  helpOnboardingToggleInputSchema,
  helpOnboardingVisibilityInputSchema,
  helpSearchQuerySchema,
  type HelpArticleQuery,
  type HelpContextQuery,
  type HelpContextDto,
  type HelpOnboardingDto,
  type HelpSearchQuery,
  type HelpSearchResponseDto,
  type PaginatedHelpArticles,
} from '@wa/shared';

import { CurrentUser, Roles } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../auth/auth.types';
import { HelpService } from './help.service';

@ApiTags('help')
@ApiBearerAuth()
@Controller('help')
export class HelpController {
  constructor(private readonly helpService: HelpService) {}

  @Get('categories')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  categories() {
    return this.helpService.getCategories();
  }

  @Get('articles')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  articles(@Query(new ZodValidationPipe(helpArticleQuerySchema)) query: HelpArticleQuery, @CurrentUser() actor: AuthUser): Promise<PaginatedHelpArticles> {
    return this.helpService.listArticles({
      categorySlug: query.categorySlug,
      language: query.language,
      role: actor.role,
      page: query.page,
      pageSize: query.pageSize,
      featureKey: query.featureKey,
      q: query.q,
    });
  }

  @Get('articles/:categorySlug/:articleSlug')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  article(
    @Param('categorySlug') categorySlug: string,
    @Param('articleSlug') articleSlug: string,
    @Query('language') language: string | undefined,
    @Query('route') route: string | undefined,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.helpService.getArticle(categorySlug, articleSlug, language === 'en' ? 'en' : 'ar', actor.role, actor.id, route);
  }

  @Get('context')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  context(@Query(new ZodValidationPipe(helpContextQuerySchema)) query: HelpContextQuery, @CurrentUser() actor: AuthUser): Promise<HelpContextDto> {
    return this.helpService.getContext(query.route, query.featureKey, query.language, actor.role);
  }

  @Get('search')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  search(@Query(new ZodValidationPipe(helpSearchQuerySchema)) query: HelpSearchQuery, @CurrentUser() actor: AuthUser): Promise<HelpSearchResponseDto> {
    return this.helpService.search(
      { q: query.q, language: query.language, categorySlug: query.categorySlug, role: actor.role },
      actor.id,
    );
  }

  @Post('articles/:id/view')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  view(@Param('id') id: string, @Body() body: { route?: string }, @CurrentUser() actor: AuthUser): Promise<void> {
    return this.helpService.recordView(id, actor.id, body?.route);
  }

  @Post('articles/:id/feedback')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  feedback(@Param('id') id: string, @Body(new ZodValidationPipe(helpFeedbackInputSchema)) body: { wasHelpful: boolean; comment?: string }, @CurrentUser() actor: AuthUser): Promise<void> {
    return this.helpService.recordFeedback({ articleId: id, wasHelpful: body.wasHelpful, comment: body.comment }, actor.id);
  }

  @Get('onboarding')
  @Roles('ADMIN')
  onboarding(@CurrentUser() actor: AuthUser): Promise<HelpOnboardingDto> {
    return this.helpService.getOnboarding(actor.id, actor.role);
  }

  @Post('onboarding/toggle')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  onboardingToggle(
    @Body(new ZodValidationPipe(helpOnboardingToggleInputSchema)) body: { key: string; completed: boolean },
    @CurrentUser() actor: AuthUser,
  ): Promise<void> {
    return this.helpService.toggleOnboardingStep(actor.id, body.key, body.completed);
  }

  @Post('onboarding/visibility')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  onboardingVisibility(
    @Body(new ZodValidationPipe(helpOnboardingVisibilityInputSchema)) body: { hidden: boolean },
    @CurrentUser() actor: AuthUser,
  ): Promise<void> {
    return this.helpService.setOnboardingVisibility(actor.id, body.hidden);
  }
}
