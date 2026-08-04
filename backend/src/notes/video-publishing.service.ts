import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import Busboy from 'busboy';
import type { Request } from 'express';

import { ChannelsService } from '../channels/channels.service.js';
import { ApiException } from '../common/api-exception.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { ImageValidatorService } from '../media/image-validator.service.js';
import {
  MAX_VIDEO_BYTES,
  Mp4ValidatorService,
} from '../media/mp4-validator.service.js';
import {
  MEDIA_STORAGE,
  type MediaStorage,
  type UploadedMemoryFile,
} from '../media/media.types.js';
import type { PublishResult } from './notes.types.js';
import {
  VideoUploadReservationService,
  type VideoUploadReservation,
} from './video-upload-reservation.service.js';

type VideoMultipart = {
  fields: {
    title: string;
    content: string;
    channelCode: string;
    clientRequestId: string;
  };
  temporaryKey: string;
  videoByteSize: number;
  cover: UploadedMemoryFile;
};

const MAX_COVER_BYTES = 10 * 1024 * 1024;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHANNEL_CODE_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;
const REQUIRED_FIELDS = [
  'title',
  'content',
  'channelCode',
  'clientRequestId',
] as const;

@Injectable()
export class VideoPublishingService {
  constructor(
    @Inject(ChannelsService) private readonly channels: ChannelsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ImageValidatorService)
    private readonly imageValidator: ImageValidatorService,
    @Inject(Mp4ValidatorService)
    private readonly mp4Validator: Mp4ValidatorService,
    @Inject(MEDIA_STORAGE) private readonly media: MediaStorage,
    @Inject(VideoUploadReservationService)
    private readonly reservations: VideoUploadReservationService,
  ) {}

  async publish(
    request: Request,
    reservation: VideoUploadReservation,
  ): Promise<PublishResult> {
    const stopHeartbeat = this.reservations.startHeartbeat(reservation);
    let parsed: VideoMultipart | null = null;
    let videoObjectKey: string | null = null;
    let coverObjectKey: string | null = null;
    try {
      parsed = await this.parseMultipart(request);
      const fields = this.validateFields(parsed.fields);
      const existing = await this.prisma.note.findUnique({
        where: {
          authorId_clientRequestId: {
            authorId: reservation.userId,
            clientRequestId: fields.clientRequestId,
          },
        },
        select: { id: true, createdAt: true },
      });
      if (existing) {
        return { id: existing.id, createdAt: existing.createdAt.toISOString() };
      }

      const channel = await this.channels.requirePublishable(
        fields.channelCode,
      );
      const video = await this.media.withTemporaryFile(
        parsed.temporaryKey,
        (filePath) =>
          this.mp4Validator.validate(filePath, parsed!.videoByteSize),
      );
      const [cover] = await this.imageValidator.validate([parsed.cover]);
      if (!cover) throw this.invalidMultipart('视频封面无效');

      coverObjectKey = this.media.createObjectKey(cover.extension);
      await this.media.preparePendingObject(coverObjectKey);
      await this.media.saveAt(coverObjectKey, cover);
      videoObjectKey = this.media.createObjectKey('mp4');
      await this.media.preparePendingObject(videoObjectKey);
      await this.media.finalizeTemporaryVideo(
        parsed.temporaryKey,
        videoObjectKey,
      );

      try {
        const note = await this.prisma.note.create({
          data: {
            authorId: reservation.userId,
            channelId: channel.id,
            title: fields.title,
            content: fields.content,
            clientRequestId: fields.clientRequestId,
            contentType: 'VIDEO',
            video: {
              create: {
                videoObjectKey,
                videoMimeType: video.mimeType,
                videoByteSize: video.byteSize,
                width: video.width,
                height: video.height,
                durationMs: video.durationMs,
                videoCodec: video.videoCodec,
                audioCodec: video.audioCodec,
                coverObjectKey,
                coverMimeType: cover.mimeType,
                coverByteSize: cover.byteSize,
                coverWidth: cover.width,
                coverHeight: cover.height,
              },
            },
          },
          select: { id: true, createdAt: true },
        });
        const assignedObjectKeys = [videoObjectKey, coverObjectKey];
        await this.media
          .completePendingObjects(assignedObjectKeys)
          .catch(() => undefined);
        videoObjectKey = null;
        coverObjectKey = null;
        return { id: note.id, createdAt: note.createdAt.toISOString() };
      } catch (error) {
        if (this.isIdempotencyConflict(error)) {
          const duplicate = await this.prisma.note.findUnique({
            where: {
              authorId_clientRequestId: {
                authorId: reservation.userId,
                clientRequestId: fields.clientRequestId,
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
    } finally {
      stopHeartbeat();
      if (parsed?.temporaryKey) {
        await this.media
          .deleteTemporary(parsed.temporaryKey)
          .catch(() => undefined);
      }
      await this.media
        .deletePendingObjects(
          [videoObjectKey, coverObjectKey].filter((key): key is string =>
            Boolean(key),
          ),
        )
        .catch(() => undefined);
    }
  }

  async releaseReservation(reservation: VideoUploadReservation): Promise<void> {
    await this.reservations.release(reservation);
  }

  private parseMultipart(request: Request): Promise<VideoMultipart> {
    return new Promise((resolve, reject) => {
      const fields = new Map<string, string>();
      let videoPromise: Promise<{
        temporaryKey: string;
        byteSize: number;
      }> | null = null;
      let coverPromise: Promise<UploadedMemoryFile> | null = null;
      let settled = false;
      let busboy: ReturnType<typeof Busboy>;

      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(
          error instanceof ApiException
            ? error
            : this.invalidMultipart('视频上传数据不符合要求'),
        );
      };

      try {
        busboy = Busboy({
          headers: request.headers,
          limits: {
            fields: 4,
            files: 2,
            // Busboy emits `partsLimit` when the counter reaches the configured
            // value, so use one past the six accepted parts (4 fields + 2 files).
            parts: 7,
            fieldSize: 16 * 1024,
            fileSize: MAX_VIDEO_BYTES + 1,
          },
        });
      } catch {
        reject(this.invalidMultipart('视频上传数据不符合要求'));
        return;
      }

      busboy.on('field', (name, value, info) => {
        if (
          info.nameTruncated ||
          info.valueTruncated ||
          !REQUIRED_FIELDS.includes(name as (typeof REQUIRED_FIELDS)[number]) ||
          fields.has(name)
        ) {
          fail(this.invalidMultipart('发布字段数量或内容无效'));
          return;
        }
        fields.set(name, value);
      });

      busboy.on('file', (name, file, info) => {
        if (name === 'video' && !videoPromise) {
          videoPromise = this.streamVideo(file).then(async (value) => {
            if (settled) {
              await this.media
                .deleteTemporary(value.temporaryKey)
                .catch(() => undefined);
            }
            return value;
          });
          void videoPromise.catch(fail);
          return;
        }
        if (name === 'cover' && !coverPromise) {
          coverPromise = this.readCover(file, info.filename, info.mimeType);
          void coverPromise.catch(fail);
          return;
        }
        file.resume();
        fail(this.invalidMultipart('只能上传一个视频和一张封面'));
      });
      busboy.once('partsLimit', () =>
        fail(this.invalidMultipart('上传字段过多')),
      );
      busboy.once('filesLimit', () =>
        fail(this.invalidMultipart('上传文件过多')),
      );
      busboy.once('fieldsLimit', () =>
        fail(this.invalidMultipart('发布字段过多')),
      );
      busboy.once('error', fail);
      request.once('aborted', () =>
        fail(this.invalidMultipart('视频上传已取消')),
      );
      busboy.once('finish', () => {
        void (async () => {
          if (settled) return;
          if (
            fields.size !== REQUIRED_FIELDS.length ||
            !videoPromise ||
            !coverPromise
          ) {
            throw this.invalidMultipart('请完整填写发布信息并提供视频封面');
          }
          const [video, cover] = await Promise.all([
            videoPromise,
            coverPromise,
          ]);
          if (settled) {
            await this.media
              .deleteTemporary(video.temporaryKey)
              .catch(() => undefined);
            return;
          }
          settled = true;
          resolve({
            fields: Object.fromEntries(fields) as VideoMultipart['fields'],
            temporaryKey: video.temporaryKey,
            videoByteSize: video.byteSize,
            cover,
          });
        })().catch(fail);
      });
      request.pipe(busboy);
    });
  }

  private async streamVideo(
    source: NodeJS.ReadableStream & { truncated?: boolean },
  ): Promise<{ temporaryKey: string; byteSize: number }> {
    const temporary = await this.media.createTemporaryVideo();
    let byteSize = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        byteSize += chunk.length;
        if (byteSize > MAX_VIDEO_BYTES) {
          callback(new Error('VIDEO_TOO_LARGE'));
          return;
        }
        callback(null, chunk);
      },
    });
    try {
      await pipeline(source, limiter, temporary.stream);
      if (source.truncated || byteSize < 1) {
        throw new Error(source.truncated ? 'VIDEO_TOO_LARGE' : 'VIDEO_EMPTY');
      }
      this.media.markTemporaryComplete(temporary.temporaryKey);
      return { temporaryKey: temporary.temporaryKey, byteSize };
    } catch (error) {
      await this.media
        .deleteTemporary(temporary.temporaryKey)
        .catch(() => undefined);
      if (error instanceof Error && error.message === 'VIDEO_TOO_LARGE') {
        throw new ApiException(
          HttpStatus.PAYLOAD_TOO_LARGE,
          'VIDEO_UPLOAD_TOO_LARGE',
          '视频不能超过100 MiB',
        );
      }
      throw this.invalidMultipart('视频上传中断或文件为空');
    }
  }

  private async readCover(
    source: AsyncIterable<Buffer> & { truncated?: boolean },
    filename: string,
    mimetype: string,
  ): Promise<UploadedMemoryFile> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of source) {
      size += chunk.length;
      if (size > MAX_COVER_BYTES) {
        throw new ApiException(
          HttpStatus.PAYLOAD_TOO_LARGE,
          'VIDEO_COVER_TOO_LARGE',
          '视频封面不能超过10 MiB',
        );
      }
      chunks.push(chunk);
    }
    return {
      buffer: Buffer.concat(chunks),
      size,
      originalname: filename,
      mimetype,
    };
  }

  private validateFields(
    fields: VideoMultipart['fields'],
  ): VideoMultipart['fields'] {
    const title = this.validateText(fields.title, 50, '标题');
    const content = this.validateText(fields.content, 2000, '正文');
    if (!CHANNEL_CODE_PATTERN.test(fields.channelCode)) {
      throw this.invalidMultipart('请选择有效频道');
    }
    if (!UUID_V4_PATTERN.test(fields.clientRequestId)) {
      throw this.invalidMultipart('发布请求标识无效');
    }
    return { ...fields, title, content };
  }

  private validateText(value: string, maximum: number, label: string): string {
    const normalized = value.trim();
    const length = Array.from(normalized).length;
    if (length < 1 || length > maximum) {
      throw this.invalidMultipart(`${label}需为1～${maximum}个字符`);
    }
    return normalized;
  }

  private invalidMultipart(message: string): ApiException {
    return new ApiException(
      HttpStatus.BAD_REQUEST,
      'VIDEO_MULTIPART_INVALID',
      message,
    );
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
}
