import type { NotePageData } from './notes';

export type SearchType = 'note' | 'video' | 'user';

export type SearchUserCardData = {
  id: string;
  nickname: string;
  littleBlueBookId: string;
  avatar: {
    type: 'initial';
    value: string;
  };
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
  avatar: {
    type: 'initial';
    value: string;
  };
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
  };
};

export type SearchNotePageData = NotePageData;

export function normalizeSearchInput(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

export function validSearchType(value: string | null): SearchType {
  return value === 'video' || value === 'user' ? value : 'note';
}
