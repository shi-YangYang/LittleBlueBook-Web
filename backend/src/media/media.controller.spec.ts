import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PassThrough } from 'node:stream';

import type { Request, Response } from 'express';

import type { SessionService } from '../auth/session.service.js';
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
      {} as SessionService,
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

  it.each(['GET', 'HEAD'] as const)(
    'authorizes %s media reads for governance, suspension and both block directions',
    async (method) => {
      const objectKey = `${'a'.repeat(48)}.png`;
      const ownerId = '00000000-0000-4000-8000-000000000001';
      const viewerId = '00000000-0000-4000-8000-000000000002';
      let noteStatus: 'VISIBLE' | 'HIDDEN' = 'VISIBLE';
      let ownerStatus: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE';
      let blockCount = 0;
      const storage = {
        info: jest.fn(async () => ({ byteSize: 4, mimeType: 'image/png' })),
      } as unknown as MediaStorage;
      const prisma = {
        noteImage: {
          findUnique: jest.fn(async () => ({
            note: {
              authorId: ownerId,
              moderationStatus: noteStatus,
              author: { status: ownerStatus },
            },
          })),
        },
        noteVideo: { findFirst: jest.fn(async () => null) },
        user: {
          findFirst: jest.fn(async () => null),
          findUnique: jest.fn(async () => ({
            id: viewerId,
            role: 'USER',
            status: 'ACTIVE',
            authVersion: 1,
          })),
        },
        userBlock: { count: jest.fn(async () => blockCount) },
      } as unknown as PrismaService;
      const sessions = {
        read: jest.fn(async () => ({
          userId: viewerId,
          authVersion: 1,
          createdAt: '2026-08-10T00:00:00.000Z',
        })),
      } as unknown as SessionService;
      const controller = new MediaController(storage, prisma, sessions);
      const pipe = jest.fn(async () => undefined);
      Object.assign(controller, { pipe });
      const response = {
        status: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        end: jest.fn(),
      } as unknown as Response;
      const anonymous = { headers: {} } as Request;
      const authenticated = {
        headers: { cookie: 'lbb_session=viewer-session' },
      } as Request;
      const invoke = (request: Request) =>
        method === 'HEAD'
          ? controller.head(objectKey, request, response)
          : controller.read(objectKey, request, response);

      await expect(invoke(anonymous)).resolves.toBeUndefined();
      noteStatus = 'HIDDEN';
      await expect(invoke(anonymous)).rejects.toMatchObject({ status: 404 });
      await expect(invoke(authenticated)).rejects.toMatchObject({
        status: 404,
      });
      noteStatus = 'VISIBLE';
      await expect(invoke(authenticated)).resolves.toBeUndefined();
      ownerStatus = 'SUSPENDED';
      await expect(invoke(anonymous)).rejects.toMatchObject({ status: 404 });
      await expect(invoke(authenticated)).rejects.toMatchObject({
        status: 404,
      });
      ownerStatus = 'ACTIVE';
      blockCount = 1;
      await expect(invoke(authenticated)).rejects.toMatchObject({
        status: 404,
      });
      expect(prisma.userBlock.count).toHaveBeenCalledWith({
        where: {
          OR: [
            { blockerId: viewerId, blockedId: ownerId },
            { blockerId: ownerId, blockedId: viewerId },
          ],
        },
      });
      blockCount = 0;
      await expect(invoke(authenticated)).resolves.toBeUndefined();
      expect(response.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Cache-Control': 'private, no-store',
          Vary: 'Cookie',
        }),
      );
    },
  );

  it('applies the same authoritative policy to videos, covers and avatars while allowing an active owner avatar', async () => {
    const videoKey = `${'b'.repeat(48)}.mp4`;
    const coverKey = `${'c'.repeat(48)}.webp`;
    const avatarKey = `${'d'.repeat(48)}.jpg`;
    const ownerId = '00000000-0000-4000-8000-000000000001';
    let ownerStatus: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE';
    const prisma = {
      noteImage: { findUnique: jest.fn(async () => null) },
      noteVideo: {
        findFirst: jest.fn(async ({ where }: { where: { OR: object[] } }) => {
          const serialized = JSON.stringify(where);
          return serialized.includes(videoKey) || serialized.includes(coverKey)
            ? {
                note: {
                  authorId: ownerId,
                  moderationStatus: 'VISIBLE',
                  author: { status: ownerStatus },
                },
              }
            : null;
        }),
      },
      user: {
        findFirst: jest.fn(async ({ where }: { where: object }) =>
          JSON.stringify(where).includes(avatarKey)
            ? { id: ownerId, status: ownerStatus }
            : null,
        ),
        findUnique: jest.fn(async () => ({
          id: ownerId,
          role: 'USER',
          status: 'ACTIVE',
          authVersion: 1,
        })),
      },
      userBlock: { count: jest.fn(async () => 0) },
    } as unknown as PrismaService;
    const storage = {
      info: jest.fn(async (key: string) => ({
        byteSize: 4,
        mimeType: key.endsWith('.mp4') ? 'video/mp4' : 'image/webp',
      })),
    } as unknown as MediaStorage;
    const sessions = {
      read: jest.fn(async () => ({
        userId: ownerId,
        authVersion: 1,
        createdAt: '2026-08-10T00:00:00.000Z',
      })),
    } as unknown as SessionService;
    const controller = new MediaController(storage, prisma, sessions);
    const response = {
      status: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      end: jest.fn(),
    } as unknown as Response;
    const authenticated = {
      headers: { cookie: 'lbb_session=owner-session' },
    } as Request;

    for (const key of [videoKey, coverKey, avatarKey]) {
      await expect(
        controller.head(key, authenticated, response),
      ).resolves.toBeUndefined();
    }
    ownerStatus = 'SUSPENDED';
    await expect(
      controller.head(avatarKey, { headers: {} } as Request, response),
    ).rejects.toMatchObject({ status: 404 });
  });
});
