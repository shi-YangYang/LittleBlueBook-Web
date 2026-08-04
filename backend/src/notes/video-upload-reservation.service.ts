import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';

import { ApiException } from '../common/api-exception.js';
import { RedisService } from '../redis/redis.service.js';

const RESERVATION_TTL_MS = 120_000;
const RESERVATION_RENEW_MS = 30_000;
const WINDOW_MS = 60 * 60_000;
const MAX_ATTEMPTS = 10;

const RESERVE_SCRIPT = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', tonumber(ARGV[1]) - tonumber(ARGV[2]))
if tonumber(redis.call('ZCARD', KEYS[1])) >= tonumber(ARGV[3]) then
  return -1
end
if not redis.call('SET', KEYS[2], ARGV[4], 'NX', 'PX', ARGV[5]) then
  return -2
end
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[4])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1
`;

const RENEW_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`;

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export type VideoUploadReservation = {
  userId: string;
  token: string;
};

@Injectable()
export class VideoUploadReservationService {
  constructor(@Inject(RedisService) private readonly redis: RedisService) {}

  async reserve(userId: string): Promise<VideoUploadReservation> {
    const token = randomUUID();
    const result = Number(
      await this.redis.eval(
        RESERVE_SCRIPT,
        [`video:upload:rate:${userId}`, `video:upload:active:${userId}`],
        [
          String(Date.now()),
          String(WINDOW_MS),
          String(MAX_ATTEMPTS),
          token,
          String(RESERVATION_TTL_MS),
        ],
      ),
    );
    if (result === -1) {
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        'VIDEO_UPLOAD_RATE_LIMITED',
        '视频上传过于频繁，请稍后再试',
      );
    }
    if (result !== 1) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'VIDEO_UPLOAD_IN_PROGRESS',
        '当前账号已有视频正在上传',
      );
    }
    return { userId, token };
  }

  startHeartbeat(reservation: VideoUploadReservation): () => void {
    const timer = setInterval(() => {
      void this.redis
        .eval(
          RENEW_SCRIPT,
          [`video:upload:active:${reservation.userId}`],
          [reservation.token, String(RESERVATION_TTL_MS)],
        )
        .catch(() => undefined);
    }, RESERVATION_RENEW_MS);
    timer.unref();
    return () => clearInterval(timer);
  }

  async release(reservation: VideoUploadReservation): Promise<void> {
    await this.redis
      .eval(
        RELEASE_SCRIPT,
        [`video:upload:active:${reservation.userId}`],
        [reservation.token],
      )
      .catch(() => undefined);
  }
}
