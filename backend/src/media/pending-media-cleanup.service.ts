import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../database/prisma.service.js';
import { MEDIA_STORAGE, type MediaStorage } from './media.types.js';

const CLEANUP_INTERVAL_MS = 15 * 60_000;
const CLEANUP_LEASE_MS = 60_000;
const CLEANUP_RETRY_BASE_MS = 60_000;
const CLEANUP_RETRY_MAX_MS = 15 * 60_000;
export const MEDIA_CLEANUP_MAX_ATTEMPTS = 5;

function retryDelay(attempt: number): number {
  return Math.min(
    CLEANUP_RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1),
    CLEANUP_RETRY_MAX_MS,
  );
}

@Injectable()
export class PendingMediaCleanupService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PendingMediaCleanupService.name);
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.retryPendingObjects();
    await this.retryQueuedObjects();
    this.cleanupTimer = setInterval(() => {
      void this.retryPendingObjects();
      void this.retryQueuedObjects();
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  async cleanupQueuedObjects(objectKeys: string[]): Promise<void> {
    for (const objectKey of [...new Set(objectKeys)]) {
      await this.tryQueuedObject(objectKey);
    }
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  private async retryPendingObjects(): Promise<void> {
    let objectKeys: string[];
    try {
      objectKeys = await this.storage.listPendingObjectKeys();
    } catch {
      this.logger.warn('Pending media cleanup journal could not be read');
      return;
    }

    for (const objectKey of objectKeys) {
      try {
        if (await this.isAssigned(objectKey)) {
          await this.storage.completePendingObjects([objectKey]);
        } else {
          await this.storage.deletePendingObjects([objectKey]);
        }
      } catch {
        this.logger.warn('One pending media cleanup will be retried later');
      }
    }
  }

  private async retryQueuedObjects(): Promise<void> {
    const records = await this.prisma.mediaCleanup
      .findMany({
        where: {
          nextAttemptAt: { lte: new Date() },
          status: { in: ['READY', 'CLEANING'] },
        },
        orderBy: { nextAttemptAt: 'asc' },
        take: 50,
        select: { objectKey: true },
      })
      .catch(() => []);
    for (const record of records) {
      await this.tryQueuedObject(record.objectKey);
    }
  }

  private async tryQueuedObject(objectKey: string): Promise<void> {
    const leaseToken = randomUUID();
    const claimed = await this.prisma.mediaCleanup
      .updateMany({
        where: {
          objectKey,
          nextAttemptAt: { lte: new Date() },
          status: { in: ['READY', 'CLEANING'] },
        },
        data: {
          status: 'CLEANING',
          leaseToken,
          nextAttemptAt: new Date(Date.now() + CLEANUP_LEASE_MS),
        },
      })
      .then((result) => result.count === 1)
      .catch(() => false);
    if (!claimed) return;

    let attempt = 1;
    try {
      const cleanup = await this.prisma.mediaCleanup.findUnique({
        where: { objectKey },
        select: { attempts: true },
      });
      if (!cleanup) return;
      attempt = cleanup.attempts + 1;
      if (await this.isAssigned(objectKey)) {
        await this.prisma.mediaCleanup.deleteMany({
          where: { objectKey, status: 'CLEANING', leaseToken },
        });
        return;
      }
      await this.storage.deleteStrict(objectKey);
      await this.prisma.mediaCleanup.deleteMany({
        where: { objectKey, status: 'CLEANING', leaseToken },
      });
    } catch {
      const exhausted = attempt >= MEDIA_CLEANUP_MAX_ATTEMPTS;
      await this.prisma.mediaCleanup
        .updateMany({
          where: { objectKey, status: 'CLEANING', leaseToken },
          data: {
            status: exhausted ? 'EXHAUSTED' : 'READY',
            leaseToken: null,
            attempts: { increment: 1 },
            lastErrorCode: 'MEDIA_DELETE_FAILED',
            nextAttemptAt: new Date(
              Date.now() + (exhausted ? 0 : retryDelay(attempt)),
            ),
          },
        })
        .catch(() => undefined);
      if (exhausted) {
        this.logger.error(
          `One queued media cleanup reached its retry limit (${attempt}/${MEDIA_CLEANUP_MAX_ATTEMPTS})`,
        );
      } else {
        this.logger.warn(
          `One queued media cleanup will be retried (${attempt}/${MEDIA_CLEANUP_MAX_ATTEMPTS})`,
        );
      }
    }
  }

  private async isAssigned(objectKey: string): Promise<boolean> {
    if (objectKey.endsWith('.mp4')) {
      return Boolean(
        await this.prisma.noteVideo.findUnique({
          where: { videoObjectKey: objectKey },
          select: { id: true },
        }),
      );
    }
    const [noteImage, videoCover, avatar] = await Promise.all([
      this.prisma.noteImage.findUnique({
        where: { objectKey },
        select: { id: true },
      }),
      this.prisma.noteVideo.findUnique({
        where: { coverObjectKey: objectKey },
        select: { id: true },
      }),
      this.prisma.user.findFirst({
        where: { avatarObjectKey: objectKey },
        select: { id: true },
      }),
    ]);
    return Boolean(noteImage || videoCover || avatar);
  }
}
