import type { PrismaService } from '../database/prisma.service.js';
import type { MediaStorage } from './media.types.js';
import {
  MEDIA_CLEANUP_MAX_ATTEMPTS,
  PendingMediaCleanupService,
} from './pending-media-cleanup.service.js';

describe('PendingMediaCleanupService', () => {
  const videoKey = `${'a'.repeat(48)}.mp4`;
  const assignedCoverKey = `${'b'.repeat(48)}.webp`;

  it('recovers unassigned final objects and clears journals for assigned media', async () => {
    const storage = {
      listPendingObjectKeys: jest.fn(async () => [videoKey, assignedCoverKey]),
      deletePendingObjects: jest.fn(async () => undefined),
      completePendingObjects: jest.fn(async () => undefined),
    } as unknown as MediaStorage;
    const prisma = {
      noteVideo: {
        findUnique: jest.fn(async ({ where }: { where: object }) =>
          'coverObjectKey' in where ? { id: 'assigned-video' } : null,
        ),
      },
      noteImage: { findUnique: jest.fn(async () => null) },
      user: { findFirst: jest.fn(async () => null) },
      mediaCleanup: { findMany: jest.fn(async () => []) },
    } as unknown as PrismaService;
    const service = new PendingMediaCleanupService(storage, prisma);

    await service.onModuleInit();
    service.onModuleDestroy();

    expect(storage.deletePendingObjects).toHaveBeenCalledWith([videoKey]);
    expect(storage.completePendingObjects).toHaveBeenCalledWith([
      assignedCoverKey,
    ]);
  });

  it('leaves a journal available for the next retry when cleanup fails', async () => {
    const storage = {
      listPendingObjectKeys: jest.fn(async () => [videoKey]),
      deletePendingObjects: jest.fn(async () => {
        throw new Error('simulated storage failure');
      }),
      completePendingObjects: jest.fn(async () => undefined),
    } as unknown as MediaStorage;
    const prisma = {
      noteVideo: { findUnique: jest.fn(async () => null) },
      mediaCleanup: { findMany: jest.fn(async () => []) },
    } as unknown as PrismaService;
    const service = new PendingMediaCleanupService(storage, prisma);

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    service.onModuleDestroy();

    expect(storage.listPendingObjectKeys).toHaveBeenCalledTimes(1);
    expect(storage.completePendingObjects).not.toHaveBeenCalled();
  });

  it('persists a failed queued deletion and succeeds on a later retry', async () => {
    const objectKey = `${'c'.repeat(48)}.webp`;
    const storage = {
      deleteStrict: jest
        .fn()
        .mockRejectedValueOnce(new Error('storage offline'))
        .mockResolvedValueOnce(undefined),
    } as unknown as MediaStorage;
    const mediaCleanup = {
      updateMany: jest
        .fn()
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 }),
      findUnique: jest
        .fn()
        .mockResolvedValueOnce({
          attempts: 0,
        })
        .mockResolvedValueOnce({
          attempts: 1,
        }),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    };
    const prisma = {
      mediaCleanup,
      noteImage: { findUnique: jest.fn(async () => null) },
      noteVideo: { findUnique: jest.fn(async () => null) },
      user: { findFirst: jest.fn(async () => null) },
    } as unknown as PrismaService;
    const service = new PendingMediaCleanupService(storage, prisma);

    await service.cleanupQueuedObjects([objectKey]);
    expect(mediaCleanup.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'READY',
          attempts: { increment: 1 },
          lastErrorCode: 'MEDIA_DELETE_FAILED',
        }),
      }),
    );
    expect(mediaCleanup.deleteMany).not.toHaveBeenCalled();

    await service.cleanupQueuedObjects([objectKey]);
    expect((storage.deleteStrict as jest.Mock).mock.calls).toEqual([
      [objectKey],
      [objectKey],
    ]);
    expect(mediaCleanup.deleteMany).toHaveBeenCalledWith({
      where: {
        objectKey,
        status: 'CLEANING',
        leaseToken: expect.any(String),
      },
    });
  });

  it('drops a stale cleanup journal without deleting media that became assigned', async () => {
    const objectKey = `${'d'.repeat(48)}.png`;
    const storage = {
      deleteStrict: jest.fn(async () => undefined),
    } as unknown as MediaStorage;
    const mediaCleanup = {
      updateMany: jest.fn(async () => ({ count: 1 })),
      findUnique: jest.fn(async () => ({
        attempts: 0,
      })),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    };
    const prisma = {
      mediaCleanup,
      noteImage: {
        findUnique: jest.fn(async () => ({ id: 'assigned-image' })),
      },
      noteVideo: { findUnique: jest.fn(async () => null) },
      user: { findFirst: jest.fn(async () => null) },
    } as unknown as PrismaService;
    const service = new PendingMediaCleanupService(storage, prisma);

    await service.cleanupQueuedObjects([objectKey]);

    expect(storage.deleteStrict).not.toHaveBeenCalled();
    expect(mediaCleanup.deleteMany).toHaveBeenCalledWith({
      where: {
        objectKey,
        status: 'CLEANING',
        leaseToken: expect.any(String),
      },
    });
  });

  it('moves a repeatedly failing cleanup to an auditable terminal state', async () => {
    const objectKey = `${'e'.repeat(48)}.webp`;
    const storage = {
      deleteStrict: jest.fn(async () => {
        throw new Error('storage remains offline');
      }),
    } as unknown as MediaStorage;
    const mediaCleanup = {
      updateMany: jest
        .fn()
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 }),
      findUnique: jest.fn(async () => ({
        attempts: MEDIA_CLEANUP_MAX_ATTEMPTS - 1,
      })),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    };
    const prisma = {
      mediaCleanup,
      noteImage: { findUnique: jest.fn(async () => null) },
      noteVideo: { findUnique: jest.fn(async () => null) },
      user: { findFirst: jest.fn(async () => null) },
    } as unknown as PrismaService;
    const service = new PendingMediaCleanupService(storage, prisma);

    await service.cleanupQueuedObjects([objectKey]);

    expect(mediaCleanup.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          objectKey,
          status: 'CLEANING',
          leaseToken: expect.any(String),
        }),
        data: expect.objectContaining({
          status: 'EXHAUSTED',
          leaseToken: null,
          attempts: { increment: 1 },
          lastErrorCode: 'MEDIA_DELETE_FAILED',
        }),
      }),
    );

    await service.cleanupQueuedObjects([objectKey]);
    expect(storage.deleteStrict).toHaveBeenCalledTimes(1);
  });

  it('does not select terminal cleanup records again after restart', async () => {
    const storage = {
      listPendingObjectKeys: jest.fn(async () => []),
    } as unknown as MediaStorage;
    const mediaCleanup = {
      findMany: jest.fn(async () => []),
    };
    const prisma = { mediaCleanup } as unknown as PrismaService;
    const service = new PendingMediaCleanupService(storage, prisma);

    await service.onModuleInit();
    service.onModuleDestroy();

    expect(mediaCleanup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['READY', 'CLEANING'] },
        }),
      }),
    );
  });
});
