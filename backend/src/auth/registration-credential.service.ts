import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { RedisService } from '../redis/redis.service.js';
import { REGISTRATION_TTL_SECONDS } from './auth.constants.js';
import type { StoredRegistration } from './auth.types.js';
import type { LegalChallenge } from './auth.types.js';

@Injectable()
export class RegistrationCredentialService {
  constructor(@Inject(RedisService) private readonly redis: RedisService) {}

  async create(email: string, challenge: LegalChallenge): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const record: StoredRegistration = {
      email,
      createdAt: new Date().toISOString(),
      ...challenge,
    };
    await this.redis.set(this.key(token), JSON.stringify(record), {
      expirationSeconds: REGISTRATION_TTL_SECONDS,
    });
    return token;
  }

  async read(token: string): Promise<StoredRegistration | null> {
    const value = await this.redis.get(this.key(token));
    return this.parse(value);
  }

  async consume(token: string): Promise<StoredRegistration | null> {
    const value = await this.redis.getDel(this.key(token));
    return this.parse(value);
  }

  async delete(token: string): Promise<void> {
    await this.redis.del(this.key(token));
  }

  private key(token: string): string {
    return `auth:registration:${createHash('sha256').update(token).digest('hex')}`;
  }

  private parse(value: string | null): StoredRegistration | null {
    if (!value) {
      return null;
    }

    try {
      const parsed = JSON.parse(value) as Partial<StoredRegistration>;
      if (
        typeof parsed.email !== 'string' ||
        typeof parsed.createdAt !== 'string' ||
        typeof parsed.challengeId !== 'string' ||
        typeof parsed.termsVersion !== 'string' ||
        typeof parsed.privacyVersion !== 'string'
      ) {
        return null;
      }
      return {
        email: parsed.email,
        createdAt: parsed.createdAt,
        challengeId: parsed.challengeId,
        termsVersion: parsed.termsVersion,
        privacyVersion: parsed.privacyVersion,
      };
    } catch {
      return null;
    }
  }
}
