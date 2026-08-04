import type { ReadStream, WriteStream } from 'node:fs';

export type UploadedMemoryFile = {
  buffer: Buffer;
  size: number;
  originalname: string;
  mimetype: string;
};

export type ValidatedImage = {
  buffer: Buffer;
  byteSize: number;
  width: number;
  height: number;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'jpg' | 'png' | 'webp';
};

export type StoredImage = Omit<ValidatedImage, 'buffer' | 'extension'> & {
  objectKey: string;
};

export type MediaObjectExtension = ValidatedImage['extension'] | 'mp4';

export type TemporaryMediaWriter = {
  temporaryKey: string;
  stream: WriteStream;
};

export type MediaObjectInfo = {
  byteSize: number;
  mimeType: string;
};

export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

export interface MediaStorage {
  save(images: ValidatedImage[]): Promise<StoredImage[]>;
  createObjectKey(extension: MediaObjectExtension): string;
  saveAt(objectKey: string, image: ValidatedImage): Promise<StoredImage>;
  deleteMany(objectKeys: string[]): Promise<void>;
  deleteStrict(objectKey: string): Promise<void>;
  read(objectKey: string): Promise<Buffer | null>;
  createTemporaryVideo(): Promise<TemporaryMediaWriter>;
  markTemporaryComplete(temporaryKey: string): void;
  withTemporaryFile<T>(
    temporaryKey: string,
    operation: (filePath: string) => Promise<T>,
  ): Promise<T>;
  finalizeTemporaryVideo(
    temporaryKey: string,
    objectKey: string,
  ): Promise<string>;
  deleteTemporary(temporaryKey: string): Promise<void>;
  preparePendingObject(objectKey: string): Promise<void>;
  completePendingObjects(objectKeys: string[]): Promise<void>;
  deletePendingObjects(objectKeys: string[]): Promise<void>;
  listPendingObjectKeys(): Promise<string[]>;
  info(objectKey: string): Promise<MediaObjectInfo | null>;
  createReadStream(
    objectKey: string,
    range?: { start: number; end: number },
  ): ReadStream;
  publicUrl(objectKey: string): string;
}
