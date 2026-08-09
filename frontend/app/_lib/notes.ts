import type { ProfileAvatar } from '../_components/avatar';

export type NoteCardData = {
  id: string;
  contentType: 'IMAGE' | 'VIDEO';
  title: string;
  cover: {
    url: string;
    width: number;
    height: number;
  };
  author: {
    id: string;
    nickname: string;
    avatar: ProfileAvatar;
  };
  likes: number;
  liked: boolean;
  canLike: boolean;
  views: number;
  videoDurationMs: number | null;
  management?: {
    contentVersion: number;
  };
};

export type NotePageData = {
  items: NoteCardData[];
  nextCursor: string | null;
};

export type NoteDetailData = {
  id: string;
  contentType: 'IMAGE' | 'VIDEO';
  title: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  author: NoteCardData['author'];
  channel: {
    code: string;
    name: string;
    navigable: boolean;
  } | null;
  images: Array<{
    url: string;
    width: number;
    height: number;
  }>;
  video: {
    url: string;
    posterUrl: string;
    width: number;
    height: number;
    durationMs: number;
  } | null;
  interactions: {
    likes: number;
    favorites: number;
    comments: number;
    views: number;
  };
  viewer: {
    authenticated: boolean;
    isAuthor: boolean;
    liked: boolean;
    favorited: boolean;
    followingAuthor: boolean;
    canLike: boolean;
    canFollow: boolean;
  };
  management: {
    contentVersion: number;
  } | null;
};

export type NoteCommentData = {
  id: string;
  rootCommentId: string | null;
  content: string | null;
  createdAt: string;
  deleted: boolean;
  author: {
    id: string;
    nickname: string;
    avatar: ProfileAvatar;
  } | null;
  replyTo: {
    id: string;
    nickname: string | null;
    deleted: boolean;
  } | null;
  isAuthor: boolean;
  canDelete: boolean;
  canReply: boolean;
  likes: number;
  liked: boolean;
  canLike: boolean;
  replies: NoteCommentData[];
  replyCount: number;
  repliesNextCursor: string | null;
};

export type CommentPageData = {
  items: NoteCommentData[];
  nextCursor: string | null;
  total: number;
};

const NOTE_DETAIL_SOURCE_KEY = 'littlebluebook:note-detail-source';
const NOTE_LIST_SCROLL_RESTORE_KEY = 'littlebluebook:note-list-scroll-restore';
const NOTE_DETAIL_SOURCE_MAX_AGE = 30_000;
const NOTE_LIST_SCROLL_RESTORE_MAX_AGE = 30 * 60_000;
const NOTE_DETAIL_HISTORY_STATE_KEY = '__littlebluebookNoteDetailSource';

type NoteDetailSource = {
  noteId: string;
  path: string;
  recordedAt: number;
  scrollY: number;
};

type BoundNoteDetailSource = Pick<
  NoteDetailSource,
  'noteId' | 'path' | 'recordedAt' | 'scrollY'
>;

type NoteListScrollRestore = Pick<
  NoteDetailSource,
  'path' | 'recordedAt' | 'scrollY'
>;

function normalizeSafeNoteSourcePath(
  value: unknown,
  noteId: string,
): string | null {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return null;
  }

  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    const currentDetailPath = `/explore/${encodeURIComponent(noteId)}`;
    if (url.pathname.replace(/\/$/, '') === currentDetailPath) return null;
    if (/^\/explore\/[^/]+\/?$/.test(url.pathname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function currentNavigationType(): PerformanceNavigationTiming['type'] | null {
  const entry = window.performance?.getEntriesByType('navigation').at(0) as
    PerformanceNavigationTiming | undefined;
  return entry?.type ?? null;
}

function clearBoundNoteDetailSource(): void {
  const currentState =
    window.history.state && typeof window.history.state === 'object'
      ? (window.history.state as Record<string, unknown>)
      : {};
  if (NOTE_DETAIL_HISTORY_STATE_KEY in currentState) {
    const nextState = { ...currentState };
    delete nextState[NOTE_DETAIL_HISTORY_STATE_KEY];
    window.history.replaceState(nextState, '', window.location.href);
  }
  window.sessionStorage.removeItem(NOTE_DETAIL_SOURCE_KEY);
  window.sessionStorage.removeItem(NOTE_LIST_SCROLL_RESTORE_KEY);
}

export function markNoteDetailSource(noteId: string): void {
  if (typeof window === 'undefined') return;
  const source: NoteDetailSource = {
    noteId,
    path: `${window.location.pathname}${window.location.search}`,
    recordedAt: Date.now(),
    scrollY: window.scrollY,
  };
  window.sessionStorage.setItem(NOTE_DETAIL_SOURCE_KEY, JSON.stringify(source));
}

export function bindNoteDetailSource(
  noteId: string,
  navigationType = currentNavigationType(),
): void {
  if (typeof window === 'undefined') return;
  const currentState =
    window.history.state && typeof window.history.state === 'object'
      ? (window.history.state as Record<string, unknown>)
      : {};
  if (
    navigationType === 'reload' &&
    NOTE_DETAIL_HISTORY_STATE_KEY in currentState
  ) {
    clearBoundNoteDetailSource();
    return;
  }

  const existing = currentState[
    NOTE_DETAIL_HISTORY_STATE_KEY
  ] as Partial<BoundNoteDetailSource> | null;
  const existingPath = normalizeSafeNoteSourcePath(existing?.path, noteId);
  const existingAge = Date.now() - (existing?.recordedAt ?? 0);
  if (
    existing?.noteId === noteId &&
    existingPath &&
    typeof existing.scrollY === 'number' &&
    Number.isFinite(existing.scrollY) &&
    existing.scrollY >= 0 &&
    existingAge >= 0 &&
    existingAge <= NOTE_LIST_SCROLL_RESTORE_MAX_AGE
  ) {
    return;
  }

  const serialized = window.sessionStorage.getItem(NOTE_DETAIL_SOURCE_KEY);
  window.sessionStorage.removeItem(NOTE_DETAIL_SOURCE_KEY);
  if (!serialized) return;

  try {
    const source = JSON.parse(serialized) as Partial<NoteDetailSource>;
    const age = Date.now() - (source.recordedAt ?? 0);
    const sourcePath = normalizeSafeNoteSourcePath(source.path, noteId);
    if (
      source.noteId !== noteId ||
      !sourcePath ||
      typeof source.scrollY !== 'number' ||
      !Number.isFinite(source.scrollY) ||
      source.scrollY < 0 ||
      age < 0 ||
      age > NOTE_DETAIL_SOURCE_MAX_AGE
    ) {
      return;
    }
    window.history.replaceState(
      {
        ...currentState,
        [NOTE_DETAIL_HISTORY_STATE_KEY]: {
          noteId,
          path: sourcePath,
          recordedAt: source.recordedAt ?? Date.now(),
          scrollY: source.scrollY,
        } satisfies BoundNoteDetailSource,
      },
      '',
      window.location.href,
    );
    window.sessionStorage.setItem(
      NOTE_LIST_SCROLL_RESTORE_KEY,
      JSON.stringify({
        path: sourcePath,
        recordedAt: source.recordedAt ?? Date.now(),
        scrollY: source.scrollY,
      } satisfies NoteListScrollRestore),
    );
  } catch {
    return;
  }
}

export function consumeNoteDetailSource(noteId: string): string | null {
  if (typeof window === 'undefined') return null;
  const currentState =
    window.history.state && typeof window.history.state === 'object'
      ? (window.history.state as Record<string, unknown>)
      : {};
  const source = currentState[
    NOTE_DETAIL_HISTORY_STATE_KEY
  ] as Partial<BoundNoteDetailSource> | null;
  const nextState = { ...currentState };
  delete nextState[NOTE_DETAIL_HISTORY_STATE_KEY];
  window.history.replaceState(nextState, '', window.location.href);
  const sourcePath = normalizeSafeNoteSourcePath(source?.path, noteId);
  if (source?.noteId !== noteId || !sourcePath) return null;
  return sourcePath;
}

export function consumeNoteListScrollRestore(path: string): number | null {
  if (typeof window === 'undefined') return null;
  const serialized = window.sessionStorage.getItem(
    NOTE_LIST_SCROLL_RESTORE_KEY,
  );
  if (!serialized) return null;

  try {
    const restore = JSON.parse(serialized) as Partial<NoteListScrollRestore>;
    const age = Date.now() - (restore.recordedAt ?? 0);
    if (age < 0 || age > NOTE_LIST_SCROLL_RESTORE_MAX_AGE) {
      window.sessionStorage.removeItem(NOTE_LIST_SCROLL_RESTORE_KEY);
      return null;
    }
    if (
      restore.path !== path ||
      typeof restore.scrollY !== 'number' ||
      !Number.isFinite(restore.scrollY) ||
      restore.scrollY < 0
    ) {
      return null;
    }

    window.sessionStorage.removeItem(NOTE_LIST_SCROLL_RESTORE_KEY);
    return restore.scrollY;
  } catch {
    window.sessionStorage.removeItem(NOTE_LIST_SCROLL_RESTORE_KEY);
    return null;
  }
}
