import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { queueOperationSchema, type QueueOperationInput, type QueueOperationResultDto, type SystemStatusDto } from '@wa/shared';

import { CurrentUser, Roles } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../auth/auth.types';
import { OperationsService } from './operations.service';

@ApiTags('operations')
@ApiBearerAuth()
@Controller('operations')
export class OperationsController {
  constructor(private readonly operationsService: OperationsService) {}

  @Get('status')
  @Roles('ADMIN')
  status(): Promise<SystemStatusDto> {
    return this.operationsService.status();
  }

  @Post('retry-failed')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  retryFailed(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(queueOperationSchema)) input: QueueOperationInput,
  ): Promise<QueueOperationResultDto> {
    return this.operationsService.retryFailed(user, input);
  }

  @Post('drain-failed')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  drainFailed(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(queueOperationSchema)) input: QueueOperationInput,
  ): Promise<QueueOperationResultDto> {
    return this.operationsService.drainFailed(user, input);
  }
}
