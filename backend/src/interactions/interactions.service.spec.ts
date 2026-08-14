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
const viewerBlockedId = '00000000-0000-4000-8000-000000000005';
const targetBlockedId = '00000000-0000-4000-8000-000000000006';

function dependencies() {
  const auth = {
    currentUser: jest.fn(async (): Promise<typeof viewer | null> => viewer),
  };
  const store = {
    user: {
      findUnique: jest.fn(async () => ({ id: authorId })),
      findFirst: jest.fn(async () => ({ id: authorId })),
    },
    note: {
      findUnique: jest.fn(async () => ({
        id: noteId,
        authorId,
        moderationStatus: 'VISIBLE' as const,
        author: { status: 'ACTIVE' as const },
      })),
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
      findUnique: jest.fn(async () => null),
    },
    userBlock: {
      findMany: jest.fn(
        async (): Promise<
          Array<{ blockerId: string; blockedId: string }>
        > => [],
      ),
      count: jest.fn(async () => 0),
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
        deletedAt: null,
        moderationStatus: 'VISIBLE' as const,
        author: { status: 'ACTIVE' as const },
        note: {
          authorId,
          moderationStatus: 'VISIBLE' as const,
          author: { status: 'ACTIVE' as const },
        },
        rootCommentId: null,
        _count: { replies: 0, referencedBy: 0 },
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
      update: jest.fn(async () => ({})),
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
      moderationStatus: 'VISIBLE',
      author: { status: 'ACTIVE' },
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

  it('returns authoritative follow counts and mutual state without deleting history', async () => {
    const { service, prisma } = dependencies();
    prisma.userFollow.count.mockResolvedValueOnce(4).mockResolvedValueOnce(7);
    (prisma.userFollow.findUnique as jest.Mock).mockResolvedValueOnce({
      followerId: authorId,
    });

    await expect(service.setFollow('session', authorId, true)).resolves.toEqual(
      {
        following: true,
        followingCount: 4,
        followerCount: 7,
        followedBy: true,
        mutual: true,
      },
    );
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        type: 'USER_FOLLOWED',
        recipientId: authorId,
        actorId: viewer.id,
      },
    });

    prisma.notification.create.mockClear();
    prisma.userFollow.count.mockResolvedValueOnce(3).mockResolvedValueOnce(6);
    (prisma.userFollow.findUnique as jest.Mock).mockResolvedValueOnce({
      followerId: authorId,
    });
    await expect(
      service.setFollow('session', authorId, false),
    ).resolves.toEqual({
      following: false,
      followingCount: 3,
      followerCount: 6,
      followedBy: true,
      mutual: false,
    });
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(prisma.userFollow.deleteMany).toHaveBeenCalledWith({
      where: { followerId: viewer.id, followedId: authorId },
    });
  });

  it('counts only relationships accessible to the same viewer after third-party blocks', async () => {
    const { service, prisma } = dependencies();
    prisma.userBlock.findMany
      .mockResolvedValueOnce([
        { blockerId: viewer.id, blockedId: viewerBlockedId },
      ])
      .mockResolvedValueOnce([
        { blockerId: targetBlockedId, blockedId: authorId },
      ]);
    prisma.userFollow.count.mockResolvedValueOnce(2).mockResolvedValueOnce(5);

    await expect(service.setFollow('session', authorId, true)).resolves.toEqual(
      {
        following: true,
        followingCount: 2,
        followerCount: 5,
        followedBy: false,
        mutual: false,
      },
    );

    expect(prisma.userFollow.count).toHaveBeenNthCalledWith(1, {
      where: {
        followerId: viewer.id,
        followedId: { notIn: [viewerBlockedId] },
        followed: { status: 'ACTIVE', ageRestrictedAt: null },
      },
    });
    expect(prisma.userFollow.count).toHaveBeenNthCalledWith(2, {
      where: {
        followedId: authorId,
        followerId: { notIn: [viewerBlockedId, targetBlockedId] },
        follower: { status: 'ACTIVE', ageRestrictedAt: null },
      },
    });
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
    ).resolves.toEqual({ deleted: true, placeholder: true, total: 1 });

    prisma.noteComment.findUnique.mockResolvedValue({
      id: commentId,
      noteId,
      authorId: '00000000-0000-4000-8000-000000000009',
      deletedAt: null,
      moderationStatus: 'VISIBLE',
      author: { status: 'ACTIVE' },
      note: {
        authorId,
        moderationStatus: 'VISIBLE',
        author: { status: 'ACTIVE' },
      },
      rootCommentId: null,
      _count: { replies: 0, referencedBy: 0 },
    });
    await expect(
      service.deleteComment('session', noteId, commentId),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'COMMENT_DELETE_FORBIDDEN' }),
    });

    prisma.note.findUnique.mockResolvedValue({
      id: noteId,
      authorId: viewer.id,
      moderationStatus: 'VISIBLE',
      author: { status: 'ACTIVE' },
    });
    await expect(
      service.deleteComment('session', noteId, commentId),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'COMMENT_DELETE_FORBIDDEN' }),
    });
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
