import { HttpStatus, Injectable } from '@nestjs/common';
import sharp from 'sharp';

import { ApiException } from '../common/api-exception.js';
import type { UploadedMemoryFile, ValidatedImage } from './media.types.js';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_IMAGES = 9;

const formatDetails = {
  jpeg: { mimeType: 'image/jpeg', extension: 'jpg' },
  png: { mimeType: 'image/png', extension: 'png' },
  webp: { mimeType: 'image/webp', extension: 'webp' },
} as const;

@Injectable()
export class ImageValidatorService {
  async validate(files: UploadedMemoryFile[]): Promise<ValidatedImage[]> {
    if (files.length < 1 || files.length > MAX_IMAGES) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'IMAGE_COUNT_INVALID',
        '请选择1～9张图片',
      );
    }

    return Promise.all(
      files.map(async (file, index) => this.validateOne(file, index)),
    );
  }

  private async validateOne(
    file: UploadedMemoryFile,
    index: number,
  ): Promise<ValidatedImage> {
    if (file.size < 1 || file.buffer.length < 1) {
      throw this.invalid(index, '图片文件不能为空');
    }
    if (file.size > MAX_IMAGE_BYTES || file.buffer.length > MAX_IMAGE_BYTES) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'IMAGE_TOO_LARGE',
        `第${index + 1}张图片超过10 MiB限制`,
        { fileIndex: index },
      );
    }

    try {
      const decoder = sharp(file.buffer, {
        animated: true,
        failOn: 'error',
        limitInputPixels: MAX_IMAGE_PIXELS,
      });
      const metadata = await decoder.metadata();
      const format = metadata.format as keyof typeof formatDetails | undefined;
      const details = format ? formatDetails[format] : undefined;

      if (!details) {
        throw this.invalid(index, '仅支持JPEG、PNG和WebP图片');
      }
      if (
        !metadata.width ||
        !metadata.height ||
        metadata.width * metadata.height > MAX_IMAGE_PIXELS
      ) {
        throw this.invalid(index, '图片尺寸无效或过大');
      }
      if ((metadata.pages ?? 1) > 1) {
        throw this.invalid(index, '不支持动图');
      }

      await sharp(file.buffer, {
        failOn: 'error',
        limitInputPixels: MAX_IMAGE_PIXELS,
      }).stats();

      return {
        buffer: file.buffer,
        byteSize: file.buffer.length,
        width: metadata.width,
        height: metadata.height,
        mimeType: details.mimeType,
        extension: details.extension,
      };
    } catch (error) {
      if (error instanceof ApiException) {
        throw error;
      }
      throw this.invalid(index, '图片已损坏或无法解码');
    }
  }

  private invalid(index: number, message: string): ApiException {
    return new ApiException(
      HttpStatus.BAD_REQUEST,
      'IMAGE_INVALID',
      `第${index + 1}张${message}`,
      { fileIndex: index },
    );
  }
}
