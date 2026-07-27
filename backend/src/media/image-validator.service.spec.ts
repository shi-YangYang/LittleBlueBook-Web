import sharp from 'sharp';

import { ApiException } from '../common/api-exception.js';
import { ImageValidatorService } from './image-validator.service.js';
import type { UploadedMemoryFile } from './media.types.js';

function upload(buffer: Buffer, mimetype = 'application/octet-stream') {
  return {
    buffer,
    size: buffer.length,
    originalname: 'untrusted-name.anything',
    mimetype,
  } satisfies UploadedMemoryFile;
}

describe('ImageValidatorService', () => {
  const service = new ImageValidatorService();

  it.each([
    ['jpeg', 'image/jpeg', 'jpg'],
    ['png', 'image/png', 'png'],
    ['webp', 'image/webp', 'webp'],
  ] as const)(
    'detects and fully decodes actual %s bytes',
    async (format, mimeType, extension) => {
      const buffer = await sharp({
        create: {
          width: 3,
          height: 2,
          channels: 3,
          background: '#1677ff',
        },
      })
        .toFormat(format)
        .toBuffer();

      await expect(
        service.validate([upload(buffer, 'image/svg+xml')]),
      ).resolves.toMatchObject([
        {
          byteSize: buffer.length,
          width: 3,
          height: 2,
          mimeType,
          extension,
        },
      ]);
    },
  );

  it.each([
    [[], 'IMAGE_COUNT_INVALID'],
    [
      Array.from({ length: 10 }, () => upload(Buffer.from([1]))),
      'IMAGE_COUNT_INVALID',
    ],
    [[upload(Buffer.alloc(0))], 'IMAGE_INVALID'],
    [[upload(Buffer.alloc(10 * 1024 * 1024 + 1))], 'IMAGE_TOO_LARGE'],
    [[upload(Buffer.from('<svg><script /></svg>'))], 'IMAGE_INVALID'],
    [[upload(Buffer.from('not-an-image'))], 'IMAGE_INVALID'],
  ] as const)('rejects unsafe image input', async (files, expectedCode) => {
    await expect(
      service.validate(files as UploadedMemoryFile[]),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: expectedCode }),
    });
  });

  it('does not expose file bytes in validation errors', async () => {
    const secretMarker = 'private-image-byte-marker';
    try {
      await service.validate([upload(Buffer.from(secretMarker))]);
      throw new Error('Expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiException);
      expect(
        JSON.stringify((error as ApiException).getResponse()),
      ).not.toContain(secretMarker);
    }
  });
});
