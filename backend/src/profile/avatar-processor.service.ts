import { HttpStatus, Injectable } from '@nestjs/common';
import sharp from 'sharp';

import { ApiException } from '../common/api-exception.js';
import type {
  UploadedMemoryFile,
  ValidatedImage,
} from '../media/media.types.js';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const MAX_AVATAR_PIXELS = 40_000_000;
const MIN_CROP_SIZE = 512;

type AvatarCrop = {
  left: number;
  top: number;
  size: number;
};

@Injectable()
export class AvatarProcessorService {
  async process(
    file: UploadedMemoryFile,
    crop: AvatarCrop,
  ): Promise<ValidatedImage> {
    if (
      file.size < 1 ||
      file.buffer.length < 1 ||
      file.size > MAX_AVATAR_BYTES ||
      file.buffer.length > MAX_AVATAR_BYTES
    ) {
      if (
        file.size > MAX_AVATAR_BYTES ||
        file.buffer.length > MAX_AVATAR_BYTES
      ) {
        throw new ApiException(
          HttpStatus.PAYLOAD_TOO_LARGE,
          'AVATAR_TOO_LARGE',
          '头像不能超过5 MiB',
        );
      }
      throw this.invalid('头像文件不能为空');
    }

    try {
      const metadata = await sharp(file.buffer, {
        animated: true,
        failOn: 'error',
        limitInputPixels: MAX_AVATAR_PIXELS,
      }).metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '')) {
        throw this.invalid('头像仅支持JPEG、PNG和WebP');
      }
      if (
        !metadata.width ||
        !metadata.height ||
        metadata.width * metadata.height > MAX_AVATAR_PIXELS
      ) {
        throw this.invalid('头像像素尺寸无效或过大');
      }
      const swapsAxes = [5, 6, 7, 8].includes(metadata.orientation ?? 1);
      const orientedWidth = swapsAxes ? metadata.height : metadata.width;
      const orientedHeight = swapsAxes ? metadata.width : metadata.height;
      if ((metadata.pages ?? 1) > 1) {
        throw this.invalid('头像不支持动图');
      }
      if (orientedWidth < MIN_CROP_SIZE || orientedHeight < MIN_CROP_SIZE) {
        throw this.invalid('头像原图至少需要512×512像素');
      }
      if (
        !Number.isInteger(crop.left) ||
        !Number.isInteger(crop.top) ||
        !Number.isInteger(crop.size) ||
        crop.left < 0 ||
        crop.top < 0 ||
        crop.size < MIN_CROP_SIZE ||
        crop.left + crop.size > orientedWidth ||
        crop.top + crop.size > orientedHeight
      ) {
        throw this.invalid('头像裁剪范围无效');
      }

      const output = await sharp(file.buffer, {
        failOn: 'error',
        limitInputPixels: MAX_AVATAR_PIXELS,
      })
        .rotate()
        .extract({
          left: crop.left,
          top: crop.top,
          width: crop.size,
          height: crop.size,
        })
        .flatten({ background: '#f3f4f6' })
        .toColourspace('srgb')
        .resize(512, 512, { fit: 'fill', withoutEnlargement: true })
        .webp({ quality: 86, effort: 4 })
        .toBuffer();
      const outputMetadata = await sharp(output).metadata();
      if (outputMetadata.width !== 512 || outputMetadata.height !== 512) {
        throw this.invalid('头像处理失败');
      }

      return {
        buffer: output,
        byteSize: output.length,
        width: 512,
        height: 512,
        mimeType: 'image/webp',
        extension: 'webp',
      };
    } catch (error) {
      if (error instanceof ApiException) {
        throw error;
      }
      throw this.invalid('头像已损坏或无法解码');
    }
  }

  private invalid(message: string): ApiException {
    return new ApiException(HttpStatus.BAD_REQUEST, 'AVATAR_INVALID', message);
  }
}
