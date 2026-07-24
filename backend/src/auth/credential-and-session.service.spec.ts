import type { RedisService } from '../redis/redis.service.js';
import { RegistrationCredentialService } from './registration-credential.service.js';
import { SessionService } from './session.service.js';

class FakeRedis {
  readonly values = new Map<string, string>();
  readonly ttl = new Map<string, number>();

  async set(
    key: string,
    value: string,
    options?: { expirationSeconds?: number },
  ): Promise<void> {
    this.values.set(key, value);
    if (options?.expirationSeconds) {
      this.ttl.set(key, options.expirationSeconds);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async getDel(key: string): Promise<string | null> {
    const value = this.values.get(key) ?? null;
    this.values.delete(key);
    return value;
  }

  async del(key: string): Promise<void> {
    this.values.delete(key);
  }
}

describe('registration credential and session storage', () => {
  it('creates a one-time ten-minute registration credential', async () => {
    const redis = new FakeRedis();
    const service = new RegistrationCredentialService(
      redis as unknown as RedisService,
    );

    const token = await service.create('user@example.com');

    expect([...redis.values.keys()][0]).not.toContain(token);
    expect([...redis.ttl.values()][0]).toBe(600);
    await expect(service.consume(token)).resolves.toMatchObject({
      email: 'user@example.com',
    });
    await expect(service.consume(token)).resolves.toBeNull();
  });

  it('creates independent fixed 30-day server-side sessions', async () => {
    const redis = new FakeRedis();
    const service = new SessionService(redis as unknown as RedisService);

    const first = await service.create('user-id');
    const second = await service.create('user-id');

    expect(first).not.toBe(second);
    expect([...redis.values.keys()].every((key) => !key.includes(first))).toBe(
      true,
    );
    expect([...redis.ttl.values()]).toEqual([2_592_000, 2_592_000]);
    await service.delete(first);
    await expect(service.read(first)).resolves.toBeNull();
    await expect(service.read(second)).resolves.toMatchObject({
      userId: 'user-id',
    });
  });
});
