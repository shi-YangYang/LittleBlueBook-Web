import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  Param,
  Res,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { ApiException } from '../common/api-exception.js';
import { MEDIA_STORAGE, type MediaStorage } from './media.types.js';

const OBJECT_KEY_PATTERN = /^[0-9a-f]{48}\.(?:jpg|png|webp)$/;

@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(@Inject(MEDIA_STORAGE) private readonly storage: MediaStorage) {}

  @Get(':objectKey')
  @ApiOperation({ summary: 'Read a public note image by opaque object key' })
  @ApiOkResponse({ description: 'The immutable image bytes' })
  @ApiNotFoundResponse({ description: 'The media object does not exist' })
  async read(
    @Param('objectKey') objectKey: string,
    @Res() response: Response,
  ): Promise<void> {
    if (!OBJECT_KEY_PATTERN.test(objectKey)) {
      throw this.notFound();
    }
    const image = await this.storage.read(objectKey);
    if (!image) {
      throw this.notFound();
    }

    const extension = objectKey.slice(objectKey.lastIndexOf('.') + 1);
    const mimeType =
      extension === 'jpg'
        ? 'image/jpeg'
        : extension === 'png'
          ? 'image/png'
          : 'image/webp';
    response
      .status(HttpStatus.OK)
      .set({
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(image);
  }

  private notFound(): ApiException {
    return new ApiException(
      HttpStatus.NOT_FOUND,
      'MEDIA_NOT_FOUND',
      '图片不存在',
    );
  }
}
