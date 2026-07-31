import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
  userQuerySchema,
  type CreateUserInput,
  type PaginatedUsers,
  type ResetPasswordInput,
  type UpdateUserInput,
  type UserDto,
  type UserQuery,
} from '@wa/shared';

import { CurrentUser, Roles } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../auth/auth.types';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('ADMIN', 'MANAGER')
  list(
    @Query(new ZodValidationPipe(userQuerySchema)) query: UserQuery,
    @CurrentUser() actor: AuthUser,
  ): Promise<PaginatedUsers> {
    return this.usersService.list(query, actor);
  }

  @Post()
  @Roles('ADMIN', 'MANAGER')
  create(
    @Body(new ZodValidationPipe(createUserSchema)) input: CreateUserInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<UserDto> {
    return this.usersService.create(input, actor);
  }

  @Get(':id')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  get(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<UserDto> {
    return this.usersService.get(id, actor);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER', 'AGENT')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) input: UpdateUserInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<UserDto> {
    return this.usersService.update(id, input, actor);
  }

  @Post(':id/suspend')
  @Roles('ADMIN')
  suspend(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<UserDto> {
    return this.usersService.suspend(id, actor);
  }

  @Post(':id/activate')
  @Roles('ADMIN')
  activate(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<UserDto> {
    return this.usersService.activate(id, actor);
  }

  @Post(':id/archive')
  @Roles('ADMIN')
  archive(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<UserDto> {
    return this.usersService.archive(id, actor);
  }

  @Post(':id/reset-password')
  @Roles('ADMIN')
  resetPassword(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resetPasswordSchema)) input: ResetPasswordInput,
    @CurrentUser() actor: AuthUser,
  ): Promise<UserDto> {
    return this.usersService.resetPassword(id, input.password, actor);
  }

  @Post(':id/revoke-sessions')
  @Roles('ADMIN')
  revokeSessions(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<void> {
    return this.usersService.revokeSessions(id, actor);
  }
}
