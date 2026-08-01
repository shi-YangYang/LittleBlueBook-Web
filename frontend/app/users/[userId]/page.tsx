'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import {
  AuthDialog,
  type AuthenticatedUser,
} from '../../_components/auth-dialog';
import { Avatar } from '../../_components/avatar';
import { Icon } from '../../_components/icon';
import { NoteFeed } from '../../_components/note-feed';
import { PageSidebar, PageTopbar } from '../../_components/page-chrome';
import { apiRequest, ApiRequestError } from '../../_lib/api';
import type { PublicUserProfileData } from '../../_lib/search';

type ProfileRequestState = {
  key: string;
  status: 'loading' | 'ready' | 'not-found' | 'error';
  profile: PublicUserProfileData | null;
};

export default function PublicUserPage() {
  const parameters = useParams<{ userId: string }>();
  const router = useRouter();
  const userId = parameters.userId;
  const [sessionUser, setSessionUser] = useState<AuthenticatedUser | null>(
    null,
  );
  const [reloadVersion, setReloadVersion] = useState(0);
  const requestKey = `${userId}:${reloadVersion}`;
  const [profileRequest, setProfileRequest] = useState<ProfileRequestState>({
    key: requestKey,
    status: 'loading',
    profile: null,
  });
  const [authOpen, setAuthOpen] = useState(false);
  const [followingBusy, setFollowingBusy] = useState(false);
  const [toast, setToast] = useState('');
  const pendingActionRef = useRef<(() => Promise<void>) | null>(null);
  const pendingDestinationRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<PublicUserProfileData>(
      `/users/${encodeURIComponent(userId)}/profile`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (result.viewer.isSelf) {
          router.replace('/profile');
          return;
        }
        setProfileRequest({
          key: requestKey,
          status: 'ready',
          profile: result,
        });
      })
      .catch((error) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setProfileRequest({
          key: requestKey,
          status:
            error instanceof ApiRequestError && error.status === 404
              ? 'not-found'
              : 'error',
          profile: null,
        });
      });
    return () => controller.abort();
  }, [requestKey, router, userId]);

  useEffect(() => {
    let active = true;
    void apiRequest<{
      authenticated: boolean;
      user: AuthenticatedUser | null;
    }>('/auth/session')
      .then((session) => {
        if (active) setSessionUser(session.authenticated ? session.user : null);
      })
      .catch(() => {
        if (active) setSessionUser(null);
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

  const setFollow = async (
    target: boolean,
    allowAuthentication = true,
  ): Promise<void> => {
    if (followingBusy) return;
    setFollowingBusy(true);
    try {
      const result = await apiRequest<{ following: boolean }>(
        `/users/${encodeURIComponent(userId)}/follow`,
        { method: target ? 'PUT' : 'DELETE' },
      );
      const refreshed = await apiRequest<PublicUserProfileData>(
        `/users/${encodeURIComponent(userId)}/profile`,
      );
      setProfileRequest((current) => ({
        ...current,
        profile: {
          ...refreshed,
          viewer: {
            ...refreshed.viewer,
            following: result.following,
          },
        },
      }));
    } catch (error) {
      if (
        allowAuthentication &&
        error instanceof ApiRequestError &&
        error.status === 401
      ) {
        pendingActionRef.current = () => setFollow(target, false);
        setAuthOpen(true);
      } else {
        setToast('关注操作失败，请稍后重试');
      }
    } finally {
      setFollowingBusy(false);
    }
  };

  const loading =
    profileRequest.key !== requestKey || profileRequest.status === 'loading';
  const notFound =
    profileRequest.key === requestKey && profileRequest.status === 'not-found';
  const loadError =
    profileRequest.key === requestKey && profileRequest.status === 'error';
  const profile =
    profileRequest.key === requestKey ? profileRequest.profile : null;

  return (
    <div className="home-shell public-profile-shell">
      <PageSidebar
        user={sessionUser}
        onLogin={(destination) => {
          pendingDestinationRef.current = destination ?? null;
          setAuthOpen(true);
        }}
        onToast={setToast}
      />
      <main className="content-shell profile-content-shell">
        <PageTopbar onToast={setToast} />
        <section
          className="profile-page public-profile-page"
          aria-label="用户公开主页"
        >
          {loading ? (
            <div className="profile-loading" aria-busy="true">
              <span className="profile-skeleton skeleton-avatar" />
              <div>
                <span className="profile-skeleton skeleton-title" />
                <span className="profile-skeleton skeleton-line" />
                <span className="profile-skeleton skeleton-line short" />
              </div>
            </div>
          ) : notFound ? (
            <div className="public-profile-message">
              <Icon name="empty" size={52} />
              <h1>用户不存在</h1>
              <p>该用户可能已不存在或链接有误</p>
              <button type="button" onClick={() => router.push('/')}>
                返回首页
              </button>
            </div>
          ) : loadError ? (
            <div className="public-profile-message" role="alert">
              <Icon name="empty" size={52} />
              <h1>主页加载失败</h1>
              <p>请稍后重试</p>
              <button
                type="button"
                onClick={() => setReloadVersion((value) => value + 1)}
              >
                重新加载
              </button>
            </div>
          ) : profile ? (
            <>
              <section className="profile-header public-profile-header">
                <Avatar
                  avatar={profile.avatar}
                  className="profile-avatar"
                  label={`${profile.nickname}的${profile.avatar.type === 'initial' ? '默认' : ''}头像`}
                />
                <div className="profile-details">
                  <div className="profile-title-row">
                    <div>
                      <h1>{profile.nickname}</h1>
                      <p>小蓝书号：{profile.littleBlueBookId}</p>
                    </div>
                    <button
                      className={`follow-action public-profile-follow ${profile.viewer.following ? 'following' : ''}`}
                      type="button"
                      disabled={followingBusy}
                      aria-pressed={profile.viewer.following}
                      onClick={() => void setFollow(!profile.viewer.following)}
                    >
                      {followingBusy
                        ? '处理中…'
                        : profile.viewer.following
                          ? '已关注'
                          : '关注'}
                    </button>
                  </div>
                  <p className="profile-gender">性别：{profile.gender}</p>
                  {profile.age == null ? null : (
                    <p className="profile-age">年龄：{profile.age}</p>
                  )}
                  {profile.bio ? (
                    <p className="profile-bio">{profile.bio}</p>
                  ) : null}
                  <dl className="profile-stats" aria-label="公开用户统计">
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
                </div>
              </section>
              <section className="profile-content" aria-label="公开笔记">
                <div
                  className="profile-tabs public-profile-tabs"
                  role="tablist"
                >
                  <button
                    id="public-profile-tab-notes"
                    type="button"
                    role="tab"
                    aria-selected="true"
                    aria-controls="public-profile-panel-notes"
                    className="active"
                  >
                    笔记
                  </button>
                </div>
                <div
                  id="public-profile-panel-notes"
                  className="profile-tab-panel"
                  role="tabpanel"
                  aria-labelledby="public-profile-tab-notes"
                >
                  <NoteFeed
                    endpoint={`/users/${encodeURIComponent(userId)}/notes`}
                    label={`${profile.nickname}发布的笔记`}
                    emptyMessage="还没有发布笔记"
                    errorMessage="笔记加载失败，请稍后重试"
                    onAuthenticationRequired={(resume) => {
                      pendingActionRef.current = resume;
                      setAuthOpen(true);
                    }}
                    onInteractionMessage={setToast}
                  />
                </div>
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
          pendingActionRef.current = null;
          pendingDestinationRef.current = null;
        }}
        onAuthenticated={(user) => {
          setSessionUser(user);
          setAuthOpen(false);
          const destination = pendingDestinationRef.current;
          pendingDestinationRef.current = null;
          if (destination) {
            router.push(destination);
            return;
          }
          const resume = pendingActionRef.current;
          pendingActionRef.current = null;
          if (resume) {
            void resume().finally(() => setReloadVersion((value) => value + 1));
          } else {
            setReloadVersion((value) => value + 1);
          }
        }}
        onToast={setToast}
      />
    </div>
  );
}
