import { Injectable } from '@nestjs/common';

import type { VerificationMailSender } from './verification-mail.sender.js';

@Injectable()
export class MemoryVerificationMailSender implements VerificationMailSender {
  async sendVerificationCode(): Promise<void> {
    // Intentionally does not deliver or log verification codes. This sender is
    // restricted by environment validation to NODE_ENV=test.
  }
}
