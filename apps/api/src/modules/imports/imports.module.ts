import { Module } from '@nestjs/common';

import { ContactsModule } from '../contacts/contacts.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { ImportsDao } from './imports.dao';
import { ImportsProcessor } from './imports.processor';
import { ImportsWorker } from './imports.worker';
import { ImportStorage } from './imports.storage';

@Module({
  imports: [ContactsModule],
  controllers: [ImportsController],
  providers: [ImportsService, ImportsDao, ImportsProcessor, ImportsWorker, ImportStorage],
  exports: [ImportsDao],
})
export class ImportsModule {}
