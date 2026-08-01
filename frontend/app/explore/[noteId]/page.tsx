/* eslint-disable @next/next/no-img-element */
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type FormEvent,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  AuthDialog,
  type AuthenticatedUser,
} from '../../_components/auth-dialog';
import { Avatar } from '../../_components/avatar';
import { Icon } from '../../_components/icon';
import { apiRequest, ApiRequestError } from '../../_lib/api';
import { lockDocumentScroll } from '../../_lib/document-scroll-lock';
import {
  bindNoteDetailSource,
  type CommentPageData,
  consumeNoteDetailSource,
  type NoteCommentData,
  type NoteDetailData,
} from '../../_lib/notes';

const THIRTY_DAYS_IN_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;

export function formatNoteTime(value: string, now = Date.now()): string {
  const date = new Date(value);
  const elapsed = Math.max(0, now - date.getTime());
  if (elapsed > THIRTY_DAYS_IN_MILLISECONDS) {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

export default function NoteDetailPage({
  params,
}: {
  params: Promise<{ noteId: string }>;
}) {
  const { noteId } = use(params);
  return <NoteDetailView noteId={noteId} />;
}

type RelationshipKind = 'like' | 'favorite' | 'follow';

export function NoteDetailView({ noteId }: { noteId: string }) {
  const router = useRouter();
  const [note, setNote] = useState<NoteDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [imageIndex, setImageIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState('');
  const [relationshipBusy, setRelationshipBusy] = useState<
    Partial<Record<RelationshipKind, boolean>>
  >({});
  const [authOpen, setAuthOpen] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentError, setCommentError] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [comments, setComments] = useState<NoteCommentData[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsError, setCommentsError] = useState(false);
  const [commentsMoreError, setCommentsMoreError] = useState(false);
  const [commentsCursor, setCommentsCursor] = useState<string | null>(null);
  const [commentsLoadingMore, setCommentsLoadingMore] = useState(false);
  const [commentsReloadVersion, setCommentsReloadVersion] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<NoteCommentData | null>(
    null,
  );
  const [deletingComment, setDeletingComment] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const pendingActionRef = useRef<(() => Promise<void>) | null>(null);
  const commentEntryRef = useRef<HTMLButtonElement>(null);
  const commentContentRef = useRef<HTMLTextAreaElement>(null);
  const authReturnFocusRef = useRef<HTMLElement | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const deleteReturnFocusRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    bindNoteDetailSource(noteId);
  }, [noteId]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setNote(null);
      setLoading(true);
      setNotFound(false);
      setLoadError(false);
      setImageIndex(0);
      setFailedImages(new Set());
      try {
        const result = await apiRequest<NoteDetailData>(`/notes/${noteId}`, {
          signal: controller.signal,
        });
        if (active) setNote(result);
      } catch (error) {
        if (
          !active ||
          (error instanceof Error && error.name === 'AbortError')
        ) {
          return;
        }
        if (error instanceof ApiRequestError && error.status === 404) {
          setNotFound(true);
        } else {
          setLoadError(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [noteId, reloadVersion]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setCommentsLoading(true);
      setCommentsError(false);
      setCommentsMoreError(false);
      setComments([]);
      setCommentsCursor(null);
      try {
        const page = await apiRequest<CommentPageData>(
          `/notes/${noteId}/comments?limit=20`,
          { signal: controller.signal },
        );
        if (!active) return;
        setComments(page.items);
        setCommentsCursor(page.nextCursor);
        setNote((current) =>
          current
            ? {
                ...current,
                interactions: { ...current.interactions, comments: page.total },
              }
            : current,
        );
      } catch (error) {
        if (
          active &&
          !(error instanceof Error && error.name === 'AbortError')
        ) {
          setCommentsError(true);
        }
      } finally {
        if (active) setCommentsLoading(false);
      }
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [commentsReloadVersion, noteId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!deleteTarget) return;
    return lockDocumentScroll();
  }, [deleteTarget]);

  const closeDeleteDialog = useCallback(() => {
    setDeleteTarget(null);
    setDeleteError('');
    window.setTimeout(() => deleteReturnFocusRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!deleteTarget) return;
    window.setTimeout(
      () =>
        deleteDialogRef.current
          ?.querySelector<HTMLButtonElement>('[data-confirm-delete]')
          ?.focus(),
      0,
    );
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeDeleteDialog();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [closeDeleteDialog, deleteTarget]);

  const requestAuthentication = (resume?: () => Promise<void>) => {
    pendingActionRef.current = resume ?? null;
    setAuthOpen(true);
  };

  const setRelationship = async (
    kind: RelationshipKind,
    target: boolean,
    allowAuthentication = true,
  ) => {
    const snapshot = note;
    if (!snapshot || relationshipBusy[kind]) return;
    if (kind === 'like' && !snapshot.viewer.canLike) {
      setToast('不能点赞自己的笔记');
      return;
    }
    if (kind === 'follow' && !snapshot.viewer.canFollow) return;

    setRelationshipBusy((current) => ({ ...current, [kind]: true }));
    setNote((current) => {
      if (!current) return current;
      if (kind === 'follow') {
        return {
          ...current,
          viewer: { ...current.viewer, followingAuthor: target },
        };
      }
      const key = kind === 'like' ? 'likes' : 'favorites';
      return {
        ...current,
        interactions: {
          ...current.interactions,
          [key]: Math.max(0, current.interactions[key] + (target ? 1 : -1)),
        },
        viewer: {
          ...current.viewer,
          ...(kind === 'like' ? { liked: target } : { favorited: target }),
        },
      };
    });

    try {
      if (kind === 'follow') {
        const result = await apiRequest<{ following: boolean }>(
          `/users/${snapshot.author.id}/follow`,
          { method: target ? 'PUT' : 'DELETE' },
        );
        setNote((current) =>
          current
            ? {
                ...current,
                viewer: {
                  ...current.viewer,
                  followingAuthor: result.following,
                },
              }
            : current,
        );
      } else {
        const result = await apiRequest<{ active: boolean; count: number }>(
          `/notes/${snapshot.id}/${kind}`,
          { method: target ? 'PUT' : 'DELETE' },
        );
        const key = kind === 'like' ? 'likes' : 'favorites';
        setNote((current) =>
          current
            ? {
                ...current,
                interactions: {
                  ...current.interactions,
                  [key]: result.count,
                },
                viewer: {
                  ...current.viewer,
                  ...(kind === 'like'
                    ? { liked: result.active }
                    : { favorited: result.active }),
                },
              }
            : current,
        );
      }
    } catch (error) {
      setNote(snapshot);
      if (
        allowAuthentication &&
        error instanceof ApiRequestError &&
        error.status === 401
      ) {
        requestAuthentication(() => setRelationship(kind, target, false));
      } else if (
        error instanceof ApiRequestError &&
        (error.payload.code === 'SELF_LIKE_NOT_ALLOWED' ||
          error.payload.code === 'SELF_FOLLOW_NOT_ALLOWED')
      ) {
        setNote({
          ...snapshot,
          viewer: {
            ...snapshot.viewer,
            isAuthor: true,
            canLike: false,
            canFollow: false,
          },
        });
        setToast(
          error.payload.code === 'SELF_LIKE_NOT_ALLOWED'
            ? '不能点赞自己的笔记'
            : '不能关注自己',
        );
      } else {
        setToast(
          kind === 'follow'
            ? '关注操作失败，请稍后重试'
            : `${kind === 'like' ? '点赞' : '收藏'}操作失败，请稍后重试`,
        );
      }
    } finally {
      setRelationshipBusy((current) => ({ ...current, [kind]: false }));
    }
  };

  const loadMoreComments = async () => {
    if (!commentsCursor || commentsLoadingMore) return;
    setCommentsLoadingMore(true);
    setCommentsMoreError(false);
    try {
      const query = new URLSearchParams({
        limit: '20',
        cursor: commentsCursor,
      });
      const page = await apiRequest<CommentPageData>(
        `/notes/${noteId}/comments?${query}`,
      );
      setComments((current) => {
        const known = new Set(current.map((comment) => comment.id));
        return [
          ...current,
          ...page.items.filter((comment) => !known.has(comment.id)),
        ];
      });
      setCommentsCursor(page.nextCursor);
      setNote((current) =>
        current
          ? {
              ...current,
              interactions: { ...current.interactions, comments: page.total },
            }
          : current,
      );
    } catch {
      setCommentsMoreError(true);
    } finally {
      setCommentsLoadingMore(false);
    }
  };

  const openCommentInput = () => {
    authReturnFocusRef.current = commentEntryRef.current;
    setCommenting(true);
    setCommentError('');
    if (!note?.viewer.authenticated) {
      requestAuthentication();
    }
  };

  const submitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = commentDraft.trim();
    const length = Array.from(content).length;
    setCommentError('');
    if (length < 1 || length > 500) {
      setCommentError('评论需为1～500个字符');
      return;
    }
    if (!note?.viewer.authenticated) {
      authReturnFocusRef.current = commentContentRef.current;
      requestAuthentication();
      return;
    }
    if (commentSubmitting) return;
    setCommentSubmitting(true);
    try {
      const result = await apiRequest<{
        comment: NoteCommentData;
        total: number;
      }>(`/notes/${noteId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      setComments((current) => [
        result.comment,
        ...current.filter((comment) => comment.id !== result.comment.id),
      ]);
      setNote((current) =>
        current
          ? {
              ...current,
              interactions: {
                ...current.interactions,
                comments: result.total,
              },
            }
          : current,
      );
      setCommentDraft('');
      setCommenting(false);
      setToast('评论发布成功');
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        authReturnFocusRef.current = commentContentRef.current;
        requestAuthentication();
      } else if (
        error instanceof ApiRequestError &&
        error.payload.code === 'COMMENT_INVALID'
      ) {
        setCommentError('评论需为1～500个字符');
      } else {
        setCommentError('评论发布失败，内容已保留，请重试');
      }
    } finally {
      setCommentSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deletingComment) return;
    setDeletingComment(true);
    setDeleteError('');
    try {
      const result = await apiRequest<{ deleted: true; total: number }>(
        `/notes/${noteId}/comments/${deleteTarget.id}`,
        { method: 'DELETE' },
      );
      setComments((current) =>
        current.filter((comment) => comment.id !== deleteTarget.id),
      );
      setNote((current) =>
        current
          ? {
              ...current,
              interactions: {
                ...current.interactions,
                comments: result.total,
              },
            }
          : current,
      );
      closeDeleteDialog();
      setToast('评论已删除');
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        closeDeleteDialog();
        requestAuthentication();
      } else if (error instanceof ApiRequestError && error.status === 404) {
        setComments((current) =>
          current.filter((comment) => comment.id !== deleteTarget.id),
        );
        closeDeleteDialog();
        setCommentsReloadVersion((value) => value + 1);
      } else {
        setDeleteError('删除失败，请稍后重试');
      }
    } finally {
      setDeletingComment(false);
    }
  };

  const selectImage = (next: number) => {
    if (!note || next < 0 || next >= note.images.length) return;
    setImageIndex(next);
  };

  if (loading) {
    return (
      <main className="detail-page detail-loading" aria-busy="true">
        <span>正在加载笔记…</span>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="detail-page detail-message-page">
        <Image
          src="/brand/littlebluebook-logo.svg"
          alt="小蓝书"
          width={116}
          height={52}
        />
        <Icon name="empty" size={58} />
        <h1>笔记不存在</h1>
        <p>这篇笔记可能不存在或暂时无法访问。</p>
        <Link href="/">返回首页</Link>
      </main>
    );
  }

  if (loadError || !note) {
    return (
      <main className="detail-page detail-message-page">
        <Icon name="empty" size={58} />
        <h1>笔记加载失败</h1>
        <p role="alert">网络异常，请稍后重试</p>
        <button
          type="button"
          onClick={() => setReloadVersion((value) => value + 1)}
        >
          重试
        </button>
        <Link href="/">返回首页</Link>
      </main>
    );
  }

  const currentImage = note.images[imageIndex];
  const commentLength = Array.from(commentDraft).length;

  return (
    <main className="detail-page">
      <button
        className="detail-back-button"
        type="button"
        aria-label="返回上一页"
        onClick={() => {
          if (consumeNoteDetailSource(noteId)) {
            window.history.back();
          } else {
            router.push('/');
          }
        }}
      >
        <Icon name="chevronLeft" size={20} />
        <span>返回</span>
      </button>

      <article className="note-detail">
        <section
          className="detail-media"
          aria-label={`笔记图片，第${imageIndex + 1}张，共${note.images.length}张`}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              selectImage(imageIndex - 1);
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              selectImage(imageIndex + 1);
            }
          }}
        >
          {currentImage && !failedImages.has(imageIndex) ? (
            <img
              src={currentImage.url}
              alt={`笔记图片 ${imageIndex + 1}`}
              onError={() =>
                setFailedImages((current) => new Set(current).add(imageIndex))
              }
            />
          ) : (
            <div
              className="detail-image-error"
              role="img"
              aria-label="图片加载失败"
            >
              <Icon name="empty" size={54} />
              <span>图片加载失败</span>
            </div>
          )}

          {note.images.length > 1 ? (
            <>
              <button
                className="carousel-button previous"
                type="button"
                disabled={imageIndex === 0}
                aria-label="上一张图片"
                onClick={() => selectImage(imageIndex - 1)}
              >
                <Icon name="chevronLeft" />
              </button>
              <button
                className="carousel-button next"
                type="button"
                disabled={imageIndex === note.images.length - 1}
                aria-label="下一张图片"
                onClick={() => selectImage(imageIndex + 1)}
              >
                <Icon name="chevronRight" />
              </button>
              <span className="carousel-position" aria-live="polite">
                {imageIndex + 1}/{note.images.length}
              </span>
            </>
          ) : null}
        </section>

        <section className="detail-content">
          <div className="detail-scroll">
            <header className="detail-author">
              <Avatar avatar={note.author.avatar} className="detail-avatar" />
              <strong>{note.author.nickname}</strong>
              {note.viewer.canFollow ? (
                <button
                  className={note.viewer.followingAuthor ? 'followed' : ''}
                  type="button"
                  disabled={relationshipBusy.follow}
                  aria-pressed={note.viewer.followingAuthor}
                  onClick={(event) => {
                    authReturnFocusRef.current = event.currentTarget;
                    void setRelationship(
                      'follow',
                      !note.viewer.followingAuthor,
                    );
                  }}
                >
                  {note.viewer.followingAuthor ? '已关注' : '关注'}
                </button>
              ) : null}
            </header>

            <div className="detail-copy">
              <h1>{note.title}</h1>
              <p>{note.content}</p>
              {note.channel ? (
                note.channel.navigable ? (
                  <Link
                    className="detail-channel-tag"
                    href={`/?channel=${encodeURIComponent(note.channel.code)}`}
                  >
                    {note.channel.name}
                  </Link>
                ) : (
                  <span className="detail-channel-tag disabled">
                    {note.channel.name}
                  </span>
                )
              ) : null}
              <time dateTime={note.createdAt}>
                {formatNoteTime(note.createdAt)}
              </time>
            </div>

            <section className="comment-section" aria-label="评论区">
              <h2>共 {note.interactions.comments} 条评论</h2>
              {commentsLoading ? (
                <div className="comment-state" aria-busy="true">
                  正在加载评论…
                </div>
              ) : commentsError ? (
                <div className="comment-state">
                  <p role="alert">评论加载失败，请稍后重试</p>
                  <button
                    type="button"
                    onClick={() =>
                      setCommentsReloadVersion((value) => value + 1)
                    }
                  >
                    重试
                  </button>
                </div>
              ) : comments.length === 0 ? (
                <div className="comment-state">
                  <Icon name="comment" size={34} />
                  <p>还没有评论</p>
                </div>
              ) : (
                <ul className="comment-list">
                  {comments.map((comment) => (
                    <li key={comment.id}>
                      <Avatar
                        avatar={comment.author.avatar}
                        className="comment-avatar"
                      />
                      <div className="comment-body">
                        <div className="comment-heading">
                          <strong>{comment.author.nickname}</strong>
                          {comment.isAuthor ? <span>作者</span> : null}
                          {comment.canDelete ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                deleteReturnFocusRef.current =
                                  event.currentTarget;
                                setDeleteTarget(comment);
                              }}
                            >
                              删除
                            </button>
                          ) : null}
                        </div>
                        <p>{comment.content}</p>
                        <time dateTime={comment.createdAt}>
                          {formatNoteTime(comment.createdAt)}
                        </time>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {!commentsLoading && !commentsError && commentsCursor ? (
                <div className="comment-pagination">
                  {commentsMoreError ? (
                    <span role="alert">加载更多失败，已保留现有评论</span>
                  ) : null}
                  <button
                    type="button"
                    disabled={commentsLoadingMore}
                    onClick={() => void loadMoreComments()}
                  >
                    {commentsLoadingMore
                      ? '正在加载…'
                      : commentsMoreError
                        ? '重新加载'
                        : '加载更多评论'}
                  </button>
                </div>
              ) : null}
            </section>
          </div>

          <div className="detail-action-area">
            {commenting ? (
              <form className="comment-composer" onSubmit={submitComment}>
                <label htmlFor="comment-content">评论内容</label>
                <textarea
                  ref={commentContentRef}
                  id="comment-content"
                  value={commentDraft}
                  maxLength={500}
                  rows={3}
                  aria-describedby="comment-length comment-error"
                  onChange={(event) => setCommentDraft(event.target.value)}
                />
                <div>
                  <span
                    id="comment-length"
                    className={commentLength > 500 ? 'invalid' : ''}
                  >
                    {commentLength}/500
                  </span>
                  <button
                    type="button"
                    disabled={commentSubmitting}
                    onClick={() => {
                      setCommenting(false);
                      setCommentError('');
                      window.setTimeout(
                        () => commentEntryRef.current?.focus(),
                        0,
                      );
                    }}
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={
                      commentSubmitting ||
                      commentDraft.trim().length === 0 ||
                      commentLength > 500
                    }
                    aria-busy={commentSubmitting}
                  >
                    {commentSubmitting ? '发送中…' : '发送'}
                  </button>
                </div>
                <p id="comment-error" role={commentError ? 'alert' : undefined}>
                  {commentError}
                </p>
              </form>
            ) : null}
            <footer className="detail-actions">
              <button
                ref={commentEntryRef}
                className="comment-entry"
                type="button"
                onClick={openCommentInput}
              >
                说点什么…
              </button>
              <button
                className={note.viewer.liked ? 'selected' : ''}
                type="button"
                disabled={relationshipBusy.like || !note.viewer.canLike}
                aria-pressed={note.viewer.liked}
                aria-label={
                  note.viewer.canLike
                    ? `${note.viewer.liked ? '取消点赞' : '点赞'}，当前 ${note.interactions.likes}`
                    : `自己的笔记不可点赞，当前 ${note.interactions.likes}`
                }
                title={note.viewer.canLike ? undefined : '不能点赞自己的笔记'}
                onClick={(event) => {
                  authReturnFocusRef.current = event.currentTarget;
                  void setRelationship('like', !note.viewer.liked);
                }}
              >
                <Icon name="heart" size={26} />
                <span>{note.interactions.likes}</span>
              </button>
              <button
                className={note.viewer.favorited ? 'selected' : ''}
                type="button"
                disabled={relationshipBusy.favorite}
                aria-pressed={note.viewer.favorited}
                aria-label={`${note.viewer.favorited ? '取消收藏' : '收藏'}，当前 ${note.interactions.favorites}`}
                onClick={(event) => {
                  authReturnFocusRef.current = event.currentTarget;
                  void setRelationship('favorite', !note.viewer.favorited);
                }}
              >
                <Icon name="bookmark" size={26} />
                <span>{note.interactions.favorites}</span>
              </button>
              <button
                type="button"
                aria-label="分享，功能正在开发中"
                onClick={() => setToast('功能正在开发中')}
              >
                <Icon name="share" size={26} />
              </button>
            </footer>
          </div>
        </section>
      </article>

      <AuthDialog
        open={authOpen}
        onClose={() => {
          setAuthOpen(false);
          pendingActionRef.current = null;
        }}
        onAuthenticated={(user: AuthenticatedUser) => {
          setAuthOpen(false);
          setNote((current) =>
            current
              ? {
                  ...current,
                  viewer: {
                    ...current.viewer,
                    authenticated: true,
                    isAuthor: user.id === current.author.id,
                    canLike: user.id !== current.author.id,
                    canFollow: user.id !== current.author.id,
                  },
                }
              : current,
          );
          setCommentsReloadVersion((value) => value + 1);
          const pending = pendingActionRef.current;
          pendingActionRef.current = null;
          if (pending) void pending();
        }}
        onToast={setToast}
        returnFocusRef={authReturnFocusRef}
      />

      {deleteTarget ? (
        <div className="confirm-layer">
          <div className="modal-backdrop" aria-hidden="true" />
          <div
            ref={deleteDialogRef}
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-comment-title"
            aria-describedby="delete-comment-description"
          >
            <h2 id="delete-comment-title">删除评论</h2>
            <p id="delete-comment-description">
              删除后无法恢复，确定删除这条评论吗？
            </p>
            {deleteError ? <p role="alert">{deleteError}</p> : null}
            <div>
              <button
                type="button"
                disabled={deletingComment}
                onClick={closeDeleteDialog}
              >
                取消
              </button>
              <button
                data-confirm-delete
                type="button"
                disabled={deletingComment}
                onClick={() => void confirmDelete()}
              >
                {deletingComment ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </main>
  );
}
