import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  contactListQuerySchema,
  createContactListSchema,
  idListSchema,
  updateContactListSchema,
  type ContactListDto,
  type ContactListQuery,
  type ContactDto,
  type CreateContactListInput,
  type IdListInput,
  type PaginatedContactLists,
  type UpdateContactListInput,
} from '@wa/shared';

import { CurrentUser, Roles } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../auth/auth.types';
import { ContactsService } from './contacts.service';

@ApiTags('lists')
@ApiBearerAuth()
@Controller('lists')
export class ListsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  list(
    @Query(new ZodValidationPipe(contactListQuerySchema)) query: ContactListQuery,
    @CurrentUser() actor: AuthUser,
  ): Promise<PaginatedContactLists> {
    return this.contactsService.listLists(query, actor);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(
    @Body(new ZodValidationPipe(createContactListSchema)) input: CreateContactListInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<ContactListDto> {
    return this.contactsService.createList(input, actor);
  }

  @Get(':id/members')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  members(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<ContactDto[]> {
    return this.contactsService.listMembers(id, actor);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateContactListSchema)) input: UpdateContactListInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<ContactListDto> {
    return this.contactsService.updateList(id, input, actor);
  }

  @Post(':id/members')
  @Roles('ADMIN', 'MANAGER')
  addMembers(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(idListSchema)) input: IdListInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<ContactDto[]> {
    return this.contactsService.addListMembers(id, input, actor);
  }

  @Post(':id/members/remove')
  @Roles('ADMIN', 'MANAGER')
  removeMembers(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(idListSchema)) input: IdListInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<ContactDto[]> {
    return this.contactsService.removeListMembers(id, input, actor);
  }

  @Post(':id/archive')
  @Roles('ADMIN', 'MANAGER')
  archive(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<ContactListDto> {
    return this.contactsService.archiveList(id, actor);
  }
}
