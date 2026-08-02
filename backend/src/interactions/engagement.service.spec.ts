import type { AuthService } from '../auth/auth.service.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { MediaStorage } from '../media/media.types.js';
import { InteractionsService } from './interactions.service.js';

const actorId = '00000000-0000-4000-8000-000000000201';
const targetAuthorId = '00000000-0000-4000-8000-000000000202';
const noteAuthorId = '00000000-0000-4000-8000-000000000203';
const noteId = '00000000-0000-4000-8000-000000000204';
const rootId = '00000000-0000-4000-8000-000000000205';
const targetId = '00000000-0000-4000-8000-000000000206';
const replyId = '00000000-0000-4000-8000-000000000207';

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: replyId,
    noteId,
    authorId: actorId,
    rootCommentId: rootId,
    content: '回复内容',
    deletedAt: null,
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
    author: { nickname: '回复者', avatarObjectKey: null },
    replyTo: {
      id: targetId,
      deletedAt: null,
      author: { nickname: '评论者' },
    },
    likes: [],
    _count: { likes: 0, replies: 0 },
    ...overrides,
  };
}

function serviceWith(transaction: Record<string, unknown>) {
  const auth = {
    currentUser: jest.fn(async () => ({
      id: actorId,
      email: 'private@example.test',
      nickname: '回复者',
      avatar: { type: 'initial', value: '回' },
    })),
  };
  const prisma = {
    note: {
      findUnique: jest.fn(async () => ({ id: noteId, authorId: noteAuthorId })),
    },
    $transaction: jest.fn(async (operation: (tx: unknown) => unknown) =>
      operation(transaction),
    ),
  };
  const media = { publicUrl: jest.fn() };
  return new InteractionsService(
    auth as unknown as AuthService,
    prisma as unknown as PrismaService,
    media as unknown as MediaStorage,
  );
}

describe('SPEC-011 comment engagement', () => {
  it('flattens a reply to the target root and creates both eligible notifications atomically', async () => {
    const transaction = {
      $queryRaw: jest.fn(async () => [{ id: targetId }]),
      noteComment: {
        findUnique: jest.fn(async () => ({
          id: targetId,
          noteId,
          authorId: targetAuthorId,
          rootCommentId: rootId,
          deletedAt: null,
        })),
        findFirst: jest.fn(async () => ({ id: rootId })),
        create: jest.fn(async () => record()),
        count: jest.fn(async () => 4),
      },
      notification: { createMany: jest.fn(async () => ({ count: 2 })) },
    };
    const service = serviceWith(transaction);

    const result = await service.createReply(
      'session',
      noteId,
      targetId,
      '  回复内容  ',
    );

    expect(transaction.noteComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rootCommentId: rootId,
          replyToId: targetId,
          replyToAuthorId: targetAuthorId,
          content: '回复内容',
        }),
      }),
    );
    expect(transaction.notification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          type: 'COMMENT_REPLIED',
          recipientId: targetAuthorId,
        }),
        expect.objectContaining({
          type: 'NOTE_COMMENTED',
          recipientId: noteAuthorId,
        }),
      ]),
    });
    expect(result).toMatchObject({
      comment: { id: replyId, rootCommentId: rootId },
      total: 4,
    });
  });

  it('does not duplicate a comment-like notification for an idempotent PUT', async () => {
    const transaction = {
      $queryRaw: jest.fn(async () => [{ id: targetId }]),
      noteComment: {
        findUnique: jest.fn(async () => ({
          id: targetId,
          noteId,
          authorId: targetAuthorId,
          deletedAt: null,
        })),
      },
      commentLike: {
        createMany: jest.fn(async () => ({ count: 0 })),
        count: jest.fn(async () => 3),
      },
      notification: { create: jest.fn() },
    };
    const result = await serviceWith(transaction).setCommentLike(
      'session',
      targetId,
      true,
    );

    expect(result).toEqual({ active: true, count: 3 });
    expect(transaction.notification.create).not.toHaveBeenCalled();
  });

  it('keeps a target referenced by a deleted placeholder and clears its likes', async () => {
    const transaction = {
      $queryRaw: jest.fn(async () => [{ id: targetId }]),
      noteComment: {
        findUnique: jest.fn(async () => ({
          id: targetId,
          noteId,
          authorId: actorId,
          deletedAt: null,
          rootCommentId: rootId,
          _count: { replies: 0, referencedBy: 1 },
        })),
        update: jest.fn(async () => undefined),
        delete: jest.fn(async () => undefined),
        count: jest.fn(async () => 2),
      },
      commentLike: { deleteMany: jest.fn(async () => ({ count: 2 })) },
    };
    const result = await serviceWith(transaction).deleteComment(
      'session',
      noteId,
      targetId,
    );

    expect(transaction.noteComment.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: {
            select: { replies: true, referencedBy: true },
          },
        }),
      }),
    );
    expect(result).toEqual({ deleted: true, placeholder: true, total: 2 });
    expect(transaction.noteComment.update).toHaveBeenCalledWith({
      where: { id: targetId },
      data: { content: '', deletedAt: expect.any(Date) },
    });
    expect(transaction.noteComment.delete).not.toHaveBeenCalled();
    expect(transaction.commentLike.deleteMany).toHaveBeenCalledWith({
      where: { commentId: targetId },
    });
  });
});
