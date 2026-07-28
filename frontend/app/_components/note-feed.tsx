'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { apiRequest, ApiRequestError } from '../_lib/api';
import {
  consumeNoteListScrollRestore,
  type NoteCardData,
  type NotePageData,
} from '../_lib/notes';
import { Icon } from './icon';
import { NoteCard } from './note-card';

type NoteFeedProps = {
  endpoint: string;
  label: string;
  emptyMessage: string;
  errorMessage: string;
  onPublish?: () => void;
  onUnauthorized?: () => void;
  onAuthenticationRequired?: (resume: () => Promise<void>) => void;
  onInteractionMessage?: (message: string) => void;
  removeWhenUnliked?: boolean;
};

const INITIAL_LOADING_MINIMUM_MS = 300;

export function NoteFeed({
  endpoint,
  label,
  emptyMessage,
  errorMessage,
  onPublish,
  onUnauthorized,
  onAuthenticationRequired,
  onInteractionMessage,
  removeWhenUnliked = false,
}: NoteFeedProps) {
  const [items, setItems] = useState<NoteCardData[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialError, setInitialError] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [interactionError, setInteractionError] = useState('');
  const sentinelRef = useRef<HTMLDivElement>(null);

  const readPage = useCallback(
    async (nextCursor?: string): Promise<NotePageData | null> => {
      const query = new URLSearchParams({ limit: '20' });
      if (nextCursor) query.set('cursor', nextCursor);
      try {
        return await apiRequest<NotePageData>(`${endpoint}?${query}`);
      } catch (error) {
        if (
          error instanceof ApiRequestError &&
          error.status === 401 &&
          onUnauthorized
        ) {
          onUnauthorized();
          return null;
        }
        throw error;
      }
    },
    [endpoint, onUnauthorized],
  );

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      const loadingStartedAt = Date.now();
      setLoading(true);
      setInitialError(false);
      setMoreError(false);
      setItems([]);
      setCursor(null);
      try {
        const page = await readPage();
        if (!active || !page) return;
        setItems(page.items);
        setCursor(page.nextCursor);
      } catch {
        if (active) setInitialError(true);
      } finally {
        const remainingLoadingTime =
          INITIAL_LOADING_MINIMUM_MS - (Date.now() - loadingStartedAt);
        if (remainingLoadingTime > 0) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, remainingLoadingTime),
          );
        }
        if (active) setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [readPage, reloadVersion]);

  useLayoutEffect(() => {
    if (loading || initialError) return;
    const path = `${window.location.pathname}${window.location.search}`;
    const scrollY = consumeNoteListScrollRestore(path);
    if (scrollY !== null) {
      window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
    }
  }, [initialError, items.length, loading]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const page = await readPage(cursor);
      if (!page) return;
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
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { rootMargin: '360px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  if (loading) {
    return (
      <section className="feed-state" aria-label={label} aria-busy="true">
        <div className="feed-loading-grid" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
        <span className="sr-only">正在加载笔记</span>
      </section>
    );
  }

  if (initialError) {
    return (
      <section className="feed-state feed-error-state" aria-label={label}>
        <Icon name="empty" size={46} />
        <p role="alert">{errorMessage}</p>
        <button
          type="button"
          onClick={() => setReloadVersion((value) => value + 1)}
        >
          重试
        </button>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section aria-label={label}>
        <div className="feed-grid" data-testid="feed-grid" aria-hidden="true" />
        <div className="feed-state feed-empty-state">
          <Icon name="empty" size={48} />
          <p>{emptyMessage}</p>
          {onPublish ? (
            <button type="button" onClick={onPublish}>
              发布笔记
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section aria-label={label}>
      <div className="feed-grid" data-testid="feed-grid">
        {items.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            onAuthenticationRequired={onAuthenticationRequired}
            onInteractionError={(message) => {
              setInteractionError(message);
              onInteractionMessage?.(message);
            }}
            onLikeChanged={(noteId, result) => {
              setItems((current) =>
                removeWhenUnliked && !result.active
                  ? current.filter((item) => item.id !== noteId)
                  : current.map((item) =>
                      item.id === noteId
                        ? {
                            ...item,
                            likes: result.count,
                            liked: result.active,
                          }
                        : item,
                    ),
              );
            }}
          />
        ))}
      </div>
      {interactionError && !onInteractionMessage ? (
        <p className="feed-interaction-error" role="alert">
          {interactionError}
        </p>
      ) : null}
      <div className="feed-pagination" ref={sentinelRef} aria-live="polite">
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
