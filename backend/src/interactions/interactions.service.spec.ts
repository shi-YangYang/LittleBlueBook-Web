import type { AuthService } from '../auth/auth.service.js';
import { ApiException } from '../common/api-exception.js';
import type { PrismaService } from '../database/prisma.service.js';
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
      upsert: jest.fn(async () => ({})),
      deleteMany: jest.fn(async () => ({ count: 0 })),
      count: jest.fn(async () => 1),
    },
    noteFavorite: {
      upsert: jest.fn(async () => ({})),
      deleteMany: jest.fn(async () => ({ count: 0 })),
      count: jest.fn(async () => 2),
    },
    userFollow: {
      upsert: jest.fn(async () => ({})),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    noteComment: {
      findMany: jest.fn(
        async (): Promise<
          Array<{
            id: string;
            authorId: string;
            content: string;
            createdAt: Date;
            author: { nickname: string };
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
        author: { nickname: viewer.nickname },
      })),
      delete: jest.fn(async () => ({})),
      count: jest.fn(async () => 1),
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

    expect(prisma.noteLike.upsert).toHaveBeenCalledWith({
      where: { userId_noteId: { userId: viewer.id, noteId } },
      create: { userId: viewer.id, noteId },
      update: {},
    });
    expect(prisma.noteLike.deleteMany).toHaveBeenCalledWith({
      where: { userId: viewer.id, noteId },
    });
    expect(prisma.noteFavorite.upsert).toHaveBeenCalled();
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
        author: { nickname: '笔记作者' },
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
    ).resolves.toEqual({ deleted: true, total: 1 });

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
    ).resolves.toEqual({ deleted: true, total: 1 });
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
});
