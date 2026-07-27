import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bindNoteDetailSource,
  consumeNoteListScrollRestore,
  markNoteDetailSource,
} from './notes';

describe('note list scroll restoration', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
  });

  it('restores the source scroll after asynchronous list content returns', () => {
    window.history.replaceState({}, '', '/profile');
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(486);

    markNoteDetailSource('note-1');
    window.history.pushState({}, '', '/explore/note-1');
    bindNoteDetailSource('note-1');

    expect(consumeNoteListScrollRestore('/profile')).toBe(486);
    expect(consumeNoteListScrollRestore('/profile')).toBeNull();
  });

  it('does not consume a restoration intended for another list route', () => {
    window.history.replaceState({}, '', '/');
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(320);

    markNoteDetailSource('note-2');
    window.history.pushState({}, '', '/explore/note-2');
    bindNoteDetailSource('note-2');

    expect(consumeNoteListScrollRestore('/profile')).toBeNull();
    expect(consumeNoteListScrollRestore('/')).toBe(320);
  });
});
