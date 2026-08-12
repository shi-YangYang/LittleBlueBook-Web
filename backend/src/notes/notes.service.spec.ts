import { HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { ApiException } from '../common/api-exception.js';
import type { AuthService } from '../auth/auth.service.js';
import type { ChannelsService } from '../channels/channels.service.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { ImageValidatorService } from '../media/image-validator.service.js';
import type { MediaStorage } from '../media/media.types.js';
import type { RedisService } from '../redis/redis.service.js';
import type { AppEnvironment } from '../config/environment.js';
import { NotesService } from './notes.service.js';

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'private@example.com',
  nickname: '蓝书作者',
};
const requestId = '00000000-0000-4000-8000-000000000002';

function dependencies() {
  const auth = {
    currentUser: jest.fn(async () => user),
    assertWriteAllowed: jest.fn(async () => undefined),
  };
  const channels = {
    requirePublishable: jest.fn(async (code: string) => ({
      id: '00000000-0000-4000-8001-000000000001',
      code,
      name: '数码',
      displayOrder: 1,
      enabled: true,
      publishable: true,
      isPublic: true,
    })),
    requirePublic: jest.fn(async (code: string) => ({
      id: '00000000-0000-4000-8001-000000000001',
      code,
      name: '数码',
      displayOrder: 1,
      enabled: true,
      publishable: true,
      isPublic: true,
    })),
  };
  const prisma = {
    note: {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
      updateMany: jest.fn(async () => ({ count: 1 })),
      delete: jest.fn(async () => ({ id: 'deleted' })),
      create: jest.fn(async () => ({
        id: '00000000-0000-4000-8000-000000000003',
        createdAt: new Date('2026-07-26T12:00:00.000Z'),
      })),
      findMany: jest.fn(async () => []),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    noteImage: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      createMany: jest.fn(async () => ({ count: 0 })),
    },
    noteVideo: { update: jest.fn() },
    mediaCleanup: { createMany: jest.fn(async () => ({ count: 0 })) },
    notification: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    noteComment: { updateMany: jest.fn(async () => ({ count: 0 })) },
  };
  prisma.$transaction.mockImplementation(
    async (operation: (transaction: unknown) => unknown) => operation(prisma),
  );
  const validator = {
    validate: jest.fn(async () => [
      {
        buffer: Buffer.from('image'),
        byteSize: 5,
        width: 100,
        height: 120,
        mimeType: 'image/png' as const,
        extension: 'png' as const,
      },
    ]),
  };
  const media = {
    save: jest.fn(async () => [
      {
        objectKey: `${'a'.repeat(48)}.png`,
        byteSize: 5,
        width: 100,
        height: 120,
        mimeType: 'image/png' as const,
      },
    ]),
    createObjectKey: jest.fn(() => `${'a'.repeat(48)}.png`),
    saveAt: jest.fn(),
    deleteMany: jest.fn(async () => undefined),
    deleteStrict: jest.fn(async () => undefined),
    read: jest.fn(),
    createTemporaryVideo: jest.fn(),
    markTemporaryComplete: jest.fn(),
    withTemporaryFile: jest.fn(),
    finalizeTemporaryVideo: jest.fn(),
    deleteTemporary: jest.fn(),
    preparePendingObject: jest.fn(),
    completePendingObjects: jest.fn(async () => undefined),
    deletePendingObjects: jest.fn(async () => undefined),
    listPendingObjectKeys: jest.fn(),
    info: jest.fn(),
    createReadStream: jest.fn(),
    publicUrl: jest.fn((key: string) => `https://media.example.test/${key}`),
  };
  const redis = { eval: jest.fn(async () => 1) };
  const config = {
    getOrThrow: jest.fn((key: string) =>
      key === 'COOKIE_SECURE'
        ? false
        : 'unit-test-view-secret-at-least-32-characters',
    ),
  };
  const cleanup = { cleanupQueuedObjects: jest.fn(async () => undefined) };
  const service = new NotesService(
    auth as unknown as AuthService,
    channels as unknown as ChannelsService,
    prisma as unknown as PrismaService,
    validator as unknown as ImageValidatorService,
    media as MediaStorage,
    cleanup as never,
    redis as unknown as RedisService,
    config as unknown as ConfigService<AppEnvironment, true>,
  );
  return { service, auth, channels, prisma, validator, media, cleanup, redis };
}

describe('NotesService', () => {
  it('publishes one ordered note for the server-side session author', async () => {
    const { service, prisma, media } = dependencies();
    const files = [
      {
        buffer: Buffer.from('image'),
        size: 5,
        originalname: '../../email@example.com.png',
        mimetype: 'image/png',
      },
    ];

    await expect(
      service.publish(
        'session-secret',
        {
          title: ' 真实标题 ',
          content: ' 第一行\n第二行 ',
          channelCode: 'digital',
          clientRequestId: requestId,
        },
        files,
      ),
    ).resolves.toEqual({
      id: '00000000-0000-4000-8000-000000000003',
      createdAt: '2026-07-26T12:00:00.000Z',
    });
    expect(prisma.note.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        authorId: user.id,
        channelId: '00000000-0000-4000-8001-000000000001',
        title: '真实标题',
        content: '第一行\n第二行',
        clientRequestId: requestId,
        images: {
          create: [
            expect.objectContaining({
              objectKey: `${'a'.repeat(48)}.png`,
              order: 0,
            }),
          ],
        },
      }),
      select: { id: true, createdAt: true },
    });
    expect(media.deleteMany).not.toHaveBeenCalled();
    expect(JSON.stringify(prisma.note.create.mock.calls)).not.toContain(
      'email@example.com',
    );
  });

  it('returns the original result for a repeated client request without storing again', async () => {
    const { service, channels, prisma, validator, media } = dependencies();
    (prisma.note.findUnique as jest.Mock).mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000099',
      createdAt: new Date('2026-07-26T13:00:00.000Z'),
    });

    await expect(
      service.publish(
        'session-secret',
        {
          title: '标题',
          content: '正文',
          channelCode: 'other',
          clientRequestId: requestId,
        },
        [],
      ),
    ).resolves.toEqual({
      id: '00000000-0000-4000-8000-000000000099',
      createdAt: '2026-07-26T13:00:00.000Z',
    });
    expect(validator.validate).not.toHaveBeenCalled();
    expect(channels.requirePublishable).not.toHaveBeenCalled();
    expect(media.save).not.toHaveBeenCalled();
    expect(prisma.note.create).not.toHaveBeenCalled();
  });

  it('cleans all newly stored objects when the database transaction fails', async () => {
    const { service, prisma, media } = dependencies();
    prisma.note.create.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(
      service.publish(
        'session-secret',
        {
          title: '标题',
          content: '正文',
          channelCode: 'digital',
          clientRequestId: requestId,
        },
        [],
      ),
    ).rejects.toThrow('database unavailable');
    expect(media.deleteMany).toHaveBeenCalledWith([`${'a'.repeat(48)}.png`]);
  });

  it('rejects publishing and current-user listing without a valid session', async () => {
    const { service, auth, prisma } = dependencies();
    (auth.currentUser as jest.Mock).mockResolvedValue(null);

    await expect(
      service.publish(
        undefined,
        {
          title: '标题',
          content: '正文',
          channelCode: 'digital',
          clientRequestId: requestId,
        },
        [],
      ),
    ).rejects.toBeInstanceOf(ApiException);
    await expect(service.mine(undefined, undefined, 20)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'AUTHENTICATION_REQUIRED',
      }),
    });
    expect(prisma.note.create).not.toHaveBeenCalled();
  });

  it('rate limits new publishing attempts without touching media storage', async () => {
    const { service, redis, validator, media } = dependencies();
    (redis.eval as jest.Mock).mockResolvedValueOnce(0);

    await expect(
      service.publish(
        'session-secret',
        {
          title: '标题',
          content: '正文',
          channelCode: 'digital',
          clientRequestId: requestId,
        },
        [],
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'RATE_LIMITED' }),
    });
    expect(validator.validate).not.toHaveBeenCalled();
    expect(media.save).not.toHaveBeenCalled();
  });

  it('enforces the write gate before returning author-only editable data', async () => {
    const { service, auth, prisma } = dependencies();
    const noteId = '00000000-0000-4000-8000-000000000009';
    (auth.assertWriteAllowed as jest.Mock).mockRejectedValueOnce(
      new ApiException(
        HttpStatus.FORBIDDEN,
        'LEGAL_ACCEPTANCE_REQUIRED',
        '需要重新确认条款',
      ),
    );

    await expect(
      service.editable('session-secret', noteId),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'LEGAL_ACCEPTANCE_REQUIRED',
      }),
    });
    expect(prisma.note.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a tampered content type before validating or storing edit media', async () => {
    const { service, prisma, channels, validator, media } = dependencies();
    const noteId = '00000000-0000-4000-8000-000000000008';
    (prisma.note.findFirst as jest.Mock).mockResolvedValueOnce({
      id: noteId,
      contentType: 'VIDEO',
      contentVersion: 1,
      images: [],
      video: { coverObjectKey: `${'9'.repeat(48)}.webp` },
    });

    await expect(
      service.update(
        'session-secret',
        noteId,
        {
          title: '标题',
          content: '正文',
          channelCode: 'digital',
          contentType: 'IMAGE',
          expectedContentVersion: 1,
          imageOrder: '[]',
        },
        {},
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NOTE_TYPE_IMMUTABLE' }),
    });
    expect(channels.requirePublishable).not.toHaveBeenCalled();
    expect(validator.validate).not.toHaveBeenCalled();
    expect(media.save).not.toHaveBeenCalled();
  });

  it('edits only the author note with an independent content version and queues removed media', async () => {
    const { service, prisma, cleanup } = dependencies();
    const noteId = '00000000-0000-4000-8000-000000000010';
    const keptId = '00000000-0000-4000-8000-000000000011';
    const removedId = '00000000-0000-4000-8000-000000000012';
    const keptKey = `${'b'.repeat(48)}.png`;
    const removedKey = `${'c'.repeat(48)}.png`;
    (prisma.note.findFirst as jest.Mock).mockResolvedValueOnce({
      id: noteId,
      contentType: 'IMAGE',
      contentVersion: 4,
      images: [
        {
          id: keptId,
          objectKey: keptKey,
          mimeType: 'image/png',
          byteSize: 5,
          width: 100,
          height: 120,
        },
        {
          id: removedId,
          objectKey: removedKey,
          mimeType: 'image/png',
          byteSize: 5,
          width: 100,
          height: 120,
        },
      ],
      video: null,
    });

    await expect(
      service.update(
        'session-secret',
        noteId,
        {
          title: ' 更新标题 ',
          content: ' 更新正文 ',
          channelCode: 'digital',
          contentType: 'IMAGE',
          expectedContentVersion: 4,
          imageOrder: JSON.stringify([{ kind: 'existing', id: keptId }]),
        },
        {},
      ),
    ).resolves.toMatchObject({ id: noteId, contentVersion: 5 });
    expect(prisma.note.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: noteId,
          authorId: user.id,
          contentVersion: 4,
          moderationStatus: 'VISIBLE',
        },
        data: expect.objectContaining({
          title: '更新标题',
          content: '更新正文',
          contentVersion: { increment: 1 },
        }),
      }),
    );
    expect(prisma.noteImage.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ objectKey: keptKey, order: 0 })],
    });
    expect(prisma.mediaCleanup.createMany).toHaveBeenCalledWith({
      data: [{ objectKey: removedKey }],
      skipDuplicates: true,
    });
    expect(cleanup.cleanupQueuedObjects).toHaveBeenCalledWith([removedKey]);
  });

  it('returns a stable conflict instead of overwriting a newer edit', async () => {
    const { service, prisma } = dependencies();
    const noteId = '00000000-0000-4000-8000-000000000020';
    (prisma.note.findFirst as jest.Mock)
      .mockResolvedValueOnce({
        id: noteId,
        contentType: 'VIDEO',
        contentVersion: 2,
        images: [],
        video: { coverObjectKey: `${'d'.repeat(48)}.webp` },
      })
      .mockResolvedValueOnce({ id: noteId });
    prisma.note.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.update(
        'session-secret',
        noteId,
        {
          title: '标题',
          content: '正文',
          channelCode: 'digital',
          contentType: 'VIDEO',
          expectedContentVersion: 1,
        },
        {},
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NOTE_EDIT_CONFLICT' }),
    });
    expect(prisma.noteVideo.update).not.toHaveBeenCalled();
  });

  it('permanently deletes the locked author note and queues all media after the transaction', async () => {
    const { service, prisma, cleanup } = dependencies();
    const noteId = '00000000-0000-4000-8000-000000000030';
    const imageKey = `${'e'.repeat(48)}.png`;
    const videoKey = `${'f'.repeat(48)}.mp4`;
    const coverKey = `${'1'.repeat(48)}.webp`;
    prisma.$queryRaw
      .mockResolvedValueOnce([{ authorId: user.id, contentVersion: 3 }])
      .mockResolvedValueOnce([]);
    (prisma.note.findUnique as jest.Mock).mockResolvedValueOnce({
      images: [{ objectKey: imageKey }],
      video: { videoObjectKey: videoKey, coverObjectKey: coverKey },
    });
    prisma.note.delete.mockResolvedValueOnce({ id: noteId });

    await expect(service.remove('session-secret', noteId, 3)).resolves.toEqual({
      id: noteId,
      deleted: true,
    });
    expect(prisma.notification.deleteMany).toHaveBeenCalled();
    expect(prisma.noteComment.updateMany).toHaveBeenCalled();
    expect(prisma.note.delete).toHaveBeenCalledWith({ where: { id: noteId } });
    expect(cleanup.cleanupQueuedObjects).toHaveBeenCalledWith([
      imageKey,
      videoKey,
      coverKey,
    ]);
  });

  it('returns a minimal stable card page and an opaque next cursor', async () => {
    const { service, prisma, media } = dependencies();
    (prisma.note.findMany as jest.Mock).mockResolvedValueOnce(
      Array.from({ length: 21 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
        title: `标题${index}`,
        createdAt: new Date(
          `2026-07-${String(26 - index).padStart(2, '0')}T12:00:00.000Z`,
        ),
        author: {
          id: user.id,
          nickname: '蓝书作者',
          email: 'must-not-leak@example.com',
        },
        images: [
          {
            objectKey: `${String(index).padStart(48, 'a')}.png`,
            width: 100,
            height: 120,
          },
        ],
        content: 'must not be returned',
        likes: [{ userId: user.id }],
        _count: { likes: 3 },
      })),
    );

    const result = await service.recommendations(
      'session-secret',
      undefined,
      20,
    );

    expect(result.items).toHaveLength(20);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(result.items[0]).toMatchObject({
      title: '标题0',
      author: {
        nickname: '蓝书作者',
        avatar: { type: 'initial', value: '蓝' },
      },
      likes: 3,
      liked: true,
      canLike: false,
    });
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
    expect(JSON.stringify(result)).not.toContain('content');
    expect(media.publicUrl).toHaveBeenCalled();
    expect(prisma.note.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
      }),
    );
  });

  it('normalizes transformed query values before using them in Prisma', async () => {
    const { service, prisma } = dependencies();

    await service.recommendations(
      undefined,
      undefined,
      '20' as unknown as number,
    );

    expect(prisma.note.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 21 }),
    );
  });

  it('returns ordered public detail with only zero interaction placeholders', async () => {
    const { service, prisma } = dependencies();
    (prisma.note.findUnique as jest.Mock).mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000003',
      title: '<img src=x onerror=alert(1)>',
      content: '<script>alert(1)</script>\n第二行',
      createdAt: new Date('2026-07-26T12:00:00.000Z'),
      author: {
        id: user.id,
        nickname: '蓝书作者',
        email: 'private@example.com',
        followers: [],
      },
      channel: {
        code: 'digital',
        name: '数码',
        enabled: true,
        isPublic: true,
      },
      images: [
        { objectKey: `${'a'.repeat(48)}.png`, width: 100, height: 120 },
        { objectKey: `${'b'.repeat(48)}.webp`, width: 90, height: 80 },
      ],
      likes: [],
      favorites: [],
      _count: { likes: 0, favorites: 0, comments: 0 },
    });

    const result = await service.detail(
      undefined,
      '00000000-0000-4000-8000-000000000003',
    );

    expect(result.images).toHaveLength(2);
    expect(result.interactions).toEqual({
      likes: 0,
      favorites: 0,
      comments: 0,
    });
    expect(result.content).toBe('<script>alert(1)</script>\n第二行');
    expect(result.channel).toEqual({
      code: 'digital',
      name: '数码',
      navigable: true,
    });
    expect(JSON.stringify(result)).not.toContain('private@example.com');
  });

  it('rejects malformed cursors and missing details with safe errors', async () => {
    const { service } = dependencies();

    await expect(
      service.recommendations(undefined, 'not-a-cursor', 20),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CURSOR_INVALID' }),
    });
    await expect(
      service.detail(undefined, '../../etc/passwd'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NOTE_NOT_FOUND' }),
    });
  });

  it('validates the channel before rate limiting or storing media', async () => {
    const { service, channels, redis, validator, media } = dependencies();
    (channels.requirePublishable as jest.Mock).mockRejectedValueOnce(
      new ApiException(
        HttpStatus.BAD_REQUEST,
        'CHANNEL_INVALID',
        '所选频道不存在或暂不可发布',
      ),
    );

    await expect(
      service.publish(
        'session-secret',
        {
          title: '标题',
          content: '正文',
          channelCode: 'uncategorized',
          clientRequestId: requestId,
        },
        [],
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CHANNEL_INVALID' }),
    });
    expect(redis.eval).not.toHaveBeenCalled();
    expect(validator.validate).not.toHaveBeenCalled();
    expect(media.save).not.toHaveBeenCalled();
  });

  it('isolates channel feeds and rejects a recommendation cursor', async () => {
    const { service, prisma } = dependencies();
    (prisma.note.findMany as jest.Mock).mockResolvedValueOnce(
      Array.from({ length: 21 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
        title: `推荐${index}`,
        createdAt: new Date(
          `2026-07-${String(26 - index).padStart(2, '0')}T12:00:00.000Z`,
        ),
        author: { id: user.id, nickname: '蓝书作者' },
        images: [
          {
            objectKey: `${String(index).padStart(48, 'b')}.png`,
            width: 100,
            height: 120,
          },
        ],
        likes: [],
        _count: { likes: 0 },
      })),
    );
    const recommendation = await service.recommendations(
      undefined,
      undefined,
      20,
    );

    await expect(
      service.channel(
        undefined,
        'digital',
        recommendation.nextCursor ?? undefined,
        20,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CURSOR_INVALID' }),
    });

    await service.channel(undefined, 'digital', undefined, 20);
    expect(prisma.note.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          channelId: '00000000-0000-4000-8001-000000000001',
        }),
      }),
    );
  });
});
