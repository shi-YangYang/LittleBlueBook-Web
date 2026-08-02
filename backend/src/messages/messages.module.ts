import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { MediaModule } from '../media/media.module.js';
import { MessageRealtimeService } from './message-realtime.service.js';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';

@Module({
  imports: [AuthModule, DatabaseModule, MediaModule],
  controllers: [MessagesController],
  providers: [MessagesService, MessageRealtimeService],
})
export class MessagesModule {}
