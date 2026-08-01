import { Module } from '@nestjs/common';

import { ContactsModule } from '../contacts/contacts.module';
import { UsersModule } from '../users/users.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { CampaignRecipientsDao } from '../campaigns/campaign-recipients.dao';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';
import { InboxAccessService } from './inbox-access.service';
import { InboxRealtimeService } from './inbox.realtime.service';
import { InboxInboundService } from './inbox-inbound.service';
import { InboxStatusService } from './inbox-status.service';
import { InboxSendService } from './inbox-send.service';
import { InboxMediaService } from './inbox-media.service';
import { InboxMediaStorage } from './inbox.media.storage';
import { ConversationsDao } from './conversations.dao';
import { AssignmentsDao } from './assignments.dao';
import { InternalNotesDao } from './internal-notes.dao';
import { QuickRepliesDao } from './quick-replies.dao';
import { MessagesDao } from './messages.dao';
import { MediaFilesDao } from './media-files.dao';
import { InboxWorker, InboxSendWorker, InboxMediaWorker } from './inbox.workers';

@Module({
  imports: [ContactsModule, UsersModule, WhatsAppModule],
  controllers: [InboxController],
  providers: [
    ConversationsDao,
    AssignmentsDao,
    InternalNotesDao,
    QuickRepliesDao,
    MessagesDao,
    MediaFilesDao,
    CampaignRecipientsDao,
    InboxAccessService,
    InboxRealtimeService,
    InboxMediaStorage,
    InboxMediaService,
    InboxInboundService,
    InboxStatusService,
    InboxSendService,
    InboxService,
    InboxWorker,
    InboxSendWorker,
    InboxMediaWorker,
  ],
  exports: [InboxService, InboxSendService, InboxMediaService, InboxAccessService, MessagesDao],
})
export class InboxModule {}
