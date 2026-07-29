import type { NotePage } from '../notes/notes.types.js';
import type { ProfileGender } from '../profile/profile.types.js';

export type SearchUserCard = {
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

export type SearchUserPage = {
  items: SearchUserCard[];
  nextCursor: string | null;
};

export type PublicUserProfile = {
  id: string;
  nickname: string;
  littleBlueBookId: string;
  gender: ProfileGender;
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

export type EmptyVideoPage = {
  items: [];
  nextCursor: null;
};

export type SearchNotePage = NotePage;
