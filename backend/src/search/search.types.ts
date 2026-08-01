import type { NotePage } from '../notes/notes.types.js';
import type { ProfileGender } from '../profile/profile.types.js';
import type { ProfileAvatar } from '../profile/profile-avatar.js';

export type SearchUserCard = {
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

export type SearchUserPage = {
  items: SearchUserCard[];
  nextCursor: string | null;
};

export type PublicUserProfile = {
  id: string;
  nickname: string;
  littleBlueBookId: string;
  gender: ProfileGender;
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
  };
};

export type EmptyVideoPage = {
  items: [];
  nextCursor: null;
};

export type SearchNotePage = NotePage;
