import type { ProfileAvatar } from '../profile/profile-avatar.js';

export type RelationshipResult = {
  active: boolean;
  count: number;
};

export type FollowResult = {
  following: boolean;
};

export type CommentAuthor = {
  id: string;
  nickname: string;
  avatar: ProfileAvatar;
};

export type NoteCommentData = {
  id: string;
  content: string;
  createdAt: string;
  author: CommentAuthor;
  isAuthor: boolean;
  canDelete: boolean;
};

export type CommentPage = {
  items: NoteCommentData[];
  nextCursor: string | null;
  total: number;
};

export type CommentMutationResult = {
  comment: NoteCommentData;
  total: number;
};

export type CommentDeletionResult = {
  deleted: true;
  total: number;
};
