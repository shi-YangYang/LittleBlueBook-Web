import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { MediaModule } from '../media/media.module.js';
import { RedisModule } from '../redis/redis.module.js';
import {
  PublicUsersController,
  SearchController,
} from './search.controller.js';
import { SearchService } from './search.service.js';
import { SearchRateLimitService } from './search-rate-limit.service.js';

@Module({
  imports: [AuthModule, DatabaseModule, MediaModule, RedisModule],
  controllers: [SearchController, PublicUsersController],
  providers: [SearchService, SearchRateLimitService],
})
export class SearchModule {}
