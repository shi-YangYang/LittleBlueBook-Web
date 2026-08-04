import { readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  MAX_VIDEO_BYTES,
  Mp4ValidatorService,
} from './mp4-validator.service.js';

// 320×240, three-second, video-only H.264 Baseline/yuv420p MP4. It contains no user or private data.
const TINY_H264_MP4 = readFileSync(
  resolve(process.cwd(), '..', 'e2e', 'fixtures', 'tiny-h264-video.mp4'),
);

type FixtureBox = {
  type: string;
  offset: number;
  size: number;
  payloadOffset: number;
  payloadSize: number;
};

const FIXTURE_CONTAINERS = new Set([
  'moov',
  'trak',
  'mdia',
  'minf',
  'stbl',
  'mvex',
  'moof',
  'traf',
]);

function fixtureBoxes(
  bytes: Buffer,
  start = 0,
  end = bytes.length,
): FixtureBox[] {
  const result: FixtureBox[] = [];
  let cursor = start;
  while (cursor < end) {
    const size = bytes.readUInt32BE(cursor);
    const type = bytes.toString('ascii', cursor + 4, cursor + 8);
    if (size < 8 || cursor + size > end) throw new Error('fixture box invalid');
    const current = {
      type,
      offset: cursor,
      size,
      payloadOffset: cursor + 8,
      payloadSize: size - 8,
    };
    result.push(current);
    if (FIXTURE_CONTAINERS.has(type)) {
      result.push(...fixtureBoxes(bytes, cursor + 8, cursor + size));
    }
    cursor += size;
  }
  return result;
}

function patchFixtureDuration(source: Buffer, durationMs: number): Buffer {
  const bytes = Buffer.from(source);
  const boxes = fixtureBoxes(bytes);
  const mdhd = boxes.find((item) => item.type === 'mdhd');
  if (!mdhd || bytes[mdhd.payloadOffset] !== 1) {
    throw new Error('expected version-one media header');
  }
  const timescale = bytes.readUInt32BE(mdhd.payloadOffset + 20);
  const durationUnits = (durationMs * timescale) / 1000;
  if (!Number.isInteger(durationUnits))
    throw new Error('duration is not exact');
  bytes.writeBigUInt64BE(BigInt(durationUnits), mdhd.payloadOffset + 24);

  const durationOffsets: number[] = [];
  for (const trun of boxes.filter((item) => item.type === 'trun')) {
    const flags = bytes.readUInt32BE(trun.payloadOffset) & 0x00ffffff;
    const sampleCount = bytes.readUInt32BE(trun.payloadOffset + 4);
    let cursor = trun.payloadOffset + 8;
    if (flags & 0x000001) cursor += 4;
    if (flags & 0x000004) cursor += 4;
    for (let index = 0; index < sampleCount; index += 1) {
      if (!(flags & 0x000100)) throw new Error('fixture duration is implicit');
      durationOffsets.push(cursor);
      cursor += 4;
      if (flags & 0x000200) cursor += 4;
      if (flags & 0x000400) cursor += 4;
      if (flags & 0x000800) cursor += 4;
    }
  }
  const baseDuration = Math.floor(durationUnits / durationOffsets.length);
  let remainder = durationUnits % durationOffsets.length;
  for (const offset of durationOffsets) {
    const value = baseDuration + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    bytes.writeUInt32BE(value, offset);
  }
  return bytes;
}

function uint32(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function box(type: string, ...payloads: Buffer[]): Buffer {
  const payload = Buffer.concat(payloads);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length + 8);
  header.write(type, 4, 'ascii');
  return Buffer.concat([header, payload]);
}

function audioTrack(chunkOffset: number, sampleSize: number): Buffer {
  const tkhd = Buffer.alloc(84);
  tkhd.writeUInt32BE(3, 0);
  tkhd.writeUInt32BE(2, 12);
  tkhd.writeUInt32BE(1_000, 20);

  const mdhd = Buffer.alloc(24);
  mdhd.writeUInt32BE(1_000, 12);
  mdhd.writeUInt32BE(1_000, 16);
  const hdlr = Buffer.alloc(25);
  hdlr.write('soun', 8, 'ascii');
  const audioFields = Buffer.alloc(28);
  audioFields.writeUInt16BE(1, 6);
  audioFields.writeUInt16BE(2, 16);
  audioFields.writeUInt16BE(16, 18);
  audioFields.writeUInt32BE(48_000 * 65_536, 24);
  const esds = box('esds', Buffer.from([0, 0, 0, 0, 0x04, 0x01, 0x40]));
  const mp4a = box('mp4a', audioFields, esds);
  const stsd = box('stsd', Buffer.alloc(4), uint32(1), mp4a);
  const stts = box(
    'stts',
    Buffer.alloc(4),
    uint32(1),
    uint32(1),
    uint32(1_000),
  );
  const stsc = box(
    'stsc',
    Buffer.alloc(4),
    uint32(1),
    uint32(1),
    uint32(1),
    uint32(1),
  );
  const stsz = box(
    'stsz',
    Buffer.alloc(4),
    uint32(0),
    uint32(1),
    uint32(sampleSize),
  );
  const stco = box('stco', Buffer.alloc(4), uint32(1), uint32(chunkOffset));
  const stbl = box('stbl', stsd, stts, stsc, stsz, stco);
  const url = box('url ', Buffer.from([0, 0, 0, 1]));
  const dref = box('dref', Buffer.alloc(4), uint32(1), url);
  const dinf = box('dinf', dref);
  const smhd = box('smhd', Buffer.alloc(8));
  const minf = box('minf', smhd, dinf, stbl);
  const mdia = box('mdia', box('mdhd', mdhd), box('hdlr', hdlr), minf);
  return box('trak', box('tkhd', tkhd), mdia);
}

function addMappedAacTrack(source: Buffer): Buffer {
  const audioSample = Buffer.from('211004608c1c', 'hex');
  const topLevel = fixtureBoxes(source).filter((item) =>
    ['ftyp', 'moov', 'moof', 'mdat', 'mfra'].includes(item.type),
  );
  const moov = topLevel.find((item) => item.type === 'moov')!;
  const mfra = topLevel.find((item) => item.type === 'mfra')!;
  const directMoovChildren = fixtureBoxes(
    source,
    moov.payloadOffset,
    moov.offset + moov.size,
  ).filter(
    (item) =>
      item.offset >= moov.payloadOffset &&
      item.offset + item.size <= moov.offset + moov.size,
  );
  const mvex = directMoovChildren.find((item) => item.type === 'mvex')!;
  const placeholderTrack = audioTrack(0, audioSample.length);
  const newMoovLength = moov.size + placeholderTrack.length;
  const beforeAudioMdatLength =
    source.length - mfra.size + placeholderTrack.length;
  const mappedTrack = audioTrack(beforeAudioMdatLength + 8, audioSample.length);
  expect(mappedTrack.length).toBe(placeholderTrack.length);
  const rebuiltMoov = box(
    'moov',
    source.subarray(moov.payloadOffset, mvex.offset),
    mappedTrack,
    source.subarray(mvex.offset, moov.offset + moov.size),
  );
  expect(rebuiltMoov.length).toBe(newMoovLength);
  return Buffer.concat([
    source.subarray(0, moov.offset),
    rebuiltMoov,
    source.subarray(moov.offset + moov.size, mfra.offset),
    box('mdat', audioSample),
  ]);
}

describe('Mp4ValidatorService', () => {
  const taskRoot = resolve(process.cwd(), '..', 'test', 'spec-013-mp4-unit');
  const validPath = resolve(taskRoot, 'valid.mp4');
  const invalidCodecPath = resolve(taskRoot, 'invalid-codec.mp4');
  const missingMediaDataPath = resolve(taskRoot, 'missing-media-data.mp4');
  const missingAvcConfigurationPath = resolve(
    taskRoot,
    'missing-avc-configuration.mp4',
  );
  const fakeMediaDataPath = resolve(taskRoot, 'fake-one-byte-mdat.mp4');
  const aacPath = resolve(taskRoot, 'mapped-aac.mp4');
  const minimumDurationPath = resolve(taskRoot, 'duration-1000ms.mp4');
  const maximumDurationPath = resolve(taskRoot, 'duration-600000ms.mp4');
  const belowMinimumDurationPath = resolve(taskRoot, 'duration-999ms.mp4');
  const aboveMaximumDurationPath = resolve(taskRoot, 'duration-600001ms.mp4');
  const validator = new Mp4ValidatorService();

  beforeAll(async () => {
    await mkdir(taskRoot, { recursive: true });
    await writeFile(validPath, TINY_H264_MP4);
    const invalidCodec = Buffer.from(TINY_H264_MP4);
    for (
      let offset = invalidCodec.indexOf('avc1');
      offset >= 0;
      offset = invalidCodec.indexOf('avc1', offset + 4)
    ) {
      invalidCodec.write('vp09', offset, 'ascii');
    }
    await writeFile(invalidCodecPath, invalidCodec);

    const missingMediaData = Buffer.from(TINY_H264_MP4);
    for (
      let offset = missingMediaData.indexOf('mdat');
      offset >= 0;
      offset = missingMediaData.indexOf('mdat', offset + 4)
    ) {
      missingMediaData.write('free', offset, 'ascii');
    }
    await writeFile(missingMediaDataPath, missingMediaData);

    const missingAvcConfiguration = Buffer.from(TINY_H264_MP4);
    const avcConfigurationOffset = missingAvcConfiguration.indexOf('avcC');
    missingAvcConfiguration.write('free', avcConfigurationOffset, 'ascii');
    await writeFile(missingAvcConfigurationPath, missingAvcConfiguration);

    const moov = fixtureBoxes(TINY_H264_MP4).find(
      (item) => item.type === 'moov',
    )!;
    await writeFile(
      fakeMediaDataPath,
      Buffer.concat([
        TINY_H264_MP4.subarray(0, moov.offset + moov.size),
        box('mdat', Buffer.from([0x65])),
      ]),
    );
    await writeFile(aacPath, addMappedAacTrack(TINY_H264_MP4));
    await writeFile(
      minimumDurationPath,
      patchFixtureDuration(TINY_H264_MP4, 1_000),
    );
    await writeFile(
      maximumDurationPath,
      patchFixtureDuration(TINY_H264_MP4, 600_000),
    );
    await writeFile(
      belowMinimumDurationPath,
      patchFixtureDuration(TINY_H264_MP4, 999),
    );
    await writeFile(
      aboveMaximumDurationPath,
      patchFixtureDuration(TINY_H264_MP4, 600_001),
    );
  });

  afterAll(async () => {
    const repositoryTestRoot = resolve(process.cwd(), '..', 'test');
    if (
      taskRoot.startsWith(`${repositoryTestRoot}\\`) ||
      taskRoot.startsWith(`${repositoryTestRoot}/`)
    ) {
      await rm(taskRoot, { recursive: true, force: true });
    }
  });

  it('accepts a real three-second H.264 MP4 without invoking an external runtime', async () => {
    await expect(
      validator.validate(validPath, TINY_H264_MP4.length),
    ).resolves.toEqual({
      byteSize: TINY_H264_MP4.length,
      width: 320,
      height: 240,
      durationMs: 3_087,
      mimeType: 'video/mp4',
      videoCodec: 'h264',
      audioCodec: null,
    });
  });

  it('rejects a non-H.264 sample entry even when the MP4 container is intact', async () => {
    await expect(
      validator.validate(invalidCodecPath, TINY_H264_MP4.length),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'VIDEO_INVALID' }),
    });
  });

  it('rejects metadata-only lookalikes without media payload data', async () => {
    await expect(
      validator.validate(missingMediaDataPath, TINY_H264_MP4.length),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'VIDEO_INVALID' }),
    });
  });

  it('rejects the 760-byte metadata lookalike with a one-byte fake mdat', async () => {
    const fake = readFileSync(fakeMediaDataPath);
    expect(fake).toHaveLength(760);
    await expect(
      validator.validate(fakeMediaDataPath, fake.length),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'VIDEO_INVALID' }),
    });
  });

  it('accepts an AAC companion track only when its sample maps to real mdat bytes', async () => {
    const bytes = readFileSync(aacPath);
    await expect(
      validator.validate(aacPath, bytes.length),
    ).resolves.toMatchObject({
      audioCodec: 'aac',
      videoCodec: 'h264',
      durationMs: 3_087,
    });
  });

  it.each([
    [minimumDurationPath, 1_000],
    [maximumDurationPath, 600_000],
  ])('accepts the exact duration boundary %s', async (path, durationMs) => {
    const bytes = readFileSync(path);
    await expect(validator.validate(path, bytes.length)).resolves.toMatchObject(
      {
        durationMs,
      },
    );
  });

  it.each([belowMinimumDurationPath, aboveMaximumDurationPath])(
    'rejects a duration immediately outside the boundary %s',
    async (path) => {
      const bytes = readFileSync(path);
      await expect(
        validator.validate(path, bytes.length),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'VIDEO_INVALID' }),
      });
    },
  );

  it('rejects an H.264-labelled sample entry without decoder configuration', async () => {
    await expect(
      validator.validate(missingAvcConfigurationPath, TINY_H264_MP4.length),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'VIDEO_INVALID' }),
    });
  });

  it('rejects an over-limit declaration before opening or buffering the file', async () => {
    await expect(
      validator.validate(
        resolve(taskRoot, 'does-not-exist.mp4'),
        MAX_VIDEO_BYTES + 1,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'VIDEO_INVALID' }),
    });
  });
});
