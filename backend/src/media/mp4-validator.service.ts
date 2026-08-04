import { open, type FileHandle } from 'node:fs/promises';

import { HttpStatus, Injectable } from '@nestjs/common';

import { ApiException } from '../common/api-exception.js';

export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MIN_VIDEO_DURATION_MS = 1_000;
export const MAX_VIDEO_DURATION_MS = 600_000;

export type ValidatedVideoMetadata = {
  byteSize: number;
  width: number;
  height: number;
  durationMs: number;
  mimeType: 'video/mp4';
  videoCodec: 'h264';
  audioCodec: 'aac' | null;
};

type Box = {
  type: string;
  offset: number;
  size: number;
  headerSize: number;
  payloadOffset: number;
  payloadSize: number;
};

type SampleRange = { offset: number; size: number };

type TrackMetadata = {
  trackId: number | null;
  handler: string | null;
  timescale: number | null;
  declaredDurationUnits: bigint;
  sampleType: string | null;
  width: number | null;
  height: number | null;
  aac: boolean;
  avcConfiguration: boolean;
  avcNalLengthSize: number | null;
  sampleRanges: SampleRange[];
  sampleDurationUnits: bigint;
};

type FragmentSamples = {
  ranges: SampleRange[];
  durationUnits: bigint;
};

type TrackDefaults = { duration: number; size: number };

const CONTAINER_TYPES = new Set([
  'moov',
  'trak',
  'mdia',
  'minf',
  'stbl',
  'mvex',
]);
const MP4_BRANDS = new Set([
  'isom',
  'iso2',
  'iso6',
  'mp41',
  'mp42',
  'avc1',
  'M4V ',
]);
const MAX_BOXES_PER_CONTAINER = 4_096;
const MAX_TRACKS = 16;
const MAX_SAMPLES = 1_000_000;
const MAX_NAL_UNITS_PER_SAMPLE = 4_096;

@Injectable()
export class Mp4ValidatorService {
  async validate(
    filePath: string,
    expectedByteSize: number,
  ): Promise<ValidatedVideoMetadata> {
    if (expectedByteSize < 1 || expectedByteSize > MAX_VIDEO_BYTES) {
      throw this.invalid('视频文件不能为空且不能超过100 MiB');
    }

    const handle = await open(filePath, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size !== expectedByteSize) {
        throw this.invalid('视频文件不完整');
      }
      const topLevel = await this.readBoxes(handle, 0, stat.size);
      const ftyp = topLevel.find((box) => box.type === 'ftyp');
      const moov = topLevel.find((box) => box.type === 'moov');
      const mediaData = topLevel.filter(
        (box) => box.type === 'mdat' && box.payloadSize > 0,
      );
      if (
        !ftyp ||
        !moov ||
        mediaData.length < 1 ||
        !(await this.isMp4Brand(handle, ftyp))
      ) {
        throw this.invalid('仅支持有效的MP4视频');
      }

      const moovChildren = await this.readBoxes(
        handle,
        moov.payloadOffset,
        moov.payloadSize,
      );
      const trackBoxes = moovChildren.filter((box) => box.type === 'trak');
      if (trackBoxes.length < 1 || trackBoxes.length > MAX_TRACKS) {
        throw this.invalid('视频轨道数量无效');
      }
      const tracks = await Promise.all(
        trackBoxes.map((track) => this.readTrack(handle, track)),
      );
      const defaults = await this.readTrackDefaults(handle, moov);
      const fragments = await this.readFragmentSamples(
        handle,
        topLevel,
        defaults,
      );
      const videoTracks = tracks.filter((track) => track.handler === 'vide');
      const audioTracks = tracks.filter((track) => track.handler === 'soun');
      if (
        videoTracks.length !== 1 ||
        (videoTracks[0]?.sampleType !== 'avc1' &&
          videoTracks[0]?.sampleType !== 'avc3') ||
        !videoTracks[0]?.avcConfiguration ||
        !videoTracks[0]?.avcNalLengthSize
      ) {
        throw this.invalid('视频轨道必须使用H.264编码');
      }
      if (audioTracks.length > 1 || audioTracks.some((track) => !track.aac)) {
        throw this.invalid('音频轨道必须使用AAC编码');
      }

      for (const track of [...videoTracks, ...audioTracks]) {
        if (!track.trackId || !track.timescale) {
          throw this.invalid('媒体轨道时间或标识无效');
        }
        const fragmented = fragments.get(track.trackId);
        const ranges = [...track.sampleRanges, ...(fragmented?.ranges ?? [])];
        if (
          ranges.length < 1 ||
          ranges.length > MAX_SAMPLES ||
          ranges.some(
            (range) =>
              range.size < 1 || !this.isInsideMediaData(range, mediaData),
          )
        ) {
          throw this.invalid('媒体采样表与视频载荷不一致');
        }
      }

      const video = videoTracks[0];
      if (!video || !video.trackId || !video.timescale) {
        throw this.invalid('视频轨道信息无效');
      }
      const videoFragment = fragments.get(video.trackId);
      const videoRanges = [
        ...video.sampleRanges,
        ...(videoFragment?.ranges ?? []),
      ];
      const sampledDurationUnits =
        video.sampleDurationUnits + (videoFragment?.durationUnits ?? 0n);
      if (
        sampledDurationUnits < 1n ||
        video.declaredDurationUnits < 1n ||
        this.absoluteDifference(
          sampledDurationUnits,
          video.declaredDurationUnits,
        ) > BigInt(video.timescale)
      ) {
        throw this.invalid('视频采样时长与轨道时长不一致');
      }
      const durationMs =
        (Number(video.declaredDurationUnits) * 1000) / video.timescale;
      if (
        !video.width ||
        !video.height ||
        !Number.isFinite(durationMs) ||
        durationMs < MIN_VIDEO_DURATION_MS ||
        durationMs > MAX_VIDEO_DURATION_MS
      ) {
        throw this.invalid('视频时长需为1秒至10分钟且尺寸必须有效');
      }

      for (const sample of videoRanges) {
        await this.validateAvcSample(handle, sample, video.avcNalLengthSize!);
      }

      return {
        byteSize: stat.size,
        width: video.width,
        height: video.height,
        durationMs: Math.round(durationMs),
        mimeType: 'video/mp4',
        videoCodec: 'h264',
        audioCodec: audioTracks.length === 1 ? 'aac' : null,
      };
    } catch (error) {
      if (error instanceof ApiException) throw error;
      throw this.invalid('视频文件损坏或无法解析');
    } finally {
      await handle.close();
    }
  }

  private async readTrack(
    handle: FileHandle,
    track: Box,
  ): Promise<TrackMetadata> {
    const result: TrackMetadata = {
      trackId: null,
      handler: null,
      timescale: null,
      declaredDurationUnits: 0n,
      sampleType: null,
      width: null,
      height: null,
      aac: false,
      avcConfiguration: false,
      avcNalLengthSize: null,
      sampleRanges: [],
      sampleDurationUnits: 0n,
    };
    const boxes = await this.walk(
      handle,
      track.payloadOffset,
      track.payloadSize,
      0,
    );
    const tkhd = boxes.find((box) => box.type === 'tkhd');
    const hdlr = boxes.find((box) => box.type === 'hdlr');
    const mdhd = boxes.find((box) => box.type === 'mdhd');
    const stsd = boxes.find((box) => box.type === 'stsd');
    if (tkhd) result.trackId = await this.readTrackId(handle, tkhd);
    if (hdlr && hdlr.payloadSize >= 12) {
      result.handler = (
        await this.read(handle, hdlr.payloadOffset + 8, 4)
      ).toString('ascii');
    }
    if (mdhd) {
      const timing = await this.readMediaTiming(handle, mdhd);
      result.timescale = timing.timescale;
      result.declaredDurationUnits = timing.durationUnits;
    }
    if (stsd) {
      const sample = await this.readSampleEntry(handle, stsd);
      result.sampleType = sample.type;
      result.width = sample.width;
      result.height = sample.height;
      result.aac = sample.aac;
      result.avcConfiguration = sample.avcConfiguration;
      result.avcNalLengthSize = sample.avcNalLengthSize;
    }
    const table = await this.readSampleTable(handle, boxes);
    result.sampleRanges = table.ranges;
    result.sampleDurationUnits = table.durationUnits;
    return result;
  }

  private async readSampleEntry(
    handle: FileHandle,
    stsd: Box,
  ): Promise<{
    type: string | null;
    width: number | null;
    height: number | null;
    aac: boolean;
    avcConfiguration: boolean;
    avcNalLengthSize: number | null;
  }> {
    const empty = {
      type: null,
      width: null,
      height: null,
      aac: false,
      avcConfiguration: false,
      avcNalLengthSize: null,
    };
    if (stsd.payloadSize < 16) return empty;
    const prefix = await this.read(handle, stsd.payloadOffset, 16);
    const entryCount = prefix.readUInt32BE(4);
    if (entryCount !== 1) return empty;
    const entrySize = prefix.readUInt32BE(8);
    const type = prefix.toString('ascii', 12, 16);
    if (
      entrySize < 16 ||
      entrySize > stsd.payloadSize - 8 ||
      entrySize > 1024 * 1024
    ) {
      return empty;
    }
    if (type === 'avc1' || type === 'avc3') {
      if (entrySize < 86) return empty;
      const dimensions = await this.read(
        handle,
        stsd.payloadOffset + 8 + 32,
        4,
      );
      const childBoxes = await this.readBoxes(
        handle,
        stsd.payloadOffset + 8 + 86,
        entrySize - 86,
      );
      const avcConfiguration = childBoxes.find(
        (box) => box.type === 'avcC' && box.payloadSize >= 7,
      );
      const avcPrefix = avcConfiguration
        ? await this.read(handle, avcConfiguration.payloadOffset, 5)
        : null;
      return {
        type,
        width: dimensions.readUInt16BE(0),
        height: dimensions.readUInt16BE(2),
        aac: false,
        avcConfiguration: Boolean(avcConfiguration),
        avcNalLengthSize: avcPrefix ? (avcPrefix[4]! & 0x03) + 1 : null,
      };
    }
    if (type !== 'mp4a') return { ...empty, type };
    const entry = await this.read(handle, stsd.payloadOffset + 8, entrySize);
    const esdsIndex = entry.indexOf(Buffer.from('esds', 'ascii'));
    const descriptor =
      esdsIndex >= 4 ? entry.subarray(esdsIndex + 4) : Buffer.alloc(0);
    return {
      ...empty,
      type,
      aac: this.hasAacObjectType(descriptor),
    };
  }

  private async readSampleTable(
    handle: FileHandle,
    boxes: Box[],
  ): Promise<{ ranges: SampleRange[]; durationUnits: bigint }> {
    const stsz = boxes.find((box) => box.type === 'stsz');
    const stco = boxes.find((box) => box.type === 'stco');
    const co64 = boxes.find((box) => box.type === 'co64');
    const stsc = boxes.find((box) => box.type === 'stsc');
    const stts = boxes.find((box) => box.type === 'stts');
    if (!stsz || (!stco && !co64) || !stsc || !stts) {
      throw new Error('Incomplete MP4 sample table');
    }

    const sampleSizes = await this.readSampleSizes(handle, stsz);
    const chunkOffsets = await this.readChunkOffsets(handle, stco ?? co64!);
    const chunkMap = await this.readSampleToChunk(handle, stsc);
    const timing = await this.readTimeToSample(handle, stts);
    if (
      sampleSizes.length === 0 &&
      chunkOffsets.length === 0 &&
      chunkMap.length === 0 &&
      timing.sampleCount === 0
    ) {
      return { ranges: [], durationUnits: 0n };
    }
    if (
      sampleSizes.length < 1 ||
      chunkOffsets.length < 1 ||
      chunkMap.length < 1 ||
      timing.sampleCount !== sampleSizes.length ||
      chunkMap[0]?.firstChunk !== 1
    ) {
      throw new Error('Inconsistent MP4 sample table');
    }

    const ranges: SampleRange[] = [];
    let sampleIndex = 0;
    let mapIndex = 0;
    for (
      let chunkIndex = 1;
      chunkIndex <= chunkOffsets.length;
      chunkIndex += 1
    ) {
      while (
        mapIndex + 1 < chunkMap.length &&
        chunkMap[mapIndex + 1]!.firstChunk <= chunkIndex
      ) {
        mapIndex += 1;
      }
      const mapping = chunkMap[mapIndex];
      if (!mapping || mapping.samplesPerChunk < 1) {
        throw new Error('Invalid MP4 sample-to-chunk mapping');
      }
      let offset = chunkOffsets[chunkIndex - 1]!;
      for (let index = 0; index < mapping.samplesPerChunk; index += 1) {
        const size = sampleSizes[sampleIndex++];
        if (!size || !Number.isSafeInteger(offset + size)) {
          throw new Error('Invalid MP4 sample range');
        }
        ranges.push({ offset, size });
        offset += size;
      }
    }
    if (sampleIndex !== sampleSizes.length || ranges.length > MAX_SAMPLES) {
      throw new Error('MP4 sample count mismatch');
    }
    return { ranges, durationUnits: timing.durationUnits };
  }

  private async readSampleSizes(
    handle: FileHandle,
    box: Box,
  ): Promise<number[]> {
    if (box.payloadSize < 12) throw new Error('Invalid stsz box');
    const header = await this.read(handle, box.payloadOffset, 12);
    const defaultSize = header.readUInt32BE(4);
    const sampleCount = header.readUInt32BE(8);
    if (sampleCount > MAX_SAMPLES) throw new Error('Too many MP4 samples');
    if (defaultSize > 0)
      return Array(sampleCount).fill(defaultSize) as number[];
    if (box.payloadSize < 12 + sampleCount * 4) {
      throw new Error('Truncated stsz entries');
    }
    const entries = await this.read(
      handle,
      box.payloadOffset + 12,
      sampleCount * 4,
    );
    return Array.from({ length: sampleCount }, (_, index) =>
      entries.readUInt32BE(index * 4),
    );
  }

  private async readChunkOffsets(
    handle: FileHandle,
    box: Box,
  ): Promise<number[]> {
    if (box.payloadSize < 8) throw new Error('Invalid chunk offset box');
    const header = await this.read(handle, box.payloadOffset, 8);
    const count = header.readUInt32BE(4);
    if (count > MAX_SAMPLES) throw new Error('Too many MP4 chunks');
    const width = box.type === 'co64' ? 8 : 4;
    if (box.payloadSize < 8 + count * width) {
      throw new Error('Truncated chunk offsets');
    }
    const entries = await this.read(
      handle,
      box.payloadOffset + 8,
      count * width,
    );
    return Array.from({ length: count }, (_, index) => {
      const offset =
        width === 8
          ? Number(entries.readBigUInt64BE(index * width))
          : entries.readUInt32BE(index * width);
      if (!Number.isSafeInteger(offset)) throw new Error('Unsafe chunk offset');
      return offset;
    });
  }

  private async readSampleToChunk(
    handle: FileHandle,
    box: Box,
  ): Promise<Array<{ firstChunk: number; samplesPerChunk: number }>> {
    if (box.payloadSize < 8) throw new Error('Invalid stsc box');
    const header = await this.read(handle, box.payloadOffset, 8);
    const count = header.readUInt32BE(4);
    if (count > MAX_SAMPLES || box.payloadSize < 8 + count * 12) {
      throw new Error('Invalid stsc entries');
    }
    const entries = await this.read(handle, box.payloadOffset + 8, count * 12);
    const mappings = Array.from({ length: count }, (_, index) => ({
      firstChunk: entries.readUInt32BE(index * 12),
      samplesPerChunk: entries.readUInt32BE(index * 12 + 4),
    }));
    if (
      mappings.some(
        (entry, index) =>
          entry.firstChunk < 1 ||
          entry.samplesPerChunk < 1 ||
          (index > 0 && entry.firstChunk <= mappings[index - 1]!.firstChunk),
      )
    ) {
      throw new Error('Invalid stsc ordering');
    }
    return mappings;
  }

  private async readTimeToSample(
    handle: FileHandle,
    box: Box,
  ): Promise<{ sampleCount: number; durationUnits: bigint }> {
    if (box.payloadSize < 8) throw new Error('Invalid stts box');
    const header = await this.read(handle, box.payloadOffset, 8);
    const count = header.readUInt32BE(4);
    if (count > MAX_SAMPLES || box.payloadSize < 8 + count * 8) {
      throw new Error('Invalid stts entries');
    }
    const entries = await this.read(handle, box.payloadOffset + 8, count * 8);
    let sampleCount = 0;
    let durationUnits = 0n;
    for (let index = 0; index < count; index += 1) {
      const samples = entries.readUInt32BE(index * 8);
      const delta = entries.readUInt32BE(index * 8 + 4);
      if (samples < 1 || delta < 1 || sampleCount + samples > MAX_SAMPLES) {
        throw new Error('Invalid MP4 sample timing');
      }
      sampleCount += samples;
      durationUnits += BigInt(samples) * BigInt(delta);
    }
    return { sampleCount, durationUnits };
  }

  private async readTrackDefaults(
    handle: FileHandle,
    moov: Box,
  ): Promise<Map<number, TrackDefaults>> {
    const boxes = await this.walk(
      handle,
      moov.payloadOffset,
      moov.payloadSize,
      0,
    );
    const defaults = new Map<number, TrackDefaults>();
    for (const trex of boxes.filter((box) => box.type === 'trex')) {
      if (trex.payloadSize < 24) throw new Error('Invalid trex box');
      const bytes = await this.read(handle, trex.payloadOffset, 24);
      const trackId = bytes.readUInt32BE(4);
      if (!trackId || defaults.has(trackId))
        throw new Error('Invalid trex track');
      defaults.set(trackId, {
        duration: bytes.readUInt32BE(12),
        size: bytes.readUInt32BE(16),
      });
    }
    return defaults;
  }

  private async readFragmentSamples(
    handle: FileHandle,
    topLevel: Box[],
    defaults: Map<number, TrackDefaults>,
  ): Promise<Map<number, FragmentSamples>> {
    const result = new Map<number, FragmentSamples>();
    let totalSamples = 0;
    for (const moof of topLevel.filter((box) => box.type === 'moof')) {
      const children = await this.readBoxes(
        handle,
        moof.payloadOffset,
        moof.payloadSize,
      );
      for (const traf of children.filter((box) => box.type === 'traf')) {
        const trafChildren = await this.readBoxes(
          handle,
          traf.payloadOffset,
          traf.payloadSize,
        );
        const tfhd = trafChildren.find((box) => box.type === 'tfhd');
        if (!tfhd) throw new Error('Fragment is missing tfhd');
        const trackHeader = await this.readTrackFragmentHeader(
          handle,
          tfhd,
          moof,
        );
        const trackDefaults = defaults.get(trackHeader.trackId) ?? {
          duration: 0,
          size: 0,
        };
        const collected = result.get(trackHeader.trackId) ?? {
          ranges: [],
          durationUnits: 0n,
        };
        let previousDataEnd: number | null = null;
        for (const trun of trafChildren.filter((box) => box.type === 'trun')) {
          const parsed = await this.readTrackRun(
            handle,
            trun,
            trackHeader,
            trackDefaults,
            previousDataEnd,
          );
          previousDataEnd = parsed.dataEnd;
          collected.ranges.push(...parsed.ranges);
          collected.durationUnits += parsed.durationUnits;
          totalSamples += parsed.ranges.length;
          if (totalSamples > MAX_SAMPLES) throw new Error('Too many fragments');
        }
        result.set(trackHeader.trackId, collected);
      }
    }
    return result;
  }

  private async readTrackFragmentHeader(
    handle: FileHandle,
    box: Box,
    moof: Box,
  ): Promise<{
    trackId: number;
    baseDataOffset: number;
    defaultDuration: number;
    defaultSize: number;
  }> {
    if (box.payloadSize < 8 || box.payloadSize > 64) {
      throw new Error('Invalid tfhd box');
    }
    const bytes = await this.read(handle, box.payloadOffset, box.payloadSize);
    const flags = bytes.readUInt32BE(0) & 0x00ffffff;
    const trackId = bytes.readUInt32BE(4);
    let cursor = 8;
    let baseDataOffset = moof.offset;
    if (flags & 0x000001) {
      if (cursor + 8 > bytes.length) throw new Error('Truncated tfhd');
      baseDataOffset = Number(bytes.readBigUInt64BE(cursor));
      cursor += 8;
    }
    if (flags & 0x000002) cursor += 4;
    let defaultDuration = 0;
    let defaultSize = 0;
    if (flags & 0x000008) {
      if (cursor + 4 > bytes.length) throw new Error('Truncated tfhd duration');
      defaultDuration = bytes.readUInt32BE(cursor);
      cursor += 4;
    }
    if (flags & 0x000010) {
      if (cursor + 4 > bytes.length) throw new Error('Truncated tfhd size');
      defaultSize = bytes.readUInt32BE(cursor);
      cursor += 4;
    }
    if (flags & 0x000020) cursor += 4;
    if (
      !trackId ||
      cursor > bytes.length ||
      !Number.isSafeInteger(baseDataOffset)
    ) {
      throw new Error('Invalid tfhd fields');
    }
    return { trackId, baseDataOffset, defaultDuration, defaultSize };
  }

  private async readTrackRun(
    handle: FileHandle,
    box: Box,
    header: {
      baseDataOffset: number;
      defaultDuration: number;
      defaultSize: number;
    },
    defaults: TrackDefaults,
    previousDataEnd: number | null,
  ): Promise<{
    ranges: SampleRange[];
    durationUnits: bigint;
    dataEnd: number;
  }> {
    if (box.payloadSize < 8 || box.payloadSize > 20 * MAX_SAMPLES) {
      throw new Error('Invalid trun box');
    }
    const bytes = await this.read(handle, box.payloadOffset, box.payloadSize);
    const flags = bytes.readUInt32BE(0) & 0x00ffffff;
    const sampleCount = bytes.readUInt32BE(4);
    if (sampleCount < 1 || sampleCount > MAX_SAMPLES) {
      throw new Error('Invalid fragment sample count');
    }
    let cursor = 8;
    let dataOffset: number | null = null;
    if (flags & 0x000001) {
      if (cursor + 4 > bytes.length) throw new Error('Truncated trun offset');
      dataOffset = bytes.readInt32BE(cursor);
      cursor += 4;
    }
    if (flags & 0x000004) cursor += 4;
    let dataCursor =
      dataOffset === null
        ? previousDataEnd
        : header.baseDataOffset + dataOffset;
    if (dataCursor === null || !Number.isSafeInteger(dataCursor)) {
      throw new Error('Fragment has no bounded data offset');
    }

    const ranges: SampleRange[] = [];
    let durationUnits = 0n;
    for (let index = 0; index < sampleCount; index += 1) {
      let duration = header.defaultDuration || defaults.duration;
      let size = header.defaultSize || defaults.size;
      if (flags & 0x000100) {
        if (cursor + 4 > bytes.length)
          throw new Error('Truncated sample duration');
        duration = bytes.readUInt32BE(cursor);
        cursor += 4;
      }
      if (flags & 0x000200) {
        if (cursor + 4 > bytes.length) throw new Error('Truncated sample size');
        size = bytes.readUInt32BE(cursor);
        cursor += 4;
      }
      if (flags & 0x000400) cursor += 4;
      if (flags & 0x000800) cursor += 4;
      if (
        duration < 1 ||
        size < 1 ||
        cursor > bytes.length ||
        !Number.isSafeInteger(dataCursor + size)
      ) {
        throw new Error('Invalid fragment sample');
      }
      ranges.push({ offset: dataCursor, size });
      dataCursor += size;
      durationUnits += BigInt(duration);
    }
    if (cursor !== bytes.length) throw new Error('Unexpected trun payload');
    return { ranges, durationUnits, dataEnd: dataCursor };
  }

  private async validateAvcSample(
    handle: FileHandle,
    sample: SampleRange,
    lengthSize: number,
  ): Promise<void> {
    const end = sample.offset + sample.size;
    let cursor = sample.offset;
    let units = 0;
    let hasVideoSlice = false;
    while (cursor < end) {
      if (end - cursor < lengthSize) throw new Error('Truncated AVC sample');
      const lengthBytes = await this.read(handle, cursor, lengthSize);
      const nalSize = lengthBytes.readUIntBE(0, lengthSize);
      cursor += lengthSize;
      if (nalSize < 1 || cursor + nalSize > end) {
        throw new Error('AVC NAL length exceeds its sample');
      }
      const nalHeader = (await this.read(handle, cursor, 1))[0]!;
      const nalType = nalHeader & 0x1f;
      if (nalType >= 1 && nalType <= 5) hasVideoSlice = true;
      cursor += nalSize;
      units += 1;
      if (units > MAX_NAL_UNITS_PER_SAMPLE) {
        throw new Error('Too many AVC NAL units in one sample');
      }
    }
    if (!hasVideoSlice) throw new Error('AVC sample contains no video slice');
  }

  private isInsideMediaData(range: SampleRange, mediaData: Box[]): boolean {
    const end = range.offset + range.size;
    return (
      Number.isSafeInteger(end) &&
      mediaData.some(
        (box) =>
          range.offset >= box.payloadOffset && end <= box.offset + box.size,
      )
    );
  }

  private hasAacObjectType(bytes: Buffer): boolean {
    for (let index = 0; index + 2 < bytes.length; index += 1) {
      if (bytes[index] !== 0x04) continue;
      let cursor = index + 1;
      for (
        let lengthBytes = 0;
        lengthBytes < 4 && cursor < bytes.length;
        lengthBytes += 1
      ) {
        const value = bytes[cursor++];
        if (value === undefined) break;
        if ((value & 0x80) === 0) return bytes[cursor] === 0x40;
      }
    }
    return false;
  }

  private async readTrackId(
    handle: FileHandle,
    tkhd: Box,
  ): Promise<number | null> {
    if (tkhd.payloadSize < 20) return null;
    const version = (await this.read(handle, tkhd.payloadOffset, 1))[0];
    const offset = version === 1 ? 20 : 12;
    if (tkhd.payloadSize < offset + 4) return null;
    const trackId = (
      await this.read(handle, tkhd.payloadOffset + offset, 4)
    ).readUInt32BE(0);
    return trackId > 0 ? trackId : null;
  }

  private async readMediaTiming(
    handle: FileHandle,
    mdhd: Box,
  ): Promise<{ timescale: number | null; durationUnits: bigint }> {
    if (mdhd.payloadSize < 20) {
      return { timescale: null, durationUnits: 0n };
    }
    const version = (await this.read(handle, mdhd.payloadOffset, 1))[0];
    const offset = version === 1 ? 20 : 12;
    const width = version === 1 ? 12 : 8;
    if (mdhd.payloadSize < offset + width) {
      return { timescale: null, durationUnits: 0n };
    }
    const bytes = await this.read(handle, mdhd.payloadOffset + offset, width);
    const timescale = bytes.readUInt32BE(0);
    const durationUnits =
      version === 1 ? bytes.readBigUInt64BE(4) : BigInt(bytes.readUInt32BE(4));
    return {
      timescale: timescale > 0 ? timescale : null,
      durationUnits,
    };
  }

  private absoluteDifference(left: bigint, right: bigint): bigint {
    return left >= right ? left - right : right - left;
  }

  private async isMp4Brand(handle: FileHandle, box: Box): Promise<boolean> {
    if (box.payloadSize < 8 || box.payloadSize > 4096) return false;
    const brands = await this.read(handle, box.payloadOffset, box.payloadSize);
    if (MP4_BRANDS.has(brands.toString('ascii', 0, 4))) return true;
    for (let offset = 8; offset + 4 <= brands.length; offset += 4) {
      if (MP4_BRANDS.has(brands.toString('ascii', offset, offset + 4))) {
        return true;
      }
    }
    return false;
  }

  private async walk(
    handle: FileHandle,
    offset: number,
    size: number,
    depth: number,
  ): Promise<Box[]> {
    if (depth > 6) throw new Error('MP4 box nesting is too deep');
    const boxes = await this.readBoxes(handle, offset, size);
    const descendants: Box[] = [...boxes];
    for (const box of boxes) {
      if (CONTAINER_TYPES.has(box.type)) {
        descendants.push(
          ...(await this.walk(
            handle,
            box.payloadOffset,
            box.payloadSize,
            depth + 1,
          )),
        );
      }
    }
    return descendants;
  }

  private async readBoxes(
    handle: FileHandle,
    offset: number,
    size: number,
  ): Promise<Box[]> {
    const boxes: Box[] = [];
    const end = offset + size;
    let cursor = offset;
    while (cursor < end) {
      if (end - cursor < 8) throw new Error('Truncated MP4 box');
      const header = await this.read(handle, cursor, 8);
      let boxSize = header.readUInt32BE(0);
      const type = header.toString('ascii', 4, 8);
      let headerSize = 8;
      if (boxSize === 1) {
        const extendedSize = await this.read(handle, cursor + 8, 8);
        boxSize = Number(extendedSize.readBigUInt64BE(0));
        headerSize = 16;
      } else if (boxSize === 0) {
        boxSize = end - cursor;
      }
      if (
        !Number.isSafeInteger(boxSize) ||
        boxSize < headerSize ||
        cursor + boxSize > end
      ) {
        throw new Error('Invalid MP4 box size');
      }
      boxes.push({
        type,
        offset: cursor,
        size: boxSize,
        headerSize,
        payloadOffset: cursor + headerSize,
        payloadSize: boxSize - headerSize,
      });
      if (boxes.length > MAX_BOXES_PER_CONTAINER) {
        throw new Error('MP4 box count exceeds the bounded parser limit');
      }
      cursor += boxSize;
    }
    return boxes;
  }

  private async read(
    handle: FileHandle,
    position: number,
    length: number,
  ): Promise<Buffer> {
    if (length < 0 || length > 20 * MAX_SAMPLES) {
      throw new Error('MP4 read exceeds bounded parser limits');
    }
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    if (bytesRead !== length) throw new Error('Unexpected end of MP4 file');
    return buffer;
  }

  private invalid(message: string): ApiException {
    return new ApiException(HttpStatus.BAD_REQUEST, 'VIDEO_INVALID', message);
  }
}
