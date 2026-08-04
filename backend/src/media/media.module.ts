import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module.js';
import { ImageValidatorService } from './image-validator.service.js';
import { LocalMediaStorageService } from './local-media-storage.service.js';
import { MediaController } from './media.controller.js';
import { MEDIA_STORAGE } from './media.types.js';
import { Mp4ValidatorService } from './mp4-validator.service.js';
import { PendingMediaCleanupService } from './pending-media-cleanup.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [MediaController],
  providers: [
    ImageValidatorService,
    Mp4ValidatorService,
    LocalMediaStorageService,
    PendingMediaCleanupService,
    {
      provide: MEDIA_STORAGE,
      useExisting: LocalMediaStorageService,
    },
  ],
  exports: [ImageValidatorService, Mp4ValidatorService, MEDIA_STORAGE],
})
export class MediaModule {}
