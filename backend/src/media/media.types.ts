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

export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

export interface MediaStorage {
  save(images: ValidatedImage[]): Promise<StoredImage[]>;
  deleteMany(objectKeys: string[]): Promise<void>;
  read(objectKey: string): Promise<Buffer | null>;
  publicUrl(objectKey: string): string;
}
