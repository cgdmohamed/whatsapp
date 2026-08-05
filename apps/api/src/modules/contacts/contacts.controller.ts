import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  bulkContactActionSchema,
  consentMutationSchema,
  contactQuerySchema,
  createContactSchema,
  idListSchema,
  suppressionMutationSchema,
  updateContactSchema,
  type BulkContactActionInput,
  type ConsentMutationInput,
  type ContactDetailDto,
  type ContactDto,
  type ContactQuery,
  type CreateContactInput,
  type IdListInput,
  type PaginatedContacts,
  type SuppressionMutationInput,
  type UpdateContactInput,
} from '@wa/shared';

import { CurrentUser, Roles } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../auth/auth.types';
import { ContactsService } from './contacts.service';

const CSV_HEADERS = ['id', 'phone', 'firstName', 'lastName', 'displayName', 'email', 'company', 'language', 'status', 'source', 'optInStatus', 'suppressed', 'tags', 'createdAt'];

function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
}

function buildCsv(contacts: ContactDto[]): string {
  const lines = [CSV_HEADERS.join(',')];
  for (const contact of contacts) {
    lines.push(
      [
        contact.id,
        contact.phoneE164,
        contact.firstName,
        contact.lastName,
        contact.displayName,
        contact.email,
        contact.company,
        contact.language,
        contact.status,
        contact.source,
        contact.optInStatus,
        contact.suppressed ? 'yes' : 'no',
        contact.tags.map((tag) => tag.name).join(';'),
        contact.createdAt,
      ]
        .map(toCsvValue)
        .join(','),
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

@ApiTags('contacts')
@ApiBearerAuth()
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  list(
    @Query(new ZodValidationPipe(contactQuerySchema)) query: ContactQuery,
    @CurrentUser() actor: AuthUser,
  ): Promise<PaginatedContacts> {
    return this.contactsService.list(query, actor);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(
    @Body(new ZodValidationPipe(createContactSchema)) input: CreateContactInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<ContactDto> {
    return this.contactsService.create(input, actor);
  }

  @Get('export')
  @Roles('ADMIN', 'MANAGER')
  async export(
    @Query(new ZodValidationPipe(contactQuerySchema)) query: ContactQuery,
    @CurrentUser() actor: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const contacts = await this.contactsService.exportCsv(query, actor);
    const csv = buildCsv(contacts);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.csv"`);
    return new StreamableFile(Buffer.from(csv, 'utf-8'));
  }

  @Post('bulk')
  @Roles('ADMIN', 'MANAGER')
  bulk(
    @Body(new ZodValidationPipe(bulkContactActionSchema)) input: BulkContactActionInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ affected: number }> {
    return this.contactsService.bulk(input, actor);
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  get(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<ContactDetailDto> {
    return this.contactsService.get(id, actor);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateContactSchema)) input: UpdateContactInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<ContactDto> {
    return this.contactsService.update(id, input, actor);
  }

  @Post(':id/archive')
  @Roles('ADMIN', 'MANAGER')
  archive(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<ContactDto> {
    return this.contactsService.archive(id, actor);
  }

  @Post(':id/restore')
  @Roles('ADMIN', 'MANAGER')
  restore(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<ContactDto> {
    return this.contactsService.restore(id, actor);
  }

  @Post(':id/tags')
  @Roles('ADMIN', 'MANAGER')
  addTags(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(idListSchema)) input: IdListInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<ContactDto> {
    return this.contactsService.addTags(id, input, actor);
  }

  @Post(':id/tags/remove')
  @Roles('ADMIN', 'MANAGER')
  removeTags(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(idListSchema)) input: IdListInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<ContactDto> {
    return this.contactsService.removeTags(id, input, actor);
  }

  @Post(':id/lists')
  @Roles('ADMIN', 'MANAGER')
  addLists(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(idListSchema)) input: IdListInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<ContactDto> {
    return this.contactsService.addToLists(id, input, actor);
  }

  @Post(':id/lists/remove')
  @Roles('ADMIN', 'MANAGER')
  removeLists(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(idListSchema)) input: IdListInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<ContactDto> {
    return this.contactsService.removeFromLists(id, input, actor);
  }

  @Post(':id/consent')
  @Roles('ADMIN', 'MANAGER')
  setConsent(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(consentMutationSchema)) input: ConsentMutationInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<ContactDto> {
    return this.contactsService.setConsent(id, input, actor);
  }

  @Post(':id/suppress')
  @Roles('ADMIN', 'MANAGER')
  suppress(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(suppressionMutationSchema)) input: SuppressionMutationInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<ContactDto> {
    return this.contactsService.suppress(id, input, actor);
  }

  @Post(':id/unsuppress')
  @Roles('ADMIN')
  unsuppress(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<ContactDto> {
    return this.contactsService.unsuppress(id, actor);
  }

  @Delete('bulk')
  @Roles('ADMIN', 'MANAGER')
  bulkDelete(
    @Body(new ZodValidationPipe(idListSchema)) input: IdListInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ affected: number }> {
    return this.contactsService.bulkDelete(input.ids, actor);
  }

  @Delete(':id')
  @Roles('ADMIN', 'MANAGER')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<{ affected: number }> {
    return this.contactsService.remove(id, actor);
  }
}
