import type { ProfileAvatar } from '../_components/avatar';
import type { NotePageData } from './notes';

export type SearchType = 'note' | 'video' | 'user';

export type SearchUserCardData = {
  id: string;
  nickname: string;
  littleBlueBookId: string;
  avatar: ProfileAvatar;
  followers: number;
  notes: number;
  viewer: {
    authenticated: boolean;
    isSelf: boolean;
    following: boolean;
    canFollow: boolean;
  };
};

export type SearchUserPageData = {
  items: SearchUserCardData[];
  nextCursor: string | null;
};

export type PublicUserProfileData = {
  id: string;
  nickname: string;
  littleBlueBookId: string;
  gender: '男' | '女' | '保密';
  age: number | null;
  bio: string | null;
  avatar: ProfileAvatar;
  stats: {
    following: number;
    followers: number;
    receivedLikesAndFavorites: number;
  };
  viewer: {
    authenticated: boolean;
    isSelf: boolean;
    following: boolean;
    canFollow: boolean;
    canMessage: boolean;
  };
};

export type SearchNotePageData = NotePageData;

export function normalizeSearchInput(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

export function validSearchType(value: string | null): SearchType {
  return value === 'video' || value === 'user' ? value : 'note';
}
