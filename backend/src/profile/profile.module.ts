import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { MediaModule } from '../media/media.module.js';
import { AvatarProcessorService } from './avatar-processor.service.js';
import { ProfileController } from './profile.controller.js';
import { ProfileService } from './profile.service.js';

@Module({
  imports: [AuthModule, DatabaseModule, MediaModule],
  controllers: [ProfileController],
  providers: [AvatarProcessorService, ProfileService],
})
export class ProfileModule {}
