import { access, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ConfigService } from '@nestjs/config';

import type { AppEnvironment } from '../config/environment.js';
import { LocalMediaStorageService } from './local-media-storage.service.js';

describe('LocalMediaStorageService video lifecycle', () => {
  const taskRoot = resolve(
    process.cwd(),
    '..',
    'test',
    'spec-013-storage-unit',
  );
  const mediaRoot = resolve(taskRoot, 'media');
  const temporaryRoot = resolve(mediaRoot, '.tmp');
  const writeFailureMarker = resolve(taskRoot, 'media-write-failure.marker');
  let service: LocalMediaStorageService;

  beforeEach(async () => {
    await mkdir(temporaryRoot, { recursive: true });
    const config = {
      getOrThrow: (key: keyof AppEnvironment) =>
        key === 'MEDIA_ROOT' ? mediaRoot : 'http://127.0.0.1:3001/api/v1/media',
      get: (key: keyof AppEnvironment) =>
        key === 'E2E_MEDIA_FAILURE_MARKER' ? writeFailureMarker : undefined,
    } as ConfigService<AppEnvironment, true>;
    service = new LocalMediaStorageService(config);
  });

  afterEach(() => service.onModuleDestroy());

  afterAll(async () => {
    const repositoryTestRoot = resolve(process.cwd(), '..', 'test');
    if (
      taskRoot.startsWith(`${repositoryTestRoot}\\`) ||
      taskRoot.startsWith(`${repositoryTestRoot}/`)
    ) {
      await rm(taskRoot, { recursive: true, force: true });
    }
  });

  it('removes stale unowned uploads while protecting an active writer', async () => {
    const staleKey = `${'1'.repeat(48)}.upload`;
    const stalePath = resolve(temporaryRoot, staleKey);
    await writeFile(stalePath, 'stale');
    const old = new Date(Date.now() - 2 * 60 * 60_000);
    await utimes(stalePath, old, old);

    await service.onModuleInit();
    await expect(access(stalePath)).rejects.toMatchObject({ code: 'ENOENT' });

    const active = await service.createTemporaryVideo();
    await new Promise<void>((resolveWrite, rejectWrite) => {
      active.stream.once('finish', resolveWrite);
      active.stream.once('error', rejectWrite);
      active.stream.end(Buffer.from('active upload'));
    });
    const activePath = resolve(temporaryRoot, active.temporaryKey);
    await utimes(activePath, old, old);
    await (
      service as unknown as {
        cleanupExpiredTemporaryFiles(): Promise<void>;
      }
    ).cleanupExpiredTemporaryFiles();
    await expect(access(activePath)).resolves.toBeUndefined();

    service.markTemporaryComplete(active.temporaryKey);
    await (
      service as unknown as {
        cleanupExpiredTemporaryFiles(): Promise<void>;
      }
    ).cleanupExpiredTemporaryFiles();
    await expect(access(activePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('atomically moves a completed temporary upload into the public object area', async () => {
    const temporary = await service.createTemporaryVideo();
    const bytes = Buffer.from('bounded stream bytes');
    await new Promise<void>((resolveWrite, rejectWrite) => {
      temporary.stream.once('finish', resolveWrite);
      temporary.stream.once('error', rejectWrite);
      temporary.stream.end(bytes);
    });
    service.markTemporaryComplete(temporary.temporaryKey);

    const objectKey = service.createObjectKey('mp4');
    await service.preparePendingObject(objectKey);
    await service.finalizeTemporaryVideo(temporary.temporaryKey, objectKey);
    await expect(service.info(objectKey)).resolves.toEqual({
      byteSize: bytes.length,
      mimeType: 'video/mp4',
    });
    await expect(service.read(objectKey)).resolves.toEqual(bytes);
    await expect(
      service.deleteTemporary(temporary.temporaryKey),
    ).resolves.toBeUndefined();
    await service.deleteStrict(objectKey);
  });

  it('keeps a durable cleanup marker until an unassigned final object is removed', async () => {
    const objectKey = `${'c'.repeat(48)}.mp4`;
    const objectPath = resolve(mediaRoot, objectKey);
    await service.preparePendingObject(objectKey);
    await mkdir(resolve(objectPath, 'blocks-non-recursive-removal'), {
      recursive: true,
    });

    await expect(service.deletePendingObjects([objectKey])).rejects.toThrow(
      'One pending media object could not be cleaned',
    );
    await expect(service.listPendingObjectKeys()).resolves.toContain(objectKey);

    await rm(objectPath, { recursive: true, force: true });
    await expect(
      service.deletePendingObjects([objectKey]),
    ).resolves.toBeUndefined();
    await expect(service.listPendingObjectKeys()).resolves.not.toContain(
      objectKey,
    );
  });

  it('injects a test-only write failure without moving the media root', async () => {
    const objectKey = `${'d'.repeat(48)}.webp`;
    await writeFile(writeFailureMarker, 'storage intentionally unavailable');

    await expect(
      service.saveAt(objectKey, {
        buffer: Buffer.from('avatar'),
        byteSize: 6,
        width: 1,
        height: 1,
        mimeType: 'image/webp',
        extension: 'webp',
      }),
    ).rejects.toThrow('Injected media storage write failure');
    await expect(access(resolve(mediaRoot, objectKey))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await rm(writeFailureMarker, { force: true });
    await expect(access(mediaRoot)).resolves.toBeUndefined();
  });
});
