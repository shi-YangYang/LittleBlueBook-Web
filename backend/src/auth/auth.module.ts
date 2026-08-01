import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppEnvironment } from '../config/environment.js';
import { DatabaseModule } from '../database/database.module.js';
import { MediaModule } from '../media/media.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { AuthController } from './auth.controller.js';
import { MAIL_SENDER } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import { LittleBlueBookIdService } from './little-blue-book-id.service.js';
import { MemoryVerificationMailSender } from './mail/memory-verification-mail.sender.js';
import { SmtpVerificationMailSender } from './mail/smtp-verification-mail.sender.js';
import type { VerificationMailSender } from './mail/verification-mail.sender.js';
import { RegistrationCredentialService } from './registration-credential.service.js';
import { SessionService } from './session.service.js';
import { VerificationCodeService } from './verification-code.service.js';

@Module({
  imports: [DatabaseModule, RedisModule, MediaModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    LittleBlueBookIdService,
    VerificationCodeService,
    RegistrationCredentialService,
    SessionService,
    {
      provide: MAIL_SENDER,
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<AppEnvironment, true>,
      ): VerificationMailSender =>
        config.getOrThrow('MAIL_TRANSPORT') === 'memory'
          ? new MemoryVerificationMailSender()
          : new SmtpVerificationMailSender(config),
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
