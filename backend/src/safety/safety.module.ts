import { Global, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { MediaModule } from '../media/media.module.js';
import { ModerationController, SafetyController } from './safety.controller.js';
import { SafetyService } from './safety.service.js';

@Global()
@Module({
  imports: [AuthModule, DatabaseModule, MediaModule],
  controllers: [SafetyController, ModerationController],
  providers: [SafetyService],
  exports: [SafetyService],
})
export class SafetyModule {}
