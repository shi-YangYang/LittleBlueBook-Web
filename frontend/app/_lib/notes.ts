export type NoteCardData = {
  id: string;
  title: string;
  cover: {
    url: string;
    width: number;
    height: number;
  };
  author: {
    nickname: string;
    avatar: {
      type: 'initial';
      value: string;
    };
  };
  likes: 0;
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
  images: Array<{
    url: string;
    width: number;
    height: number;
  }>;
  interactions: {
    likes: 0;
    favorites: 0;
    comments: 0;
  };
};

const NOTE_DETAIL_SOURCE_KEY = 'littlebluebook:note-detail-source';
const NOTE_DETAIL_SOURCE_MAX_AGE = 30_000;
const NOTE_DETAIL_HISTORY_STATE_KEY = '__littlebluebookNoteDetailSource';

type NoteDetailSource = {
  noteId: string;
  path: string;
  recordedAt: number;
};

type BoundNoteDetailSource = Pick<NoteDetailSource, 'noteId' | 'path'>;

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
        } satisfies BoundNoteDetailSource,
      },
      '',
      window.location.href,
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
