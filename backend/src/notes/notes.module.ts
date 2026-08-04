import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { ChannelsModule } from '../channels/channels.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { MediaModule } from '../media/media.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { NotesController } from './notes.controller.js';
import { NotesService } from './notes.service.js';
import { VideoPublishingService } from './video-publishing.service.js';
import { VideoUploadGuard } from './video-upload.guard.js';
import { VideoUploadReservationService } from './video-upload-reservation.service.js';

@Module({
  imports: [
    AuthModule,
    ChannelsModule,
    DatabaseModule,
    MediaModule,
    RedisModule,
  ],
  controllers: [NotesController],
  providers: [
    NotesService,
    VideoPublishingService,
    VideoUploadGuard,
    VideoUploadReservationService,
  ],
})
export class NotesModule {}
