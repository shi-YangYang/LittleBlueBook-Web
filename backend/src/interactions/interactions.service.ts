import { Buffer } from 'node:buffer';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';

import { AuthService } from '../auth/auth.service.js';
import { ApiException } from '../common/api-exception.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
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
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class InteractionsService {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
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
        await transaction.noteLike.upsert({
          where: { userId_noteId: { userId: user.id, noteId } },
          create: { userId: user.id, noteId },
          update: {},
        });
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
    await this.requireNote(noteId);

    return this.prisma.$transaction(async (transaction) => {
      if (active) {
        await transaction.noteFavorite.upsert({
          where: { userId_noteId: { userId: user.id, noteId } },
          create: { userId: user.id, noteId },
          update: {},
        });
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
    if (!UUID_PATTERN.test(followedId)) {
      throw this.userNotFound();
    }
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
    if (!target) {
      throw this.userNotFound();
    }

    if (following) {
      await this.prisma.userFollow.upsert({
        where: {
          followerId_followedId: { followerId: user.id, followedId },
        },
        create: { followerId: user.id, followedId },
        update: {},
      });
    } else {
      await this.prisma.userFollow.deleteMany({
        where: { followerId: user.id, followedId },
      });
    }
    return { following };
  }

  async comments(
    sessionId: string | undefined,
    noteId: string,
    cursorInput: string | undefined,
    limit: number,
  ): Promise<CommentPage> {
    const note = await this.requireNote(noteId);
    const viewer = await this.auth.currentUser(sessionId);
    const pageSize = Number(limit);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 20) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'PAGINATION_INVALID',
        '分页参数无效',
      );
    }
    const cursor = this.decodeCursor(cursorInput, noteId);
    const cursorWhere = cursor
      ? {
          OR: [
            { createdAt: { lt: new Date(cursor.createdAt) } },
            {
              createdAt: new Date(cursor.createdAt),
              id: { lt: cursor.id },
            },
          ],
        }
      : {};

    const [comments, total] = await Promise.all([
      this.prisma.noteComment.findMany({
        where: { noteId, ...cursorWhere },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: pageSize + 1,
        select: {
          id: true,
          authorId: true,
          content: true,
          createdAt: true,
          author: { select: { nickname: true } },
        },
      }),
      this.prisma.noteComment.count({ where: { noteId } }),
    ]);
    const hasMore = comments.length > pageSize;
    const pageItems = hasMore ? comments.slice(0, pageSize) : comments;
    const last = pageItems.at(-1);

    return {
      items: pageItems.map((comment) =>
        this.toComment(comment, note.authorId, viewer?.id),
      ),
      nextCursor:
        hasMore && last
          ? this.encodeCursor({
              createdAt: last.createdAt.toISOString(),
              id: last.id,
              noteId,
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
    const content = contentInput.trim();
    const length = Array.from(content).length;
    if (length < 1 || length > 500) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'COMMENT_INVALID',
        '评论需为1～500个字符',
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      const comment = await transaction.noteComment.create({
        data: { noteId, authorId: user.id, content },
        select: {
          id: true,
          authorId: true,
          content: true,
          createdAt: true,
          author: { select: { nickname: true } },
        },
      });
      const total = await transaction.noteComment.count({ where: { noteId } });
      return {
        comment: this.toComment(comment, note.authorId, user.id),
        total,
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
    if (!UUID_PATTERN.test(commentId)) {
      throw this.commentNotFound();
    }
    const comment = await this.prisma.noteComment.findUnique({
      where: { id: commentId },
      select: { id: true, noteId: true, authorId: true },
    });
    if (!comment || comment.noteId !== noteId) {
      throw this.commentNotFound();
    }
    if (comment.authorId !== user.id && note.authorId !== user.id) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'COMMENT_DELETE_FORBIDDEN',
        '无权删除这条评论',
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      try {
        await transaction.noteComment.delete({ where: { id: commentId } });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2025'
        ) {
          throw this.commentNotFound();
        }
        throw error;
      }
      return {
        deleted: true,
        total: await transaction.noteComment.count({ where: { noteId } }),
      };
    });
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
    if (!UUID_PATTERN.test(noteId)) {
      throw this.noteNotFound();
    }
    const note = await this.prisma.note.findUnique({
      where: { id: noteId },
      select: { id: true, authorId: true },
    });
    if (!note) {
      throw this.noteNotFound();
    }
    return note;
  }

  private toComment(
    comment: {
      id: string;
      authorId: string;
      content: string;
      createdAt: Date;
      author: { nickname: string };
    },
    noteAuthorId: string,
    viewerId: string | undefined,
  ): NoteCommentData {
    return {
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
      author: {
        id: comment.authorId,
        nickname: comment.author.nickname,
        avatar: {
          type: 'initial',
          value: Array.from(comment.author.nickname.trim())[0] ?? '蓝',
        },
      },
      isAuthor: comment.authorId === noteAuthorId,
      canDelete: viewerId === comment.authorId || viewerId === noteAuthorId,
    };
  }

  private encodeCursor(cursor: CommentCursor): string {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private decodeCursor(
    cursor: string | undefined,
    noteId: string,
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
        parsed.noteId !== noteId
      ) {
        throw new Error('invalid');
      }
      return {
        createdAt: parsed.createdAt,
        id: parsed.id,
        noteId: parsed.noteId,
      };
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
