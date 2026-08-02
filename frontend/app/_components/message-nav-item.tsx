'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { apiRequest } from '../_lib/api';
import {
  MESSAGE_UNREAD_EVENT,
  messageWebSocketUrl,
  publishMessageUnreadCount,
  type MessageRealtimeEvent,
} from '../_lib/messages';
import { Icon } from './icon';

export function MessageNavItem({
  authenticated,
  active,
  onLogin,
}: {
  authenticated: boolean;
  active?: boolean;
  onLogin: (destination?: string) => void;
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const retryRef = useRef<number | null>(null);

  useEffect(() => {
    if (!authenticated) {
      queueMicrotask(() => setUnreadCount(0));
      return;
    }
    let activeEffect = true;
    let socket: WebSocket | null = null;
    const refresh = () =>
      apiRequest<{ unreadCount: number }>('/messages/unread-count')
        .then((result) => {
          if (!activeEffect) return;
          setUnreadCount(Math.max(0, result.unreadCount));
        })
        .catch(() => undefined);
    const connect = () => {
      if (!activeEffect) return;
      socket = new WebSocket(messageWebSocketUrl());
      socket.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(
            String(event.data),
          ) as MessageRealtimeEvent;
          if (
            payload.type === 'unread.updated' &&
            typeof payload.data.unreadCount === 'number'
          ) {
            setUnreadCount(Math.max(0, payload.data.unreadCount));
          } else if (payload.type === 'message.created') {
            void refresh();
          }
        } catch {
          // Ignore malformed or future-version events and recover via HTTP.
        }
      });
      socket.addEventListener('close', () => {
        if (activeEffect) retryRef.current = window.setTimeout(connect, 1500);
      });
    };
    void refresh();
    connect();
    return () => {
      activeEffect = false;
      if (retryRef.current !== null) window.clearTimeout(retryRef.current);
      socket?.close();
    };
  }, [authenticated]);

  useEffect(() => {
    const update = (event: Event) => {
      const count = (event as CustomEvent<number>).detail;
      if (typeof count === 'number') setUnreadCount(Math.max(0, count));
    };
    window.addEventListener(MESSAGE_UNREAD_EVENT, update);
    return () => window.removeEventListener(MESSAGE_UNREAD_EVENT, update);
  }, []);

  useEffect(() => {
    if (authenticated) publishMessageUnreadCount(unreadCount);
  }, [authenticated, unreadCount]);

  const contents = (
    <>
      <Icon name="message" />
      <span>私信</span>
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
        aria-label="私信，登录后查看"
        onClick={() => onLogin('/messages')}
      >
        {contents}
      </button>
    );
  }
  return (
    <Link
      className={`nav-item ${active ? 'active' : ''}`}
      href="/messages"
      aria-label={unreadCount > 0 ? `私信，${unreadCount} 条未读` : '私信'}
      aria-current={active ? 'page' : undefined}
    >
      {contents}
    </Link>
  );
}
