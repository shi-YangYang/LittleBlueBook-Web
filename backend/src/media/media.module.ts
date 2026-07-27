import { Module } from '@nestjs/common';

import { ImageValidatorService } from './image-validator.service.js';
import { LocalMediaStorageService } from './local-media-storage.service.js';
import { MediaController } from './media.controller.js';
import { MEDIA_STORAGE } from './media.types.js';

@Module({
  controllers: [MediaController],
  providers: [
    ImageValidatorService,
    LocalMediaStorageService,
    {
      provide: MEDIA_STORAGE,
      useExisting: LocalMediaStorageService,
    },
  ],
  exports: [ImageValidatorService, MEDIA_STORAGE],
})
export class MediaModule {}
