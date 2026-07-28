import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import {
  NoteInteractionsController,
  UserInteractionsController,
} from './interactions.controller.js';
import { InteractionsService } from './interactions.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [NoteInteractionsController, UserInteractionsController],
  providers: [InteractionsService],
})
export class InteractionsModule {}
