'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiRequest, ApiRequestError } from '../_lib/api';
import { lockDocumentScroll } from '../_lib/document-scroll-lock';
import { Avatar, type ProfileAvatar } from './avatar';

type FollowingUser = {
  id: string;
  nickname: string;
  littleBlueBookId: string;
  bio: string | null;
  avatar: ProfileAvatar;
};

type FollowingPage = {
  items: FollowingUser[];
  nextCursor: string | null;
};

type FollowingDialogProps = {
  open: boolean;
  onClose: () => void;
  onFollowingCountChange: (count: number) => void;
  onAuthenticationRequired?: () => void;
};

export function FollowingDialog({
  open,
  onClose,
  onFollowingCountChange,
  onAuthenticationRequired,
}: FollowingDialogProps) {
  const router = useRouter();
  const [items, setItems] = useState<FollowingUser[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<FollowingUser | null>(
    null,
  );
  const [unfollowing, setUnfollowing] = useState(false);
  const [unfollowError, setUnfollowError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLButtonElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const unfollowTriggerRef = useRef<HTMLButtonElement | null>(null);
  const loadingMoreRef = useRef(false);
  const onAuthenticationRequiredRef = useRef(onAuthenticationRequired);

  useEffect(() => {
    onAuthenticationRequiredRef.current = onAuthenticationRequired;
  }, [onAuthenticationRequired]);

  const load = useCallback(async (cursor?: string, signal?: AbortSignal) => {
    try {
      const page = await apiRequest<FollowingPage>(
        `/profile/me/following${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal },
      );
      setItems((current) => {
        const merged = cursor ? [...current, ...page.items] : page.items;
        return merged.filter(
          (item, index) =>
            merged.findIndex((candidate) => candidate.id === item.id) === index,
        );
      });
      setNextCursor(page.nextCursor);
    } catch (loadError) {
      if (loadError instanceof ApiRequestError && loadError.status === 401) {
        onAuthenticationRequiredRef.current?.();
      }
      throw loadError;
    }
  }, []);

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
            setError('关注列表加载失败，请稍后重试');
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
        if (confirmTarget && !unfollowing) {
          setConfirmTarget(null);
          setUnfollowError('');
          window.setTimeout(() => unfollowTriggerRef.current?.focus(), 0);
        } else if (!confirmTarget) {
          onClose();
        }
        return;
      }
      const focusContainer = confirmTarget
        ? confirmationRef.current
        : dialogRef.current;
      if (event.key !== 'Tab' || !focusContainer) return;
      const controls = Array.from(
        focusContainer.querySelectorAll<HTMLElement>(
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
  }, [confirmTarget, onClose, open, unfollowing]);

  useEffect(() => {
    if (!confirmTarget) return;
    window.setTimeout(() => confirmButtonRef.current?.focus(), 0);
  }, [confirmTarget]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError('');
    try {
      await load(nextCursor);
    } catch (loadError) {
      if (!(loadError instanceof Error && loadError.name === 'AbortError')) {
        setError('更多关注加载失败，请重试');
      }
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
    ) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { root, rootMargin: '160px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore, nextCursor, open]);

  if (!open) return null;

  const unfollow = async () => {
    if (!confirmTarget || unfollowing) return;
    setUnfollowing(true);
    setUnfollowError('');
    try {
      const result = await apiRequest<{
        following: false;
        followingCount: number;
      }>(`/users/${encodeURIComponent(confirmTarget.id)}/follow`, {
        method: 'DELETE',
      });
      setItems((current) =>
        current.filter((item) => item.id !== confirmTarget.id),
      );
      onFollowingCountChange(result.followingCount);
      setConfirmTarget(null);
      window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    } catch (unfollowRequestError) {
      if (
        unfollowRequestError instanceof ApiRequestError &&
        unfollowRequestError.status === 401
      ) {
        onAuthenticationRequiredRef.current?.();
        setUnfollowError('登录状态已失效，请重新登录后重试');
      } else {
        setUnfollowError('取消关注失败，请稍后重试');
      }
    } finally {
      setUnfollowing(false);
    }
  };

  return (
    <div className="following-dialog-layer">
      <button
        className="modal-backdrop"
        type="button"
        aria-label="关闭关注列表"
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
          <h2 id="following-dialog-title">我的关注</h2>
          <button ref={closeButtonRef} type="button" onClick={onClose}>
            <span aria-hidden="true">×</span>
            <span className="sr-only">关闭关注列表</span>
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
              aria-label="正在加载关注列表"
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
              <span className="sr-only">正在加载关注列表…</span>
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
                    .catch(() => setError('关注列表加载失败，请稍后重试'))
                    .finally(() => setLoading(false));
                }}
              >
                重新加载
              </button>
            </div>
          ) : null}
          {!loading && !error && items.length === 0 ? (
            <p className="following-state">还没有关注任何人</p>
          ) : null}
          {items.map((user) => (
            <article className="following-row" key={user.id}>
              <button
                className="following-user-link"
                type="button"
                onClick={() => {
                  onClose();
                  router.push(`/users/${encodeURIComponent(user.id)}`);
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
              <button
                className="following-action"
                type="button"
                onClick={(event) => {
                  unfollowTriggerRef.current = event.currentTarget;
                  setConfirmTarget(user);
                }}
              >
                已关注
              </button>
            </article>
          ))}
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
              {unfollowError ? <p role="alert">{unfollowError}</p> : null}
              <footer>
                <button
                  type="button"
                  disabled={unfollowing}
                  onClick={() => {
                    setConfirmTarget(null);
                    setUnfollowError('');
                    window.setTimeout(
                      () => unfollowTriggerRef.current?.focus(),
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
                  disabled={unfollowing}
                  aria-busy={unfollowing}
                  onClick={() => void unfollow()}
                >
                  {unfollowing ? '处理中…' : '确认取消关注'}
                </button>
              </footer>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
