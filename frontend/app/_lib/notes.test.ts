import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bindNoteDetailSource,
  consumeNoteDetailSource,
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

  it('returns a recorded search source and consumes it once', () => {
    window.history.replaceState({}, '', '/search?keyword=蓝&type=note');
    markNoteDetailSource('note-3');
    window.history.pushState({}, '', '/explore/note-3');
    bindNoteDetailSource('note-3', 'navigate');

    expect(consumeNoteDetailSource('note-3')).toBe(
      '/search?keyword=%E8%93%9D&type=note',
    );
    expect(consumeNoteDetailSource('note-3')).toBeNull();
  });

  it('rejects cross-origin and detail-loop sources', () => {
    const recordedAt = Date.now();
    window.history.replaceState({}, '', '/explore/note-4');
    window.sessionStorage.setItem(
      'littlebluebook:note-detail-source',
      JSON.stringify({
        noteId: 'note-4',
        path: '//malicious.example/path',
        recordedAt,
        scrollY: 100,
      }),
    );
    bindNoteDetailSource('note-4', 'navigate');
    expect(consumeNoteDetailSource('note-4')).toBeNull();

    markNoteDetailSource('note-4');
    bindNoteDetailSource('note-4', 'navigate');
    expect(consumeNoteDetailSource('note-4')).toBeNull();
  });

  it('drops a recorded source after the detail page is refreshed', () => {
    window.history.replaceState({}, '', '/profile');
    markNoteDetailSource('note-5');
    window.history.pushState({}, '', '/explore/note-5');
    bindNoteDetailSource('note-5', 'navigate');

    bindNoteDetailSource('note-5', 'reload');

    expect(consumeNoteDetailSource('note-5')).toBeNull();
    expect(consumeNoteListScrollRestore('/profile')).toBeNull();
  });

  it('keeps a new detail source after the source document was refreshed', () => {
    window.history.replaceState({}, '', '/profile');
    markNoteDetailSource('note-6');
    window.history.pushState({}, '', '/explore/note-6');

    bindNoteDetailSource('note-6', 'reload');

    expect(consumeNoteDetailSource('note-6')).toBe('/profile');
  });
});
