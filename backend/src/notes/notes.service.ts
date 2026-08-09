import { Buffer } from 'node:buffer';
import { createHmac, randomBytes } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthService } from '../auth/auth.service.js';
import { ChannelsService } from '../channels/channels.service.js';
import { ApiException } from '../common/api-exception.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { ImageValidatorService } from '../media/image-validator.service.js';
import { PendingMediaCleanupService } from '../media/pending-media-cleanup.service.js';
import {
  MEDIA_STORAGE,
  type MediaStorage,
  type UploadedMemoryFile,
} from '../media/media.types.js';
import { RedisService } from '../redis/redis.service.js';
import type { AppEnvironment } from '../config/environment.js';
import { publicAvatar } from '../profile/profile-avatar.js';
import type {
  NoteCard,
  NoteDetail,
  EditableNote,
  NoteDeletionResult,
  NoteMutationResult,
  NotePage,
  PublishResult,
} from './notes.types.js';

type CursorValue = {
  createdAt: string;
  id: string;
  scope: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESERVE_PUBLISH_RATE_SCRIPT = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current >= tonumber(ARGV[1]) then
  return 0
end
current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end
return 1
`;

@Injectable()
export class NotesService {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ChannelsService) private readonly channels: ChannelsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ImageValidatorService)
    private readonly imageValidator: ImageValidatorService,
    @Inject(MEDIA_STORAGE) private readonly media: MediaStorage,
    @Inject(PendingMediaCleanupService)
    private readonly mediaCleanup: PendingMediaCleanupService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(ConfigService)
    private readonly config: ConfigService<AppEnvironment, true>,
  ) {}

  async publish(
    sessionId: string | undefined,
    input: {
      title: string;
      content: string;
      channelCode: string;
      clientRequestId: string;
    },
    files: UploadedMemoryFile[],
  ): Promise<PublishResult> {
    const user = await this.requireUser(sessionId);
    const existing = await this.prisma.note.findUnique({
      where: {
        authorId_clientRequestId: {
          authorId: user.id,
          clientRequestId: input.clientRequestId,
        },
      },
      select: { id: true, createdAt: true },
    });
    if (existing) {
      return {
        id: existing.id,
        createdAt: existing.createdAt.toISOString(),
      };
    }
    const title = this.validateText(input.title, 50, '标题', 'TITLE_INVALID');
    const content = this.validateText(
      input.content,
      2000,
      '正文',
      'CONTENT_INVALID',
    );
    const channel = await this.channels.requirePublishable(input.channelCode);
    const reservation = await this.redis.eval(
      RESERVE_PUBLISH_RATE_SCRIPT,
      [`notes:publish:rate:${user.id}`],
      ['20', '60'],
    );
    if (Number(reservation) !== 1) {
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        'RATE_LIMITED',
        '发布过于频繁，请稍后再试',
      );
    }

    const validatedImages = await this.imageValidator.validate(files);
    const storedImages = await this.media.save(validatedImages);

    try {
      const note = await this.prisma.note.create({
        data: {
          authorId: user.id,
          channelId: channel.id,
          title,
          content,
          clientRequestId: input.clientRequestId,
          contentType: 'IMAGE',
          images: {
            create: storedImages.map((image, order) => ({
              objectKey: image.objectKey,
              mimeType: image.mimeType,
              byteSize: image.byteSize,
              width: image.width,
              height: image.height,
              order,
            })),
          },
        },
        select: { id: true, createdAt: true },
      });
      return { id: note.id, createdAt: note.createdAt.toISOString() };
    } catch (error) {
      await this.media.deleteMany(storedImages.map((image) => image.objectKey));
      if (this.isIdempotencyConflict(error)) {
        const duplicate = await this.prisma.note.findUnique({
          where: {
            authorId_clientRequestId: {
              authorId: user.id,
              clientRequestId: input.clientRequestId,
            },
          },
          select: { id: true, createdAt: true },
        });
        if (duplicate) {
          return {
            id: duplicate.id,
            createdAt: duplicate.createdAt.toISOString(),
          };
        }
      }
      throw error;
    }
  }

  async recommendations(
    sessionId: string | undefined,
    cursor: string | undefined,
    limit: number,
  ): Promise<NotePage> {
    const viewer = await this.auth.currentUser(sessionId);
    return this.list({ scope: 'recommendations' }, cursor, limit, viewer?.id);
  }

  async videos(
    sessionId: string | undefined,
    cursor: string | undefined,
    limit: number,
  ): Promise<NotePage> {
    const viewer = await this.auth.currentUser(sessionId);
    return this.list(
      { contentType: 'VIDEO', scope: 'videos' },
      cursor,
      limit,
      viewer?.id,
    );
  }

  async channel(
    sessionId: string | undefined,
    channelCode: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<NotePage> {
    const channel = await this.channels.requirePublic(channelCode);
    const viewer = await this.auth.currentUser(sessionId);
    return this.list(
      {
        channelId: channel.id,
        scope: `channel:${channel.code}`,
      },
      cursor,
      limit,
      viewer?.id,
    );
  }

  async mine(
    sessionId: string | undefined,
    cursor: string | undefined,
    limit: number,
  ): Promise<NotePage> {
    const user = await this.requireUser(sessionId);
    return this.list(
      { authorId: user.id, scope: `mine:${user.id}` },
      cursor,
      limit,
      user.id,
    );
  }

  async favorites(
    sessionId: string | undefined,
    cursor: string | undefined,
    limit: number,
  ): Promise<NotePage> {
    const user = await this.requireUser(sessionId);
    return this.interactionList('favorites', user.id, cursor, limit);
  }

  async liked(
    sessionId: string | undefined,
    cursor: string | undefined,
    limit: number,
  ): Promise<NotePage> {
    const user = await this.requireUser(sessionId);
    return this.interactionList('likes', user.id, cursor, limit);
  }

  async editable(
    sessionId: string | undefined,
    noteId: string,
  ): Promise<EditableNote> {
    const user = await this.requireUser(sessionId);
    if (sessionId) await this.auth.assertWriteAllowed(sessionId);
    if (!UUID_PATTERN.test(noteId)) throw this.notFound();
    const note = await this.prisma.note.findFirst({
      where: { id: noteId, authorId: user.id },
      select: {
        id: true,
        contentType: true,
        title: true,
        content: true,
        contentVersion: true,
        channel: {
          select: {
            code: true,
            name: true,
            enabled: true,
            isPublic: true,
            publishable: true,
          },
        },
        images: {
          orderBy: { order: 'asc' },
          select: { id: true, objectKey: true, width: true, height: true },
        },
        video: {
          select: {
            videoObjectKey: true,
            coverObjectKey: true,
            width: true,
            height: true,
            durationMs: true,
          },
        },
      },
    });
    if (!note) throw this.notFound();
    return {
      id: note.id,
      contentType: note.contentType,
      title: note.title,
      content: note.content,
      contentVersion: note.contentVersion,
      channel: {
        code: note.channel.code,
        name: note.channel.name,
        publishable:
          note.channel.enabled &&
          note.channel.isPublic &&
          note.channel.publishable,
      },
      images: note.images.map((image) => ({
        id: image.id,
        url: this.media.publicUrl(image.objectKey),
        width: image.width,
        height: image.height,
      })),
      video: note.video
        ? {
            url: this.media.publicUrl(note.video.videoObjectKey),
            posterUrl: this.media.publicUrl(note.video.coverObjectKey),
            width: note.video.width,
            height: note.video.height,
            durationMs: note.video.durationMs,
          }
        : null,
    };
  }

  async update(
    sessionId: string | undefined,
    noteId: string,
    input: {
      title: string;
      content: string;
      channelCode: string;
      contentType: 'IMAGE' | 'VIDEO';
      expectedContentVersion: number;
      imageOrder?: string;
    },
    files: { images?: UploadedMemoryFile[]; cover?: UploadedMemoryFile[] },
  ): Promise<NoteMutationResult> {
    const user = await this.requireUser(sessionId);
    if (sessionId) await this.auth.assertWriteAllowed(sessionId);
    if (!UUID_PATTERN.test(noteId)) throw this.notFound();
    const current = await this.prisma.note.findFirst({
      where: { id: noteId, authorId: user.id },
      select: {
        id: true,
        contentType: true,
        contentVersion: true,
        images: {
          select: {
            id: true,
            objectKey: true,
            mimeType: true,
            byteSize: true,
            width: true,
            height: true,
          },
        },
        video: {
          select: {
            coverObjectKey: true,
          },
        },
      },
    });
    if (!current) throw this.notFound();
    if (current.contentType !== input.contentType) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'NOTE_TYPE_IMMUTABLE',
        '笔记类型不可修改',
      );
    }
    const title = this.validateText(input.title, 50, '标题', 'TITLE_INVALID');
    const content = this.validateText(
      input.content,
      2000,
      '正文',
      'CONTENT_INVALID',
    );
    const channel = await this.channels.requirePublishable(input.channelCode);
    const imageFiles = files.images ?? [];
    const coverFiles = files.cover ?? [];
    if (coverFiles.length > 1 || imageFiles.length > 9) {
      throw this.invalidEditMedia();
    }

    const newStored = await this.storePendingImages(
      input.contentType === 'IMAGE' ? imageFiles : coverFiles,
    );
    const newObjectKeys = newStored.map((item) => item.objectKey);
    const cleanupObjectKeys: string[] = [];
    const editedAt = new Date();

    try {
      if (input.contentType === 'IMAGE') {
        if (coverFiles.length > 0) throw this.invalidEditMedia();
        const finalImages = this.finalImageOrder(
          input.imageOrder,
          current.images,
          newStored,
        );
        const retained = new Set(finalImages.map((image) => image.objectKey));
        cleanupObjectKeys.push(
          ...current.images
            .filter((image) => !retained.has(image.objectKey))
            .map((image) => image.objectKey),
        );

        await this.prisma.$transaction(async (transaction) => {
          await this.updateContentVersion(
            transaction,
            noteId,
            user.id,
            input.expectedContentVersion,
            { title, content, channelId: channel.id, editedAt },
          );
          await transaction.noteImage.deleteMany({ where: { noteId } });
          await transaction.noteImage.createMany({
            data: finalImages.map((image, order) => ({
              noteId,
              objectKey: image.objectKey,
              mimeType: image.mimeType,
              byteSize: image.byteSize,
              width: image.width,
              height: image.height,
              order,
            })),
          });
          await this.queueMediaCleanup(transaction, cleanupObjectKeys);
        });
      } else {
        if (imageFiles.length > 0 || input.imageOrder !== undefined) {
          throw this.invalidEditMedia();
        }
        if (!current.video) throw this.notFound();
        const cover = newStored[0];
        if (cover) cleanupObjectKeys.push(current.video.coverObjectKey);
        await this.prisma.$transaction(async (transaction) => {
          await this.updateContentVersion(
            transaction,
            noteId,
            user.id,
            input.expectedContentVersion,
            { title, content, channelId: channel.id, editedAt },
          );
          if (cover) {
            await transaction.noteVideo.update({
              where: { noteId },
              data: {
                coverObjectKey: cover.objectKey,
                coverMimeType: cover.mimeType,
                coverByteSize: cover.byteSize,
                coverWidth: cover.width,
                coverHeight: cover.height,
              },
            });
          }
          await this.queueMediaCleanup(transaction, cleanupObjectKeys);
        });
      }

      await this.media
        .completePendingObjects(newObjectKeys)
        .catch(() => undefined);
      await this.mediaCleanup.cleanupQueuedObjects(cleanupObjectKeys);
      return {
        id: noteId,
        contentVersion: input.expectedContentVersion + 1,
        editedAt: editedAt.toISOString(),
      };
    } catch (error) {
      await this.media
        .deletePendingObjects(newObjectKeys)
        .catch(() => undefined);
      throw error;
    }
  }

  async remove(
    sessionId: string | undefined,
    noteId: string,
    expectedContentVersion: number,
  ): Promise<NoteDeletionResult> {
    const user = await this.requireUser(sessionId);
    if (sessionId) await this.auth.assertWriteAllowed(sessionId);
    if (!UUID_PATTERN.test(noteId)) throw this.notFound();
    const objectKeys = await this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<
        Array<{
          authorId: string;
          contentVersion: number;
        }>
      >(Prisma.sql`
        SELECT "authorId", "contentVersion"
        FROM "notes"
        WHERE "id" = ${noteId}::uuid
        FOR UPDATE
      `);
      const locked = rows[0];
      if (!locked || locked.authorId !== user.id) throw this.notFound();
      if (locked.contentVersion !== expectedContentVersion) {
        throw this.versionConflict();
      }
      const note = await transaction.note.findUnique({
        where: { id: noteId },
        select: {
          images: { select: { objectKey: true } },
          video: {
            select: { videoObjectKey: true, coverObjectKey: true },
          },
        },
      });
      if (!note) throw this.notFound();
      const keys = [
        ...note.images.map((image) => image.objectKey),
        ...(note.video
          ? [note.video.videoObjectKey, note.video.coverObjectKey]
          : []),
      ];
      await this.queueMediaCleanup(transaction, keys);
      await transaction.notification.deleteMany({
        where: {
          OR: [{ noteId }, { comment: { noteId } }],
        },
      });
      await transaction.noteComment.updateMany({
        where: { noteId },
        data: { rootCommentId: null, replyToId: null, replyToAuthorId: null },
      });
      await transaction.note.delete({ where: { id: noteId } });
      return keys;
    });
    await this.mediaCleanup.cleanupQueuedObjects(objectKeys);
    return { id: noteId, deleted: true };
  }

  async detail(
    sessionId: string | undefined,
    noteId: string,
  ): Promise<NoteDetail> {
    if (!UUID_PATTERN.test(noteId)) {
      throw this.notFound();
    }
    const viewer = await this.auth.currentUser(sessionId);
    const viewerId = viewer?.id ?? '00000000-0000-0000-0000-000000000000';
    const note = await this.prisma.note.findUnique({
      where: { id: noteId },
      select: {
        id: true,
        contentType: true,
        title: true,
        content: true,
        createdAt: true,
        editedAt: true,
        contentVersion: true,
        viewCount: true,
        author: {
          select: {
            id: true,
            nickname: true,
            avatarObjectKey: true,
            ageRestrictedAt: true,
            followers: {
              where: { followerId: viewerId },
              take: 1,
              select: { followerId: true },
            },
          },
        },
        channel: {
          select: {
            code: true,
            name: true,
            enabled: true,
            isPublic: true,
          },
        },
        images: {
          orderBy: { order: 'asc' },
          select: {
            objectKey: true,
            width: true,
            height: true,
          },
        },
        video: {
          select: {
            videoObjectKey: true,
            coverObjectKey: true,
            width: true,
            height: true,
            durationMs: true,
          },
        },
        likes: {
          where: { userId: viewerId },
          take: 1,
          select: { userId: true },
        },
        favorites: {
          where: { userId: viewerId },
          take: 1,
          select: { userId: true },
        },
        _count: {
          select: {
            likes: true,
            favorites: true,
            comments: { where: { deletedAt: null } },
          },
        },
      },
    });
    if (
      !note ||
      note.author.ageRestrictedAt ||
      (note.contentType === 'IMAGE' && note.images.length < 1) ||
      (note.contentType === 'VIDEO' && !note.video)
    ) {
      throw this.notFound();
    }

    return {
      id: note.id,
      contentType: note.contentType,
      title: note.title,
      content: note.content,
      createdAt: note.createdAt.toISOString(),
      editedAt: note.editedAt?.toISOString() ?? null,
      author: this.author(
        note.author.id,
        note.author.nickname,
        note.author.avatarObjectKey,
      ),
      channel: note.channel.isPublic
        ? {
            code: note.channel.code,
            name: note.channel.name,
            navigable: note.channel.enabled,
          }
        : null,
      images: note.images.map((image) => ({
        url: this.media.publicUrl(image.objectKey),
        width: image.width,
        height: image.height,
      })),
      video:
        note.contentType === 'VIDEO' && note.video
          ? {
              url: this.media.publicUrl(note.video.videoObjectKey),
              posterUrl: this.media.publicUrl(note.video.coverObjectKey),
              width: note.video.width,
              height: note.video.height,
              durationMs: note.video.durationMs,
            }
          : null,
      interactions: {
        likes: note._count.likes,
        favorites: note._count.favorites,
        comments: note._count.comments,
        views: note.viewCount,
      },
      viewer: {
        authenticated: Boolean(viewer),
        isAuthor: viewer?.id === note.author.id,
        liked: note.likes.length > 0,
        favorited: note.favorites.length > 0,
        followingAuthor: note.author.followers.length > 0,
        canLike: viewer?.id !== note.author.id,
        canFollow: viewer?.id !== note.author.id,
      },
      management:
        viewer?.id === note.author.id
          ? { contentVersion: note.contentVersion }
          : null,
    };
  }

  async recordView(
    sessionId: string | undefined,
    noteId: string,
    visitorId: string | undefined,
  ): Promise<{
    counted: boolean;
    viewCount: number;
    visitorIdToSet: string | null;
    secure: boolean;
  }> {
    if (!UUID_PATTERN.test(noteId)) throw this.notFound();
    const viewer = await this.auth.currentUser(sessionId);
    const generatedVisitor =
      viewer || visitorId ? null : randomBytes(32).toString('base64url');
    const subjectValue = viewer?.id ?? visitorId ?? generatedVisitor!;
    const subjectType = viewer ? 'AUTHENTICATED' : 'ANONYMOUS';
    const subjectHash = createHmac(
      'sha256',
      this.config.getOrThrow('AUTH_CODE_HASH_SECRET'),
    )
      .update(`${subjectType}:${subjectValue}`)
      .digest('hex');
    const now = new Date();
    const cutoff = new Date(now.getTime() - 30 * 60_000);

    const result = await this.prisma.$transaction(async (transaction) => {
      const note = await transaction.note.findUnique({
        where: { id: noteId },
        select: { authorId: true, viewCount: true },
      });
      if (!note) throw this.notFound();
      if (viewer?.id === note.authorId) {
        return { counted: false, viewCount: note.viewCount };
      }
      const changed = await transaction.$queryRaw<Array<{ noteId: string }>>`
        INSERT INTO "note_view_subjects"
          ("noteId", "subjectType", "subjectHash", "lastViewedAt")
        VALUES (
          ${noteId}::uuid,
          CAST(${subjectType} AS "ViewSubjectType"),
          ${subjectHash},
          ${now}
        )
        ON CONFLICT ("noteId", "subjectType", "subjectHash")
        DO UPDATE SET "lastViewedAt" = EXCLUDED."lastViewedAt"
        WHERE "note_view_subjects"."lastViewedAt" <= ${cutoff}
        RETURNING "noteId"
      `;
      if (changed.length === 0) {
        const current = await transaction.note.findUnique({
          where: { id: noteId },
          select: { viewCount: true },
        });
        if (!current) throw this.notFound();
        return { counted: false, viewCount: current.viewCount };
      }
      const updated = await transaction.note.update({
        where: { id: noteId },
        data: { viewCount: { increment: 1 } },
        select: { viewCount: true },
      });
      return { counted: true, viewCount: updated.viewCount };
    });

    return {
      ...result,
      visitorIdToSet: generatedVisitor,
      secure: this.config.getOrThrow('COOKIE_SECURE'),
    };
  }

  private async list(
    filter: {
      authorId?: string;
      channelId?: string;
      contentType?: 'IMAGE' | 'VIDEO';
      scope: string;
    },
    cursorInput: string | undefined,
    limit: number,
    viewerId: string | undefined,
  ): Promise<NotePage> {
    const pageSize = Number(limit);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 20) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'PAGINATION_INVALID',
        '分页参数无效',
      );
    }
    const cursor = this.decodeCursor(cursorInput, filter.scope);
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
    const notes = await this.prisma.note.findMany({
      where: {
        author: { ageRestrictedAt: null },
        ...(filter.authorId ? { authorId: filter.authorId } : {}),
        ...(filter.channelId ? { channelId: filter.channelId } : {}),
        ...(filter.contentType ? { contentType: filter.contentType } : {}),
        ...cursorWhere,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1,
      select: {
        id: true,
        contentType: true,
        title: true,
        createdAt: true,
        viewCount: true,
        contentVersion: true,
        author: {
          select: { id: true, nickname: true, avatarObjectKey: true },
        },
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
            durationMs: true,
          },
        },
        likes: viewerId
          ? {
              where: { userId: viewerId },
              take: 1,
              select: { userId: true },
            }
          : false,
        _count: { select: { likes: true } },
      },
    });
    const hasMore = notes.length > pageSize;
    const pageItems = hasMore ? notes.slice(0, pageSize) : notes;
    const last = pageItems.at(-1);

    return {
      items: pageItems.map((note) =>
        this.toCard(
          note,
          viewerId,
          Boolean(filter.authorId && filter.authorId === viewerId),
        ),
      ),
      nextCursor:
        hasMore && last
          ? this.encodeCursor({
              createdAt: last.createdAt.toISOString(),
              id: last.id,
              scope: filter.scope,
            })
          : null,
    };
  }

  private async interactionList(
    kind: 'favorites' | 'likes',
    userId: string,
    cursorInput: string | undefined,
    limit: number,
  ): Promise<NotePage> {
    const pageSize = Number(limit);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 20) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'PAGINATION_INVALID',
        '分页参数无效',
      );
    }
    const scope = `${kind}:${userId}`;
    const cursor = this.decodeCursor(cursorInput, scope);
    const cursorWhere = cursor
      ? {
          OR: [
            { createdAt: { lt: new Date(cursor.createdAt) } },
            {
              createdAt: new Date(cursor.createdAt),
              noteId: { lt: cursor.id },
            },
          ],
        }
      : {};
    const select = {
      noteId: true,
      createdAt: true,
      note: {
        select: {
          id: true,
          contentType: true,
          title: true,
          viewCount: true,
          author: {
            select: { id: true, nickname: true, avatarObjectKey: true },
          },
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
              durationMs: true,
            },
          },
          likes: {
            where: { userId },
            take: 1,
            select: { userId: true },
          },
          _count: { select: { likes: true } },
        },
      },
    } satisfies Prisma.NoteLikeSelect;
    const visibleWhere = {
      userId,
      ...cursorWhere,
      note: { author: { ageRestrictedAt: null } },
    };
    const relations =
      kind === 'likes'
        ? await this.prisma.noteLike.findMany({
            where: visibleWhere,
            orderBy: [{ createdAt: 'desc' }, { noteId: 'desc' }],
            take: pageSize + 1,
            select,
          })
        : await this.prisma.noteFavorite.findMany({
            where: visibleWhere,
            orderBy: [{ createdAt: 'desc' }, { noteId: 'desc' }],
            take: pageSize + 1,
            select,
          });
    const hasMore = relations.length > pageSize;
    const pageItems = hasMore ? relations.slice(0, pageSize) : relations;
    const last = pageItems.at(-1);

    return {
      items: pageItems.map((relation) => this.toCard(relation.note, userId)),
      nextCursor:
        hasMore && last
          ? this.encodeCursor({
              createdAt: last.createdAt.toISOString(),
              id: last.noteId,
              scope,
            })
          : null,
    };
  }

  private toCard(
    note: {
      id: string;
      contentType: 'IMAGE' | 'VIDEO';
      title: string;
      author: {
        id: string;
        nickname: string;
        avatarObjectKey: string | null;
      };
      images: Array<{
        objectKey: string;
        width: number;
        height: number;
      }>;
      video: {
        coverObjectKey: string;
        coverWidth: number;
        coverHeight: number;
        durationMs: number;
      } | null;
      likes?: Array<{ userId: string }>;
      _count: { likes: number };
      viewCount: number;
      contentVersion?: number;
    },
    viewerId?: string,
    manageable = false,
  ): NoteCard {
    const imageCover = note.images[0];
    const cover =
      note.contentType === 'VIDEO' && note.video
        ? {
            objectKey: note.video.coverObjectKey,
            width: note.video.coverWidth,
            height: note.video.coverHeight,
          }
        : imageCover;
    if (!cover) {
      throw new ApiException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'NOTE_MEDIA_INVALID',
        '笔记暂时无法显示',
      );
    }
    return {
      id: note.id,
      contentType: note.contentType,
      title: note.title,
      cover: {
        url: this.media.publicUrl(cover.objectKey),
        width: cover.width,
        height: cover.height,
      },
      author: this.author(
        note.author.id,
        note.author.nickname,
        note.author.avatarObjectKey,
      ),
      likes: note._count.likes,
      liked: (note.likes?.length ?? 0) > 0,
      canLike: viewerId !== note.author.id,
      views: note.viewCount,
      videoDurationMs:
        note.contentType === 'VIDEO' ? (note.video?.durationMs ?? null) : null,
      ...(manageable && note.contentVersion
        ? { management: { contentVersion: note.contentVersion } }
        : {}),
    };
  }

  private async storePendingImages(files: UploadedMemoryFile[]) {
    if (files.length === 0) return [];
    const images = await this.imageValidator.validate(files);
    const stored: Array<{
      objectKey: string;
      byteSize: number;
      width: number;
      height: number;
      mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    }> = [];
    try {
      for (const image of images) {
        const objectKey = this.media.createObjectKey(image.extension);
        await this.media.preparePendingObject(objectKey);
        stored.push(await this.media.saveAt(objectKey, image));
      }
      return stored;
    } catch (error) {
      await this.media
        .deletePendingObjects(stored.map((image) => image.objectKey))
        .catch(() => undefined);
      throw error;
    }
  }

  private finalImageOrder(
    serialized: string | undefined,
    existing: Array<{
      id: string;
      objectKey: string;
      mimeType: string;
      byteSize: number;
      width: number;
      height: number;
    }>,
    added: Array<{
      objectKey: string;
      mimeType: string;
      byteSize: number;
      width: number;
      height: number;
    }>,
  ) {
    try {
      const order = JSON.parse(serialized ?? '') as Array<
        { kind: 'existing'; id: string } | { kind: 'new'; index: number }
      >;
      if (!Array.isArray(order) || order.length < 1 || order.length > 9) {
        throw new Error('invalid count');
      }
      const existingById = new Map(existing.map((image) => [image.id, image]));
      const usedExisting = new Set<string>();
      const usedNew = new Set<number>();
      const result = order.map((entry) => {
        if (entry.kind === 'existing' && UUID_PATTERN.test(entry.id)) {
          const image = existingById.get(entry.id);
          if (!image || usedExisting.has(entry.id)) throw new Error('invalid');
          usedExisting.add(entry.id);
          return image;
        }
        if (
          entry.kind === 'new' &&
          Number.isInteger(entry.index) &&
          entry.index >= 0 &&
          entry.index < added.length &&
          !usedNew.has(entry.index)
        ) {
          usedNew.add(entry.index);
          return added[entry.index]!;
        }
        throw new Error('invalid');
      });
      if (usedNew.size !== added.length) throw new Error('unused upload');
      return result;
    } catch {
      throw this.invalidEditMedia();
    }
  }

  private async updateContentVersion(
    transaction: Prisma.TransactionClient,
    noteId: string,
    authorId: string,
    expectedContentVersion: number,
    data: {
      title: string;
      content: string;
      channelId: string;
      editedAt: Date;
    },
  ): Promise<void> {
    const updated = await transaction.note.updateMany({
      where: { id: noteId, authorId, contentVersion: expectedContentVersion },
      data: { ...data, contentVersion: { increment: 1 } },
    });
    if (updated.count === 1) return;
    const stillExists = await transaction.note.findFirst({
      where: { id: noteId, authorId },
      select: { id: true },
    });
    if (!stillExists) throw this.notFound();
    throw this.versionConflict();
  }

  private async queueMediaCleanup(
    transaction: Prisma.TransactionClient,
    objectKeys: string[],
  ): Promise<void> {
    if (objectKeys.length === 0) return;
    await transaction.mediaCleanup.createMany({
      data: [...new Set(objectKeys)].map((objectKey) => ({ objectKey })),
      skipDuplicates: true,
    });
  }

  private invalidEditMedia(): ApiException {
    return new ApiException(
      HttpStatus.BAD_REQUEST,
      'NOTE_EDIT_MEDIA_INVALID',
      '笔记媒体数据无效',
    );
  }

  private versionConflict(): ApiException {
    return new ApiException(
      HttpStatus.CONFLICT,
      'NOTE_EDIT_CONFLICT',
      '笔记已在其他位置更新，请重新加载后再操作',
    );
  }

  private author(id: string, nickname: string, avatarObjectKey: string | null) {
    return {
      id,
      nickname,
      avatar: publicAvatar(nickname, avatarObjectKey, this.media),
    };
  }

  private validateText(
    value: string,
    maximum: number,
    label: string,
    code: string,
  ): string {
    const normalized = value.trim();
    const length = Array.from(normalized).length;
    if (length < 1 || length > maximum) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        code,
        `${label}需为1～${maximum}个字符`,
      );
    }
    return normalized;
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

  private encodeCursor(cursor: CursorValue): string {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private decodeCursor(
    cursor: string | undefined,
    expectedScope: string,
  ): CursorValue | null {
    if (!cursor) {
      return null;
    }
    try {
      if (cursor.length > 512) {
        throw new Error('too long');
      }
      const parsed = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as Partial<CursorValue>;
      if (
        typeof parsed.createdAt !== 'string' ||
        Number.isNaN(Date.parse(parsed.createdAt)) ||
        typeof parsed.id !== 'string' ||
        !UUID_PATTERN.test(parsed.id) ||
        parsed.scope !== expectedScope
      ) {
        throw new Error('invalid');
      }
      return {
        createdAt: parsed.createdAt,
        id: parsed.id,
        scope: parsed.scope,
      };
    } catch {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'CURSOR_INVALID',
        '分页游标无效',
      );
    }
  }

  private isIdempotencyConflict(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }
    const target = error.meta?.target;
    return Array.isArray(target)
      ? target.includes('clientRequestId')
      : String(target).includes('clientRequestId');
  }

  private notFound(): ApiException {
    return new ApiException(
      HttpStatus.NOT_FOUND,
      'NOTE_NOT_FOUND',
      '笔记不存在',
    );
  }
}
