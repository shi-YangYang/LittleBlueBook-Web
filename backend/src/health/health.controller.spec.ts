import { ServiceUnavailableException } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service.js';
import type { RedisService } from '../redis/redis.service.js';
import { HealthController } from './health.controller.js';

function createController(options?: {
  databaseFailure?: Error;
  redisFailure?: Error;
}) {
  const prisma = {
    ping: options?.databaseFailure
      ? jest.fn().mockRejectedValue(options.databaseFailure)
      : jest.fn().mockResolvedValue(undefined),
  };
  const redis = {
    ping: options?.redisFailure
      ? jest.fn().mockRejectedValue(options.redisFailure)
      : jest.fn().mockResolvedValue(undefined),
  };

  return {
    controller: new HealthController(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
    ),
    prisma,
    redis,
  };
}

describe('HealthController', () => {
  it('returns liveness without checking dependencies', () => {
    const { controller, prisma, redis } = createController();

    expect(controller.live()).toEqual({
      status: 'ok',
      service: 'backend',
    });
    expect(prisma.ping).not.toHaveBeenCalled();
    expect(redis.ping).not.toHaveBeenCalled();
  });

  it('returns readiness when both dependencies are available', async () => {
    const { controller } = createController();

    await expect(controller.ready()).resolves.toEqual({
      status: 'ok',
      service: 'backend',
    });
  });

  it.each([
    { dependency: 'PostgreSQL', databaseFailure: new Error('unavailable') },
    { dependency: 'Redis', redisFailure: new Error('unavailable') },
  ])(
    'returns a sanitized 503 when $dependency is unavailable',
    async ({ databaseFailure, redisFailure }) => {
      const { controller } = createController({
        ...(databaseFailure ? { databaseFailure } : {}),
        ...(redisFailure ? { redisFailure } : {}),
      });

      const error: unknown = await controller.ready().catch((reason) => reason);

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getResponse()).toEqual({
        status: 'error',
        service: 'backend',
      });
    },
  );
});
