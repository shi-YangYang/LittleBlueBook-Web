import type { ProfileAvatar } from '../profile/profile-avatar.js';

export type NoteAuthor = {
  id: string;
  nickname: string;
  avatar: ProfileAvatar;
};

export type NoteCard = {
  id: string;
  contentType: 'IMAGE' | 'VIDEO';
  title: string;
  cover: {
    url: string;
    width: number;
    height: number;
  };
  author: NoteAuthor;
  likes: number;
  liked: boolean;
  canLike: boolean;
  views: number;
  videoDurationMs: number | null;
};

export type NotePage = {
  items: NoteCard[];
  nextCursor: string | null;
};

export type NoteDetail = {
  id: string;
  contentType: 'IMAGE' | 'VIDEO';
  title: string;
  content: string;
  createdAt: string;
  author: NoteAuthor;
  channel: {
    code: string;
    name: string;
    navigable: boolean;
  } | null;
  images: Array<{
    url: string;
    width: number;
    height: number;
  }>;
  video: {
    url: string;
    posterUrl: string;
    width: number;
    height: number;
    durationMs: number;
  } | null;
  interactions: {
    likes: number;
    favorites: number;
    comments: number;
    views: number;
  };
  viewer: {
    authenticated: boolean;
    isAuthor: boolean;
    liked: boolean;
    favorited: boolean;
    followingAuthor: boolean;
    canLike: boolean;
    canFollow: boolean;
  };
};

export type PublishResult = {
  id: string;
  createdAt: string;
};

export type NoteViewResult = {
  counted: boolean;
  viewCount: number;
};
