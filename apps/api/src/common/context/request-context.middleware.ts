import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

import { RequestContextService } from './request-context.service';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly contextService: RequestContextService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = this.extractRequestId(req);
    res.setHeader('X-Request-Id', requestId);
    const ipAddress = this.extractIp(req);
    const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '';

    this.contextService.run({ requestId, ipAddress, userAgent }, () => {
      next();
    });
  }

  private extractRequestId(req: Request): string {
    const header = req.headers['x-request-id'];
    if (typeof header === 'string' && header.length > 0 && header.length <= 128) {
      return header;
    }
    return randomUUID();
  }

  private extractIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0]?.trim() ?? '';
    }
    return req.ip ?? req.socket?.remoteAddress ?? '';
  }
}
