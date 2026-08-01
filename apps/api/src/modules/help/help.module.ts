import { Module } from '@nestjs/common';

import { HelpAdminController } from './help-admin.controller';
import { HelpController } from './help.controller';
import { HelpDao } from './help.dao';
import { HelpService } from './help.service';

@Module({
  controllers: [HelpController, HelpAdminController],
  providers: [HelpDao, HelpService],
  exports: [HelpService],
})
export class HelpModule {}
