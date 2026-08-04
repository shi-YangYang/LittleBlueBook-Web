import type { PrismaService } from '../database/prisma.service.js';
import type { MediaStorage } from './media.types.js';
import { PendingMediaCleanupService } from './pending-media-cleanup.service.js';

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
    } as unknown as PrismaService;
    const service = new PendingMediaCleanupService(storage, prisma);

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    service.onModuleDestroy();

    expect(storage.listPendingObjectKeys).toHaveBeenCalledTimes(1);
    expect(storage.completePendingObjects).not.toHaveBeenCalled();
  });
});
