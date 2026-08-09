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
  management?: {
    contentVersion: number;
  };
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
  editedAt: string | null;
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
  management: {
    contentVersion: number;
  } | null;
};

export type EditableNote = {
  id: string;
  contentType: 'IMAGE' | 'VIDEO';
  title: string;
  content: string;
  contentVersion: number;
  channel: { code: string; name: string; publishable: boolean };
  images: Array<{
    id: string;
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
};

export type NoteMutationResult = {
  id: string;
  contentVersion: number;
  editedAt: string;
};

export type NoteDeletionResult = {
  id: string;
  deleted: true;
};

export type PublishResult = {
  id: string;
  createdAt: string;
};

export type NoteViewResult = {
  counted: boolean;
  viewCount: number;
};
