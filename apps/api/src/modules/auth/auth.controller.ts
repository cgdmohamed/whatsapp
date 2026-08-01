import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordInputSchema,
  validateResetTokenSchema,
  type AuthResponse,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type LoginInput,
} from '@wa/shared';
import type { Request, Response } from 'express';

import { CurrentUser, Public, RateLimit } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  clearAuthCookies,
  REFRESH_TOKEN_COOKIE,
  setAuthCookies,
} from '../../common/auth/cookies';
import { toUserDto } from '../users/user.mapper';
import type { AuthUser } from './auth.types';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @RateLimit({ limit: 10, ttlSeconds: 60 })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) input: LoginInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.login(input.email, input.password);
    setAuthCookies(response, this.configService, result.accessToken, result.refreshToken);
    return { user: toUserDto(result.user) };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ success: true }> {
    const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
    await this.authService.logout(refreshToken);
    clearAuthCookies(response);
    return { success: true };
  }

  @Public()
  @RateLimit({ limit: 10, ttlSeconds: 300 })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) input: ForgotPasswordInput,
  ): Promise<{ message: string }> {
    return this.authService.forgotPassword(input.email);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('validate-reset-token')
  async validateResetToken(
    @Body(new ZodValidationPipe(validateResetTokenSchema)) input: { token: string },
  ): Promise<{ valid: boolean }> {
    return this.authService.validateResetToken(input.token);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordInputSchema)) input: { token: string; password: string },
  ): Promise<{ success: true }> {
    await this.authService.resetPassword(input.token, input.password);
    return { success: true };
  }

  @Public()
  @RateLimit({ limit: 30, ttlSeconds: 60 })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
    const result = await this.authService.refresh(refreshToken);
    setAuthCookies(response, this.configService, result.accessToken, result.refreshToken);
    return { user: toUserDto(result.user) };
  }

  @ApiBearerAuth()
  @Get('me')
  async me(@CurrentUser() user: AuthUser): Promise<AuthResponse> {
    return this.authService.me(user.id);
  }

  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  async changePassword(
    @Body(new ZodValidationPipe(changePasswordSchema)) input: ChangePasswordInput,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ success: true }> {
    await this.authService.changePassword(user.id, input.currentPassword, input.newPassword);
    clearAuthCookies(response);
    return { success: true };
  }

  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Post('revoke-sessions')
  async revokeSessions(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ success: true }> {
    await this.authService.revokeSessions(user.id);
    clearAuthCookies(response);
    return { success: true };
  }
}
