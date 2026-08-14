'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiRequest, ApiRequestError } from '../_lib/api';
import { lockDocumentScroll } from '../_lib/document-scroll-lock';
import { Avatar, type ProfileAvatar } from './avatar';

export type RelationshipKind = 'following' | 'followers';

type RelationshipUser = {
  id: string;
  nickname: string;
  littleBlueBookId: string;
  bio: string | null;
  avatar: ProfileAvatar;
  viewer?: {
    authenticated: boolean;
    isSelf: boolean;
    following: boolean;
    followedBy: boolean;
    mutual: boolean;
    canFollow: boolean;
  };
};

type RelationshipPage = {
  items: RelationshipUser[];
  nextCursor: string | null;
};

type FollowingDialogProps = {
  open: boolean;
  onClose: () => void;
  onFollowingCountChange?: (count: number) => void;
  onAuthenticationRequired?: () => void;
  ownerId?: string;
  kind?: RelationshipKind;
  title?: string;
};

export function FollowingDialog({
  open,
  onClose,
  onFollowingCountChange,
  onAuthenticationRequired,
  ownerId,
  kind = 'following',
  title,
}: FollowingDialogProps) {
  const router = useRouter();
  const [items, setItems] = useState<RelationshipUser[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<RelationshipUser | null>(
    null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLButtonElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const relationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const loadingMoreRef = useRef(false);

  const endpoint = ownerId
    ? `/users/${encodeURIComponent(ownerId)}/${kind}`
    : `/profile/me/${kind}`;

  const load = useCallback(
    async (cursor?: string, signal?: AbortSignal) => {
      if (!endpoint) throw new Error('RELATIONSHIP_ENDPOINT_MISSING');
      const query = new URLSearchParams({ limit: '20' });
      if (cursor) query.set('cursor', cursor);
      const queryString = query.toString();
      const requestUrl = ownerId
        ? `${endpoint}?${queryString}`
        : cursor
          ? `${endpoint}?cursor=${encodeURIComponent(cursor)}`
          : endpoint;
      const page = await apiRequest<RelationshipPage>(requestUrl, {
        signal,
      });
      setItems((current) => {
        const merged = cursor ? [...current, ...page.items] : page.items;
        return merged.filter(
          (item, index) =>
            merged.findIndex((candidate) => candidate.id === item.id) === index,
        );
      });
      setNextCursor(page.nextCursor);
    },
    [endpoint, ownerId],
  );

  useEffect(() => {
    if (!open) return;
    let active = true;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!active) return;
      setItems([]);
      setNextCursor(null);
      setError('');
      setLoading(true);
      void load(undefined, controller.signal)
        .catch((loadError) => {
          if (
            active &&
            !(loadError instanceof Error && loadError.name === 'AbortError')
          ) {
            setError('关系列表加载失败，请稍后重试');
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [load, open]);

  useEffect(() => {
    if (!open) return;
    const unlock = lockDocumentScroll();
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    return unlock;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (confirmTarget && !busyId) {
          setConfirmTarget(null);
          setMutationError('');
          window.setTimeout(() => relationTriggerRef.current?.focus(), 0);
        } else if (!confirmTarget) {
          onClose();
        }
        return;
      }
      const container = confirmTarget
        ? confirmationRef.current
        : dialogRef.current;
      if (event.key !== 'Tab' || !container) return;
      const controls = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href]',
        ),
      );
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', handleKeys);
    return () => document.removeEventListener('keydown', handleKeys);
  }, [busyId, confirmTarget, onClose, open]);

  useEffect(() => {
    if (confirmTarget)
      window.setTimeout(() => confirmButtonRef.current?.focus(), 0);
  }, [confirmTarget]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError('');
    try {
      await load(nextCursor);
    } catch {
      setError('更多关系加载失败，请重试');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [load, nextCursor]);

  useEffect(() => {
    const target = loadMoreRef.current;
    const root = listRef.current;
    if (
      !open ||
      !target ||
      !root ||
      !nextCursor ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { root, rootMargin: '160px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore, nextCursor, open]);

  const setFollow = async (target: RelationshipUser, following: boolean) => {
    if (busyId) return;
    setBusyId(target.id);
    setMutationError('');
    try {
      const result = await apiRequest<{
        following: boolean;
        followingCount: number;
        followerCount: number;
        followedBy: boolean;
        mutual: boolean;
      }>(`/users/${encodeURIComponent(target.id)}/follow`, {
        method: following ? 'PUT' : 'DELETE',
      });
      setItems((current) => {
        if (!ownerId && kind === 'following' && !result.following) {
          return current.filter((item) => item.id !== target.id);
        }
        return current.map((item) => {
          if (item.id !== target.id) return item;
          const viewer = item.viewer ?? {
            authenticated: true,
            isSelf: false,
            following: kind === 'following',
            followedBy: false,
            mutual: false,
            canFollow: true,
          };
          return {
            ...item,
            viewer: {
              ...viewer,
              following: result.following,
              followedBy: result.followedBy,
              mutual: result.mutual,
            },
          };
        });
      });
      onFollowingCountChange?.(result.followingCount);
      setConfirmTarget(null);
      window.setTimeout(() => relationTriggerRef.current?.focus(), 0);
    } catch (requestError) {
      if (
        requestError instanceof ApiRequestError &&
        requestError.status === 401
      ) {
        setMutationError('登录状态已失效，请重新登录后重试');
        setConfirmTarget(null);
        onAuthenticationRequired?.();
      } else if (
        requestError instanceof ApiRequestError &&
        requestError.status === 404
      ) {
        setItems((current) => current.filter((item) => item.id !== target.id));
        setConfirmTarget(null);
        setMutationError('该用户已不可访问');
      } else {
        setMutationError('关注操作失败，请稍后重试');
      }
    } finally {
      setBusyId(null);
    }
  };

  if (!open) return null;
  const dialogTitle = title ?? (kind === 'following' ? '我的关注' : '我的粉丝');
  const closeLabel = kind === 'following' ? '关闭关注列表' : '关闭粉丝列表';

  return (
    <div className="following-dialog-layer">
      <button
        className="modal-backdrop"
        type="button"
        aria-label={closeLabel}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className="following-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="following-dialog-title"
      >
        <header>
          <h2 id="following-dialog-title">{dialogTitle}</h2>
          <button ref={closeButtonRef} type="button" onClick={onClose}>
            <span aria-hidden="true">×</span>
            <span className="sr-only">{closeLabel}</span>
          </button>
        </header>
        <div
          ref={listRef}
          className="following-list"
          aria-live="polite"
          aria-busy={loading || loadingMore}
        >
          {loading ? (
            <div
              className="following-skeleton"
              data-testid="following-skeleton"
              role="status"
              aria-label={
                kind === 'following' ? '正在加载关注列表' : '正在加载粉丝列表'
              }
            >
              {Array.from({ length: 4 }, (_, index) => (
                <div className="following-skeleton-row" key={index}>
                  <span className="following-skeleton-avatar" />
                  <span className="following-skeleton-copy">
                    <span />
                    <span />
                    <span />
                  </span>
                  <span className="following-skeleton-action" />
                </div>
              ))}
            </div>
          ) : null}
          {!loading && error && items.length === 0 ? (
            <div className="following-state" role="alert">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setLoading(true);
                  void load()
                    .catch(() => setError('关系列表加载失败，请稍后重试'))
                    .finally(() => setLoading(false));
                }}
              >
                重新加载
              </button>
            </div>
          ) : null}
          {!loading && !error && items.length === 0 ? (
            <p className="following-state">
              {kind === 'following' ? '还没有关注任何人' : '还没有粉丝'}
            </p>
          ) : null}
          {items.map((user) => {
            const relation = user.viewer ?? {
              authenticated: true,
              isSelf: false,
              following: true,
              followedBy: false,
              mutual: false,
              canFollow: true,
            };
            return (
              <article className="following-row" key={user.id}>
                <button
                  className="following-user-link"
                  type="button"
                  onClick={() => {
                    onClose();
                    router.push(
                      relation.isSelf
                        ? '/profile'
                        : `/users/${encodeURIComponent(user.id)}`,
                    );
                  }}
                >
                  <Avatar
                    avatar={user.avatar}
                    className="following-avatar"
                    label={user.nickname}
                  />
                  <span>
                    <strong>{user.nickname}</strong>
                    <small>小蓝书号：{user.littleBlueBookId}</small>
                    <em>{user.bio || '暂无简介'}</em>
                  </span>
                </button>
                {relation.isSelf ? (
                  <span className="following-self">我</span>
                ) : (
                  <span className="following-relation-wrap">
                    {relation.mutual ? (
                      <small className="mutual-badge">互相关注</small>
                    ) : null}
                    <button
                      className={`following-action ${relation.following ? 'following' : ''}`}
                      type="button"
                      disabled={busyId === user.id}
                      aria-busy={busyId === user.id}
                      onClick={(event) => {
                        relationTriggerRef.current = event.currentTarget;
                        if (!relation.authenticated) {
                          onAuthenticationRequired?.();
                          return;
                        }
                        if (relation.following) setConfirmTarget(user);
                        else void setFollow(user, true);
                      }}
                    >
                      {busyId === user.id
                        ? '处理中…'
                        : relation.following
                          ? '已关注'
                          : relation.followedBy
                            ? '回关'
                            : '关注'}
                    </button>
                  </span>
                )}
              </article>
            );
          })}
          {items.length > 0 && nextCursor ? (
            <button
              className="following-load-more"
              ref={loadMoreRef}
              type="button"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? '加载中…' : '加载更多'}
            </button>
          ) : null}
          {items.length > 0 && error ? (
            <p className="following-inline-error" role="alert">
              {error}
            </p>
          ) : null}
          {!confirmTarget && mutationError ? (
            <p className="following-inline-error" role="alert">
              {mutationError}
            </p>
          ) : null}
        </div>
        {confirmTarget ? (
          <div
            ref={confirmationRef}
            className="following-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="following-confirm-title"
            aria-describedby="following-confirm-description"
          >
            <div>
              <h3 id="following-confirm-title">取消关注</h3>
              <p id="following-confirm-description">
                确认不再关注“{confirmTarget.nickname}”吗？
              </p>
              {mutationError ? <p role="alert">{mutationError}</p> : null}
              <footer>
                <button
                  type="button"
                  disabled={Boolean(busyId)}
                  onClick={() => {
                    setConfirmTarget(null);
                    setMutationError('');
                    window.setTimeout(
                      () => relationTriggerRef.current?.focus(),
                      0,
                    );
                  }}
                >
                  取消
                </button>
                <button
                  ref={confirmButtonRef}
                  className="danger"
                  type="button"
                  disabled={Boolean(busyId)}
                  aria-busy={Boolean(busyId)}
                  onClick={() => void setFollow(confirmTarget, false)}
                >
                  {busyId ? '处理中…' : '确认取消关注'}
                </button>
              </footer>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
