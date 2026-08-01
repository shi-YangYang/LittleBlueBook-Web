import sharp from 'sharp';

import { ApiException } from '../common/api-exception.js';
import type { UploadedMemoryFile } from '../media/media.types.js';
import { AvatarProcessorService } from './avatar-processor.service.js';

function upload(buffer: Buffer): UploadedMemoryFile {
  return {
    buffer,
    size: buffer.length,
    originalname: '../../private-name.svg',
    mimetype: 'image/svg+xml',
  };
}

describe('AvatarProcessorService', () => {
  const service = new AvatarProcessorService();

  it.each(['jpeg', 'png', 'webp'] as const)(
    'detects actual %s bytes and emits metadata-free 512px WebP',
    async (format) => {
      const source = await sharp({
        create: {
          width: 700,
          height: 620,
          channels: 4,
          background: { r: 22, g: 119, b: 255, alpha: 0.45 },
        },
      })
        .withExif({ IFD0: { Copyright: 'private-marker' } })
        .toFormat(format)
        .toBuffer();

      const result = await service.process(upload(source), {
        left: 60,
        top: 20,
        size: 560,
      });
      const metadata = await sharp(result.buffer).metadata();

      expect(result).toMatchObject({
        width: 512,
        height: 512,
        mimeType: 'image/webp',
        extension: 'webp',
      });
      expect(metadata).toMatchObject({
        format: 'webp',
        width: 512,
        height: 512,
        hasAlpha: false,
      });
      expect(metadata.exif).toBeUndefined();
      expect(result.buffer.toString('utf8')).not.toContain('private-marker');
    },
  );

  it('rejects undersized, invalid, disguised and out-of-bounds input', async () => {
    const small = await sharp({
      create: {
        width: 511,
        height: 700,
        channels: 3,
        background: '#1677ff',
      },
    })
      .png()
      .toBuffer();
    const valid = await sharp({
      create: {
        width: 600,
        height: 600,
        channels: 3,
        background: '#1677ff',
      },
    })
      .png()
      .toBuffer();

    for (const [file, crop] of [
      [upload(small), { left: 0, top: 0, size: 511 }],
      [
        upload(Buffer.from('<svg><script /></svg>')),
        { left: 0, top: 0, size: 512 },
      ],
      [upload(valid), { left: 100, top: 100, size: 512 }],
      [upload(valid), { left: 0, top: 0, size: 511 }],
    ] as const) {
      await expect(service.process(file, crop)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'AVATAR_INVALID' }),
      });
    }
  });

  it('uses a stable 413 error without exposing file bytes', async () => {
    const marker = 'private-avatar-marker';
    const file = upload(Buffer.alloc(5 * 1024 * 1024 + 1));
    file.buffer.write(marker);
    await expect(
      service.process(file, { left: 0, top: 0, size: 512 }),
    ).rejects.toMatchObject({
      status: 413,
      response: expect.objectContaining({ code: 'AVATAR_TOO_LARGE' }),
    });
    await service
      .process(file, { left: 0, top: 0, size: 512 })
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(ApiException);
        expect(
          JSON.stringify((error as ApiException).getResponse()),
        ).not.toContain(marker);
      });
  });

  it('applies EXIF orientation before validating and extracting browser crop coordinates', async () => {
    const blueBottomHalf = await sharp({
      create: {
        width: 600,
        height: 400,
        channels: 3,
        background: { r: 0, g: 40, b: 230 },
      },
    })
      .png()
      .toBuffer();
    const source = await sharp({
      create: {
        width: 600,
        height: 800,
        channels: 3,
        background: { r: 230, g: 30, b: 20 },
      },
    })
      .composite([{ input: blueBottomHalf, left: 0, top: 400 }])
      .jpeg({ quality: 100, chromaSubsampling: '4:4:4' })
      .withMetadata({ orientation: 6 })
      .toBuffer();

    await expect(sharp(source).metadata()).resolves.toMatchObject({
      width: 600,
      height: 800,
      orientation: 6,
    });

    const result = await service.process(upload(source), {
      left: 200,
      top: 0,
      size: 600,
    });
    const { data, info } = await sharp(result.buffer)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => {
      const offset = (y * info.width + x) * info.channels;
      return Array.from(data.subarray(offset, offset + 3));
    };

    expect(info).toMatchObject({ width: 512, height: 512, channels: 3 });
    expect(pixel(4, 256)[2]).toBeGreaterThan(pixel(4, 256)[0]!);
    expect(pixel(507, 256)[0]).toBeGreaterThan(pixel(507, 256)[2]!);
    const outputMetadata = await sharp(result.buffer).metadata();
    expect(outputMetadata.format).toBe('webp');
    expect(outputMetadata.orientation).toBeUndefined();
    expect(outputMetadata.exif).toBeUndefined();
  });
});
