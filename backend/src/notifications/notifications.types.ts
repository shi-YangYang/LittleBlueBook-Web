import type { ProfileAvatar } from '../profile/profile-avatar.js';

export type NotificationTab = 'all' | 'comments' | 'reactions' | 'follows';

export type NotificationItem = {
  id: string;
  type: 'NOTE_LIKED' | 'NOTE_FAVORITED' | 'NOTE_COMMENTED' | 'USER_FOLLOWED';
  action: string;
  createdAt: string;
  readAt: string | null;
  actor: {
    id: string | null;
    nickname: string;
    littleBlueBookId: string | null;
    avatar: ProfileAvatar;
  };
  note: {
    id: string;
    title: string;
    thumbnail: {
      url: string;
      width: number;
      height: number;
    } | null;
  } | null;
  comment: {
    preview: string | null;
    deleted: boolean;
  } | null;
};

export type NotificationPage = {
  items: NotificationItem[];
  nextCursor: string | null;
};

export type UnreadCountResult = {
  unreadCount: number;
};

export type ReadNotificationResult = {
  id: string;
  readAt: string;
  unreadCount: number;
};

export type ReadAllNotificationsResult = {
  updatedCount: number;
  unreadCount: number;
};
