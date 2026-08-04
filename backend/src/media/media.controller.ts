import {
  Controller,
  Get,
  Head,
  HttpStatus,
  Inject,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPartialContentResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { ApiException } from '../common/api-exception.js';
import { PrismaService } from '../database/prisma.service.js';
import { MEDIA_STORAGE, type MediaStorage } from './media.types.js';

const OBJECT_KEY_PATTERN = /^[0-9a-f]{48}\.(?:jpg|png|webp|mp4)$/;

@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Head(':objectKey')
  @ApiOperation({ summary: 'Read public media metadata without a body' })
  @ApiOkResponse({ description: 'Headers matching a complete GET response' })
  async head(
    @Param('objectKey') objectKey: string,
    @Res() response: Response,
  ): Promise<void> {
    const info = await this.requirePublicObject(objectKey);
    response
      .status(HttpStatus.OK)
      .set(this.headers(info.mimeType, info.byteSize))
      .end();
  }

  @Get(':objectKey')
  @ApiOperation({ summary: 'Read a public image or byte-range video object' })
  @ApiOkResponse({ description: 'The complete immutable media bytes' })
  @ApiPartialContentResponse({ description: 'One requested video byte range' })
  @ApiNotFoundResponse({ description: 'The media object does not exist' })
  async read(
    @Param('objectKey') objectKey: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const info = await this.requirePublicObject(objectKey);
    const isVideo = info.mimeType === 'video/mp4';
    const requestedRange = request.headers.range;
    if (!isVideo || !requestedRange) {
      response
        .status(HttpStatus.OK)
        .set(this.headers(info.mimeType, info.byteSize));
      await this.pipe(objectKey, response);
      return;
    }

    const range = this.parseRange(requestedRange, info.byteSize);
    if (!range) {
      response
        .status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
        .set({
          'Content-Range': `bytes */${info.byteSize}`,
          'Accept-Ranges': 'bytes',
          'X-Content-Type-Options': 'nosniff',
        })
        .json({
          statusCode: HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE,
          code: 'MEDIA_RANGE_INVALID',
          message: '视频区间请求无效',
        });
      return;
    }
    const length = range.end - range.start + 1;
    response.status(HttpStatus.PARTIAL_CONTENT).set({
      ...this.headers(info.mimeType, length),
      'Content-Range': `bytes ${range.start}-${range.end}/${info.byteSize}`,
    });
    await this.pipe(objectKey, response, range);
  }

  private async requirePublicObject(objectKey: string) {
    if (!OBJECT_KEY_PATTERN.test(objectKey)) throw this.notFound();
    const assigned = objectKey.endsWith('.mp4')
      ? await this.prisma.noteVideo.findUnique({
          where: { videoObjectKey: objectKey },
          select: { noteId: true },
        })
      : await this.isAssignedImage(objectKey);
    if (!assigned) throw this.notFound();
    const info = await this.storage.info(objectKey);
    if (!info) throw this.notFound();
    return info;
  }

  private async isAssignedImage(objectKey: string): Promise<boolean> {
    const [noteImage, videoCover, avatar] = await Promise.all([
      this.prisma.noteImage.findUnique({
        where: { objectKey },
        select: { id: true },
      }),
      this.prisma.noteVideo.findUnique({
        where: { coverObjectKey: objectKey },
        select: { id: true },
      }),
      this.prisma.user.findFirst({
        where: { avatarObjectKey: objectKey },
        select: { id: true },
      }),
    ]);
    return Boolean(noteImage || videoCover || avatar);
  }

  private headers(mimeType: string, contentLength: number) {
    return {
      'Content-Type': mimeType,
      'Content-Length': String(contentLength),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    };
  }

  private parseRange(
    value: string,
    byteSize: number,
  ): { start: number; end: number } | null {
    const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
    if (!match || (!match[1] && !match[2])) return null;
    if (!match[1]) {
      const suffixLength = Number(match[2]);
      if (!Number.isSafeInteger(suffixLength) || suffixLength < 1) return null;
      return {
        start: Math.max(0, byteSize - suffixLength),
        end: byteSize - 1,
      };
    }
    const start = Number(match[1]);
    const requestedEnd = match[2] ? Number(match[2]) : byteSize - 1;
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(requestedEnd) ||
      start < 0 ||
      start >= byteSize ||
      requestedEnd < start
    ) {
      return null;
    }
    return { start, end: Math.min(requestedEnd, byteSize - 1) };
  }

  private async pipe(
    objectKey: string,
    response: Response,
    range?: { start: number; end: number },
  ): Promise<void> {
    const stream = this.storage.createReadStream(objectKey, range);
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let responseEnded = false;
      let streamError: unknown = null;

      const cleanup = () => {
        stream.removeListener('error', onStreamError);
        stream.removeListener('close', onStreamClose);
        response.removeListener('finish', onResponseFinish);
        response.removeListener('close', onResponseClose);
      };
      const settleWhenClosed = () => {
        if (settled || !responseEnded || !stream.closed) return;
        settled = true;
        cleanup();
        stream.unpipe(response);
        if (streamError) reject(streamError);
        else resolve();
      };
      const onStreamError = (error: unknown) => {
        streamError = error;
        responseEnded = true;
        if (!response.destroyed) response.destroy();
        settleWhenClosed();
      };
      const onStreamClose = () => settleWhenClosed();
      const onResponseFinish = () => {
        responseEnded = true;
        settleWhenClosed();
      };
      const onResponseClose = () => {
        responseEnded = true;
        if (!response.writableFinished && !stream.destroyed) {
          stream.destroy();
        }
        settleWhenClosed();
      };

      stream.once('error', onStreamError);
      stream.once('close', onStreamClose);
      response.once('finish', onResponseFinish);
      response.once('close', onResponseClose);
      stream.pipe(response);
    });
  }

  private notFound(): ApiException {
    return new ApiException(
      HttpStatus.NOT_FOUND,
      'MEDIA_NOT_FOUND',
      '媒体不存在',
    );
  }
}
