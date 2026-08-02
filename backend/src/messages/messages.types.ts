import type { ProfileAvatar } from '../profile/profile-avatar.js';

export type MessageUser = {
  id: string;
  nickname: string;
  avatar: ProfileAvatar;
};

export type DirectMessageData = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  mine: boolean;
  read: boolean;
};

export type ConversationSummary = {
  id: string;
  opponent: MessageUser;
  lastMessage: DirectMessageData;
  unreadCount: number;
  canSend: boolean;
};

export type ConversationPage = {
  items: ConversationSummary[];
  nextCursor: string | null;
};

export type ConversationDetail = {
  id: string;
  opponent: MessageUser;
  canSend: boolean;
};

export type MessagePage = {
  items: DirectMessageData[];
  nextCursor: string | null;
  syncCursor: string | null;
  hasMoreAfter: boolean;
};

export type SendMessageResult = {
  conversationId: string;
  message: DirectMessageData;
};

export type ReadMessageResult = {
  conversationId: string;
  messageId: string;
  readAt: string;
  unreadCount: number;
};

export type MessageUnreadCount = { unreadCount: number };
