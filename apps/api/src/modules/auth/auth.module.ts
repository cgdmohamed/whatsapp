import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';
import { LoginThrottleService } from '../../common/throttling/login-throttle.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequestContextModule } from '../../common/context/request-context.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule, RequestContextModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, TokensService, LoginThrottleService, JwtAuthGuard, RolesGuard, { provide: APP_GUARD, useExisting: JwtAuthGuard }, { provide: APP_GUARD, useExisting: RolesGuard }],
  exports: [TokensService],
})
export class AuthModule {}
