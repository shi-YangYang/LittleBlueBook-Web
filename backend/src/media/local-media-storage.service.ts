import { randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppEnvironment } from '../config/environment.js';
import type {
  MediaStorage,
  MediaObjectExtension,
  MediaObjectInfo,
  StoredImage,
  TemporaryMediaWriter,
  ValidatedImage,
} from './media.types.js';

const OBJECT_KEY_PATTERN = /^[0-9a-f]{48}\.(?:jpg|png|webp|mp4)$/;
const TEMPORARY_KEY_PATTERN = /^[0-9a-f]{48}\.upload$/;
const PENDING_MARKER_PATTERN =
  /^([0-9a-f]{48}\.(?:jpg|png|webp|mp4))\.pending$/;
const TEMPORARY_MAX_AGE_MS = 60 * 60_000;
const CLEANUP_INTERVAL_MS = 15 * 60_000;

@Injectable()
export class LocalMediaStorageService
  implements MediaStorage, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(LocalMediaStorageService.name);
  private readonly root: string;
  private readonly temporaryRoot: string;
  private readonly pendingCleanupRoot: string;
  private readonly publicBaseUrl: string;
  private readonly activeTemporaryKeys = new Set<string>();
  private readonly activePendingObjectKeys = new Set<string>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(ConfigService) config: ConfigService<AppEnvironment, true>,
  ) {
    this.root = resolve(config.getOrThrow('MEDIA_ROOT'));
    this.temporaryRoot = resolve(this.root, '.tmp');
    this.pendingCleanupRoot = resolve(this.root, '.cleanup');
    this.publicBaseUrl = config
      .getOrThrow('MEDIA_PUBLIC_BASE_URL')
      .replace(/\/+$/, '');
  }

  async onModuleInit(): Promise<void> {
    await this.cleanupExpiredTemporaryFiles().catch(() => {
      this.logger.warn(
        'Temporary media cleanup could not access its private directory',
      );
    });
    this.cleanupTimer = setInterval(() => {
      void this.cleanupExpiredTemporaryFiles().catch(() => {
        this.logger.warn('Temporary media cleanup failed safely');
      });
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  async save(images: ValidatedImage[]): Promise<StoredImage[]> {
    await mkdir(this.root, { recursive: true });
    const saved: StoredImage[] = [];

    try {
      for (const image of images) {
        const objectKey = this.createObjectKey(image.extension);
        saved.push(await this.saveAt(objectKey, image));
      }
      return saved;
    } catch (error) {
      await this.deleteMany(saved.map((image) => image.objectKey));
      throw error;
    }
  }

  createObjectKey(extension: MediaObjectExtension): string {
    return `${randomBytes(24).toString('hex')}.${extension}`;
  }

  async saveAt(objectKey: string, image: ValidatedImage): Promise<StoredImage> {
    this.assertValidObjectKey(objectKey);
    if (!objectKey.endsWith(`.${image.extension}`)) {
      throw new Error('Media object key extension mismatch');
    }
    await mkdir(this.root, { recursive: true });
    await writeFile(this.resolveObjectPath(objectKey), image.buffer, {
      flag: 'wx',
    });
    return {
      objectKey,
      byteSize: image.byteSize,
      width: image.width,
      height: image.height,
      mimeType: image.mimeType,
    };
  }

  async deleteMany(objectKeys: string[]): Promise<void> {
    await Promise.all(
      objectKeys.map(async (objectKey) => {
        try {
          await rm(this.resolveObjectPath(objectKey), { force: true });
        } catch {
          // Cleanup is best effort and must not expose filesystem details.
        }
      }),
    );
  }

  async deleteStrict(objectKey: string): Promise<void> {
    await rm(this.resolveObjectPath(objectKey), { force: true });
  }

  async read(objectKey: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolveObjectPath(objectKey));
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return null;
      }
      throw error;
    }
  }

  async createTemporaryVideo(): Promise<TemporaryMediaWriter> {
    await mkdir(this.temporaryRoot, { recursive: true });
    const temporaryKey = `${randomBytes(24).toString('hex')}.upload`;
    const path = this.resolveTemporaryPath(temporaryKey);
    this.activeTemporaryKeys.add(temporaryKey);
    const stream = createWriteStream(path, { flags: 'wx' });
    stream.once('error', () => this.activeTemporaryKeys.delete(temporaryKey));
    return { temporaryKey, stream };
  }

  markTemporaryComplete(temporaryKey: string): void {
    this.assertValidTemporaryKey(temporaryKey);
    this.activeTemporaryKeys.delete(temporaryKey);
  }

  async withTemporaryFile<T>(
    temporaryKey: string,
    operation: (filePath: string) => Promise<T>,
  ): Promise<T> {
    return operation(this.resolveTemporaryPath(temporaryKey));
  }

  async finalizeTemporaryVideo(
    temporaryKey: string,
    objectKey: string,
  ): Promise<string> {
    this.assertValidObjectKey(objectKey);
    if (!objectKey.endsWith('.mp4')) {
      throw new Error('Finalized video object key extension mismatch');
    }
    await mkdir(this.root, { recursive: true });
    await rename(
      this.resolveTemporaryPath(temporaryKey),
      this.resolveObjectPath(objectKey),
    );
    this.activeTemporaryKeys.delete(temporaryKey);
    return objectKey;
  }

  async deleteTemporary(temporaryKey: string): Promise<void> {
    await rm(this.resolveTemporaryPath(temporaryKey), { force: true });
    this.activeTemporaryKeys.delete(temporaryKey);
  }

  async preparePendingObject(objectKey: string): Promise<void> {
    this.assertValidObjectKey(objectKey);
    await mkdir(this.pendingCleanupRoot, { recursive: true });
    await writeFile(this.resolvePendingMarkerPath(objectKey), objectKey, {
      encoding: 'utf8',
      flag: 'wx',
    });
    this.activePendingObjectKeys.add(objectKey);
  }

  async completePendingObjects(objectKeys: string[]): Promise<void> {
    await Promise.all(
      objectKeys.map(async (objectKey) => {
        this.assertValidObjectKey(objectKey);
        try {
          await rm(this.resolvePendingMarkerPath(objectKey), { force: true });
        } finally {
          this.activePendingObjectKeys.delete(objectKey);
        }
      }),
    );
  }

  async deletePendingObjects(objectKeys: string[]): Promise<void> {
    const results = await Promise.allSettled(
      objectKeys.map(async (objectKey) => {
        this.assertValidObjectKey(objectKey);
        try {
          await rm(this.resolveObjectPath(objectKey), { force: true });
          await rm(this.resolvePendingMarkerPath(objectKey), { force: true });
        } finally {
          this.activePendingObjectKeys.delete(objectKey);
        }
      }),
    );
    if (results.some((result) => result.status === 'rejected')) {
      throw new Error('One pending media object could not be cleaned');
    }
  }

  async listPendingObjectKeys(): Promise<string[]> {
    await mkdir(this.pendingCleanupRoot, { recursive: true });
    const entries = await readdir(this.pendingCleanupRoot, {
      withFileTypes: true,
    });
    return entries.flatMap((entry) => {
      if (!entry.isFile()) return [];
      const match = PENDING_MARKER_PATTERN.exec(entry.name);
      const objectKey = match?.[1];
      return objectKey && !this.activePendingObjectKeys.has(objectKey)
        ? [objectKey]
        : [];
    });
  }

  async info(objectKey: string): Promise<MediaObjectInfo | null> {
    try {
      const value = await stat(this.resolveObjectPath(objectKey));
      if (!value.isFile()) return null;
      return {
        byteSize: value.size,
        mimeType: objectKey.endsWith('.mp4')
          ? 'video/mp4'
          : objectKey.endsWith('.jpg')
            ? 'image/jpeg'
            : objectKey.endsWith('.png')
              ? 'image/png'
              : 'image/webp',
      };
    } catch (error) {
      if (this.isMissing(error)) return null;
      throw error;
    }
  }

  createReadStream(objectKey: string, range?: { start: number; end: number }) {
    const path = this.resolveObjectPath(objectKey);
    return createReadStream(path, range);
  }

  publicUrl(objectKey: string): string {
    this.assertValidObjectKey(objectKey);
    return `${this.publicBaseUrl}/${objectKey}`;
  }

  private resolveObjectPath(objectKey: string): string {
    this.assertValidObjectKey(objectKey);
    const resolved = resolve(this.root, objectKey);
    if (dirname(resolved) !== this.root) {
      throw new Error('Invalid media object key');
    }
    return resolved;
  }

  private resolveTemporaryPath(temporaryKey: string): string {
    this.assertValidTemporaryKey(temporaryKey);
    const resolved = resolve(this.temporaryRoot, temporaryKey);
    if (dirname(resolved) !== this.temporaryRoot) {
      throw new Error('Invalid temporary media key');
    }
    return resolved;
  }

  private resolvePendingMarkerPath(objectKey: string): string {
    this.assertValidObjectKey(objectKey);
    const resolved = resolve(this.pendingCleanupRoot, `${objectKey}.pending`);
    if (dirname(resolved) !== this.pendingCleanupRoot) {
      throw new Error('Invalid pending media key');
    }
    return resolved;
  }

  private assertValidObjectKey(objectKey: string): void {
    if (!OBJECT_KEY_PATTERN.test(objectKey)) {
      throw new Error('Invalid media object key');
    }
  }

  private assertValidTemporaryKey(temporaryKey: string): void {
    if (!TEMPORARY_KEY_PATTERN.test(temporaryKey)) {
      throw new Error('Invalid temporary media key');
    }
  }

  private isMissing(error: unknown): boolean {
    return Boolean(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT',
    );
  }

  private async cleanupExpiredTemporaryFiles(): Promise<void> {
    await mkdir(this.temporaryRoot, { recursive: true });
    const cutoff = Date.now() - TEMPORARY_MAX_AGE_MS;
    let entries;
    try {
      entries = await readdir(this.temporaryRoot, { withFileTypes: true });
    } catch {
      this.logger.warn(
        'Temporary media cleanup could not enumerate its private directory',
      );
      return;
    }
    for (const entry of entries) {
      if (
        !entry.isFile() ||
        !TEMPORARY_KEY_PATTERN.test(entry.name) ||
        this.activeTemporaryKeys.has(entry.name)
      ) {
        continue;
      }
      try {
        const value = await stat(this.resolveTemporaryPath(entry.name));
        if (value.mtimeMs <= cutoff) {
          await rm(this.resolveTemporaryPath(entry.name), { force: true });
        }
      } catch {
        this.logger.warn(
          'One expired temporary media object could not be cleaned',
        );
      }
    }
  }
}
