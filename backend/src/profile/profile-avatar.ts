import type { MediaStorage } from '../media/media.types.js';

export type ProfileAvatar =
  | {
      type: 'initial';
      value: string;
    }
  | {
      type: 'image';
      value: string;
    };

export function profileInitial(nickname: string): string {
  return Array.from(nickname.trim())[0] ?? '蓝';
}

export function publicAvatar(
  nickname: string,
  avatarObjectKey: string | null,
  media: Pick<MediaStorage, 'publicUrl'>,
): ProfileAvatar {
  return avatarObjectKey
    ? { type: 'image', value: media.publicUrl(avatarObjectKey) }
    : { type: 'initial', value: profileInitial(nickname) };
}
