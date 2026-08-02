import type { ProfileAvatar } from '../_components/avatar';
import { API_BASE_URL } from './api';

export type MessageUserData = {
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

export type ConversationSummaryData = {
  id: string;
  opponent: MessageUserData;
  lastMessage: DirectMessageData;
  unreadCount: number;
  canSend: boolean;
};

export type ConversationPageData = {
  items: ConversationSummaryData[];
  nextCursor: string | null;
};

export type ConversationDetailData = {
  id: string;
  opponent: MessageUserData;
  canSend: boolean;
};

export type MessagePageData = {
  items: DirectMessageData[];
  nextCursor: string | null;
  syncCursor: string | null;
  hasMoreAfter: boolean;
};

export type MessageRealtimeEvent = {
  type:
    | 'message.created'
    | 'conversation.updated'
    | 'unread.updated'
    | 'read.updated';
  data: Record<string, unknown>;
};

export const MESSAGE_UNREAD_EVENT = 'littlebluebook:message-unread';

export function publishMessageUnreadCount(unreadCount: number): void {
  window.dispatchEvent(
    new CustomEvent<number>(MESSAGE_UNREAD_EVENT, {
      detail: Math.max(0, unreadCount),
    }),
  );
}

export function messageWebSocketUrl(): string {
  const url = new URL(`${API_BASE_URL}/messages/ws`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}
