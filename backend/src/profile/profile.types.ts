import type { ProfileAvatar } from './profile-avatar.js';

export type ProfileGender = '男' | '女' | '保密';
export type EditableProfileGender = 'MALE' | 'FEMALE' | 'PRIVATE';

export type CurrentProfile = {
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
};

export type PrivateProfileSettings = {
  nickname: string;
  littleBlueBookId: string;
  email: string;
  gender: EditableProfileGender;
  birthDate: string | null;
  showAge: boolean;
  bio: string | null;
  avatar: ProfileAvatar;
  profileVersion: string;
};

export type ProfileSettingsUpdateResult = {
  settings: PrivateProfileSettings;
  publicProfile: {
    nickname: string;
    littleBlueBookId: string;
    gender: ProfileGender;
    age: number | null;
    bio: string | null;
    avatar: ProfileAvatar;
  };
};
