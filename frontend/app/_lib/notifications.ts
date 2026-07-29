export type NotificationTab = 'all' | 'comments' | 'reactions' | 'follows';

export type NotificationItemData = {
  id: string;
  type: 'NOTE_LIKED' | 'NOTE_FAVORITED' | 'NOTE_COMMENTED' | 'USER_FOLLOWED';
  action: string;
  createdAt: string;
  readAt: string | null;
  actor: {
    id: string | null;
    nickname: string;
    littleBlueBookId: string | null;
    avatar: {
      type: 'initial';
      value: string;
    };
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

export type NotificationPageData = {
  items: NotificationItemData[];
  nextCursor: string | null;
};

export const NOTIFICATION_UNREAD_EVENT = 'littlebluebook:notification-unread';

export function publishUnreadCount(unreadCount: number): void {
  window.dispatchEvent(
    new CustomEvent<number>(NOTIFICATION_UNREAD_EVENT, {
      detail: Math.max(0, unreadCount),
    }),
  );
}
