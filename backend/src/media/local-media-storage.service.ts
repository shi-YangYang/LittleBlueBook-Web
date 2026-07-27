import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppEnvironment } from '../config/environment.js';
import type {
  MediaStorage,
  StoredImage,
  ValidatedImage,
} from './media.types.js';

const OBJECT_KEY_PATTERN = /^[0-9a-f]{48}\.(?:jpg|png|webp)$/;

@Injectable()
export class LocalMediaStorageService implements MediaStorage {
  private readonly root: string;
  private readonly publicBaseUrl: string;

  constructor(
    @Inject(ConfigService) config: ConfigService<AppEnvironment, true>,
  ) {
    this.root = resolve(config.getOrThrow('MEDIA_ROOT'));
    this.publicBaseUrl = config
      .getOrThrow('MEDIA_PUBLIC_BASE_URL')
      .replace(/\/+$/, '');
  }

  async save(images: ValidatedImage[]): Promise<StoredImage[]> {
    await mkdir(this.root, { recursive: true });
    const saved: StoredImage[] = [];

    try {
      for (const image of images) {
        const objectKey = `${randomBytes(24).toString('hex')}.${image.extension}`;
        await writeFile(this.resolveObjectPath(objectKey), image.buffer, {
          flag: 'wx',
        });
        saved.push({
          objectKey,
          byteSize: image.byteSize,
          width: image.width,
          height: image.height,
          mimeType: image.mimeType,
        });
      }
      return saved;
    } catch (error) {
      await this.deleteMany(saved.map((image) => image.objectKey));
      throw error;
    }
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

  private assertValidObjectKey(objectKey: string): void {
    if (!OBJECT_KEY_PATTERN.test(objectKey)) {
      throw new Error('Invalid media object key');
    }
  }
}
