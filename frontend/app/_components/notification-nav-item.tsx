'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { apiRequest } from '../_lib/api';
import {
  NOTIFICATION_UNREAD_EVENT,
  type NotificationTab,
} from '../_lib/notifications';
import { Icon } from './icon';

type NotificationNavItemProps = {
  authenticated: boolean;
  active?: boolean;
  onLogin: (destination?: string) => void;
};

export function NotificationNavItem({
  authenticated,
  active = false,
  onLogin,
}: NotificationNavItemProps) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    if (!authenticated) {
      queueMicrotask(() => {
        if (mounted) setUnreadCount(0);
      });
      return () => {
        mounted = false;
      };
    }
    const controller = new AbortController();
    void apiRequest<{ unreadCount: number }>('/notifications/unread-count', {
      signal: controller.signal,
    })
      .then((result) => {
        if (mounted && !controller.signal.aborted) {
          setUnreadCount(Math.max(0, result.unreadCount));
        }
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (mounted) setUnreadCount(0);
      });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [authenticated]);

  useEffect(() => {
    const update = (event: Event) => {
      const unreadEvent = event as CustomEvent<number>;
      if (typeof unreadEvent.detail === 'number') {
        setUnreadCount(Math.max(0, unreadEvent.detail));
      }
    };
    window.addEventListener(NOTIFICATION_UNREAD_EVENT, update);
    return () => window.removeEventListener(NOTIFICATION_UNREAD_EVENT, update);
  }, []);

  const label = unreadCount > 0 ? `通知，${unreadCount} 条未读` : '通知';
  const contents = (
    <>
      <Icon name="notice" />
      <span>通知</span>
      {unreadCount > 0 ? (
        <span className="notification-badge" aria-hidden="true">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      ) : null}
    </>
  );

  if (!authenticated) {
    return (
      <button
        className="nav-item"
        type="button"
        aria-label="通知，登录后查看"
        onClick={() => onLogin('/notifications')}
      >
        {contents}
      </button>
    );
  }

  return (
    <Link
      className={`nav-item ${active ? 'active' : ''}`}
      href="/notifications"
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      {contents}
    </Link>
  );
}

export function notificationTabFromUrl(value: string | null): NotificationTab {
  return value === 'comments' || value === 'reactions' || value === 'follows'
    ? value
    : 'all';
}
