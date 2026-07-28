import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { markNoteDetailSource } from '../../_lib/notes';
import { formatNoteTime, NoteDetailView } from './page';

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
}));

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const note = {
  id: '00000000-0000-4000-8000-000000000004',
  title: '<img src=x onerror=alert(1)>',
  content: '<script>alert(1)</script>\n第二行',
  createdAt: '2026-07-26T11:00:00.000Z',
  author: {
    nickname: '蓝书作者',
    avatar: { type: 'initial', value: '蓝' },
  },
  channel: { code: 'digital', name: '数码', navigable: true },
  images: [
    { url: 'https://media.example.test/one.png', width: 100, height: 120 },
    { url: 'https://media.example.test/two.webp', width: 90, height: 80 },
  ],
  interactions: { likes: 0, favorites: 0, comments: 0 },
};

describe('formatNoteTime', () => {
  const now = new Date('2026-07-27T12:00:00.000Z').getTime();

  it('keeps an exact thirty-day interval relative', () => {
    const createdAt = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

    expect(formatNoteTime(createdAt, now)).toBe('30天前');
  });

  it('uses a concrete date immediately after the thirty-day boundary', () => {
    const createdAt = new Date(
      now - (30 * 24 * 60 * 60 * 1000 + 1),
    ).toISOString();

    expect(formatNoteTime(createdAt, now)).toBe('2026/06/27');
  });

  it('uses a concrete date for a thirty-and-a-half-day interval', () => {
    const createdAt = new Date(now - 30.5 * 24 * 60 * 60 * 1000).toISOString();

    expect(formatNoteTime(createdAt, now)).toBe('2026/06/27');
  });
});

describe('NoteDetailPage', () => {
  beforeEach(() => {
    navigation.push.mockReset();
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.spyOn(Date, 'now').mockReturnValue(
      new Date('2026-07-26T12:00:00.000Z').getTime(),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(note)) as unknown as typeof fetch,
    );
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders public pure text, ordered media and zero placeholders', async () => {
    render(<NoteDetailView noteId="00000000-0000-4000-8000-000000000004" />);

    expect(
      await screen.findByRole('heading', {
        name: '<img src=x onerror=alert(1)>',
      }),
    ).toBeVisible();
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeVisible();
    expect(document.querySelector('.detail-copy script')).toBeNull();
    expect(screen.getByText('1小时前')).toBeVisible();
    expect(screen.getByText('共 0 条评论')).toBeVisible();
    expect(screen.getByRole('link', { name: '数码' })).toHaveAttribute(
      'href',
      '/?channel=digital',
    );
    expect(screen.getByLabelText('点赞 0，功能正在开发中')).toBeVisible();
    expect(screen.getByLabelText('收藏 0，功能正在开发中')).toBeVisible();
    expect(screen.getByAltText('笔记图片 1')).toHaveAttribute(
      'src',
      note.images[0].url,
    );
  });

  it('hides the internal legacy channel and keeps a disabled label inert', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ ...note, channel: null }))
      .mockResolvedValueOnce(
        response({
          ...note,
          channel: { code: 'digital', name: '数码', navigable: false },
        }),
      );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    const first = render(<NoteDetailView noteId={note.id} />);
    await screen.findByRole('heading', { name: note.title });
    expect(screen.queryByText('数码')).toBeNull();

    first.unmount();
    render(<NoteDetailView noteId={note.id} />);
    expect(await screen.findByText('数码')).toHaveClass(
      'detail-channel-tag',
      'disabled',
    );
    expect(screen.queryByRole('link', { name: '数码' })).toBeNull();
  });

  it('supports button and keyboard carousel bounds', async () => {
    render(<NoteDetailView noteId="00000000-0000-4000-8000-000000000004" />);
    const region = await screen.findByLabelText('笔记图片，第1张，共2张');
    expect(screen.getByRole('button', { name: '上一张图片' })).toBeDisabled();
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(screen.getByAltText('笔记图片 2')).toHaveAttribute(
      'src',
      note.images[1].url,
    );
    expect(screen.getByRole('button', { name: '下一张图片' })).toBeDisabled();
    fireEvent.keyDown(screen.getByLabelText('笔记图片，第2张，共2张'), {
      key: 'ArrowLeft',
    });
    expect(screen.getByAltText('笔记图片 1')).toBeVisible();
  });

  it('keeps placeholder interactions inert and shows one consistent message', async () => {
    render(<NoteDetailView noteId="00000000-0000-4000-8000-000000000004" />);
    await screen.findByRole('heading', {
      name: '<img src=x onerror=alert(1)>',
    });

    fireEvent.click(screen.getByRole('button', { name: '关注' }));
    expect(screen.getByRole('status')).toHaveTextContent('功能正在开发中');
    fireEvent.click(screen.getByLabelText('点赞 0，功能正在开发中'));
    expect(screen.getByLabelText('点赞 0，功能正在开发中')).toHaveTextContent(
      '0',
    );
  });

  it('returns through browser history for a recorded in-site source', async () => {
    window.history.replaceState({}, '', '/profile');
    markNoteDetailSource(note.id);
    window.history.pushState({}, '', `/explore/${note.id}`);
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});

    render(<NoteDetailView noteId={note.id} />);
    await screen.findByRole('heading', { name: note.title });
    vi.spyOn(Date, 'now').mockReturnValue(
      new Date('2026-07-26T12:30:00.000Z').getTime(),
    );
    fireEvent.click(screen.getByRole('button', { name: '返回上一页' }));

    expect(back).toHaveBeenCalledOnce();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.queryByAltText('小蓝书')).toBeNull();
  });

  it('falls back to the homepage when opened without an in-site source', async () => {
    render(<NoteDetailView noteId={note.id} />);
    await screen.findByRole('heading', { name: note.title });
    fireEvent.click(screen.getByRole('button', { name: '返回上一页' }));

    expect(navigation.push).toHaveBeenCalledWith('/');
  });

  it('shows a clear public 404 state with homepage recovery', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response(
          {
            statusCode: 404,
            code: 'NOTE_NOT_FOUND',
            message: '笔记不存在',
          },
          404,
        ),
      ) as unknown as typeof fetch,
    );
    render(<NoteDetailView noteId="missing" />);

    expect(
      await screen.findByRole('heading', { name: '笔记不存在' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: '返回首页' })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
