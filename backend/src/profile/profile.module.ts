import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { ProfileController } from './profile.controller.js';
import { ProfileService } from './profile.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
