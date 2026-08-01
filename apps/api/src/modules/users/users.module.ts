import { Module } from '@nestjs/common';

import { MailModule } from '../mail/mail.module';
import { PasswordResetDao } from '../auth/password-reset.dao';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersDao } from './users.dao';

@Module({
  imports: [MailModule],
  controllers: [UsersController],
  providers: [UsersService, UsersDao, PasswordResetDao],
  exports: [UsersDao],
})
export class UsersModule {}
