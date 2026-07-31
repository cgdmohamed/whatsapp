import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES } from '../errors';
import { IS_PUBLIC_KEY } from '../decorators';
import { RequestContextService } from '../context/request-context.service';
import { UsersDao } from '../../modules/users/users.dao';

export interface AccessTokenPayload {
  sub: string;
  role: string;
  name: string;
  lang: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly requestContext: RequestContextService,
    private readonly reflector: Reflector,
    private readonly usersDao: UsersDao,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: unknown }>();
    const token = this.extractAccessToken(request as { cookies?: Record<string, string> });
    if (!token) {
      throw new UnauthorizedException(ERROR_CODES.AUTH_REQUIRED);
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.configService.getOrThrow<string>('ACCESS_TOKEN_SECRET'),
      });
    } catch {
      throw new UnauthorizedException(ERROR_CODES.INVALID_TOKEN);
    }

    const user = await this.usersDao.findById(payload.sub);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException(ERROR_CODES.INVALID_TOKEN);
    }

    (request as { user?: unknown }).user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      preferredLanguage: user.preferredLanguage,
    };
    this.requestContext.setActor(user.id, user.role);
    return true;
  }

  private extractAccessToken(request: { cookies?: Record<string, string> }): string | undefined {
    return request.cookies?.['wa_access'];
  }
}
