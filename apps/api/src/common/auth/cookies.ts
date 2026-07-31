import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

export const ACCESS_TOKEN_COOKIE = 'wa_access';
export const REFRESH_TOKEN_COOKIE = 'wa_refresh';
export const REFRESH_COOKIE_PATH = '/api/auth';

export function parseTtlToSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match || !match[1] || !match[2]) {
    throw new Error(`Invalid TTL value: ${ttl}`);
  }
  const value = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      throw new Error(`Invalid TTL unit: ${unit}`);
  }
}

export function setAuthCookies(
  response: Response,
  configService: ConfigService,
  accessToken: string,
  refreshToken: string,
): void {
  const secure = configService.get<string>('NODE_ENV') === 'production';
  const accessMaxAge = parseTtlToSeconds(configService.getOrThrow<string>('ACCESS_TOKEN_TTL')) * 1000;
  const refreshMaxAge = configService.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS') * 24 * 60 * 60 * 1000;

  response.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: accessMaxAge,
  });
  response.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: refreshMaxAge,
  });
}

export function clearAuthCookies(response: Response): void {
  response.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
  response.clearCookie(REFRESH_TOKEN_COOKIE, { path: REFRESH_COOKIE_PATH });
}
