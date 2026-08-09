import type { AuthService } from '../auth/auth.service.js';
import { ApiException } from '../common/api-exception.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { MediaStorage } from '../media/media.types.js';
import { InteractionsService } from './interactions.service.js';

const viewer = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'viewer@example.com',
  nickname: '互动用户',
};
const authorId = '00000000-0000-4000-8000-000000000002';
const noteId = '00000000-0000-4000-8000-000000000003';
const commentId = '00000000-0000-4000-8000-000000000004';

function dependencies() {
  const auth = {
    currentUser: jest.fn(async (): Promise<typeof viewer | null> => viewer),
  };
  const store = {
    user: {
      findUnique: jest.fn(async () => ({ id: authorId })),
    },
    note: {
      findUnique: jest.fn(async () => ({ id: noteId, authorId })),
    },
    noteLike: {
      createMany: jest.fn(async () => ({ count: 1 })),
      deleteMany: jest.fn(async () => ({ count: 0 })),
      count: jest.fn(async () => 1),
    },
    noteFavorite: {
      createMany: jest.fn(async () => ({ count: 1 })),
      deleteMany: jest.fn(async () => ({ count: 0 })),
      count: jest.fn(async () => 2),
    },
    userFollow: {
      createMany: jest.fn(async () => ({ count: 1 })),
      deleteMany: jest.fn(async () => ({ count: 0 })),
      count: jest.fn(async () => 1),
    },
    noteComment: {
      findMany: jest.fn(
        async (): Promise<
          Array<{
            id: string;
            authorId: string;
            content: string;
            createdAt: Date;
            author: { nickname: string; avatarObjectKey: string | null };
          }>
        > => [],
      ),
      findUnique: jest.fn(async () => ({
        id: commentId,
        noteId,
        authorId: viewer.id,
      })),
      create: jest.fn(async () => ({
        id: commentId,
        noteId,
        authorId: viewer.id,
        content: '评论正文',
        createdAt: new Date('2026-07-28T12:00:00.000Z'),
        author: { nickname: viewer.nickname, avatarObjectKey: null },
      })),
      delete: jest.fn(async () => ({})),
      count: jest.fn(async () => 1),
    },
    notification: {
      create: jest.fn(async () => ({})),
    },
  };
  const prisma = {
    ...store,
    $transaction: jest.fn(
      async (operation: (client: typeof store) => unknown) => operation(store),
    ),
  };
  return {
    service: new InteractionsService(
      auth as unknown as AuthService,
      prisma as unknown as PrismaService,
      {
        publicUrl: jest.fn((key: string) => `/media/${key}`),
      } as unknown as MediaStorage,
    ),
    auth,
    prisma,
  };
}

describe('InteractionsService', () => {
  it('sets like and favorite target states idempotently with authoritative counts', async () => {
    const { service, prisma } = dependencies();

    await expect(service.setLike('session', noteId, true)).resolves.toEqual({
      active: true,
      count: 1,
    });
    await expect(service.setFavorite('session', noteId, true)).resolves.toEqual(
      {
        active: true,
        count: 2,
      },
    );
    await expect(service.setLike('session', noteId, false)).resolves.toEqual({
      active: false,
      count: 1,
    });

    expect(prisma.noteLike.createMany).toHaveBeenCalledWith({
      data: [{ userId: viewer.id, noteId }],
      skipDuplicates: true,
    });
    expect(prisma.noteLike.deleteMany).toHaveBeenCalledWith({
      where: { userId: viewer.id, noteId },
    });
    expect(prisma.noteFavorite.createMany).toHaveBeenCalled();
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        type: 'NOTE_LIKED',
        recipientId: authorId,
        actorId: viewer.id,
        noteId,
      },
    });
  });

  it('rejects self-like and self-follow while allowing self-favorite', async () => {
    const { service, prisma } = dependencies();
    prisma.note.findUnique.mockResolvedValue({
      id: noteId,
      authorId: viewer.id,
    });

    await expect(
      service.setLike('session', noteId, true),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SELF_LIKE_NOT_ALLOWED' }),
    });
    await expect(
      service.setFollow('session', viewer.id, true),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SELF_FOLLOW_NOT_ALLOWED' }),
    });
    await expect(
      service.setFavorite('session', noteId, true),
    ).resolves.toMatchObject({ active: true });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('creates notifications only for real relationship transitions', async () => {
    const { service, prisma } = dependencies();

    await service.setLike('session', noteId, true);
    await service.setFavorite('session', noteId, true);
    await service.setFollow('session', authorId, true);
    expect(prisma.notification.create).toHaveBeenCalledTimes(3);

    prisma.notification.create.mockClear();
    prisma.noteLike.createMany.mockResolvedValue({ count: 0 });
    prisma.noteFavorite.createMany.mockResolvedValue({ count: 0 });
    prisma.userFollow.createMany.mockResolvedValue({ count: 0 });

    await service.setLike('session', noteId, true);
    await service.setFavorite('session', noteId, true);
    await service.setFollow('session', authorId, true);
    await service.setLike('session', noteId, false);
    await service.setFavorite('session', noteId, false);
    await service.setFollow('session', authorId, false);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('publishes normalized plain text and rejects invalid comment lengths', async () => {
    const { service, prisma } = dependencies();

    await expect(
      service.createComment('session', noteId, '  评论正文  '),
    ).resolves.toMatchObject({
      comment: {
        id: commentId,
        content: '评论正文',
        canDelete: true,
        isAuthor: false,
      },
      total: 1,
    });
    expect(prisma.noteComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          noteId,
          authorId: viewer.id,
          content: '评论正文',
        },
      }),
    );
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        type: 'NOTE_COMMENTED',
        recipientId: authorId,
        actorId: viewer.id,
        noteId,
        commentId,
      },
    });
    await expect(
      service.createComment('session', noteId, '   '),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'COMMENT_INVALID' }),
    });
    await expect(
      service.createComment('session', noteId, '字'.repeat(501)),
    ).rejects.toBeInstanceOf(ApiException);
  });

  it('lists comments newest first with viewer delete permission and isolated cursors', async () => {
    const { service, prisma } = dependencies();
    prisma.noteComment.findMany.mockResolvedValue([
      {
        id: commentId,
        authorId: authorId,
        content: '<script>纯文本</script>',
        createdAt: new Date('2026-07-28T12:00:00.000Z'),
        author: { nickname: '笔记作者', avatarObjectKey: null },
      },
    ]);

    const page = await service.comments('session', noteId, undefined, 20);
    expect(page.items[0]).toMatchObject({
      content: '<script>纯文本</script>',
      isAuthor: true,
      canDelete: false,
    });
    expect(prisma.noteComment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
      }),
    );

    await expect(
      service.comments('session', noteId, 'not-a-cursor', 20),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CURSOR_INVALID' }),
    });
  });

  it('enforces the comment deletion permission matrix', async () => {
    const { service, prisma } = dependencies();

    await expect(
      service.deleteComment('session', noteId, commentId),
    ).resolves.toEqual({ deleted: true, placeholder: false, total: 1 });

    prisma.noteComment.findUnique.mockResolvedValue({
      id: commentId,
      noteId,
      authorId: '00000000-0000-4000-8000-000000000009',
    });
    await expect(
      service.deleteComment('session', noteId, commentId),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'COMMENT_DELETE_FORBIDDEN' }),
    });

    prisma.note.findUnique.mockResolvedValue({
      id: noteId,
      authorId: viewer.id,
    });
    await expect(
      service.deleteComment('session', noteId, commentId),
    ).resolves.toEqual({ deleted: true, placeholder: false, total: 1 });
  });

  it('requires a valid session before every interaction write', async () => {
    const { service, auth, prisma } = dependencies();
    auth.currentUser.mockResolvedValue(null);

    await expect(
      service.setLike(undefined, noteId, true),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'AUTHENTICATION_REQUIRED' }),
    });
    await expect(
      service.createComment(undefined, noteId, '评论'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'AUTHENTICATION_REQUIRED' }),
    });
    expect(prisma.note.findUnique).not.toHaveBeenCalled();
  });

  it('does not complete an interaction when transactional notification creation fails', async () => {
    const { service, prisma } = dependencies();
    prisma.notification.create.mockRejectedValue(
      new Error('notification write failed'),
    );

    await expect(service.setLike('session', noteId, true)).rejects.toThrow(
      'notification write failed',
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
