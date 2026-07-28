import { Buffer } from 'node:buffer';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';

import { AuthService } from '../auth/auth.service.js';
import { ChannelsService } from '../channels/channels.service.js';
import { ApiException } from '../common/api-exception.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { ImageValidatorService } from '../media/image-validator.service.js';
import {
  MEDIA_STORAGE,
  type MediaStorage,
  type UploadedMemoryFile,
} from '../media/media.types.js';
import { RedisService } from '../redis/redis.service.js';
import type {
  NoteCard,
  NoteDetail,
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
    @Inject(RedisService) private readonly redis: RedisService,
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
    cursor: string | undefined,
    limit: number,
  ): Promise<NotePage> {
    return this.list({ scope: 'recommendations' }, cursor, limit);
  }

  async channel(
    channelCode: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<NotePage> {
    const channel = await this.channels.requirePublic(channelCode);
    return this.list(
      {
        channelId: channel.id,
        scope: `channel:${channel.code}`,
      },
      cursor,
      limit,
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
    );
  }

  async detail(noteId: string): Promise<NoteDetail> {
    if (!UUID_PATTERN.test(noteId)) {
      throw this.notFound();
    }
    const note = await this.prisma.note.findUnique({
      where: { id: noteId },
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
        author: { select: { nickname: true } },
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
      },
    });
    if (!note || note.images.length < 1) {
      throw this.notFound();
    }

    return {
      id: note.id,
      title: note.title,
      content: note.content,
      createdAt: note.createdAt.toISOString(),
      author: this.author(note.author.nickname),
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
      interactions: { likes: 0, favorites: 0, comments: 0 },
    };
  }

  private async list(
    filter: {
      authorId?: string;
      channelId?: string;
      scope: string;
    },
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
        ...(filter.authorId ? { authorId: filter.authorId } : {}),
        ...(filter.channelId ? { channelId: filter.channelId } : {}),
        ...cursorWhere,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1,
      select: {
        id: true,
        title: true,
        createdAt: true,
        author: { select: { nickname: true } },
        images: {
          where: { order: 0 },
          take: 1,
          select: {
            objectKey: true,
            width: true,
            height: true,
          },
        },
      },
    });
    const hasMore = notes.length > pageSize;
    const pageItems = hasMore ? notes.slice(0, pageSize) : notes;
    const last = pageItems.at(-1);

    return {
      items: pageItems.map((note) => this.toCard(note)),
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

  private toCard(note: {
    id: string;
    title: string;
    author: { nickname: string };
    images: Array<{
      objectKey: string;
      width: number;
      height: number;
    }>;
  }): NoteCard {
    const cover = note.images[0];
    if (!cover) {
      throw new ApiException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'NOTE_MEDIA_INVALID',
        '笔记暂时无法显示',
      );
    }
    return {
      id: note.id,
      title: note.title,
      cover: {
        url: this.media.publicUrl(cover.objectKey),
        width: cover.width,
        height: cover.height,
      },
      author: this.author(note.author.nickname),
      likes: 0,
    };
  }

  private author(nickname: string) {
    return {
      nickname,
      avatar: {
        type: 'initial' as const,
        value: Array.from(nickname.trim())[0] ?? '蓝',
      },
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
