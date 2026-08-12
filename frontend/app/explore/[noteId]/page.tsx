/* eslint-disable @next/next/no-img-element */
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Fragment,
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
import { NoteManageMenu } from '../../_components/note-manage-menu';
import { ReportDialog } from '../../_components/report-dialog';
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

function updateCommentTree(
  comments: NoteCommentData[],
  commentId: string,
  update: (comment: NoteCommentData) => NoteCommentData | null,
): NoteCommentData[] {
  return comments.flatMap((root) => {
    if (root.id === commentId) {
      const next = update(root);
      return next ? [next] : [];
    }
    let removedReply = false;
    const replies = root.replies.flatMap((reply) => {
      if (reply.id !== commentId) return [reply];
      const next = update(reply);
      if (!next) removedReply = true;
      return next ? [next] : [];
    });
    return [
      {
        ...root,
        replies,
        replyCount: Math.max(0, root.replyCount - (removedReply ? 1 : 0)),
      },
    ];
  });
}

function normalizeComment(comment: NoteCommentData): NoteCommentData {
  return {
    ...comment,
    rootCommentId: comment.rootCommentId ?? null,
    content: comment.content ?? null,
    deleted: comment.deleted ?? false,
    moderationHidden: comment.moderationHidden ?? false,
    replyTo: comment.replyTo ?? null,
    canReply: comment.canReply ?? !comment.deleted,
    likes: comment.likes ?? 0,
    liked: comment.liked ?? false,
    canLike: comment.canLike ?? true,
    canReport: comment.canReport ?? false,
    replies: (comment.replies ?? []).map(normalizeComment),
    replyCount: comment.replyCount ?? comment.replies?.length ?? 0,
    repliesNextCursor: comment.repliesNextCursor ?? null,
  };
}

function hasVisibleComments(comments: NoteCommentData[]): boolean {
  return comments.some(
    (comment) =>
      !comment.deleted ||
      comment.moderationHidden ||
      comment.replies.some(
        (reply) => !reply.deleted || reply.moderationHidden,
      ) ||
      Boolean(comment.repliesNextCursor),
  );
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
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReloadKey, setVideoReloadKey] = useState(0);
  const [toast, setToast] = useState('');
  const [relationshipBusy, setRelationshipBusy] = useState<
    Partial<Record<RelationshipKind, boolean>>
  >({});
  const [authOpen, setAuthOpen] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentError, setCommentError] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyTarget, setReplyTarget] = useState<NoteCommentData | null>(null);
  const [commentLikeBusy, setCommentLikeBusy] = useState<Set<string>>(
    () => new Set(),
  );
  const [replyLoadingIds, setReplyLoadingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [replyErrorIds, setReplyErrorIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [highlightCommentId, setHighlightCommentId] = useState<string | null>(
    null,
  );
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
  const [reportTarget, setReportTarget] = useState<{
    targetType: 'NOTE' | 'COMMENT';
    targetId: string;
  } | null>(null);
  const pendingActionRef = useRef<(() => Promise<void>) | null>(null);
  const commentEntryRef = useRef<HTMLButtonElement>(null);
  const commentContentRef = useRef<HTMLTextAreaElement>(null);
  const authReturnFocusRef = useRef<HTMLElement | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const deleteReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const deleteFocusRequestRef = useRef<{
    focusCommentEntry: boolean;
    returnTarget: HTMLButtonElement | null;
  } | null>(null);
  const backNavigationFallbackRef = useRef<number | null>(null);
  const locatedCommentRef = useRef(false);

  const enterDeletedState = useCallback(() => {
    setLoading(false);
    setLoadError(false);
    setNotFound(true);
    setNote(null);
    setComments([]);
    setCommentsError(false);
    setCommentsMoreError(false);
    setCommentsCursor(null);
    setCommenting(false);
    setReplyTarget(null);
    setDeleteTarget(null);
    setAuthOpen(false);
  }, []);

  const recoverDeletedNote = useCallback(
    async (error: unknown): Promise<boolean> => {
      if (!(error instanceof ApiRequestError) || error.status !== 404) {
        return false;
      }
      if (error.payload.code === 'NOTE_NOT_FOUND') {
        enterDeletedState();
        return true;
      }
      try {
        await apiRequest<NoteDetailData>(`/notes/${noteId}`);
        return false;
      } catch (probeError) {
        if (
          probeError instanceof ApiRequestError &&
          probeError.status === 404
        ) {
          enterDeletedState();
          return true;
        }
        return false;
      }
    },
    [enterDeletedState, noteId],
  );

  useEffect(() => {
    return () => {
      if (backNavigationFallbackRef.current !== null) {
        window.clearTimeout(backNavigationFallbackRef.current);
      }
    };
  }, []);

  useEffect(() => {
    locatedCommentRef.current = false;
  }, [noteId]);

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
    if (note?.id !== noteId) return;
    const controller = new AbortController();
    void apiRequest<{ counted: boolean; viewCount: number }>(
      `/notes/${noteId}/views`,
      { method: 'POST', signal: controller.signal },
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setNote((current) =>
          current
            ? {
                ...current,
                interactions: {
                  ...current.interactions,
                  views: Math.max(0, result.viewCount),
                },
              }
            : current,
        );
      })
      .catch((error) => {
        void recoverDeletedNote(error);
      });
    return () => controller.abort();
  }, [note?.id, noteId, recoverDeletedNote]);

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
        setComments(page.items.map(normalizeComment));
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
          if (await recoverDeletedNote(error)) return;
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
  }, [commentsReloadVersion, noteId, recoverDeletedNote]);

  useEffect(() => {
    if (commentsLoading || commentsError || locatedCommentRef.current) return;
    const parameters = new URLSearchParams(window.location.search);
    const targetId = parameters.get('comment');
    const rootId = parameters.get('root') ?? targetId;
    if (!targetId || !rootId) {
      if (parameters.get('commentDeleted') === '1') {
        locatedCommentRef.current = true;
        queueMicrotask(() => setToast('相关评论已删除'));
      }
      return;
    }
    locatedCommentRef.current = true;
    let cancelled = false;
    void Promise.resolve()
      .then(async () => {
        let roots = comments;
        let rootCursor = commentsCursor;
        let root = roots.find((comment) => comment.id === rootId);
        while (!root && rootCursor && !cancelled) {
          const page = await apiRequest<CommentPageData>(
            `/notes/${noteId}/comments?limit=20&cursor=${encodeURIComponent(rootCursor)}`,
          );
          roots = [...roots, ...page.items.map(normalizeComment)].filter(
            (item, index, items) =>
              items.findIndex((candidate) => candidate.id === item.id) ===
              index,
          );
          rootCursor = page.nextCursor;
          root = roots.find((comment) => comment.id === rootId);
        }
        if (cancelled) return;
        if (!root) {
          setToast('相关评论已删除');
          return;
        }
        let target =
          targetId === root.id
            ? root
            : root.replies.find((item) => item.id === targetId);
        let replyCursor = root.repliesNextCursor;
        let replies = root.replies;
        while (!target && replyCursor && !cancelled) {
          const page = await apiRequest<CommentPageData>(
            `/notes/${noteId}/comments/${root.id}/replies?limit=10&cursor=${encodeURIComponent(replyCursor)}`,
          );
          replies = [...replies, ...page.items.map(normalizeComment)].filter(
            (item, index, items) =>
              items.findIndex((candidate) => candidate.id === item.id) ===
              index,
          );
          replyCursor = page.nextCursor;
          target = replies.find((item) => item.id === targetId);
        }
        if (cancelled) return;
        setComments(
          roots.map((comment) =>
            comment.id === root!.id
              ? { ...comment, replies, repliesNextCursor: replyCursor }
              : comment,
          ),
        );
        setCommentsCursor(rootCursor);
        if (!target || target.deleted) {
          setToast('相关评论已删除');
        }
        if (target) {
          setHighlightCommentId(target.id);
          window.setTimeout(() => {
            document
              .querySelector<HTMLElement>(`[data-comment-id="${target!.id}"]`)
              ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }, 0);
          window.setTimeout(() => setHighlightCommentId(null), 2200);
        }
      })
      .catch(async (error) => {
        if (await recoverDeletedNote(error)) return;
        setToast('评论定位失败，请重试');
      });
    return () => {
      cancelled = true;
    };
  }, [
    comments,
    commentsCursor,
    commentsError,
    commentsLoading,
    noteId,
    recoverDeletedNote,
  ]);

  useEffect(() => {
    const message = window.sessionStorage.getItem(
      'littlebluebook:detail-toast',
    );
    if (!message) return;
    window.sessionStorage.removeItem('littlebluebook:detail-toast');
    queueMicrotask(() => setToast(message));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!deleteTarget) return;
    return lockDocumentScroll();
  }, [deleteTarget]);

  const closeDeleteDialog = useCallback((focusCommentEntry = false) => {
    deleteFocusRequestRef.current = {
      focusCommentEntry,
      returnTarget: deleteReturnFocusRef.current,
    };
    setDeleteTarget(null);
    setDeleteError('');
  }, []);

  useEffect(() => {
    if (deleteTarget || !deleteFocusRequestRef.current) return;
    const request = deleteFocusRequestRef.current;
    deleteFocusRequestRef.current = null;
    const timer = window.setTimeout(() => {
      if (!request.focusCommentEntry && request.returnTarget?.isConnected) {
        request.returnTarget.focus();
      } else {
        commentEntryRef.current?.focus();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [deleteTarget]);

  useEffect(() => {
    if (!deleteTarget) return;
    window.setTimeout(
      () =>
        deleteDialogRef.current
          ?.querySelector<HTMLButtonElement>('[data-confirm-delete]')
          ?.focus(),
      0,
    );
    const dialog = deleteDialogRef.current;
    const focusDialogControl = (last = false) => {
      const controls = dialog
        ? Array.from(
            dialog.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          )
        : [];
      const target = last ? controls.at(-1) : controls[0];
      (target ?? dialog)?.focus();
    };
    const keepDialogFocus = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDeleteDialog();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = controls[0];
      const last = controls.at(-1);
      const active = document.activeElement;
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
      } else if (
        event.shiftKey &&
        (active === first || !dialog.contains(active))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !dialog.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    const containFocus = (event: FocusEvent) => {
      if (dialog && !dialog.contains(event.target as Node)) {
        focusDialogControl();
      }
    };
    document.addEventListener('keydown', keepDialogFocus);
    document.addEventListener('focusin', containFocus);
    return () => {
      document.removeEventListener('keydown', keepDialogFocus);
      document.removeEventListener('focusin', containFocus);
    };
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
      if (await recoverDeletedNote(error)) return;
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
          ...page.items
            .map(normalizeComment)
            .filter((comment) => !known.has(comment.id)),
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
    } catch (error) {
      if (await recoverDeletedNote(error)) return;
      setCommentsMoreError(true);
    } finally {
      setCommentsLoadingMore(false);
    }
  };

  const loadMoreReplies = async (rootCommentId: string) => {
    const root = comments.find((comment) => comment.id === rootCommentId);
    if (!root?.repliesNextCursor || replyLoadingIds.has(rootCommentId)) return;
    setReplyLoadingIds((current) => new Set(current).add(rootCommentId));
    setReplyErrorIds((current) => {
      const next = new Set(current);
      next.delete(rootCommentId);
      return next;
    });
    try {
      const page = await apiRequest<CommentPageData>(
        `/notes/${noteId}/comments/${rootCommentId}/replies?limit=10&cursor=${encodeURIComponent(root.repliesNextCursor)}`,
      );
      setComments((current) =>
        current.map((comment) =>
          comment.id === rootCommentId
            ? {
                ...comment,
                replies: [
                  ...comment.replies,
                  ...page.items.map(normalizeComment),
                ].filter(
                  (item, index, items) =>
                    items.findIndex((candidate) => candidate.id === item.id) ===
                    index,
                ),
                repliesNextCursor: page.nextCursor,
                replyCount: page.total,
              }
            : comment,
        ),
      );
    } catch (error) {
      if (await recoverDeletedNote(error)) return;
      setReplyErrorIds((current) => new Set(current).add(rootCommentId));
    } finally {
      setReplyLoadingIds((current) => {
        const next = new Set(current);
        next.delete(rootCommentId);
        return next;
      });
    }
  };

  const openReplyInput = (comment: NoteCommentData) => {
    setReplyTarget(comment);
    setCommenting(true);
    setCommentError('');
    window.setTimeout(() => commentContentRef.current?.focus(), 0);
    if (!note?.viewer.authenticated) requestAuthentication();
  };

  const setCommentLike = async (
    comment: NoteCommentData,
    target: boolean,
    allowAuthentication = true,
  ) => {
    if (comment.deleted || commentLikeBusy.has(comment.id)) return;
    const previous = comment;
    setCommentLikeBusy((current) => new Set(current).add(comment.id));
    setComments((current) =>
      updateCommentTree(current, comment.id, (item) => ({
        ...item,
        liked: target,
        likes: Math.max(0, item.likes + (target ? 1 : -1)),
      })),
    );
    try {
      const result = await apiRequest<{ active: boolean; count: number }>(
        `/comments/${comment.id}/like`,
        { method: target ? 'PUT' : 'DELETE' },
      );
      setComments((current) =>
        updateCommentTree(current, comment.id, (item) => ({
          ...item,
          liked: result.active,
          likes: result.count,
        })),
      );
    } catch (error) {
      setComments((current) =>
        updateCommentTree(current, comment.id, () => previous),
      );
      if (await recoverDeletedNote(error)) return;
      if (
        allowAuthentication &&
        error instanceof ApiRequestError &&
        error.status === 401
      ) {
        pendingActionRef.current = () => setCommentLike(comment, target, false);
        setAuthOpen(true);
      } else if (
        error instanceof ApiRequestError &&
        error.payload.code === 'SELF_COMMENT_LIKE_NOT_ALLOWED'
      ) {
        setToast('不能点赞自己的评论');
      } else {
        setToast('评论点赞失败，已恢复服务端状态');
      }
    } finally {
      setCommentLikeBusy((current) => {
        const next = new Set(current);
        next.delete(comment.id);
        return next;
      });
    }
  };

  const openCommentInput = () => {
    authReturnFocusRef.current = commentEntryRef.current;
    setCommenting(true);
    setReplyTarget(null);
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
      }>(
        replyTarget
          ? `/notes/${noteId}/comments/${replyTarget.id}/replies`
          : `/notes/${noteId}/comments`,
        {
          method: 'POST',
          body: JSON.stringify({ content }),
        },
      );
      setComments((current) => {
        if (!replyTarget) {
          return [
            normalizeComment(result.comment),
            ...current.filter((comment) => comment.id !== result.comment.id),
          ];
        }
        const rootId = replyTarget.rootCommentId ?? replyTarget.id;
        return current.map((comment) =>
          comment.id === rootId
            ? {
                ...comment,
                replies: [
                  ...comment.replies,
                  normalizeComment(result.comment),
                ].filter(
                  (item, index, items) =>
                    items.findIndex((candidate) => candidate.id === item.id) ===
                    index,
                ),
                replyCount: comment.replyCount + 1,
              }
            : comment,
        );
      });
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
      setReplyTarget(null);
      setToast(replyTarget ? '回复发布成功' : '评论发布成功');
    } catch (error) {
      if (await recoverDeletedNote(error)) return;
      if (error instanceof ApiRequestError && error.status === 401) {
        authReturnFocusRef.current = commentContentRef.current;
        requestAuthentication();
      } else if (
        error instanceof ApiRequestError &&
        (error.payload.code === 'COMMENT_INVALID' ||
          error.payload.code === 'COMMENT_REPLY_TARGET_DELETED')
      ) {
        setCommentError(
          error.payload.code === 'COMMENT_REPLY_TARGET_DELETED'
            ? '该评论已删除，无法回复'
            : '评论需为1～500个字符',
        );
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
      const result = await apiRequest<{
        deleted: true;
        placeholder: boolean;
        total: number;
      }>(`/notes/${noteId}/comments/${deleteTarget.id}`, { method: 'DELETE' });
      setComments((current) =>
        updateCommentTree(current, deleteTarget.id, (comment) =>
          result.placeholder
            ? {
                ...comment,
                deleted: true,
                content: null,
                author: null,
                canDelete: false,
                canReply: false,
                likes: 0,
                liked: false,
                canLike: false,
              }
            : null,
        ),
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
      closeDeleteDialog(true);
      setToast('评论已删除');
    } catch (error) {
      if (await recoverDeletedNote(error)) return;
      if (error instanceof ApiRequestError && error.status === 401) {
        closeDeleteDialog();
        requestAuthentication();
      } else if (error instanceof ApiRequestError && error.status === 404) {
        setComments((current) =>
          current.filter((comment) => comment.id !== deleteTarget.id),
        );
        closeDeleteDialog(true);
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
        <h1>笔记不存在或已删除</h1>
        <p>这篇笔记不存在、已被删除或暂时无法访问。</p>
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
  const hasRenderedComments = hasVisibleComments(comments);

  const renderComment = (
    comment: NoteCommentData,
    rootCommentId: string,
    reply = false,
  ) => {
    if (comment.deleted && !comment.moderationHidden) {
      if (reply) return null;
      return (
        <Fragment key={comment.id}>
          {comment.replies.map((item) =>
            renderComment(item, rootCommentId, false),
          )}
          {comment.repliesNextCursor ? (
            <li className="reply-pagination">
              {replyErrorIds.has(rootCommentId) ? (
                <span role="alert">加载回复失败，已保留现有内容</span>
              ) : null}
              <button
                type="button"
                disabled={replyLoadingIds.has(rootCommentId)}
                onClick={() => void loadMoreReplies(rootCommentId)}
              >
                {replyLoadingIds.has(rootCommentId)
                  ? '加载中…'
                  : `展开更多回复（共 ${comment.replyCount} 条）`}
              </button>
            </li>
          ) : null}
        </Fragment>
      );
    }

    return (
      <li
        key={comment.id}
        className={`${reply ? 'comment-reply' : ''} ${highlightCommentId === comment.id ? 'comment-highlight' : ''}`}
        data-comment-id={comment.id}
      >
        {comment.author ? (
          <Avatar avatar={comment.author.avatar} className="comment-avatar" />
        ) : (
          <span
            className="comment-avatar comment-avatar-deleted"
            aria-hidden="true"
          >
            ×
          </span>
        )}
        <div className="comment-body">
          {comment.deleted ? (
            <p className="deleted-comment">
              {comment.moderationHidden ? '内容已被管理员隐藏' : '该评论已删除'}
            </p>
          ) : (
            <>
              <div className="comment-heading">
                <strong>{comment.author!.nickname}</strong>
                {comment.isAuthor ? <span>作者</span> : null}
                {comment.canDelete ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      deleteReturnFocusRef.current = event.currentTarget;
                      setDeleteTarget(comment);
                    }}
                  >
                    删除
                  </button>
                ) : null}
                {comment.canReport ? (
                  <button
                    type="button"
                    onClick={() =>
                      setReportTarget({
                        targetType: 'COMMENT',
                        targetId: comment.id,
                      })
                    }
                  >
                    举报
                  </button>
                ) : null}
              </div>
              <p>
                {comment.replyTo ? (
                  <span className="reply-target-label">
                    {comment.replyTo.deleted
                      ? '回复已删除的评论 '
                      : `回复 @${comment.replyTo.nickname} `}
                  </span>
                ) : null}
                {comment.content}
              </p>
              <div className="comment-meta-actions">
                <time dateTime={comment.createdAt}>
                  {formatNoteTime(comment.createdAt)}
                </time>
                <button type="button" onClick={() => openReplyInput(comment)}>
                  回复
                </button>
                <button
                  type="button"
                  className={comment.liked ? 'selected' : ''}
                  disabled={commentLikeBusy.has(comment.id) || !comment.canLike}
                  aria-pressed={comment.liked}
                  aria-label={
                    comment.canLike
                      ? `${comment.liked ? '取消点赞' : '点赞评论'}，当前 ${comment.likes}`
                      : `自己的评论不可点赞，当前 ${comment.likes}`
                  }
                  onClick={() => void setCommentLike(comment, !comment.liked)}
                >
                  <Icon name="heart" size={15} />
                  <span>{comment.likes}</span>
                </button>
              </div>
            </>
          )}
          {!reply && comment.replies.length > 0 ? (
            <ul className="comment-replies">
              {comment.replies.map((item) =>
                renderComment(item, rootCommentId, true),
              )}
            </ul>
          ) : null}
          {!reply && comment.repliesNextCursor ? (
            <div className="reply-pagination">
              {replyErrorIds.has(rootCommentId) ? (
                <span role="alert">加载回复失败，已保留现有内容</span>
              ) : null}
              <button
                type="button"
                disabled={replyLoadingIds.has(rootCommentId)}
                onClick={() => void loadMoreReplies(rootCommentId)}
              >
                {replyLoadingIds.has(rootCommentId)
                  ? '加载中…'
                  : `展开更多回复（共 ${comment.replyCount} 条）`}
              </button>
            </div>
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <main className="detail-page">
      <button
        className="detail-back-button"
        type="button"
        aria-label="返回上一页"
        onClick={() => {
          const sourcePath = consumeNoteDetailSource(noteId);
          const target = sourcePath ?? '/';
          router.replace(target);
          if (backNavigationFallbackRef.current !== null) {
            window.clearTimeout(backNavigationFallbackRef.current);
          }
          backNavigationFallbackRef.current = window.setTimeout(() => {
            const current = `${window.location.pathname}${window.location.search}`;
            if (current !== target) window.location.replace(target);
          }, 1_500);
        }}
      >
        <Icon name="chevronLeft" size={20} />
        <span>返回</span>
      </button>

      <article className="note-detail">
        <section
          className={`detail-media ${note.contentType === 'VIDEO' ? 'detail-video-media' : ''}`}
          aria-label={
            note.contentType === 'VIDEO'
              ? '笔记视频播放器'
              : `笔记图片，第${imageIndex + 1}张，共${note.images.length}张`
          }
          tabIndex={note.contentType === 'IMAGE' ? 0 : undefined}
          onKeyDown={(event) => {
            if (note.contentType !== 'IMAGE') return;
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              selectImage(imageIndex - 1);
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              selectImage(imageIndex + 1);
            }
          }}
        >
          {note.moderationHidden ? (
            <div className="detail-image-error" role="status">
              <Icon name="empty" size={54} />
              <span>内容已被管理员隐藏</span>
            </div>
          ) : note.contentType === 'VIDEO' && note.video ? (
            videoFailed ? (
              <div className="detail-image-error" role="alert">
                <Icon name="video" size={54} />
                <span>视频加载失败，请重试</span>
                <button
                  type="button"
                  onClick={() => {
                    setVideoFailed(false);
                    setVideoReloadKey((value) => value + 1);
                  }}
                >
                  重新加载
                </button>
              </div>
            ) : (
              <video
                key={videoReloadKey}
                src={note.video.url}
                poster={note.video.posterUrl}
                controls
                preload="metadata"
                playsInline
                crossOrigin="anonymous"
                aria-label={`${note.title} 视频`}
                style={{
                  aspectRatio: `${note.video.width} / ${note.video.height}`,
                }}
                onError={() => setVideoFailed(true)}
              />
            )
          ) : currentImage && !failedImages.has(imageIndex) ? (
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

          {note.contentType === 'IMAGE' && note.images.length > 1 ? (
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
              {note.management ? (
                <NoteManageMenu
                  noteId={note.id}
                  contentVersion={note.management.contentVersion}
                  placement="detail"
                  onVersionConflict={() => {
                    setToast('笔记已被更新，请重新打开删除确认');
                    setReloadVersion((current) => current + 1);
                  }}
                />
              ) : null}
              {note.viewer.canReport ? (
                <button
                  className="detail-report-action"
                  type="button"
                  onClick={() =>
                    setReportTarget({ targetType: 'NOTE', targetId: note.id })
                  }
                >
                  举报
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
              <span className="detail-meta-row">
                <time dateTime={note.createdAt}>
                  {formatNoteTime(note.createdAt)}
                </time>
                {note.editedAt ? (
                  <span className="detail-edited">· 已编辑</span>
                ) : null}
                <span
                  className="detail-view-count"
                  aria-label={`浏览量 ${note.interactions.views}`}
                >
                  <Icon name="eye" size={15} />
                  {note.interactions.views} 次浏览
                </span>
              </span>
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
              ) : !hasRenderedComments ? (
                <div className="comment-state">
                  <Icon name="comment" size={34} />
                  <p>还没有评论</p>
                </div>
              ) : (
                <ul className="comment-list">
                  {comments.map((comment) =>
                    renderComment(comment, comment.id),
                  )}
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
                <label htmlFor="comment-content">
                  {replyTarget?.author
                    ? `回复 @${replyTarget.author.nickname}`
                    : '评论内容'}
                </label>
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
                      if (replyTarget) {
                        setReplyTarget(null);
                      } else {
                        setCommenting(false);
                      }
                      setCommentError('');
                      window.setTimeout(
                        () => commentEntryRef.current?.focus(),
                        0,
                      );
                    }}
                  >
                    {replyTarget ? '取消回复' : '取消'}
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
                    canReport: user.id !== current.author.id,
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
            tabIndex={-1}
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
                onClick={() => closeDeleteDialog()}
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

      {reportTarget ? (
        <ReportDialog
          open
          targetType={reportTarget.targetType}
          targetId={reportTarget.targetId}
          onClose={() => setReportTarget(null)}
          onSuccess={setToast}
        />
      ) : null}

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </main>
  );
}
