import { ApiException } from '../common/api-exception.js';
import type { RedisService } from '../redis/redis.service.js';
import { VideoUploadReservationService } from './video-upload-reservation.service.js';

describe('VideoUploadReservationService', () => {
  afterEach(() => jest.useRealTimers());

  it('maps rolling-window and active-upload conflicts without changing their semantics', async () => {
    const redis = { eval: jest.fn() };
    const service = new VideoUploadReservationService(
      redis as unknown as RedisService,
    );

    redis.eval.mockResolvedValueOnce(-1);
    await expect(service.reserve('user-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'VIDEO_UPLOAD_RATE_LIMITED' }),
    });
    redis.eval.mockResolvedValueOnce(-2);
    await expect(service.reserve('user-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'VIDEO_UPLOAD_IN_PROGRESS' }),
    });
    expect(redis.eval).toHaveBeenCalledTimes(2);
  });

  it('reserves with one-hour, ten-attempt and two-minute active-lock bounds', async () => {
    const redis = { eval: jest.fn(async () => 1) };
    const service = new VideoUploadReservationService(
      redis as unknown as RedisService,
    );

    const reservation = await service.reserve('bounded-user');
    expect(reservation).toEqual({
      userId: 'bounded-user',
      token: expect.any(String),
    });
    const [, keys, args] = redis.eval.mock.calls[0] as unknown as [
      string,
      string[],
      string[],
    ];
    expect(keys).toEqual([
      'video:upload:rate:bounded-user',
      'video:upload:active:bounded-user',
    ]);
    expect(args[1]).toBe(String(60 * 60_000));
    expect(args[2]).toBe('10');
    expect(args[3]).toBe(reservation.token);
    expect(args[4]).toBe(String(120_000));
  });

  it('renews only its token and treats release failure as TTL-backed cleanup', async () => {
    jest.useFakeTimers();
    const redis = { eval: jest.fn(async () => 1) };
    const service = new VideoUploadReservationService(
      redis as unknown as RedisService,
    );
    const reservation = await service.reserve('user-2');
    const stop = service.startHeartbeat(reservation);
    await jest.advanceTimersByTimeAsync(30_000);
    expect(redis.eval).toHaveBeenCalledTimes(2);
    stop();

    redis.eval.mockRejectedValueOnce(
      new ApiException(500, 'REDIS_DOWN', 'down'),
    );
    await expect(service.release(reservation)).resolves.toBeUndefined();
  });
});
