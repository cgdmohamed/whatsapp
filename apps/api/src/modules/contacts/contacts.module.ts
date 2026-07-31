import { Module } from '@nestjs/common';

import { ContactsController } from './contacts.controller';
import { TagsController } from './tags.controller';
import { ListsController } from './lists.controller';
import { ContactsService } from './contacts.service';
import { ContactsDao } from './contacts.dao';
import { TagsDao } from './tags.dao';
import { ContactListsDao } from './lists.dao';

@Module({
  controllers: [ContactsController, TagsController, ListsController],
  providers: [ContactsService, ContactsDao, TagsDao, ContactListsDao],
  exports: [ContactsDao, TagsDao, ContactListsDao],
})
export class ContactsModule {}
