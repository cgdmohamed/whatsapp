import { Module } from '@nestjs/common';

import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersDao } from './users.dao';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersDao],
  exports: [UsersDao],
})
export class UsersModule {}
