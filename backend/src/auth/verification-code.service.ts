import {
  createHash,
  createHmac,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApiException } from '../common/api-exception.js';
import type { AppEnvironment } from '../config/environment.js';
import { RedisService } from '../redis/redis.service.js';
import {
  MAIL_SENDER,
  VERIFICATION_CODE_MAX_ATTEMPTS,
  VERIFICATION_CODE_TTL_SECONDS,
} from './auth.constants.js';
import type { VerificationMailSender } from './mail/verification-mail.sender.js';

const RESERVE_RATE_LIMIT_SCRIPT = `
for index = 1, #KEYS do
  local current = tonumber(redis.call('GET', KEYS[index]) or '0')
  local limit = tonumber(ARGV[index])
  if current >= limit then
    return 0
  end
end

for index = 1, #KEYS do
  local current = redis.call('INCR', KEYS[index])
  if current == 1 then
    redis.call('EXPIRE', KEYS[index], tonumber(ARGV[#KEYS + index]))
  end
end
return 1
`;

const ROLLBACK_RATE_LIMIT_SCRIPT = `
for index = 1, #KEYS do
  local current = tonumber(redis.call('GET', KEYS[index]) or '0')
  if current <= 1 then
    redis.call('DEL', KEYS[index])
  else
    redis.call('DECR', KEYS[index])
  end
end
return 1
`;

const VERIFY_CODE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return {-1, 0}
end

local record = cjson.decode(raw)
if record.hash == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return {1, 0}
end

record.attempts = tonumber(record.attempts or 0) + 1
if record.attempts >= tonumber(ARGV[2]) then
  redis.call('DEL', KEYS[1])
  return {0, 0}
end

local ttl = redis.call('TTL', KEYS[1])
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ttl)
return {0, tonumber(ARGV[2]) - record.attempts}
`;

type StoredCode = {
  hash: string;
  attempts: number;
};

@Injectable()
export class VerificationCodeService {
  private readonly hashSecret: string;
  private readonly fixedTestCode: string | undefined;

  constructor(
    @Inject(ConfigService) config: ConfigService<AppEnvironment, true>,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(MAIL_SENDER) private readonly mailer: VerificationMailSender,
  ) {
    this.hashSecret = config.getOrThrow('AUTH_CODE_HASH_SECRET');
    this.fixedTestCode =
      config.getOrThrow('MAIL_TRANSPORT') === 'memory'
        ? config.getOrThrow('E2E_TEST_CODE')
        : undefined;
  }

  async requestCode(email: string, sourceIp: string): Promise<void> {
    const rateKeys = this.rateKeys(email, sourceIp);
    const reservation = await this.redis.eval(
      RESERVE_RATE_LIMIT_SCRIPT,
      rateKeys,
      ['1', '5', '10', '20', '60', '3600', '86400', '3600'],
    );

    if (Number(reservation) !== 1) {
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        'RATE_LIMITED',
        '操作过于频繁，请稍后再试',
      );
    }

    const code =
      this.fixedTestCode ?? randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeKey = this.codeKey(email);
    const record: StoredCode = {
      hash: this.hash(email, code),
      attempts: 0,
    };

    try {
      await this.redis.set(codeKey, JSON.stringify(record), {
        expirationSeconds: VERIFICATION_CODE_TTL_SECONDS,
      });
      await this.mailer.sendVerificationCode(email, code);
    } catch {
      await Promise.allSettled([
        this.redis.del(codeKey),
        this.redis.eval(ROLLBACK_RATE_LIMIT_SCRIPT, rateKeys, []),
      ]);
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'EMAIL_SEND_FAILED',
        '验证码发送失败，请稍后重试',
      );
    }
  }

  async verifyCode(email: string, code: string): Promise<void> {
    const result = await this.redis.eval(
      VERIFY_CODE_SCRIPT,
      [this.codeKey(email)],
      [this.hash(email, code), String(VERIFICATION_CODE_MAX_ATTEMPTS)],
    );
    const values = Array.isArray(result) ? result.map(Number) : [];
    const status = values[0];
    const remaining = values[1] ?? 0;

    if (status === 1) {
      return;
    }

    if (status === 0 && remaining > 0) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VERIFICATION_CODE_INVALID',
        `验证码错误，还可尝试 ${remaining} 次`,
        { remainingAttempts: remaining },
      );
    }

    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      'VERIFICATION_CODE_EXPIRED',
      '验证码已失效，请重新获取',
    );
  }

  private codeKey(email: string): string {
    return `auth:code:${this.digestIdentifier(email)}`;
  }

  private rateKeys(email: string, sourceIp: string): string[] {
    const emailKey = this.digestIdentifier(email);
    const ipKey = this.digestIdentifier(sourceIp);

    return [
      `auth:rate:email:cooldown:${emailKey}`,
      `auth:rate:email:hour:${emailKey}`,
      `auth:rate:email:day:${emailKey}`,
      `auth:rate:ip:hour:${ipKey}`,
    ];
  }

  private hash(email: string, code: string): string {
    return createHmac('sha256', this.hashSecret)
      .update(`${email}:${code}`)
      .digest('hex');
  }

  private digestIdentifier(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  // Kept here to make the intended constant-time comparison explicit for
  // non-Redis callers; Redis performs the atomic record comparison.
  static hashesEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }
}
