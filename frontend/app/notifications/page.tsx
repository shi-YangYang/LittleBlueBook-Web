/* eslint-disable @next/next/no-img-element */
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import {
  Suspense,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

import { AuthDialog, type AuthenticatedUser } from '../_components/auth-dialog';
import { Icon } from '../_components/icon';
import { notificationTabFromUrl } from '../_components/notification-nav-item';
import { PageSidebar, PageTopbar } from '../_components/page-chrome';
import { Avatar } from '../_components/avatar';
import { apiRequest, ApiRequestError } from '../_lib/api';
import {
  publishUnreadCount,
  type NotificationItemData,
  type NotificationPageData,
  type NotificationTab,
} from '../_lib/notifications';

const tabs: Array<{
  id: NotificationTab;
  label: string;
  emptyMessage: string;
}> = [
  { id: 'all', label: '全部', emptyMessage: '暂时没有通知' },
  { id: 'comments', label: '评论', emptyMessage: '暂时没有评论通知' },
  {
    id: 'reactions',
    label: '赞和收藏',
    emptyMessage: '暂时没有赞和收藏通知',
  },
  { id: 'follows', label: '新增关注', emptyMessage: '暂时没有新增关注' },
];

function relativeTime(value: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function NotificationSkeleton() {
  return (
    <div
      className="notification-skeleton-list"
      aria-hidden="true"
      data-testid="notification-skeleton"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div className="notification-skeleton-row" key={index}>
          <span />
          <div>
            <span />
            <span />
          </div>
          <span />
        </div>
      ))}
    </div>
  );
}

function NotificationsPageContent() {
  const router = useRouter();
  const parameters = useSearchParams();
  const activeTab = notificationTabFromUrl(parameters.get('tab'));
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [items, setItems] = useState<NotificationItemData[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [readAllBusy, setReadAllBusy] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState('');
  const tabRefs = useRef<
    Partial<Record<NotificationTab, HTMLButtonElement | null>>
  >({});
  const listRequestVersion = useRef(0);
  const loadMoreRequestVersion = useRef(0);
  const loadMoreController = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    void apiRequest<{
      authenticated: boolean;
      user: AuthenticatedUser | null;
    }>('/auth/session')
      .then((session) => {
        if (!active) return;
        if (session.authenticated && session.user) {
          setUser(session.user);
        } else {
          setAuthOpen(true);
        }
      })
      .catch(() => {
        if (active) setAuthOpen(true);
      })
      .finally(() => {
        if (active) setSessionLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    void apiRequest<{ unreadCount: number }>('/notifications/unread-count', {
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        const nextCount = Math.max(0, result.unreadCount);
        setUnreadCount(nextCount);
        publishUnreadCount(nextCount);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
      });
    return () => controller.abort();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    const version = ++listRequestVersion.current;
    loadMoreRequestVersion.current += 1;
    loadMoreController.current?.abort();
    loadMoreController.current = null;
    const startedAt = Date.now();
    queueMicrotask(() => {
      if (controller.signal.aborted || version !== listRequestVersion.current) {
        return;
      }
      setLoading(true);
      setLoadError(false);
      setLoadMoreError(false);
      setLoadingMore(false);
      setItems([]);
      setCursor(null);
    });

    void apiRequest<NotificationPageData>(
      `/notifications?tab=${activeTab}&limit=20`,
      { signal: controller.signal },
    )
      .then(async (result) => {
        const remaining = 300 - (Date.now() - startedAt);
        if (remaining > 0) await wait(remaining);
        if (
          controller.signal.aborted ||
          version !== listRequestVersion.current
        ) {
          return;
        }
        setItems(result.items);
        setCursor(result.nextCursor);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (version !== listRequestVersion.current) return;
        if (error instanceof ApiRequestError && error.status === 401) {
          setUser(null);
          setAuthOpen(true);
          return;
        }
        setLoadError(true);
      })
      .finally(() => {
        if (
          !controller.signal.aborted &&
          version === listRequestVersion.current
        ) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
      loadMoreRequestVersion.current += 1;
      loadMoreController.current?.abort();
      loadMoreController.current = null;
    };
  }, [activeTab, reloadVersion, user]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectTab = (tab: NotificationTab) => {
    loadMoreRequestVersion.current += 1;
    loadMoreController.current?.abort();
    loadMoreController.current = null;
    setLoadingMore(false);
    router.push(tab === 'all' ? '/notifications' : `/notifications?tab=${tab}`);
  };

  const handleTabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    tab: NotificationTab,
  ) => {
    const index = tabs.findIndex((item) => item.id === tab);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft')
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectTab(tab);
      return;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    const next = tabs[nextIndex];
    if (next) tabRefs.current[next.id]?.focus();
  };

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    const expectedCursor = cursor;
    const expectedTab = activeTab;
    const requestVersion = ++loadMoreRequestVersion.current;
    const controller = new AbortController();
    loadMoreController.current?.abort();
    loadMoreController.current = controller;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const result = await apiRequest<NotificationPageData>(
        `/notifications?tab=${expectedTab}&limit=20&cursor=${encodeURIComponent(expectedCursor)}`,
        { signal: controller.signal },
      );
      if (
        controller.signal.aborted ||
        requestVersion !== loadMoreRequestVersion.current
      ) {
        return;
      }
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [
          ...current,
          ...result.items.filter((item) => !known.has(item.id)),
        ];
      });
      setCursor(result.nextCursor);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') return;
      if (requestVersion !== loadMoreRequestVersion.current) {
        return;
      }
      setLoadMoreError(true);
    } finally {
      if (requestVersion === loadMoreRequestVersion.current) {
        loadMoreController.current = null;
        setLoadingMore(false);
      }
    }
  };

  const openNotification = async (notification: NotificationItemData) => {
    if (busyIds.has(notification.id)) return;
    setBusyIds((current) => new Set(current).add(notification.id));
    try {
      const result = await apiRequest<{
        id: string;
        readAt: string;
        unreadCount: number;
      }>(`/notifications/${notification.id}/read`, { method: 'PUT' });
      setItems((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, readAt: result.readAt }
            : item,
        ),
      );
      setUnreadCount(result.unreadCount);
      publishUnreadCount(result.unreadCount);

      if (notification.type === 'USER_FOLLOWED') {
        if (notification.actor.id) {
          router.push(`/users/${notification.actor.id}`);
        } else {
          setToast('相关用户已不存在');
        }
      } else if (notification.note) {
        const commentQuery = notification.comment?.id
          ? `?comment=${encodeURIComponent(notification.comment.id)}&root=${encodeURIComponent(notification.comment.rootCommentId ?? notification.comment.id)}`
          : notification.comment?.deleted
            ? '?commentDeleted=1'
            : '';
        router.push(`/explore/${notification.note.id}${commentQuery}`);
      } else {
        setToast('相关内容已不存在');
      }
    } catch {
      setToast('通知状态更新失败，请稍后重试');
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(notification.id);
        return next;
      });
    }
  };

  const readAll = async () => {
    if (readAllBusy) return;
    setReadAllBusy(true);
    try {
      const result = await apiRequest<{
        updatedCount: number;
        unreadCount: number;
      }>('/notifications/read-all', { method: 'PUT' });
      const readAt = new Date().toISOString();
      setItems((current) =>
        current.map((item) => ({
          ...item,
          readAt: item.readAt ?? readAt,
        })),
      );
      setUnreadCount(result.unreadCount);
      publishUnreadCount(result.unreadCount);
      setToast(
        result.updatedCount > 0 ? '全部通知已标记为已读' : '没有未读通知',
      );
    } catch {
      setToast('一键已读失败，请稍后重试');
    } finally {
      setReadAllBusy(false);
    }
  };

  const emptyMessage =
    tabs.find((tab) => tab.id === activeTab)?.emptyMessage ?? '暂时没有通知';

  return (
    <div className="home-shell notifications-shell">
      <PageSidebar
        user={user}
        active="notifications"
        onLogin={() => setAuthOpen(true)}
        onToast={setToast}
      />
      <main className="content-shell notifications-content-shell">
        <PageTopbar onToast={setToast} />
        <section
          className="notifications-page"
          aria-labelledby="notifications-title"
        >
          <header className="notifications-heading">
            <div>
              <p>互动消息</p>
              <h1 id="notifications-title">通知</h1>
            </div>
            <button
              type="button"
              disabled={
                readAllBusy ||
                loading ||
                unreadCount === null ||
                unreadCount === 0
              }
              aria-busy={readAllBusy}
              onClick={() => void readAll()}
            >
              {readAllBusy ? '处理中…' : '一键已读'}
            </button>
          </header>

          <div
            className="notification-tabs"
            role="tablist"
            aria-label="通知分类"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                ref={(element) => {
                  tabRefs.current[tab.id] = element;
                }}
                id={`notification-tab-${tab.id}`}
                role="tab"
                type="button"
                aria-selected={activeTab === tab.id}
                aria-controls={`notification-panel-${tab.id}`}
                tabIndex={activeTab === tab.id ? 0 : -1}
                className={activeTab === tab.id ? 'active' : ''}
                onClick={() => selectTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            id={`notification-panel-${activeTab}`}
            className="notification-panel"
            role="tabpanel"
            aria-labelledby={`notification-tab-${activeTab}`}
            aria-busy={loading}
          >
            {sessionLoading || loading ? (
              <NotificationSkeleton />
            ) : loadError ? (
              <div className="notification-state" role="alert">
                <Icon name="empty" size={50} />
                <p>通知加载失败，请稍后重试</p>
                <button
                  type="button"
                  onClick={() => setReloadVersion((value) => value + 1)}
                >
                  重新加载
                </button>
              </div>
            ) : !user ? (
              <div className="notification-state">
                <Icon name="notice" size={50} />
                <p>登录后查看互动通知</p>
                <button type="button" onClick={() => setAuthOpen(true)}>
                  登录
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="notification-state">
                <Icon name="notice" size={50} />
                <p>{emptyMessage}</p>
              </div>
            ) : (
              <>
                <ul className="notification-list" aria-label="通知列表">
                  {items.map((notification) => {
                    const unavailable =
                      notification.type === 'USER_FOLLOWED'
                        ? !notification.actor.id
                        : !notification.note;
                    return (
                      <li key={notification.id}>
                        <button
                          type="button"
                          className={`notification-row ${notification.readAt ? 'read' : 'unread'}`}
                          aria-label={`${notification.readAt ? '已读' : '未读'}，${notification.actor.nickname}${notification.action}${unavailable ? '，相关目标已不存在' : ''}`}
                          disabled={busyIds.has(notification.id)}
                          onClick={() => void openNotification(notification)}
                        >
                          <Avatar
                            avatar={notification.actor.avatar}
                            className="notification-avatar"
                          />
                          <span className="notification-copy">
                            <span className="notification-main">
                              <strong>{notification.actor.nickname}</strong>
                              <span>{notification.action}</span>
                              <span className="notification-read-state">
                                {notification.readAt ? '已读' : '未读'}
                              </span>
                            </span>
                            {notification.comment ? (
                              <span className="notification-comment-preview">
                                {notification.comment.deleted
                                  ? '相关评论已删除'
                                  : notification.comment.preview}
                              </span>
                            ) : null}
                            {unavailable ? (
                              <span className="notification-unavailable">
                                {notification.type === 'USER_FOLLOWED'
                                  ? '相关用户已不存在'
                                  : '相关内容已不存在'}
                              </span>
                            ) : null}
                            <time
                              dateTime={notification.createdAt}
                              title={new Date(
                                notification.createdAt,
                              ).toLocaleString('zh-CN')}
                            >
                              {relativeTime(notification.createdAt)}
                            </time>
                          </span>
                          {notification.type !== 'USER_FOLLOWED' ? (
                            notification.note?.thumbnail ? (
                              <img
                                className="notification-thumbnail"
                                src={notification.note.thumbnail.url}
                                alt={`笔记缩略图：${notification.note.title}`}
                                loading="lazy"
                              />
                            ) : (
                              <span
                                className="notification-thumbnail unavailable"
                                aria-label="笔记缩略图不可用"
                              >
                                <Icon name="empty" size={25} />
                              </span>
                            )
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="notification-pagination">
                  {loadMoreError ? (
                    <>
                      <span role="alert">加载更多失败，已保留现有通知</span>
                      <button type="button" onClick={() => void loadMore()}>
                        重新加载
                      </button>
                    </>
                  ) : loadingMore ? (
                    <span role="status">正在加载更多…</span>
                  ) : cursor ? (
                    <button type="button" onClick={() => void loadMore()}>
                      加载更多
                    </button>
                  ) : (
                    <span>已经到底了</span>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      </main>
      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
      <AuthDialog
        open={authOpen}
        onClose={() => {
          setAuthOpen(false);
          if (!user) router.replace('/');
        }}
        onAuthenticated={(authenticatedUser) => {
          setUser(authenticatedUser);
          setAuthOpen(false);
        }}
        onToast={setToast}
      />
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense
      fallback={
        <main className="search-route-loading" aria-busy="true">
          正在加载通知页面…
        </main>
      }
    >
      <NotificationsPageContent />
    </Suspense>
  );
}
