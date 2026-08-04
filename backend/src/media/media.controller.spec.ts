import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PassThrough } from 'node:stream';

import type { Response } from 'express';

import type { PrismaService } from '../database/prisma.service.js';
import { MediaController } from './media.controller.js';
import type { MediaStorage } from './media.types.js';

describe('MediaController stream lifecycle', () => {
  const taskRoot = resolve(
    process.cwd(),
    '..',
    'test',
    'spec-013-media-stream-unit',
  );
  const mediaPath = resolve(taskRoot, 'response-close.mp4');

  afterAll(async () => {
    const repositoryTestRoot = resolve(process.cwd(), '..', 'test');
    if (
      taskRoot.startsWith(`${repositoryTestRoot}\\`) ||
      taskRoot.startsWith(`${repositoryTestRoot}/`)
    ) {
      await rm(taskRoot, { recursive: true, force: true });
    }
  });

  it('destroys the file stream and waits for its handle to close after an early response close', async () => {
    await mkdir(taskRoot, { recursive: true });
    await writeFile(mediaPath, Buffer.alloc(1024 * 1024, 0x2a));
    let openedStream: ReturnType<typeof createReadStream> | null = null;
    const storage = {
      createReadStream: jest.fn(() => {
        openedStream = createReadStream(mediaPath, { highWaterMark: 1 });
        return openedStream;
      }),
    } as unknown as MediaStorage;
    const controller = new MediaController(
      storage,
      {} as PrismaService,
    ) as unknown as {
      pipe(objectKey: string, response: Response): Promise<void>;
    };
    const response = new PassThrough({ highWaterMark: 1 });

    const piping = controller.pipe(
      `${'a'.repeat(48)}.mp4`,
      response as unknown as Response,
    );
    await new Promise<void>((resolveImmediate) =>
      setImmediate(resolveImmediate),
    );
    response.destroy();

    await expect(piping).resolves.toBeUndefined();
    expect(openedStream).not.toBeNull();
    expect(openedStream!.destroyed).toBe(true);
    expect(openedStream!.closed).toBe(true);
    await expect(rm(mediaPath, { force: true })).resolves.toBeUndefined();
  });
});
