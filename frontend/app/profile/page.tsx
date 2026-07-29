'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { AuthDialog } from '../_components/auth-dialog';
import { Icon } from '../_components/icon';
import { NoteFeed } from '../_components/note-feed';
import { NotificationNavItem } from '../_components/notification-nav-item';
import { SearchTrigger } from '../_components/search-dialog';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api/v1';

const menuItems = [
  { icon: 'discover', label: '发现', href: '/' },
  { icon: 'video', label: '视频' },
  { icon: 'live', label: '直播' },
  { icon: 'publish', label: '发布', href: '/publish' },
] as const;

const tabs = [
  { id: 'notes', label: '笔记', emptyMessage: '还没有发布笔记' },
  { id: 'favorites', label: '收藏', emptyMessage: '还没有收藏内容' },
  { id: 'likes', label: '点赞', emptyMessage: '还没有点赞内容' },
] as const;

type TabId = (typeof tabs)[number]['id'];

type Profile = {
  nickname: string;
  littleBlueBookId: string;
  gender: '男' | '女' | '保密';
  avatar: {
    type: 'initial';
    value: string;
  };
  stats: {
    following: number;
    followers: number;
    receivedLikesAndFavorites: number;
  };
};

type ApiErrorPayload = {
  code?: string;
  message?: string;
};

type ApiError = Error & {
  status?: number;
  payload?: ApiErrorPayload;
};

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    throw new Error('NETWORK_ERROR');
  }

  const payload = (await response.json().catch(() => ({}))) as
    ({ data?: T } & Record<string, unknown>) | ApiErrorPayload;
  if (!response.ok) {
    const apiErrorPayload = payload as ApiErrorPayload;
    const error = new Error(
      apiErrorPayload.code ?? 'UNKNOWN_ERROR',
    ) as ApiError;
    error.status = response.status;
    error.payload = apiErrorPayload;
    throw error;
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'data' in payload &&
    payload.data !== undefined
  ) {
    return payload.data;
  }
  return payload as T;
}

export default function ProfilePage() {
  const router = useRouter();
  const replaceRoute = router.replace;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('notes');
  const [focusedTab, setFocusedTab] = useState<TabId>('notes');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [toast, setToast] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);
  const [authOpen, setAuthOpen] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const logoutButtonRef = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const pendingInteractionRef = useRef<(() => Promise<void>) | null>(null);

  const redirectToLogin = useCallback(() => {
    setProfile(null);
    replaceRoute('/?login=1');
  }, [replaceRoute]);

  useEffect(() => {
    const controller = new AbortController();

    void apiRequest<Profile>('/profile/me', {
      signal: controller.signal,
    })
      .then((result) => {
        setProfile(result);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        const apiError = error as ApiError;
        if (
          apiError.status === 401 ||
          apiError.message === 'AUTHENTICATION_REQUIRED'
        ) {
          redirectToLogin();
          return;
        }
        setProfile(null);
        setLoading(false);
        setLoadError(true);
      });

    return () => controller.abort();
  }, [redirectToLogin, reloadVersion]);

  useEffect(() => {
    let active = true;
    const revalidateSession = () => {
      void apiRequest<Profile>('/profile/me')
        .then((result) => {
          if (active) {
            setProfile(result);
          }
        })
        .catch((error: unknown) => {
          if (!active) return;
          const apiError = error as ApiError;
          if (
            apiError.status === 401 ||
            apiError.message === 'AUTHENTICATION_REQUIRED'
          ) {
            redirectToLogin();
          }
        });
    };
    const revalidateWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        revalidateSession();
      }
    };

    window.addEventListener('focus', revalidateSession);
    document.addEventListener('visibilitychange', revalidateWhenVisible);
    const timer = window.setInterval(revalidateSession, 60_000);
    return () => {
      active = false;
      window.removeEventListener('focus', revalidateSession);
      document.removeEventListener('visibilitychange', revalidateWhenVisible);
      window.clearInterval(timer);
    };
  }, [redirectToLogin]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!settingsOpen) return;

    window.setTimeout(() => logoutButtonRef.current?.focus(), 0);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setSettingsOpen(false);
      window.setTimeout(() => settingsButtonRef.current?.focus(), 0);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [settingsOpen]);

  const showComingSoon = () => setToast('功能开发中');

  const handleLogout = async () => {
    if (loggingOut) return;
    setLogoutError('');
    setLoggingOut(true);
    try {
      await apiRequest<{ success: true }>('/auth/logout', { method: 'POST' });
      setProfile(null);
      setSettingsOpen(false);
      replaceRoute('/');
    } catch {
      setLogoutError('退出登录失败，请稍后重试');
    } finally {
      setLoggingOut(false);
    }
  };

  const handleTabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    tabId: TabId,
  ) => {
    const index = tabs.findIndex((tab) => tab.id === tabId);
    let nextIndex: number | null = null;

    if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setActiveTab(tabId);
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    setFocusedTab(nextTab.id);
    tabRefs.current[nextTab.id]?.focus();
  };

  return (
    <div className="home-shell profile-shell">
      <aside className="sidebar" aria-label="主菜单">
        <Link className="sidebar-logo" href="/" aria-label="返回首页">
          <Image
            src="/brand/littlebluebook-logo.svg"
            alt="小蓝书"
            width={116}
            height={52}
            priority
          />
        </Link>

        <nav className="primary-nav" aria-label="主要功能">
          {menuItems.map((item) =>
            'href' in item ? (
              item.href === '/publish' ? (
                <a className="nav-item" href={item.href} key={item.label}>
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </a>
              ) : (
                <Link className="nav-item" href={item.href} key={item.label}>
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </Link>
              )
            ) : (
              <button
                className="nav-item"
                key={item.label}
                type="button"
                onClick={showComingSoon}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </button>
            ),
          )}
          <NotificationNavItem
            authenticated={Boolean(profile)}
            onLogin={() => setAuthOpen(true)}
          />

          <div className="identity-wrap">
            <Link
              className="identity-button active"
              href="/profile"
              aria-current="page"
              aria-label="我"
            >
              <span className="identity-avatar" aria-hidden="true">
                {profile?.avatar.value ?? '我'}
              </span>
              <span className="identity-name">我</span>
            </Link>
          </div>
        </nav>

        <nav className="secondary-nav" aria-label="其他功能">
          <button type="button" onClick={showComingSoon}>
            <Icon name="more" />
            <span>更多</span>
          </button>
          <button type="button" onClick={showComingSoon}>
            <Icon name="info" />
            <span>关于我们</span>
          </button>
        </nav>
      </aside>

      <main className="content-shell profile-content-shell">
        <header className="topbar">
          <SearchTrigger />
          <div className="top-actions">
            <button type="button" onClick={showComingSoon}>
              创作中心
            </button>
            <button type="button" onClick={showComingSoon}>
              业务合作
            </button>
          </div>
        </header>

        <section className="profile-page" aria-label="个人主页">
          {loading ? (
            <div
              className="profile-loading"
              aria-busy="true"
              aria-label="正在加载个人资料"
            >
              <span className="profile-skeleton skeleton-avatar" />
              <div>
                <span className="profile-skeleton skeleton-title" />
                <span className="profile-skeleton skeleton-line" />
                <span className="profile-skeleton skeleton-line short" />
              </div>
            </div>
          ) : loadError ? (
            <div className="profile-load-error" role="alert">
              <p>个人资料加载失败，请稍后重试</p>
              <button
                className="profile-retry"
                type="button"
                onClick={() => {
                  setLoading(true);
                  setLoadError(false);
                  setReloadVersion((version) => version + 1);
                }}
              >
                重试
              </button>
            </div>
          ) : profile ? (
            <>
              <section className="profile-header">
                <div
                  className="profile-avatar"
                  role="img"
                  aria-label={`${profile.nickname}的默认头像`}
                >
                  {profile.avatar.value}
                </div>

                <div className="profile-details">
                  <div className="profile-title-row">
                    <div>
                      <h1 id="profile-title">{profile.nickname}</h1>
                      <p>小蓝书号：{profile.littleBlueBookId}</p>
                    </div>
                    <div className="profile-settings">
                      <button
                        ref={settingsButtonRef}
                        className="settings-trigger"
                        type="button"
                        aria-label="个人主页设置"
                        aria-haspopup="menu"
                        aria-expanded={settingsOpen}
                        onClick={() => {
                          setLogoutError('');
                          setSettingsOpen((open) => !open);
                        }}
                      >
                        <Icon name="settings" size={21} />
                        <span>设置</span>
                      </button>
                      {settingsOpen ? (
                        <div className="profile-settings-menu" role="menu">
                          <button
                            ref={logoutButtonRef}
                            type="button"
                            role="menuitem"
                            disabled={loggingOut}
                            onClick={handleLogout}
                          >
                            {loggingOut ? '退出中…' : '退出登录'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <p className="profile-gender">性别：{profile.gender}</p>

                  <dl className="profile-stats" aria-label="个人统计">
                    <div>
                      <dt>关注</dt>
                      <dd>{profile.stats.following}</dd>
                    </div>
                    <div>
                      <dt>粉丝</dt>
                      <dd>{profile.stats.followers}</dd>
                    </div>
                    <div>
                      <dt>获赞与收藏</dt>
                      <dd>{profile.stats.receivedLikesAndFavorites}</dd>
                    </div>
                  </dl>
                  {logoutError ? (
                    <p className="profile-action-error" role="alert">
                      {logoutError}
                    </p>
                  ) : null}
                </div>
              </section>

              <section className="profile-content" aria-label="个人内容">
                <div
                  className="profile-tabs"
                  role="tablist"
                  aria-label="个人内容分类"
                >
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      ref={(element) => {
                        tabRefs.current[tab.id] = element;
                      }}
                      id={`profile-tab-${tab.id}`}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === tab.id}
                      aria-controls={`profile-panel-${tab.id}`}
                      tabIndex={focusedTab === tab.id ? 0 : -1}
                      className={activeTab === tab.id ? 'active' : ''}
                      onFocus={() => setFocusedTab(tab.id)}
                      onClick={() => {
                        setFocusedTab(tab.id);
                        setActiveTab(tab.id);
                      }}
                      onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {tabs.map((tab) => (
                  <div
                    key={tab.id}
                    id={`profile-panel-${tab.id}`}
                    className="profile-tab-panel"
                    role="tabpanel"
                    aria-labelledby={`profile-tab-${tab.id}`}
                    tabIndex={0}
                    hidden={activeTab !== tab.id}
                  >
                    {activeTab === tab.id ? (
                      <NoteFeed
                        endpoint={
                          tab.id === 'notes'
                            ? '/notes/mine'
                            : tab.id === 'favorites'
                              ? '/notes/favorites'
                              : '/notes/liked'
                        }
                        label={
                          tab.id === 'notes'
                            ? '我的笔记'
                            : tab.id === 'favorites'
                              ? '我的收藏'
                              : '我的点赞'
                        }
                        emptyMessage={tab.emptyMessage}
                        errorMessage={`${tab.label}内容加载失败，请稍后重试`}
                        onPublish={
                          tab.id === 'notes'
                            ? () => window.location.assign('/publish')
                            : undefined
                        }
                        onUnauthorized={redirectToLogin}
                        onAuthenticationRequired={(resume) => {
                          pendingInteractionRef.current = resume;
                          setAuthOpen(true);
                        }}
                        onInteractionMessage={setToast}
                        removeWhenUnliked={tab.id === 'likes'}
                      />
                    ) : null}
                  </div>
                ))}
              </section>
            </>
          ) : null}
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
          pendingInteractionRef.current = null;
        }}
        onAuthenticated={() => {
          setAuthOpen(false);
          const resume = pendingInteractionRef.current;
          pendingInteractionRef.current = null;
          if (resume) void resume();
          setReloadVersion((version) => version + 1);
        }}
        onToast={setToast}
      />
    </div>
  );
}
