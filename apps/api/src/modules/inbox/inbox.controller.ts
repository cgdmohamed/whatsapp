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
  Sse,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { finalize, map } from 'rxjs';
import type { Observable } from 'rxjs';
import type { Response } from 'express';
import {
  assignConversationSchema,
  claimConversationSchema,
  conversationMessagesQuerySchema,
  conversationPriorityInputSchema,
  conversationQuerySchema,
  conversationStatusInputSchema,
  conversationTagsInputSchema,
  createInternalNoteSchema,
  createQuickReplySchema,
  quickReplyQuerySchema,
  replyInputSchema,
  updateInternalNoteSchema,
  updateQuickReplySchema,
  type AssignConversationInput,
  type ClaimConversationInput,
  type ConversationDetailDto,
  type ConversationMessagesQuery,
  type ConversationPriorityInput,
  type ConversationQuery,
  type ConversationStatusInput,
  type ConversationSummaryDto,
  type ConversationTagsInput,
  type CreateInternalNoteInput,
  type CreateQuickReplyInput,
  type InternalNoteDto,
  type MediaFileDto,
  type MessageDto,
  type PaginatedConversationMessages,
  type PaginatedConversations,
  type PaginatedQuickReplies,
  type QuickReplyDto,
  type QuickReplyQuery,
  type ReplyInput,
  type UpdateInternalNoteInput,
  type UpdateQuickReplyInput,
} from '@wa/shared';

import { CurrentUser, Public, Roles } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../auth/auth.types';
import { toMessageDto } from './inbox.mapper';
import { InboxService } from './inbox.service';
import { InboxSendService } from './inbox-send.service';
import { InboxMediaService, type IncomingUpload } from './inbox-media.service';
import { InboxRealtimeService } from './inbox.realtime.service';
import { InboxAccessService } from './inbox-access.service';

@ApiTags('inbox')
@ApiBearerAuth()
@Controller('inbox')
export class InboxController {
  constructor(
    private readonly inboxService: InboxService,
    private readonly sendService: InboxSendService,
    private readonly mediaService: InboxMediaService,
    private readonly realtime: InboxRealtimeService,
    private readonly accessService: InboxAccessService,
  ) {}

  @Sse('events')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  async events(@CurrentUser() actor: AuthUser): Promise<Observable<{ data: string }>> {
    const canViewUnassigned = await this.accessService.canViewUnassigned(actor.role);
    const subject = this.realtime.connect(actor.id, { userId: actor.id, role: actor.role, canViewUnassigned });
    return subject.pipe(
      map((event) => ({ data: JSON.stringify(event) })),
      finalize(() => this.realtime.disconnect(actor.id)),
    );
  }

  @Get('conversations')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  listConversations(
    @Query(new ZodValidationPipe(conversationQuerySchema)) query: ConversationQuery,
    @CurrentUser() actor: AuthUser,
  ): Promise<PaginatedConversations> {
    return this.inboxService.listConversations(query, actor);
  }

  @Get('conversations/:id')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  getConversation(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<ConversationDetailDto> {
    return this.inboxService.getDetail(id, actor);
  }

  @Get('conversations/:id/messages')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  getMessages(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(conversationMessagesQuerySchema)) query: ConversationMessagesQuery,
    @CurrentUser() actor: AuthUser,
  ): Promise<PaginatedConversationMessages> {
    return this.inboxService.getMessages(id, query, actor);
  }

  @Post('conversations/:id/assign')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  assign(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(assignConversationSchema)) input: AssignConversationInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<ConversationSummaryDto> {
    return this.inboxService.assign(id, input, actor);
  }

  @Post('conversations/:id/claim')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  claim(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(claimConversationSchema)) input: ClaimConversationInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<ConversationSummaryDto> {
    return this.inboxService.claim(id, input, actor);
  }

  @Patch('conversations/:id/status')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(conversationStatusInputSchema)) input: ConversationStatusInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<ConversationSummaryDto> {
    return this.inboxService.setStatus(id, input, actor);
  }

  @Patch('conversations/:id/priority')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  setPriority(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(conversationPriorityInputSchema)) input: ConversationPriorityInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<ConversationSummaryDto> {
    return this.inboxService.setPriority(id, input, actor);
  }

  @Post('conversations/:id/read')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  markRead(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<ConversationSummaryDto> {
    return this.inboxService.markRead(id, actor);
  }

  @Post('conversations/:id/unread')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  markUnread(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<ConversationSummaryDto> {
    return this.inboxService.markUnread(id, actor);
  }

  @Post('conversations/:id/close')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  close(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<ConversationSummaryDto> {
    return this.inboxService.close(id, actor);
  }

  @Post('conversations/:id/reopen')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  reopen(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<ConversationSummaryDto> {
    return this.inboxService.reopen(id, actor);
  }

  @Patch('conversations/:id/tags')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  updateTags(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(conversationTagsInputSchema)) input: ConversationTagsInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<ConversationDetailDto> {
    return this.inboxService.updateTags(id, input, actor);
  }

  @Post('conversations/:id/notes')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  createNote(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createInternalNoteSchema)) input: CreateInternalNoteInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<InternalNoteDto> {
    return this.inboxService.createNote(id, input, actor);
  }

  @Patch('conversations/:id/notes/:noteId')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  updateNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Body(new ZodValidationPipe(updateInternalNoteSchema)) input: UpdateInternalNoteInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<InternalNoteDto> {
    return this.inboxService.updateNote(id, noteId, input, actor);
  }

  @Delete('conversations/:id/notes/:noteId')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  deleteNote(
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ id: string }> {
    return this.inboxService.deleteNote(id, noteId, actor);
  }

  @Post('conversations/:id/replies')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  sendReply(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(replyInputSchema)) input: ReplyInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<MessageDto> {
    return this.sendService.sendReply(actor, id, input).then((row) => toMessageDto(row));
  }

  @Post('conversations/:id/media')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadMedia(
    @Param('id') id: string,
    @UploadedFile() file: IncomingUpload,
    @CurrentUser() actor: AuthUser,
  ): Promise<MediaFileDto> {
    return this.mediaService.upload(actor, id, file);
  }

  @Post('messages/:messageId/retry')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  retryMessage(@Param('messageId') messageId: string, @CurrentUser() actor: AuthUser): Promise<MessageDto> {
    return this.sendService.retryFailed(actor, messageId).then((row) => toMessageDto(row));
  }

  @Get('media/:id/stream')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  async streamMedia(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.mediaService.getForStream(actor, id);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Length', String(result.sizeBytes));
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(result.filename)}"`);
    return new StreamableFile(result.stream);
  }

  @Get('media/:id/signed-url')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  signedUrl(@Param('id') id: string): { url: string; expiresAt: string } {
    return this.mediaService.createSignedUrl(id);
  }

  @Get('stream')
  @Public()
  async streamMediaSigned(
    @Query('mediaFileId') mediaFileId: string,
    @Query('expires') expires: string,
    @Query('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.mediaService.getForSignedStream(mediaFileId, Number(expires), token);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Length', String(result.sizeBytes));
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(result.filename)}"`);
    return new StreamableFile(result.stream);
  }

  @Get('quick-replies')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  listQuickReplies(
    @Query(new ZodValidationPipe(quickReplyQuerySchema)) query: QuickReplyQuery,
    @CurrentUser() actor: AuthUser,
  ): Promise<PaginatedQuickReplies> {
    return this.inboxService.listQuickReplies(query, actor);
  }

  @Post('quick-replies')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  createQuickReply(
    @Body(new ZodValidationPipe(createQuickReplySchema)) input: CreateQuickReplyInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<QuickReplyDto> {
    return this.inboxService.createQuickReply(input, actor);
  }

  @Patch('quick-replies/:id')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  updateQuickReply(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateQuickReplySchema)) input: UpdateQuickReplyInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<QuickReplyDto> {
    return this.inboxService.updateQuickReply(id, input, actor);
  }

  @Post('quick-replies/:id/archive')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  archiveQuickReply(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<QuickReplyDto> {
    return this.inboxService.archiveQuickReply(id, actor);
  }

  @Get('assignable-users')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  assignableUsers(): Promise<Array<{ id: string; name: string; email: string; role: string }>> {
    return this.inboxService.assignableUsers();
  }
}
