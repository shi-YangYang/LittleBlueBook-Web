import { Buffer } from 'node:buffer';

import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';

import { AuthService } from '../auth/auth.service.js';
import { ApiException } from '../common/api-exception.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { MEDIA_STORAGE, type MediaStorage } from '../media/media.types.js';
import { publicAvatar } from '../profile/profile-avatar.js';
import { SafetyService } from '../safety/safety.service.js';
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
  moderationStatus: 'VISIBLE' | 'HIDDEN';
  createdAt: Date;
  author: {
    nickname: string;
    avatarObjectKey: string | null;
    ageRestrictedAt: Date | null;
    status: 'ACTIVE' | 'SUSPENDED';
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
    @Optional() @Inject(SafetyService) private readonly safety?: SafetyService,
  ) {}

  async setLike(
    sessionId: string | undefined,
    noteId: string,
    active: boolean,
  ): Promise<RelationshipResult> {
    const user = await this.requireUser(sessionId);
    const note = await this.requireNote(noteId);
    await this.safety?.assertNotBlocked(user.id, note.authorId);
    if (note.authorId === user.id) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'SELF_LIKE_NOT_ALLOWED',
        '不能点赞自己的笔记',
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      await this.assertTransactionNotBlocked(transaction, user.id, [
        note.authorId,
      ]);
      await this.assertTransactionNoteAvailable(transaction, noteId);
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
    await this.safety?.assertNotBlocked(user.id, note.authorId);

    return this.prisma.$transaction(async (transaction) => {
      await this.assertTransactionNotBlocked(transaction, user.id, [
        note.authorId,
      ]);
      await this.assertTransactionNoteAvailable(transaction, noteId);
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
    const target = await this.prisma.user.findFirst({
      where: { id: followedId, status: 'ACTIVE', ageRestrictedAt: null },
      select: { id: true },
    });
    if (!target) throw this.userNotFound();
    await this.safety?.assertNotBlocked(user.id, followedId);

    const result = await this.prisma.$transaction(async (transaction) => {
      if (following) {
        await this.assertTransactionNotBlocked(transaction, user.id, [
          followedId,
        ]);
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
      const [viewerBlockedIds, targetBlockedIds] = await Promise.all([
        this.transactionBlockedIds(transaction, user.id),
        this.transactionBlockedIds(transaction, followedId),
      ]);
      const blockedIds = [
        ...new Set([...viewerBlockedIds, ...targetBlockedIds]),
      ];
      const [followingCount, followerCount, reverse] = await Promise.all([
        transaction.userFollow.count({
          where: {
            followerId: user.id,
            ...(viewerBlockedIds.length > 0
              ? { followedId: { notIn: viewerBlockedIds } }
              : {}),
            followed: { status: 'ACTIVE', ageRestrictedAt: null },
          },
        }),
        transaction.userFollow.count({
          where: {
            followedId,
            ...(blockedIds.length > 0
              ? { followerId: { notIn: blockedIds } }
              : {}),
            follower: { status: 'ACTIVE', ageRestrictedAt: null },
          },
        }),
        transaction.userFollow.findUnique({
          where: {
            followerId_followedId: {
              followerId: followedId,
              followedId: user.id,
            },
          },
          select: { followerId: true },
        }),
      ]);
      return {
        followingCount,
        followerCount,
        followedBy: Boolean(reverse),
      };
    });
    return {
      following,
      ...result,
      mutual: following && result.followedBy,
    };
  }

  async comments(
    sessionId: string | undefined,
    noteId: string,
    cursorInput: string | undefined,
    limit: number,
  ): Promise<CommentPage> {
    const note = await this.requireNote(noteId);
    const viewer = await this.auth.currentUser(sessionId);
    if (viewer) {
      await this.safety?.assertNotBlocked(viewer.id, note.authorId);
    }
    const blockedIds =
      viewer && this.safety ? await this.safety.blockedIds(viewer.id) : [];
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
        where: {
          noteId,
          rootCommentId: null,
          authorId: { notIn: blockedIds },
          author: { status: 'ACTIVE' },
          OR: [
            { moderationStatus: 'VISIBLE' },
            ...(viewer ? [{ authorId: viewer.id }] : []),
          ],
          ...cursorWhere,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: pageSize + 1,
        select: {
          ...this.commentSelect(viewerLikes),
          replies: {
            where: {
              authorId: { notIn: blockedIds },
              author: { status: 'ACTIVE' as const },
              OR: [
                { moderationStatus: 'VISIBLE' as const },
                ...(viewer ? [{ authorId: viewer.id }] : []),
              ],
            },
            orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
            take: 4,
            select: this.commentSelect(viewerLikes),
          },
        },
      }),
      this.prisma.noteComment.count({
        where: {
          noteId,
          deletedAt: null,
          moderationStatus: 'VISIBLE',
          authorId: { notIn: blockedIds },
          author: { status: 'ACTIVE' },
        },
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
    const viewer = await this.auth.currentUser(sessionId);
    if (viewer) {
      await this.safety?.assertNotBlocked(viewer.id, note.authorId);
    }
    const blockedIds =
      viewer && this.safety ? await this.safety.blockedIds(viewer.id) : [];
    const root = await this.prisma.noteComment.findFirst({
      where: {
        id: rootCommentId,
        noteId,
        rootCommentId: null,
        authorId: { notIn: blockedIds },
        author: { status: 'ACTIVE' },
        OR: [
          { moderationStatus: 'VISIBLE' },
          ...(viewer ? [{ authorId: viewer.id }] : []),
        ],
      },
      select: { id: true },
    });
    if (!root) throw this.commentNotFound();
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
        where: {
          noteId,
          rootCommentId,
          authorId: { notIn: blockedIds },
          author: { status: 'ACTIVE' },
          OR: [
            { moderationStatus: 'VISIBLE' },
            ...(viewer ? [{ authorId: viewer.id }] : []),
          ],
          ...cursorWhere,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: pageSize + 1,
        select: this.commentSelect(viewerLikes),
      }),
      this.prisma.noteComment.count({
        where: {
          noteId,
          rootCommentId,
          moderationStatus: 'VISIBLE',
          authorId: { notIn: blockedIds },
          author: { status: 'ACTIVE' },
        },
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
    await this.safety?.assertNotBlocked(user.id, note.authorId);
    const content = this.validComment(contentInput);

    return this.prisma.$transaction(async (transaction) => {
      await this.assertTransactionNotBlocked(transaction, user.id, [
        note.authorId,
      ]);
      await this.assertTransactionNoteAvailable(transaction, noteId);
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
    await this.safety?.assertNotBlocked(user.id, note.authorId);
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
          moderationStatus: true,
          author: { select: { status: true } },
        },
      });
      if (
        !target ||
        target.noteId !== noteId ||
        target.moderationStatus === 'HIDDEN' ||
        target.author.status === 'SUSPENDED'
      )
        throw this.commentNotFound();
      await this.assertTransactionNotBlocked(transaction, user.id, [
        note.authorId,
        target.authorId,
      ]);
      await this.assertTransactionNoteAvailable(transaction, noteId);
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
        select: {
          id: true,
          authorId: true,
          noteId: true,
          deletedAt: true,
          moderationStatus: true,
          author: { select: { status: true } },
          note: {
            select: {
              authorId: true,
              moderationStatus: true,
              author: { select: { status: true } },
            },
          },
        },
      });
      if (
        !comment ||
        comment.deletedAt ||
        comment.moderationStatus === 'HIDDEN' ||
        comment.author.status === 'SUSPENDED' ||
        comment.note.moderationStatus === 'HIDDEN' ||
        comment.note.author.status === 'SUSPENDED'
      )
        throw this.commentNotFound();
      await this.assertTransactionNotBlocked(transaction, user.id, [
        comment.authorId,
        comment.note.authorId,
      ]);
      await this.assertTransactionNoteAvailable(transaction, comment.noteId);
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
    await this.requireNote(noteId);
    if (!UUID_PATTERN.test(commentId)) throw this.commentNotFound();

    return this.prisma.$transaction(async (transaction) => {
      await this.lockNote(transaction, noteId);
      await this.lockComment(transaction, commentId);
      const lockedNote = await transaction.note.findUnique({
        where: { id: noteId },
        select: {
          moderationStatus: true,
          author: { select: { status: true } },
        },
      });
      if (
        !lockedNote ||
        lockedNote.moderationStatus === 'HIDDEN' ||
        lockedNote.author.status === 'SUSPENDED'
      ) {
        throw this.noteNotFound();
      }
      const comment = await transaction.noteComment.findUnique({
        where: { id: commentId },
        select: {
          id: true,
          noteId: true,
          authorId: true,
          deletedAt: true,
          moderationStatus: true,
          rootCommentId: true,
          _count: {
            select: {
              replies: true,
              referencedBy: true,
            },
          },
        },
      });
      if (!comment || comment.noteId !== noteId) {
        throw this.commentNotFound();
      }
      if (
        comment.authorId !== user.id ||
        comment.moderationStatus === 'HIDDEN'
      ) {
        throw new ApiException(
          HttpStatus.FORBIDDEN,
          'COMMENT_DELETE_FORBIDDEN',
          '无权删除这条评论',
        );
      }

      const placeholder = true;
      if (!comment.deletedAt) {
        await transaction.commentLike?.deleteMany({ where: { commentId } });
        await transaction.noteComment.update({
          where: { id: commentId },
          data: { content: '', deletedAt: new Date() },
        });
        await this.safety?.markTargetUnavailable(
          transaction,
          'COMMENT',
          commentId,
        );
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
      moderationStatus: true,
      createdAt: true,
      author: {
        select: {
          nickname: true,
          avatarObjectKey: true,
          ageRestrictedAt: true,
          status: true,
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
      comment.deletedAt ||
      comment.moderationStatus === 'HIDDEN' ||
      comment.author.ageRestrictedAt ||
      comment.author.status === 'SUSPENDED',
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
      moderationHidden: comment.moderationStatus === 'HIDDEN',
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
      canDelete: !deleted && Boolean(viewerId) && viewerId === comment.authorId,
      canReply: !deleted,
      likes: deleted ? 0 : (comment._count?.likes ?? 0),
      liked: !deleted && Boolean(comment.likes?.length),
      canLike: !deleted && viewerId !== comment.authorId,
      canReport: !deleted && Boolean(viewerId) && viewerId !== comment.authorId,
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

  private async lockNote(
    transaction: Prisma.TransactionClient,
    noteId: string,
  ): Promise<void> {
    if (typeof transaction.$queryRaw !== 'function') return;
    await transaction.$queryRaw`
      SELECT id FROM "notes"
      WHERE id = ${noteId}::uuid
      FOR UPDATE
    `;
  }

  private async assertTransactionNotBlocked(
    transaction: Prisma.TransactionClient,
    userId: string,
    targetIds: string[],
  ): Promise<void> {
    if (!this.safety) return;
    const targets = [...new Set(targetIds.filter((id) => id !== userId))];
    if (targets.length === 0) return;
    const lockIds = [...new Set([userId, ...targets])].sort();
    await transaction.$queryRaw(
      Prisma.sql`
        SELECT id
        FROM "users"
        WHERE id IN (${Prisma.join(
          lockIds.map((id) => Prisma.sql`${id}::uuid`),
        )})
        ORDER BY id
        FOR UPDATE
      `,
    );
    const activeUsers = await transaction.user.count({
      where: {
        id: { in: lockIds },
        status: 'ACTIVE',
        ageRestrictedAt: null,
      },
    });
    if (activeUsers !== lockIds.length) throw this.userNotFound();
    const blocked = await transaction.userBlock.count({
      where: {
        OR: targets.flatMap((targetId) => [
          { blockerId: userId, blockedId: targetId },
          { blockerId: targetId, blockedId: userId },
        ]),
      },
    });
    if (blocked > 0) throw this.userNotFound();
  }

  private async transactionBlockedIds(
    transaction: Prisma.TransactionClient,
    userId: string,
  ): Promise<string[]> {
    const rows = await transaction.userBlock.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return [
      ...new Set(
        rows.map((row) =>
          row.blockerId === userId ? row.blockedId : row.blockerId,
        ),
      ),
    ];
  }

  private async assertTransactionNoteAvailable(
    transaction: Prisma.TransactionClient,
    noteId: string,
  ): Promise<void> {
    if (!this.safety) return;
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT n.id
      FROM "notes" n
      JOIN "users" u ON u.id = n."authorId"
      WHERE n.id = ${noteId}::uuid
        AND n."moderationStatus" = 'VISIBLE'
        AND u.status = 'ACTIVE'
      FOR UPDATE OF n
    `;
    if (rows.length === 0) throw this.noteNotFound();
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
      select: {
        id: true,
        authorId: true,
        moderationStatus: true,
        author: { select: { status: true } },
      },
    });
    if (
      !note ||
      note.moderationStatus === 'HIDDEN' ||
      note.author?.status === 'SUSPENDED'
    )
      throw this.noteNotFound();
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
