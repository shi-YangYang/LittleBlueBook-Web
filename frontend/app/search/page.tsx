'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { AuthDialog, type AuthenticatedUser } from '../_components/auth-dialog';
import { Icon } from '../_components/icon';
import { NoteFeed } from '../_components/note-feed';
import { PageSidebar, PageTopbar } from '../_components/page-chrome';
import { apiRequest, ApiRequestError } from '../_lib/api';
import {
  normalizeSearchInput,
  type SearchType,
  type SearchUserCardData,
  type SearchUserPageData,
  validSearchType,
} from '../_lib/search';

const tabs: Array<{ id: SearchType; label: string }> = [
  { id: 'note', label: '笔记' },
  { id: 'video', label: '视频' },
  { id: 'user', label: '用户' },
];
const MINIMUM_LOADING_MS = 300;

function VideoResults() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setLoading(false),
      MINIMUM_LOADING_MS,
    );
    return () => window.clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <section
        className="feed-state"
        aria-label="视频搜索结果"
        aria-busy="true"
      >
        <div className="feed-loading-grid" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
        <span className="sr-only">正在切换到视频搜索结果</span>
      </section>
    );
  }

  return (
    <section className="search-state" aria-label="视频搜索结果">
      <Icon name="empty" size={48} />
      <p>暂无视频内容</p>
    </section>
  );
}

function UserResults({
  keyword,
  onAuthenticationRequired,
  onMessage,
}: {
  keyword: string;
  onAuthenticationRequired: (resume: () => Promise<void>) => void;
  onMessage: (message: string) => void;
}) {
  const [items, setItems] = useState<SearchUserCardData[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialError, setInitialError] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [busyUsers, setBusyUsers] = useState<Set<string>>(() => new Set());
  const sentinelRef = useRef<HTMLDivElement>(null);

  const readPage = useCallback(
    async (nextCursor?: string, signal?: AbortSignal) => {
      const query = new URLSearchParams({ keyword, limit: '20' });
      if (nextCursor) query.set('cursor', nextCursor);
      return apiRequest<SearchUserPageData>(`/search/users?${query}`, {
        signal,
      });
    },
    [keyword],
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void (async () => {
      const startedAt = Date.now();
      setLoading(true);
      setInitialError(false);
      setMoreError(false);
      setItems([]);
      setCursor(null);
      try {
        const page = await readPage(undefined, controller.signal);
        if (!active) return;
        setItems(page.items);
        setCursor(page.nextCursor);
      } catch (error) {
        if (
          active &&
          !(error instanceof Error && error.name === 'AbortError')
        ) {
          setInitialError(true);
        }
      } finally {
        const wait = MINIMUM_LOADING_MS - (Date.now() - startedAt);
        if (wait > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, wait));
        }
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [readPage, reloadVersion]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const page = await readPage(cursor);
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [
          ...current,
          ...page.items.filter((item) => !known.has(item.id)),
        ];
      });
      setCursor(page.nextCursor);
    } catch {
      setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, readPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !cursor || typeof IntersectionObserver === 'undefined') {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: '320px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  const setFollow = async (
    userId: string,
    target: boolean,
    allowAuthentication = true,
  ) => {
    if (busyUsers.has(userId)) return;
    setBusyUsers((current) => new Set(current).add(userId));
    try {
      const result = await apiRequest<{ following: boolean }>(
        `/users/${userId}/follow`,
        { method: target ? 'PUT' : 'DELETE' },
      );
      const refreshed = await readPage();
      const authoritative = refreshed.items.find((item) => item.id === userId);
      setItems((current) =>
        current.map((item) => {
          if (item.id !== userId) return item;
          return (
            authoritative ?? {
              ...item,
              viewer: {
                ...item.viewer,
                authenticated: true,
                following: result.following,
                canFollow: true,
              },
            }
          );
        }),
      );
    } catch (error) {
      if (
        allowAuthentication &&
        error instanceof ApiRequestError &&
        error.status === 401
      ) {
        onAuthenticationRequired(() => setFollow(userId, target, false));
      } else {
        onMessage('关注操作失败，请稍后重试');
      }
    } finally {
      setBusyUsers((current) => {
        const next = new Set(current);
        next.delete(userId);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <section className="search-user-results" aria-busy="true">
        <span className="sr-only">正在搜索用户</span>
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="search-user-skeleton"
            key={index}
            aria-hidden="true"
          />
        ))}
      </section>
    );
  }

  if (initialError) {
    return (
      <section className="search-state" role="alert">
        <Icon name="empty" size={48} />
        <p>搜索失败，请稍后重试</p>
        <button
          type="button"
          onClick={() => setReloadVersion((value) => value + 1)}
        >
          重新加载
        </button>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="search-state">
        <Icon name="empty" size={48} />
        <p>没有找到与“{keyword}”相关的内容</p>
      </section>
    );
  }

  return (
    <section className="search-user-results" aria-label="用户搜索结果">
      {items.map((user) => {
        const destination = user.viewer.isSelf
          ? '/profile'
          : `/users/${user.id}`;
        return (
          <article className="search-user-card" key={user.id}>
            <Link href={destination} aria-label={`查看${user.nickname}的主页`}>
              <span className="search-user-avatar" aria-hidden="true">
                {user.avatar.value}
              </span>
              <span className="search-user-copy">
                <strong>{user.nickname}</strong>
                <span>小蓝书号：{user.littleBlueBookId}</span>
                <span>
                  {user.followers} 粉丝 · {user.notes} 篇笔记
                </span>
              </span>
            </Link>
            {!user.viewer.isSelf ? (
              <button
                className={`follow-action ${user.viewer.following ? 'following' : ''}`}
                type="button"
                disabled={busyUsers.has(user.id)}
                aria-pressed={user.viewer.following}
                onClick={() => void setFollow(user.id, !user.viewer.following)}
              >
                {busyUsers.has(user.id)
                  ? '处理中…'
                  : user.viewer.following
                    ? '已关注'
                    : '关注'}
              </button>
            ) : null}
          </article>
        );
      })}
      <div ref={sentinelRef} className="search-pagination" aria-live="polite">
        {moreError ? (
          <>
            <span role="alert">加载更多失败，已保留现有内容</span>
            <button type="button" onClick={() => void loadMore()}>
              重新加载
            </button>
          </>
        ) : loadingMore ? (
          <span>正在加载更多…</span>
        ) : cursor ? (
          <button type="button" onClick={() => void loadMore()}>
            加载更多
          </button>
        ) : (
          <span>已经到底了</span>
        )}
      </div>
    </section>
  );
}

function SearchPageContent() {
  const router = useRouter();
  const parameters = useSearchParams();
  const keyword = normalizeSearchInput(parameters.get('keyword') ?? '');
  const keywordValid =
    Array.from(keyword).length >= 1 && Array.from(keyword).length <= 50;
  const activeType = validSearchType(parameters.get('type'));
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [toast, setToast] = useState('');
  const pendingActionRef = useRef<(() => Promise<void>) | null>(null);
  const tabRefs = useRef<Partial<Record<SearchType, HTMLButtonElement | null>>>(
    {},
  );

  useEffect(() => {
    let active = true;
    void apiRequest<{
      authenticated: boolean;
      user: AuthenticatedUser | null;
    }>('/auth/session')
      .then((session) => {
        if (active) setUser(session.authenticated ? session.user : null);
      })
      .catch(() => {
        if (active) setUser(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectType = (type: SearchType) => {
    router.push(`/search?keyword=${encodeURIComponent(keyword)}&type=${type}`);
  };

  const handleTabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    type: SearchType,
  ) => {
    const index = tabs.findIndex((tab) => tab.id === type);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft')
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectType(type);
      return;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    const next = tabs[nextIndex];
    if (!next) return;
    tabRefs.current[next.id]?.focus();
  };

  const requestAuthentication = (resume?: () => Promise<void>) => {
    pendingActionRef.current = resume ?? null;
    setAuthOpen(true);
  };

  return (
    <div className="home-shell search-shell">
      <PageSidebar
        user={user}
        onLogin={() => requestAuthentication()}
        onToast={setToast}
      />
      <main className="content-shell search-content-shell">
        <PageTopbar
          currentKeyword={keywordValid ? keyword : ''}
          onToast={setToast}
        />
        <section className="search-page" aria-labelledby="search-page-title">
          <div className="search-page-heading">
            <p>搜索结果</p>
            <h1 id="search-page-title">
              {keywordValid ? `“${keyword}”` : '开始搜索'}
            </h1>
          </div>
          <div className="search-tabs" role="tablist" aria-label="搜索分类">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                ref={(element) => {
                  tabRefs.current[tab.id] = element;
                }}
                id={`search-tab-${tab.id}`}
                role="tab"
                type="button"
                aria-selected={activeType === tab.id}
                aria-controls={`search-panel-${tab.id}`}
                tabIndex={activeType === tab.id ? 0 : -1}
                className={activeType === tab.id ? 'active' : ''}
                onClick={() => selectType(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div
            id={`search-panel-${activeType}`}
            role="tabpanel"
            aria-labelledby={`search-tab-${activeType}`}
            className="search-panel"
          >
            {!keywordValid ? (
              <section className="search-state">
                <Icon name="search" size={48} />
                <p>点击顶部搜索框，输入想查找的内容</p>
              </section>
            ) : activeType === 'note' ? (
              <NoteFeed
                key={`notes:${keyword}`}
                endpoint={`/search/notes?keyword=${encodeURIComponent(keyword)}`}
                label={`与${keyword}相关的笔记`}
                emptyMessage={`没有找到与“${keyword}”相关的内容`}
                errorMessage="搜索失败，请稍后重试"
                onAuthenticationRequired={(resume) =>
                  requestAuthentication(resume)
                }
                onInteractionMessage={setToast}
              />
            ) : activeType === 'video' ? (
              <VideoResults key={`videos:${keyword}`} />
            ) : (
              <UserResults
                key={`users:${keyword}`}
                keyword={keyword}
                onAuthenticationRequired={(resume) =>
                  requestAuthentication(resume)
                }
                onMessage={setToast}
              />
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
          pendingActionRef.current = null;
        }}
        onAuthenticated={(authenticatedUser) => {
          setUser(authenticatedUser);
          setAuthOpen(false);
          const resume = pendingActionRef.current;
          pendingActionRef.current = null;
          if (resume) void resume();
        }}
        onToast={setToast}
      />
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <main className="search-route-loading" aria-busy="true">
          正在加载搜索页面…
        </main>
      }
    >
      <SearchPageContent />
    </Suspense>
  );
}
