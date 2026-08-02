import type { ProfileAvatar } from '../_components/avatar';

export type NoteCardData = {
  id: string;
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
};

export type NotePageData = {
  items: NoteCardData[];
  nextCursor: string | null;
};

export type NoteDetailData = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
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

function isSafeInternalPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//')
  );
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

export function bindNoteDetailSource(noteId: string): void {
  if (typeof window === 'undefined') return;
  const currentState =
    window.history.state && typeof window.history.state === 'object'
      ? (window.history.state as Record<string, unknown>)
      : {};
  const existing = currentState[
    NOTE_DETAIL_HISTORY_STATE_KEY
  ] as Partial<BoundNoteDetailSource> | null;
  if (existing?.noteId === noteId && isSafeInternalPath(existing.path)) return;

  const serialized = window.sessionStorage.getItem(NOTE_DETAIL_SOURCE_KEY);
  window.sessionStorage.removeItem(NOTE_DETAIL_SOURCE_KEY);
  if (!serialized) return;

  try {
    const source = JSON.parse(serialized) as Partial<NoteDetailSource>;
    const age = Date.now() - (source.recordedAt ?? 0);
    if (
      source.noteId !== noteId ||
      !isSafeInternalPath(source.path) ||
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
          path: source.path,
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
        path: source.path,
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
  if (source?.noteId !== noteId || !isSafeInternalPath(source.path)) {
    return null;
  }

  const nextState = { ...currentState };
  delete nextState[NOTE_DETAIL_HISTORY_STATE_KEY];
  window.history.replaceState(nextState, '', window.location.href);
  return source.path;
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
