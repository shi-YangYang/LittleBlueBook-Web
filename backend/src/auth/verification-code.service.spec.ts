import type { ConfigService } from '@nestjs/config';

import { ApiException } from '../common/api-exception.js';
import type { AppEnvironment } from '../config/environment.js';
import type { RedisService } from '../redis/redis.service.js';
import type { VerificationMailSender } from './mail/verification-mail.sender.js';
import { VerificationCodeService } from './verification-code.service.js';

class FakeRedis {
  readonly values = new Map<string, string>();
  readonly expirations = new Map<string, number>();
  readonly counters = new Map<string, number>();

  async set(
    key: string,
    value: string,
    options?: { expirationSeconds?: number },
  ): Promise<void> {
    this.values.set(key, value);
    if (options?.expirationSeconds) {
      this.expirations.set(key, options.expirationSeconds);
    }
  }

  async del(key: string): Promise<void> {
    this.values.delete(key);
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async eval(
    _script: string,
    keys: string[],
    args: string[],
  ): Promise<number | number[]> {
    if (args.length === 8) {
      const limits = args.slice(0, 4).map(Number);
      if (
        keys.some(
          (key, index) => (this.counters.get(key) ?? 0) >= (limits[index] ?? 0),
        )
      ) {
        return 0;
      }
      keys.forEach((key) =>
        this.counters.set(key, (this.counters.get(key) ?? 0) + 1),
      );
      return 1;
    }

    if (args.length === 0) {
      keys.forEach((key) => {
        const value = this.counters.get(key) ?? 0;
        if (value <= 1) {
          this.counters.delete(key);
        } else {
          this.counters.set(key, value - 1);
        }
      });
      return 1;
    }

    const key = keys[0]!;
    const raw = this.values.get(key);
    if (!raw) {
      return [-1, 0];
    }
    const record = JSON.parse(raw) as {
      hash: string;
      attempts: number;
      challengeId: string;
    };
    if (record.hash === args[0] && record.challengeId === args[2]) {
      this.values.delete(key);
      return [1, 0];
    }
    record.attempts += 1;
    if (record.attempts >= Number(args[1])) {
      this.values.delete(key);
      return [0, 0];
    }
    this.values.set(key, JSON.stringify(record));
    return [0, Number(args[1]) - record.attempts];
  }
}

function createService(options?: { mailFailure?: boolean }) {
  const redis = new FakeRedis();
  const sent: Array<{ email: string; code: string }> = [];
  const mailer: VerificationMailSender = {
    sendVerificationCode: jest.fn(async (email: string, code: string) => {
      if (options?.mailFailure) {
        throw new Error('SMTP unavailable');
      }
      sent.push({ email, code });
    }),
  };
  const config = {
    getOrThrow: jest.fn(() => 'test-only-secret-with-more-than-32-characters'),
  } as unknown as ConfigService<AppEnvironment, true>;

  return {
    service: new VerificationCodeService(
      config,
      redis as unknown as RedisService,
      mailer,
    ),
    redis,
    sent,
  };
}

describe('VerificationCodeService', () => {
  it('sends a six-digit code and stores only its HMAC record', async () => {
    const { service, redis, sent } = createService();

    await service.requestCode('user@example.com', '127.0.0.1');

    expect(sent).toHaveLength(1);
    expect(sent[0]?.code).toMatch(/^\d{6}$/);
    const stored = [...redis.values.values()][0];
    expect(stored).toBeDefined();
    expect(stored).not.toContain(sent[0]!.code);
    expect([...redis.expirations.values()]).toContain(600);
  });

  it('consumes a valid code so it cannot be reused', async () => {
    const { service, sent } = createService();
    await service.requestCode('user@example.com', '127.0.0.1');
    const code = sent[0]!.code;

    await expect(
      service.verifyCode('user@example.com', code),
    ).resolves.toMatchObject({
      challengeId: expect.any(String),
      termsVersion: expect.any(String),
      privacyVersion: expect.any(String),
    });
    await expect(
      service.verifyCode('user@example.com', code),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'VERIFICATION_CODE_EXPIRED',
      }),
    });
  });

  it('invalidates a challenge when an authoritative legal version changes', async () => {
    const { service, redis, sent } = createService();
    await service.requestCode('user@example.com', '127.0.0.1');
    const [key, raw] = [...redis.values.entries()][0]!;
    const stored = JSON.parse(raw) as Record<string, unknown>;
    stored.termsVersion = 'superseded-terms-version';
    redis.values.set(key, JSON.stringify(stored));

    await expect(
      service.verifyCode('user@example.com', sent[0]!.code),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'LEGAL_VERSION_CHANGED' }),
    });
    expect(redis.values.has(key)).toBe(false);
  });

  it('reports real remaining attempts and expires after five failures', async () => {
    const { service, sent } = createService();
    await service.requestCode('user@example.com', '127.0.0.1');
    const wrongCode = sent[0]!.code === '000000' ? '999999' : '000000';

    for (const remaining of [4, 3, 2, 1]) {
      await expect(
        service.verifyCode('user@example.com', wrongCode),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'VERIFICATION_CODE_INVALID',
          message: `验证码错误，还可尝试 ${remaining} 次`,
          details: { remainingAttempts: remaining },
        }),
      });
    }

    await expect(
      service.verifyCode('user@example.com', wrongCode),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'VERIFICATION_CODE_EXPIRED',
      }),
    });
  });

  it('removes the code and returns a sanitized error when SMTP fails', async () => {
    const { service, redis } = createService({ mailFailure: true });

    const error = await service
      .requestCode('user@example.com', '127.0.0.1')
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiException);
    expect((error as ApiException).getResponse()).toMatchObject({
      code: 'EMAIL_SEND_FAILED',
      message: '验证码发送失败，请稍后重试',
    });
    expect(redis.values.size).toBe(0);
  });

  it('treats a repeated request with an active code as a successful replay', async () => {
    const { service, sent } = createService();
    await service.requestCode('user@example.com', '127.0.0.1');

    await expect(
      service.requestCode('user@example.com', '127.0.0.1'),
    ).resolves.toBeUndefined();
    expect(sent).toHaveLength(1);
  });

  it('enforces the 60-second cooldown when no active code exists', async () => {
    const { service, redis } = createService();
    await service.requestCode('user@example.com', '127.0.0.1');
    redis.values.clear();

    await expect(
      service.requestCode('user@example.com', '127.0.0.1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'RATE_LIMITED' }),
    });
  });
});
