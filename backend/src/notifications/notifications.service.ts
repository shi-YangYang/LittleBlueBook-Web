import { Buffer } from 'node:buffer';

import { HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';

import { AuthService } from '../auth/auth.service.js';
import { ApiException } from '../common/api-exception.js';
import { PrismaService } from '../database/prisma.service.js';
import type { NotificationType } from '../generated/prisma/client.js';
import { MEDIA_STORAGE, type MediaStorage } from '../media/media.types.js';
import { publicAvatar } from '../profile/profile-avatar.js';
import { SafetyService } from '../safety/safety.service.js';
import type {
  NotificationItem,
  NotificationPage,
  NotificationTab,
  ReadAllNotificationsResult,
  ReadNotificationResult,
  UnreadCountResult,
} from './notifications.types.js';

type NotificationCursor = {
  createdAt: string;
  id: string;
  recipientId: string;
  tab: NotificationTab;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TAB_TYPES: Record<NotificationTab, NotificationType[] | undefined> = {
  all: undefined,
  comments: ['NOTE_COMMENTED', 'COMMENT_REPLIED'],
  reactions: ['NOTE_LIKED', 'NOTE_FAVORITED', 'COMMENT_LIKED'],
  follows: ['USER_FOLLOWED'],
};

const ACTIONS: Record<NotificationType, string> = {
  NOTE_LIKED: '赞了你的笔记',
  NOTE_FAVORITED: '收藏了你的笔记',
  NOTE_COMMENTED: '评论了你的笔记',
  USER_FOLLOWED: '关注了你',
  COMMENT_REPLIED: '回复了你的评论',
  COMMENT_LIKED: '赞了你的评论',
};

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MEDIA_STORAGE) private readonly media: MediaStorage,
    @Optional() @Inject(SafetyService) private readonly safety?: SafetyService,
  ) {}

  async list(
    sessionId: string | undefined,
    tab: NotificationTab,
    cursorInput: string | undefined,
    limit: number,
  ): Promise<NotificationPage> {
    const user = await this.requireUser(sessionId);
    const pageSize = Number(limit);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 20) {
      throw this.invalidPagination();
    }
    const cursor = this.decodeCursor(cursorInput, user.id, tab);
    const types = TAB_TYPES[tab];
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

    const notifications = await this.prisma.notification.findMany({
      where: {
        recipientId: user.id,
        ...(this.safety
          ? { suppressedAt: null, actor: { status: 'ACTIVE' as const } }
          : {}),
        ...(types ? { type: { in: types } } : {}),
        ...cursorWhere,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1,
      select: {
        id: true,
        type: true,
        createdAt: true,
        readAt: true,
        actor: {
          select: {
            id: true,
            nickname: true,
            littleBlueBookId: true,
            avatarObjectKey: true,
          },
        },
        note: {
          select: {
            id: true,
            title: true,
            contentType: true,
            images: {
              where: { order: 0 },
              take: 1,
              select: {
                objectKey: true,
                width: true,
                height: true,
              },
            },
            video: {
              select: {
                coverObjectKey: true,
                coverWidth: true,
                coverHeight: true,
              },
            },
          },
        },
        comment: {
          select: {
            id: true,
            rootCommentId: true,
            content: true,
            deletedAt: true,
            moderationStatus: true,
          },
        },
      },
    });
    const hasMore = notifications.length > pageSize;
    const pageItems = hasMore
      ? notifications.slice(0, pageSize)
      : notifications;
    const last = pageItems.at(-1);

    return {
      items: pageItems.map((notification) => this.toItem(notification)),
      nextCursor:
        hasMore && last
          ? this.encodeCursor({
              createdAt: last.createdAt.toISOString(),
              id: last.id,
              recipientId: user.id,
              tab,
            })
          : null,
    };
  }

  async unreadCount(sessionId: string | undefined): Promise<UnreadCountResult> {
    const user = await this.requireUser(sessionId);
    return {
      unreadCount: await this.prisma.notification.count({
        where: {
          recipientId: user.id,
          readAt: null,
          ...(this.safety ? { suppressedAt: null } : {}),
        },
      }),
    };
  }

  async read(
    sessionId: string | undefined,
    notificationId: string,
  ): Promise<ReadNotificationResult> {
    const user = await this.requireUser(sessionId);
    if (!UUID_PATTERN.test(notificationId)) {
      throw this.notFound();
    }

    return this.prisma.$transaction(async (transaction) => {
      const notification = await transaction.notification.findFirst({
        where: {
          id: notificationId,
          recipientId: user.id,
          ...(this.safety ? { suppressedAt: null } : {}),
        },
        select: { id: true, readAt: true },
      });
      if (!notification) {
        throw this.notFound();
      }
      let readAt = notification.readAt;
      if (!readAt) {
        readAt = new Date();
        await transaction.notification.updateMany({
          where: {
            id: notificationId,
            recipientId: user.id,
            readAt: null,
            ...(this.safety ? { suppressedAt: null } : {}),
          },
          data: { readAt },
        });
      }
      return {
        id: notification.id,
        readAt: readAt.toISOString(),
        unreadCount: await transaction.notification.count({
          where: {
            recipientId: user.id,
            readAt: null,
            ...(this.safety ? { suppressedAt: null } : {}),
          },
        }),
      };
    });
  }

  async readAll(
    sessionId: string | undefined,
  ): Promise<ReadAllNotificationsResult> {
    const user = await this.requireUser(sessionId);
    return this.prisma.$transaction(async (transaction) => {
      const result = await transaction.notification.updateMany({
        where: {
          recipientId: user.id,
          readAt: null,
          ...(this.safety ? { suppressedAt: null } : {}),
        },
        data: { readAt: new Date() },
      });
      return {
        updatedCount: result.count,
        unreadCount: await transaction.notification.count({
          where: {
            recipientId: user.id,
            readAt: null,
            ...(this.safety ? { suppressedAt: null } : {}),
          },
        }),
      };
    });
  }

  private toItem(notification: {
    id: string;
    type: NotificationType;
    createdAt: Date;
    readAt: Date | null;
    actor: {
      id: string;
      nickname: string;
      littleBlueBookId: string;
      avatarObjectKey: string | null;
    } | null;
    note: {
      id: string;
      title: string;
      contentType: 'IMAGE' | 'VIDEO';
      images: Array<{
        objectKey: string;
        width: number;
        height: number;
      }>;
      video: {
        coverObjectKey: string;
        coverWidth: number;
        coverHeight: number;
      } | null;
    } | null;
    comment: {
      id: string;
      rootCommentId: string | null;
      content: string;
      deletedAt: Date | null;
      moderationStatus: 'VISIBLE' | 'HIDDEN';
    } | null;
  }): NotificationItem {
    const actorNickname = notification.actor?.nickname ?? '该用户已注销';
    const image =
      notification.note?.contentType === 'VIDEO' && notification.note.video
        ? {
            objectKey: notification.note.video.coverObjectKey,
            width: notification.note.video.coverWidth,
            height: notification.note.video.coverHeight,
          }
        : notification.note?.images[0];
    return {
      id: notification.id,
      type: notification.type,
      action: ACTIONS[notification.type],
      createdAt: notification.createdAt.toISOString(),
      readAt: notification.readAt?.toISOString() ?? null,
      actor: {
        id: notification.actor?.id ?? null,
        nickname: actorNickname,
        littleBlueBookId: notification.actor?.littleBlueBookId ?? null,
        avatar: publicAvatar(
          actorNickname,
          notification.actor?.avatarObjectKey ?? null,
          this.media,
        ),
      },
      note: notification.note
        ? {
            id: notification.note.id,
            title: notification.note.title,
            thumbnail: image
              ? {
                  url: this.media.publicUrl(image.objectKey),
                  width: image.width,
                  height: image.height,
                }
              : null,
          }
        : null,
      comment:
        notification.type === 'NOTE_COMMENTED' ||
        notification.type === 'COMMENT_REPLIED' ||
        notification.type === 'COMMENT_LIKED'
          ? {
              id: notification.comment?.id ?? null,
              rootCommentId:
                notification.comment?.rootCommentId ??
                notification.comment?.id ??
                null,
              preview:
                notification.comment &&
                !notification.comment.deletedAt &&
                notification.comment.moderationStatus !== 'HIDDEN'
                  ? Array.from(notification.comment.content)
                      .slice(0, 200)
                      .join('')
                  : null,
              deleted:
                notification.comment === null ||
                Boolean(notification.comment.deletedAt) ||
                notification.comment?.moderationStatus === 'HIDDEN',
            }
          : null,
    };
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

  private encodeCursor(cursor: NotificationCursor): string {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private decodeCursor(
    cursor: string | undefined,
    recipientId: string,
    tab: NotificationTab,
  ): NotificationCursor | null {
    if (!cursor) return null;
    try {
      if (cursor.length > 512) throw new Error('too long');
      const parsed = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as Partial<NotificationCursor>;
      if (
        typeof parsed.createdAt !== 'string' ||
        Number.isNaN(Date.parse(parsed.createdAt)) ||
        typeof parsed.id !== 'string' ||
        !UUID_PATTERN.test(parsed.id) ||
        parsed.recipientId !== recipientId ||
        parsed.tab !== tab
      ) {
        throw new Error('invalid');
      }
      return {
        createdAt: parsed.createdAt,
        id: parsed.id,
        recipientId: parsed.recipientId,
        tab: parsed.tab,
      };
    } catch {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'CURSOR_INVALID',
        '分页游标无效',
      );
    }
  }

  private invalidPagination(): ApiException {
    return new ApiException(
      HttpStatus.BAD_REQUEST,
      'PAGINATION_INVALID',
      '分页参数无效',
    );
  }

  private notFound(): ApiException {
    return new ApiException(
      HttpStatus.NOT_FOUND,
      'NOTIFICATION_NOT_FOUND',
      '通知不存在',
    );
  }
}
