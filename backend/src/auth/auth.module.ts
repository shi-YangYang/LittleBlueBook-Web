import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import type { AppEnvironment } from '../config/environment.js';
import { DatabaseModule } from '../database/database.module.js';
import { MediaModule } from '../media/media.module.js';
import { AuthController } from './auth.controller.js';
import { MAIL_SENDER } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import { LittleBlueBookIdService } from './little-blue-book-id.service.js';
import { MemoryVerificationMailSender } from './mail/memory-verification-mail.sender.js';
import { SmtpVerificationMailSender } from './mail/smtp-verification-mail.sender.js';
import type { VerificationMailSender } from './mail/verification-mail.sender.js';
import { RegistrationCredentialService } from './registration-credential.service.js';
import { SessionModule } from './session.module.js';
import { VerificationCodeService } from './verification-code.service.js';
import { LegalWriteGuard } from './legal-write.guard.js';

@Module({
  imports: [DatabaseModule, MediaModule, SessionModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    LittleBlueBookIdService,
    VerificationCodeService,
    RegistrationCredentialService,
    {
      provide: APP_GUARD,
      useClass: LegalWriteGuard,
    },
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
