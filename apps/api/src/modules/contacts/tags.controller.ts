import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createTagSchema,
  tagQuerySchema,
  updateTagSchema,
  type CreateTagInput,
  type PaginatedTags,
  type TagDto,
  type TagQuery,
  type UpdateTagInput,
} from '@wa/shared';

import { CurrentUser, Roles } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../auth/auth.types';
import { ContactsService } from './contacts.service';

@ApiTags('tags')
@ApiBearerAuth()
@Controller('tags')
export class TagsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  list(
    @Query(new ZodValidationPipe(tagQuerySchema)) query: TagQuery,
    @CurrentUser() actor: AuthUser,
  ): Promise<PaginatedTags> {
    return this.contactsService.listTags(query, actor);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(
    @Body(new ZodValidationPipe(createTagSchema)) input: CreateTagInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<TagDto> {
    return this.contactsService.createTag(input, actor);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTagSchema)) input: UpdateTagInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<TagDto> {
    return this.contactsService.updateTag(id, input, actor);
  }

  @Post(':id/archive')
  @Roles('ADMIN', 'MANAGER')
  archive(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<TagDto> {
    return this.contactsService.archiveTag(id, actor);
  }
}
