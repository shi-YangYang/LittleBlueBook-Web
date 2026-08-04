import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';
import { MEDIA_STORAGE, type MediaStorage } from './media.types.js';

const CLEANUP_INTERVAL_MS = 15 * 60_000;

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
    this.cleanupTimer = setInterval(() => {
      void this.retryPendingObjects();
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
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
