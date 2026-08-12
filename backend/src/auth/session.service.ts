import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { RedisService } from '../redis/redis.service.js';
import { SESSION_TTL_SECONDS } from './auth.constants.js';
import type { StoredSession } from './auth.types.js';

@Injectable()
export class SessionService {
  constructor(@Inject(RedisService) private readonly redis: RedisService) {}

  async create(userId: string, authVersion = 1): Promise<string> {
    const sessionId = randomBytes(32).toString('base64url');
    const session: StoredSession = {
      userId,
      authVersion,
      createdAt: new Date().toISOString(),
    };
    await this.redis.set(this.key(sessionId), JSON.stringify(session), {
      expirationSeconds: SESSION_TTL_SECONDS,
    });
    return sessionId;
  }

  async read(sessionId: string): Promise<StoredSession | null> {
    const value = await this.redis.get(this.key(sessionId));
    if (!value) {
      return null;
    }

    try {
      const parsed = JSON.parse(value) as Partial<StoredSession>;
      if (
        typeof parsed.userId !== 'string' ||
        typeof parsed.createdAt !== 'string' ||
        (parsed.authVersion !== undefined &&
          typeof parsed.authVersion !== 'number')
      ) {
        return null;
      }
      return {
        userId: parsed.userId,
        authVersion: parsed.authVersion ?? 1,
        createdAt: parsed.createdAt,
      };
    } catch {
      return null;
    }
  }

  async delete(sessionId: string): Promise<void> {
    await this.redis.del(this.key(sessionId));
  }

  private key(sessionId: string): string {
    return `auth:session:${createHash('sha256').update(sessionId).digest('hex')}`;
  }
}
