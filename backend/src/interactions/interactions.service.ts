import { Buffer } from 'node:buffer';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';

import { AuthService } from '../auth/auth.service.js';
import { ApiException } from '../common/api-exception.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { MEDIA_STORAGE, type MediaStorage } from '../media/media.types.js';
import { publicAvatar } from '../profile/profile-avatar.js';
import type {
  CommentDeletionResult,
  CommentMutationResult,
  CommentPage,
  FollowResult,
  NoteCommentData,
  RelationshipResult,
} from './interactions.types.js';

type CommentCursor = {
  createdAt: string;
  id: string;
  noteId: string;
  rootCommentId: string | null;
  direction: 'older-roots' | 'newer-replies';
};

type CommentRecord = {
  id: string;
  noteId: string;
  authorId: string;
  rootCommentId: string | null;
  content: string;
  deletedAt: Date | null;
  createdAt: Date;
  author: {
    nickname: string;
    avatarObjectKey: string | null;
    ageRestrictedAt: Date | null;
  };
  replyTo: {
    id: string;
    deletedAt: Date | null;
    author: { nickname: string; ageRestrictedAt: Date | null };
  } | null;
  likes?: Array<{ userId: string }>;
  _count: { likes: number; replies: number };
  replies?: CommentRecord[];
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class InteractionsService {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MEDIA_STORAGE) private readonly media: MediaStorage,
  ) {}

  async setLike(
    sessionId: string | undefined,
    noteId: string,
    active: boolean,
  ): Promise<RelationshipResult> {
    const user = await this.requireUser(sessionId);
    const note = await this.requireNote(noteId);
    if (note.authorId === user.id) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'SELF_LIKE_NOT_ALLOWED',
        '不能点赞自己的笔记',
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      if (active) {
        const created = await transaction.noteLike.createMany({
          data: [{ userId: user.id, noteId }],
          skipDuplicates: true,
        });
        if (created.count === 1) {
          await transaction.notification.create({
            data: {
              type: 'NOTE_LIKED',
              recipientId: note.authorId,
              actorId: user.id,
              noteId,
            },
          });
        }
      } else {
        await transaction.noteLike.deleteMany({
          where: { userId: user.id, noteId },
        });
      }
      return {
        active,
        count: await transaction.noteLike.count({ where: { noteId } }),
      };
    });
  }

  async setFavorite(
    sessionId: string | undefined,
    noteId: string,
    active: boolean,
  ): Promise<RelationshipResult> {
    const user = await this.requireUser(sessionId);
    const note = await this.requireNote(noteId);

    return this.prisma.$transaction(async (transaction) => {
      if (active) {
        const created = await transaction.noteFavorite.createMany({
          data: [{ userId: user.id, noteId }],
          skipDuplicates: true,
        });
        if (created.count === 1 && note.authorId !== user.id) {
          await transaction.notification.create({
            data: {
              type: 'NOTE_FAVORITED',
              recipientId: note.authorId,
              actorId: user.id,
              noteId,
            },
          });
        }
      } else {
        await transaction.noteFavorite.deleteMany({
          where: { userId: user.id, noteId },
        });
      }
      return {
        active,
        count: await transaction.noteFavorite.count({ where: { noteId } }),
      };
    });
  }

  async setFollow(
    sessionId: string | undefined,
    followedId: string,
    following: boolean,
  ): Promise<FollowResult> {
    const user = await this.requireUser(sessionId);
    if (!UUID_PATTERN.test(followedId)) throw this.userNotFound();
    if (user.id === followedId) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'SELF_FOLLOW_NOT_ALLOWED',
        '不能关注自己',
      );
    }
    const target = await this.prisma.user.findUnique({
      where: { id: followedId },
      select: { id: true },
    });
    if (!target) throw this.userNotFound();

    const followingCount = await this.prisma.$transaction(
      async (transaction) => {
        if (following) {
          const created = await transaction.userFollow.createMany({
            data: [{ followerId: user.id, followedId }],
            skipDuplicates: true,
          });
          if (created.count === 1) {
            await transaction.notification.create({
              data: {
                type: 'USER_FOLLOWED',
                recipientId: followedId,
                actorId: user.id,
              },
            });
          }
        } else {
          await transaction.userFollow.deleteMany({
            where: { followerId: user.id, followedId },
          });
        }
        return transaction.userFollow.count({ where: { followerId: user.id } });
      },
    );
    return { following, followingCount };
  }

  async comments(
    sessionId: string | undefined,
    noteId: string,
    cursorInput: string | undefined,
    limit: number,
  ): Promise<CommentPage> {
    const note = await this.requireNote(noteId);
    const viewer = await this.auth.currentUser(sessionId);
    const pageSize = this.pageSize(limit, 20);
    const cursor = this.decodeCursor(cursorInput, noteId, null, 'older-roots');
    const cursorWhere = cursor
      ? {
          OR: [
            { createdAt: { lt: new Date(cursor.createdAt) } },
            { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
          ],
        }
      : {};
    const viewerLikes = viewer
      ? { where: { userId: viewer.id }, take: 1, select: { userId: true } }
      : false;

    const [comments, total] = await Promise.all([
      this.prisma.noteComment.findMany({
        where: { noteId, rootCommentId: null, ...cursorWhere },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: pageSize + 1,
        select: {
          ...this.commentSelect(viewerLikes),
          replies: {
            orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
            take: 4,
            select: this.commentSelect(viewerLikes),
          },
        },
      }),
      this.prisma.noteComment.count({
        where: { noteId, deletedAt: null },
      }),
    ]);
    const hasMore = comments.length > pageSize;
    const pageItems = (
      hasMore ? comments.slice(0, pageSize) : comments
    ) as CommentRecord[];
    const last = pageItems.at(-1);

    return {
      items: pageItems.map((comment) =>
        this.toComment(comment, note.authorId, viewer?.id, true),
      ),
      nextCursor:
        hasMore && last
          ? this.encodeCursor({
              createdAt: last.createdAt.toISOString(),
              id: last.id,
              noteId,
              rootCommentId: null,
              direction: 'older-roots',
            })
          : null,
      total,
    };
  }

  async replies(
    sessionId: string | undefined,
    noteId: string,
    rootCommentId: string,
    cursorInput: string | undefined,
    limit: number,
  ): Promise<CommentPage> {
    const note = await this.requireNote(noteId);
    if (!UUID_PATTERN.test(rootCommentId)) throw this.commentNotFound();
    const root = await this.prisma.noteComment.findFirst({
      where: { id: rootCommentId, noteId, rootCommentId: null },
      select: { id: true },
    });
    if (!root) throw this.commentNotFound();
    const viewer = await this.auth.currentUser(sessionId);
    const pageSize = this.pageSize(limit, 10);
    const cursor = this.decodeCursor(
      cursorInput,
      noteId,
      rootCommentId,
      'newer-replies',
    );
    const cursorWhere = cursor
      ? {
          OR: [
            { createdAt: { gt: new Date(cursor.createdAt) } },
            { createdAt: new Date(cursor.createdAt), id: { gt: cursor.id } },
          ],
        }
      : {};
    const viewerLikes = viewer
      ? { where: { userId: viewer.id }, take: 1, select: { userId: true } }
      : false;
    const [items, total] = await Promise.all([
      this.prisma.noteComment.findMany({
        where: { noteId, rootCommentId, ...cursorWhere },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: pageSize + 1,
        select: this.commentSelect(viewerLikes),
      }),
      this.prisma.noteComment.count({
        where: { noteId, rootCommentId },
      }),
    ]);
    const hasMore = items.length > pageSize;
    const pageItems = (
      hasMore ? items.slice(0, pageSize) : items
    ) as CommentRecord[];
    const last = pageItems.at(-1);
    return {
      items: pageItems.map((comment) =>
        this.toComment(comment, note.authorId, viewer?.id, false),
      ),
      nextCursor:
        hasMore && last
          ? this.encodeCursor({
              createdAt: last.createdAt.toISOString(),
              id: last.id,
              noteId,
              rootCommentId,
              direction: 'newer-replies',
            })
          : null,
      total,
    };
  }

  async createComment(
    sessionId: string | undefined,
    noteId: string,
    contentInput: string,
  ): Promise<CommentMutationResult> {
    const user = await this.requireUser(sessionId);
    const note = await this.requireNote(noteId);
    const content = this.validComment(contentInput);

    return this.prisma.$transaction(async (transaction) => {
      const comment = await transaction.noteComment.create({
        data: { noteId, authorId: user.id, content },
        select: this.commentSelect({
          where: { userId: user.id },
          take: 1,
          select: { userId: true },
        }),
      });
      if (note.authorId !== user.id) {
        await transaction.notification.create({
          data: {
            type: 'NOTE_COMMENTED',
            recipientId: note.authorId,
            actorId: user.id,
            noteId,
            commentId: comment.id,
          },
        });
      }
      return {
        comment: this.toComment(
          comment as CommentRecord,
          note.authorId,
          user.id,
          false,
        ),
        total: await transaction.noteComment.count({
          where: { noteId, deletedAt: null },
        }),
      };
    });
  }

  async createReply(
    sessionId: string | undefined,
    noteId: string,
    targetCommentId: string,
    contentInput: string,
  ): Promise<CommentMutationResult> {
    const user = await this.requireUser(sessionId);
    const note = await this.requireNote(noteId);
    if (!UUID_PATTERN.test(targetCommentId)) throw this.commentNotFound();
    const content = this.validComment(contentInput);

    return this.prisma.$transaction(async (transaction) => {
      await this.lockComment(transaction, targetCommentId);
      const target = await transaction.noteComment.findUnique({
        where: { id: targetCommentId },
        select: {
          id: true,
          noteId: true,
          authorId: true,
          rootCommentId: true,
          deletedAt: true,
        },
      });
      if (!target || target.noteId !== noteId) throw this.commentNotFound();
      if (target.deletedAt) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          'COMMENT_REPLY_TARGET_DELETED',
          '该评论已删除，无法回复',
        );
      }
      const rootCommentId = target.rootCommentId ?? target.id;
      const root = await transaction.noteComment.findFirst({
        where: { id: rootCommentId, noteId, rootCommentId: null },
        select: { id: true },
      });
      if (!root) throw this.commentNotFound();

      const reply = await transaction.noteComment.create({
        data: {
          noteId,
          authorId: user.id,
          rootCommentId,
          replyToId: target.id,
          replyToAuthorId: target.authorId,
          content,
        },
        select: this.commentSelect({
          where: { userId: user.id },
          take: 1,
          select: { userId: true },
        }),
      });
      const notifications: Prisma.NotificationCreateManyInput[] = [];
      if (target.authorId !== user.id) {
        notifications.push({
          type: 'COMMENT_REPLIED',
          recipientId: target.authorId,
          actorId: user.id,
          noteId,
          commentId: reply.id,
        });
      }
      if (note.authorId !== user.id && note.authorId !== target.authorId) {
        notifications.push({
          type: 'NOTE_COMMENTED',
          recipientId: note.authorId,
          actorId: user.id,
          noteId,
          commentId: reply.id,
        });
      }
      if (notifications.length > 0) {
        await transaction.notification.createMany({ data: notifications });
      }
      return {
        comment: this.toComment(
          reply as CommentRecord,
          note.authorId,
          user.id,
          false,
        ),
        total: await transaction.noteComment.count({
          where: { noteId, deletedAt: null },
        }),
      };
    });
  }

  async setCommentLike(
    sessionId: string | undefined,
    commentId: string,
    active: boolean,
  ): Promise<RelationshipResult> {
    const user = await this.requireUser(sessionId);
    if (!UUID_PATTERN.test(commentId)) throw this.commentNotFound();
    return this.prisma.$transaction(async (transaction) => {
      await this.lockComment(transaction, commentId);
      const comment = await transaction.noteComment.findUnique({
        where: { id: commentId },
        select: { id: true, authorId: true, noteId: true, deletedAt: true },
      });
      if (!comment || comment.deletedAt) throw this.commentNotFound();
      if (comment.authorId === user.id) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          'SELF_COMMENT_LIKE_NOT_ALLOWED',
          '不能点赞自己的评论',
        );
      }
      if (active) {
        const created = await transaction.commentLike.createMany({
          data: [{ userId: user.id, commentId }],
          skipDuplicates: true,
        });
        if (created.count === 1) {
          await transaction.notification.create({
            data: {
              type: 'COMMENT_LIKED',
              recipientId: comment.authorId,
              actorId: user.id,
              noteId: comment.noteId,
              commentId,
            },
          });
        }
      } else {
        await transaction.commentLike.deleteMany({
          where: { userId: user.id, commentId },
        });
      }
      return {
        active,
        count: await transaction.commentLike.count({ where: { commentId } }),
      };
    });
  }

  async deleteComment(
    sessionId: string | undefined,
    noteId: string,
    commentId: string,
  ): Promise<CommentDeletionResult> {
    const user = await this.requireUser(sessionId);
    const note = await this.requireNote(noteId);
    if (!UUID_PATTERN.test(commentId)) throw this.commentNotFound();

    return this.prisma.$transaction(async (transaction) => {
      await this.lockComment(transaction, commentId);
      const comment = await transaction.noteComment.findUnique({
        where: { id: commentId },
        select: {
          id: true,
          noteId: true,
          authorId: true,
          deletedAt: true,
          rootCommentId: true,
          _count: {
            select: {
              replies: true,
              referencedBy: true,
            },
          },
        },
      });
      if (!comment || comment.noteId !== noteId || comment.deletedAt) {
        throw this.commentNotFound();
      }
      if (comment.authorId !== user.id && note.authorId !== user.id) {
        throw new ApiException(
          HttpStatus.FORBIDDEN,
          'COMMENT_DELETE_FORBIDDEN',
          '无权删除这条评论',
        );
      }

      await transaction.commentLike?.deleteMany({ where: { commentId } });
      const placeholder =
        (comment._count?.replies ?? 0) > 0 ||
        (comment._count?.referencedBy ?? 0) > 0;
      if (placeholder) {
        await transaction.noteComment.update({
          where: { id: commentId },
          data: { content: '', deletedAt: new Date() },
        });
      } else {
        await transaction.noteComment.delete({ where: { id: commentId } });
      }
      return {
        deleted: true,
        placeholder,
        total: await transaction.noteComment.count({
          where: { noteId, deletedAt: null },
        }),
      };
    });
  }

  private commentSelect(viewerLikes: false | Record<string, unknown>) {
    return {
      id: true,
      noteId: true,
      authorId: true,
      rootCommentId: true,
      content: true,
      deletedAt: true,
      createdAt: true,
      author: {
        select: {
          nickname: true,
          avatarObjectKey: true,
          ageRestrictedAt: true,
        },
      },
      replyTo: {
        select: {
          id: true,
          deletedAt: true,
          author: { select: { nickname: true, ageRestrictedAt: true } },
        },
      },
      likes: viewerLikes,
      _count: { select: { likes: true, replies: true } },
    } as const;
  }

  private toComment(
    comment: CommentRecord,
    noteAuthorId: string,
    viewerId: string | undefined,
    includePreview: boolean,
  ): NoteCommentData {
    const deleted = Boolean(
      comment.deletedAt || comment.author.ageRestrictedAt,
    );
    const preview = includePreview ? (comment.replies ?? []).slice(0, 3) : [];
    const replyCount = comment._count?.replies ?? comment.replies?.length ?? 0;
    const lastPreview = preview.at(-1);
    return {
      id: comment.id,
      rootCommentId: comment.rootCommentId,
      content: deleted ? null : comment.content,
      createdAt: comment.createdAt.toISOString(),
      deleted,
      author: deleted
        ? null
        : {
            id: comment.authorId,
            nickname: comment.author.nickname,
            avatar: publicAvatar(
              comment.author.nickname,
              comment.author.avatarObjectKey,
              this.media,
            ),
          },
      replyTo: comment.replyTo
        ? (() => {
            const replyTargetUnavailable = Boolean(
              comment.replyTo.deletedAt ||
              comment.replyTo.author.ageRestrictedAt,
            );
            return {
              id: comment.replyTo.id,
              nickname: replyTargetUnavailable
                ? null
                : comment.replyTo.author.nickname,
              deleted: replyTargetUnavailable,
            };
          })()
        : null,
      isAuthor: !deleted && comment.authorId === noteAuthorId,
      canDelete:
        !deleted &&
        Boolean(viewerId) &&
        (viewerId === comment.authorId || viewerId === noteAuthorId),
      canReply: !deleted,
      likes: deleted ? 0 : (comment._count?.likes ?? 0),
      liked: !deleted && Boolean(comment.likes?.length),
      canLike: !deleted && viewerId !== comment.authorId,
      replies: preview.map((reply) =>
        this.toComment(reply, noteAuthorId, viewerId, false),
      ),
      replyCount,
      repliesNextCursor:
        includePreview && replyCount > preview.length && lastPreview
          ? this.encodeCursor({
              createdAt: lastPreview.createdAt.toISOString(),
              id: lastPreview.id,
              noteId: comment.noteId,
              rootCommentId: comment.id,
              direction: 'newer-replies',
            })
          : null,
    };
  }

  private async lockComment(
    transaction: Prisma.TransactionClient,
    commentId: string,
  ): Promise<void> {
    if (typeof transaction.$queryRaw !== 'function') return;
    await transaction.$queryRaw`
      SELECT "id" FROM "note_comments"
      WHERE "id" = ${commentId}::uuid
      FOR UPDATE
    `;
  }

  private validComment(input: string): string {
    const content = input.trim();
    const length = Array.from(content).length;
    if (length < 1 || length > 500) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'COMMENT_INVALID',
        '评论需为1～500个字符',
      );
    }
    return content;
  }

  private pageSize(value: number, maximum: number): number {
    const size = Number(value);
    if (!Number.isInteger(size) || size < 1 || size > maximum) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'PAGINATION_INVALID',
        '分页参数无效',
      );
    }
    return size;
  }

  private async requireUser(sessionId: string | undefined) {
    const user = await this.auth.currentUser(sessionId);
    if (!user) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'AUTHENTICATION_REQUIRED',
        '请先登录',
      );
    }
    return user;
  }

  private async requireNote(noteId: string) {
    if (!UUID_PATTERN.test(noteId)) throw this.noteNotFound();
    const note = await this.prisma.note.findUnique({
      where: { id: noteId },
      select: { id: true, authorId: true },
    });
    if (!note) throw this.noteNotFound();
    return note;
  }

  private encodeCursor(cursor: CommentCursor): string {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private decodeCursor(
    cursor: string | undefined,
    noteId: string,
    rootCommentId: string | null,
    direction: CommentCursor['direction'],
  ): CommentCursor | null {
    if (!cursor) return null;
    try {
      if (cursor.length > 512) throw new Error('too long');
      const parsed = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as Partial<CommentCursor>;
      if (
        typeof parsed.createdAt !== 'string' ||
        Number.isNaN(Date.parse(parsed.createdAt)) ||
        typeof parsed.id !== 'string' ||
        !UUID_PATTERN.test(parsed.id) ||
        parsed.noteId !== noteId ||
        parsed.rootCommentId !== rootCommentId ||
        parsed.direction !== direction
      ) {
        throw new Error('invalid');
      }
      return parsed as CommentCursor;
    } catch {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'CURSOR_INVALID',
        '分页游标无效',
      );
    }
  }

  private noteNotFound(): ApiException {
    return new ApiException(
      HttpStatus.NOT_FOUND,
      'NOTE_NOT_FOUND',
      '笔记不存在',
    );
  }

  private commentNotFound(): ApiException {
    return new ApiException(
      HttpStatus.NOT_FOUND,
      'COMMENT_NOT_FOUND',
      '评论不存在',
    );
  }

  private userNotFound(): ApiException {
    return new ApiException(
      HttpStatus.NOT_FOUND,
      'USER_NOT_FOUND',
      '用户不存在',
    );
  }
}
