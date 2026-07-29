import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module.js';
import { ChannelsModule } from './channels/channels.module.js';
import { validateEnvironment } from './config/environment.js';
import { HealthModule } from './health/health.module.js';
import { InteractionsModule } from './interactions/interactions.module.js';
import { MediaModule } from './media/media.module.js';
import { NotesModule } from './notes/notes.module.js';
import { ProfileModule } from './profile/profile.module.js';
import { SearchModule } from './search/search.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    AuthModule,
    ChannelsModule,
    HealthModule,
    InteractionsModule,
    MediaModule,
    NotesModule,
    ProfileModule,
    SearchModule,
  ],
})
export class AppModule {}
