import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { ERROR_CODES } from '../errors';
import { RequestContextService } from '../context/request-context.service';

function isMulterFileTooLarge(exception: unknown): boolean {
  return (
    exception instanceof Error &&
    exception.name === 'MulterError' &&
    (exception as Error & { code?: string }).code === 'LIMIT_FILE_SIZE'
  );
}

interface ErrorResponseBody {
  message: string | string[];
  error?: string;
  statusCode?: number;
  details?: unknown;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly requestContext: RequestContextService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const context = this.requestContext.current;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = ERROR_CODES.INTERNAL;
    let details: unknown;

    if (isMulterFileTooLarge(exception)) {
      status = HttpStatus.PAYLOAD_TOO_LARGE;
      error = 'Payload Too Large';
      message = ERROR_CODES.PAYLOAD_TOO_LARGE;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const parsed = body as ErrorResponseBody;
        error = parsed.error ?? exception.name;
        message = parsed.message ?? exception.message;
        details = parsed.details;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const stack = exception instanceof Error ? (exception.stack ?? '') : '';
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        { error, message, stack, requestId: context.requestId, ipAddress: context.ipAddress },
      );
      message = ERROR_CODES.INTERNAL;
      details = undefined;
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      ...(details !== undefined ? { details } : {}),
      requestId: context.requestId,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
