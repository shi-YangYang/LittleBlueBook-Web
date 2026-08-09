import type { ProfileAvatar } from '../profile/profile-avatar.js';

export type RelationshipResult = {
  active: boolean;
  count: number;
};

export type FollowResult = {
  following: boolean;
  followingCount: number;
};

export type CommentAuthor = {
  id: string;
  nickname: string;
  avatar: ProfileAvatar;
};

export type NoteCommentData = {
  id: string;
  rootCommentId: string | null;
  content: string | null;
  createdAt: string;
  deleted: boolean;
  author: CommentAuthor | null;
  replyTo: {
    id: string;
    nickname: string | null;
    deleted: boolean;
  } | null;
  isAuthor: boolean;
  canDelete: boolean;
  canReply: boolean;
  likes: number;
  liked: boolean;
  canLike: boolean;
  replies: NoteCommentData[];
  replyCount: number;
  repliesNextCursor: string | null;
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
  placeholder: boolean;
  total: number;
};
