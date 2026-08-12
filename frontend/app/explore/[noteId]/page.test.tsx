import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { markNoteDetailSource } from '../../_lib/notes';
import { formatNoteTime, NoteDetailView } from './page';

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
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
  contentType: 'IMAGE' as const,
  title: '<img src=x onerror=alert(1)>',
  content: '<script>alert(1)</script>\n第二行',
  createdAt: '2026-07-26T11:00:00.000Z',
  author: {
    id: '00000000-0000-4000-8000-000000000099',
    nickname: '蓝书作者',
    avatar: { type: 'initial', value: '蓝' },
  },
  channel: { code: 'digital', name: '数码', navigable: true },
  images: [
    { url: 'https://media.example.test/one.png', width: 100, height: 120 },
    { url: 'https://media.example.test/two.webp', width: 90, height: 80 },
  ],
  video: null,
  interactions: { likes: 0, favorites: 0, comments: 0, views: 0 },
  viewer: {
    authenticated: false,
    isAuthor: false,
    liked: false,
    favorited: false,
    followingAuthor: false,
    canLike: true,
    canFollow: true,
  },
};

const emptyComments = {
  items: [],
  nextCursor: null,
  total: 0,
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
    navigation.replace.mockReset();
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.spyOn(Date, 'now').mockReturnValue(
      new Date('2026-07-26T12:00:00.000Z').getTime(),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith(`/notes/${note.id}/views`)) {
          return response({ counted: true, viewCount: 1 });
        }
        return url.includes('/comments')
          ? response(emptyComments)
          : response(note);
      }) as unknown as typeof fetch,
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
    expect(screen.getByLabelText('点赞，当前 0')).toBeVisible();
    expect(screen.getByLabelText('收藏，当前 0')).toBeVisible();
    const viewCount = await screen.findByLabelText('浏览量 1');
    expect(viewCount).toBeVisible();
    const metadataRow = viewCount.closest('.detail-meta-row');
    expect(metadataRow).not.toBeNull();
    expect(metadataRow).toContainElement(screen.getByText('1小时前'));
    expect(screen.getByAltText('笔记图片 1')).toHaveAttribute(
      'src',
      note.images[0].url,
    );
  });

  it('omits user-deleted comments while preserving their visible replies', async () => {
    const deletedRootId = '00000000-0000-4000-8000-000000000030';
    const visibleReply = {
      id: '00000000-0000-4000-8000-000000000031',
      rootCommentId: deletedRootId,
      content: '保留的回复',
      createdAt: '2026-07-26T11:30:00.000Z',
      deleted: false,
      moderationHidden: false,
      author: {
        id: '00000000-0000-4000-8000-000000000032',
        nickname: '回复用户',
        avatar: { type: 'initial', value: '回' },
      },
      replyTo: { id: deletedRootId, nickname: null, deleted: true },
      isAuthor: false,
      canDelete: false,
      canReply: true,
      likes: 0,
      liked: false,
      canLike: true,
      canReport: false,
      replies: [],
      replyCount: 0,
      repliesNextCursor: null,
    };
    const deletedRoot = {
      ...visibleReply,
      id: deletedRootId,
      rootCommentId: null,
      content: null,
      deleted: true,
      author: null,
      replyTo: null,
      canReply: false,
      replies: [visibleReply],
      replyCount: 1,
      repliesNextCursor: 'more-replies',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith(`/notes/${note.id}/views`)) {
          return response({ counted: true, viewCount: 1 });
        }
        if (url.includes('/comments')) {
          return response({ items: [deletedRoot], nextCursor: null, total: 1 });
        }
        return response({
          ...note,
          interactions: { ...note.interactions, comments: 1 },
        });
      }) as unknown as typeof fetch,
    );

    render(<NoteDetailView noteId={note.id} />);

    expect(await screen.findByText('保留的回复')).toBeVisible();
    expect(screen.queryByText('该评论已删除')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '展开更多回复（共 1 条）' }),
    ).toBeVisible();
  });

  it('hides the internal legacy channel and keeps a disabled label inert', async () => {
    let detailRead = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('/comments')) return response(emptyComments);
      detailRead += 1;
      return detailRead === 1
        ? response({ ...note, channel: null })
        : response({
            ...note,
            channel: { code: 'digital', name: '数码', navigable: false },
          });
    });
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

  it('keeps only sharing as an unavailable placeholder', async () => {
    render(<NoteDetailView noteId="00000000-0000-4000-8000-000000000004" />);
    await screen.findByRole('heading', {
      name: '<img src=x onerror=alert(1)>',
    });

    fireEvent.click(
      screen.getByRole('button', { name: '分享，功能正在开发中' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('功能正在开发中');
    expect(screen.getByRole('button', { name: '关注' })).toBeVisible();
    expect(screen.getByLabelText('点赞，当前 0')).toBeVisible();
  });

  it('completes like, favorite, follow, comment and authorized deletion', async () => {
    const authenticatedNote = {
      ...note,
      viewer: { ...note.viewer, authenticated: true },
    };
    const existingComment = {
      id: '00000000-0000-4000-8000-000000000010',
      content: '已有评论',
      createdAt: '2026-07-26T11:30:00.000Z',
      author: {
        id: '00000000-0000-4000-8000-000000000011',
        nickname: '评论用户',
        avatar: { type: 'initial', value: '评' },
      },
      isAuthor: false,
      canDelete: true,
    };
    const createdComment = {
      ...existingComment,
      id: '00000000-0000-4000-8000-000000000012',
      content: '新评论',
    };
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith(`/notes/${note.id}`)) {
          return response(authenticatedNote);
        }
        if (url.includes(`/notes/${note.id}/comments`) && !init?.method) {
          return response({
            items: [existingComment],
            nextCursor: null,
            total: 1,
          });
        }
        if (url.endsWith(`/notes/${note.id}/like`)) {
          return response({ active: true, count: 1 });
        }
        if (url.endsWith(`/notes/${note.id}/favorite`)) {
          return response({ active: true, count: 1 });
        }
        if (url.endsWith(`/users/${note.author.id}/follow`)) {
          return response({ following: true });
        }
        if (
          url.endsWith(`/notes/${note.id}/comments`) &&
          init?.method === 'POST'
        ) {
          expect(init.body).toBe(JSON.stringify({ content: '新评论' }));
          return response({ comment: createdComment, total: 2 });
        }
        if (
          url.endsWith(`/notes/${note.id}/comments/${existingComment.id}`) &&
          init?.method === 'DELETE'
        ) {
          return response({ deleted: true, total: 1 });
        }
        throw new Error(`Unexpected URL: ${url}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    render(<NoteDetailView noteId={note.id} />);
    await screen.findByText('已有评论');

    fireEvent.click(screen.getByLabelText('点赞，当前 0'));
    expect(await screen.findByLabelText('取消点赞，当前 1')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByLabelText('收藏，当前 0'));
    expect(await screen.findByLabelText('取消收藏，当前 1')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: '关注' }));
    expect(
      await screen.findByRole('button', { name: '已关注' }),
    ).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: '说点什么…' }));
    fireEvent.change(screen.getByLabelText('评论内容'), {
      target: { value: '新评论' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() =>
      expect(
        screen.getByText('新评论', { selector: '.comment-body > p' }),
      ).toBeVisible(),
    );
    expect(screen.getByText('共 2 条评论')).toBeVisible();

    fireEvent.click(screen.getAllByRole('button', { name: '删除' }).at(-1)!);
    expect(screen.getByRole('alertdialog', { name: '删除评论' })).toBeVisible();
    const confirmDelete = screen.getByRole('button', { name: '确认删除' });
    const cancelDelete = screen.getByRole('button', { name: '取消' });
    await waitFor(() => expect(confirmDelete).toHaveFocus());
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(cancelDelete).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(confirmDelete).toHaveFocus();
    fireEvent.click(confirmDelete);
    await waitFor(() =>
      expect(screen.queryByText('已有评论')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('共 1 条评论')).toBeVisible();
  });

  it('reports a rendered view and supports flattened reply and comment-like interactions', async () => {
    const rootId = '00000000-0000-4000-8000-000000000020';
    const replyId = '00000000-0000-4000-8000-000000000021';
    const root = {
      id: rootId,
      rootCommentId: null,
      content: '可以回复的一级评论',
      createdAt: '2026-07-26T11:30:00.000Z',
      deleted: false,
      author: {
        id: '00000000-0000-4000-8000-000000000022',
        nickname: '评论用户',
        avatar: { type: 'initial', value: '评' },
      },
      replyTo: null,
      isAuthor: false,
      canDelete: false,
      canReply: true,
      likes: 0,
      liked: false,
      canLike: true,
      replies: [],
      replyCount: 0,
      repliesNextCursor: null,
    };
    const createdReply = {
      ...root,
      id: replyId,
      rootCommentId: rootId,
      content: '扁平回复正文',
      replyTo: { id: rootId, nickname: '评论用户', deleted: false },
      author: {
        id: '00000000-0000-4000-8000-000000000023',
        nickname: '当前用户',
        avatar: { type: 'initial', value: '当' },
      },
      canDelete: true,
      canLike: false,
    };
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith(`/notes/${note.id}`)) {
          return response({
            ...note,
            viewer: { ...note.viewer, authenticated: true },
          });
        }
        if (url.endsWith(`/notes/${note.id}/views`)) {
          expect(init?.method).toBe('POST');
          return response({ counted: true, viewCount: 9 });
        }
        if (url.endsWith(`/notes/${note.id}/comments?limit=20`)) {
          return response({ items: [root], nextCursor: null, total: 1 });
        }
        if (url.endsWith(`/comments/${rootId}/like`)) {
          expect(init?.method).toBe('PUT');
          return response({ active: true, count: 1 });
        }
        if (url.endsWith(`/notes/${note.id}/comments/${rootId}/replies`)) {
          expect(init?.body).toBe(JSON.stringify({ content: '扁平回复正文' }));
          return response({ comment: createdReply, total: 2 }, 201);
        }
        throw new Error(`Unexpected URL: ${url}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    render(<NoteDetailView noteId={note.id} />);

    expect(await screen.findByLabelText('浏览量 9')).toBeVisible();
    const rootItem = document.querySelector<HTMLElement>(
      `[data-comment-id="${rootId}"]`,
    );
    expect(rootItem).not.toBeNull();
    fireEvent.click(within(rootItem!).getByRole('button', { name: '回复' }));
    fireEvent.change(screen.getByLabelText('回复 @评论用户'), {
      target: { value: '扁平回复正文' },
    });
    fireEvent.click(screen.getByRole('button', { name: '取消回复' }));
    expect(screen.getByLabelText('评论内容')).toHaveValue('扁平回复正文');
    fireEvent.click(within(rootItem!).getByRole('button', { name: '回复' }));
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    expect(
      await screen.findByText('扁平回复正文', {
        selector: '.comment-reply .comment-body > p',
      }),
    ).toBeVisible();
    expect(screen.getByText('回复 @评论用户')).toBeVisible();
    expect(screen.getByText('共 2 条评论')).toBeVisible();

    fireEvent.click(
      within(rootItem!).getByRole('button', { name: '点赞评论，当前 0' }),
    );
    expect(
      await within(rootItem!).findByRole('button', {
        name: '取消点赞，当前 1',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps a comment draft when an expired session opens authentication', async () => {
    const authenticatedNote = {
      ...note,
      viewer: { ...note.viewer, authenticated: true },
    };
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith(`/notes/${note.id}`)) {
          return response(authenticatedNote);
        }
        if (url.includes('/comments') && !init?.method) {
          return response(emptyComments);
        }
        if (url.endsWith(`/notes/${note.id}/comments`)) {
          return response(
            {
              statusCode: 401,
              code: 'AUTHENTICATION_REQUIRED',
              message: '请先登录',
            },
            401,
          );
        }
        if (url.endsWith('/auth/session')) {
          return response({
            authenticated: false,
            user: null,
            pendingRegistration: false,
            registrationExpired: false,
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    render(<NoteDetailView noteId={note.id} />);
    await screen.findByRole('heading', { name: note.title });

    fireEvent.click(screen.getByRole('button', { name: '说点什么…' }));
    fireEvent.change(screen.getByLabelText('评论内容'), {
      target: { value: '需要保留的评论' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    expect(
      await screen.findByRole('dialog', { name: '邮箱登录' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '关闭登录弹窗' }));
    expect(screen.getByLabelText('评论内容')).toHaveValue('需要保留的评论');
  });

  it('returns to the recorded in-site source without relying on browser history', async () => {
    window.history.replaceState({}, '', '/profile');
    markNoteDetailSource(note.id);
    window.history.pushState({}, '', `/explore/${note.id}`);

    render(<NoteDetailView noteId={note.id} />);
    await screen.findByRole('heading', { name: note.title });
    vi.spyOn(Date, 'now').mockReturnValue(
      new Date('2026-07-26T12:30:00.000Z').getTime(),
    );
    fireEvent.click(screen.getByRole('button', { name: '返回上一页' }));

    expect(navigation.replace).toHaveBeenCalledWith('/profile');
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.queryByAltText('小蓝书')).toBeNull();
  });

  it('falls back to the homepage when opened without an in-site source', async () => {
    render(<NoteDetailView noteId={note.id} />);
    await screen.findByRole('heading', { name: note.title });
    fireEvent.click(screen.getByRole('button', { name: '返回上一页' }));

    expect(navigation.replace).toHaveBeenCalledWith('/');
  });

  it('explains a hard-deleted notification target after the note loads', async () => {
    window.history.replaceState({}, '', `/explore/${note.id}?commentDeleted=1`);
    render(<NoteDetailView noteId={note.id} />);

    await screen.findByRole('heading', { name: note.title });
    expect(await screen.findByRole('status')).toHaveTextContent(
      '相关评论已删除',
    );
  });

  it('replaces a stale detail with the deleted state when an interaction reports NOTE_NOT_FOUND', async () => {
    const authenticatedNote = {
      ...note,
      viewer: { ...note.viewer, authenticated: true },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith(`/notes/${note.id}/views`)) {
          return response({ counted: true, viewCount: 1 });
        }
        if (url.includes('/comments')) return response(emptyComments);
        if (url.endsWith(`/notes/${note.id}/like`)) {
          return response(
            {
              statusCode: 404,
              code: 'NOTE_NOT_FOUND',
              message: '笔记不存在',
            },
            404,
          );
        }
        return response(authenticatedNote);
      }) as unknown as typeof fetch,
    );

    render(<NoteDetailView noteId={note.id} />);
    await screen.findByRole('heading', { name: note.title });
    fireEvent.click(screen.getByLabelText('点赞，当前 0'));

    expect(
      await screen.findByRole('heading', { name: '笔记不存在或已删除' }),
    ).toBeVisible();
    expect(screen.queryByRole('heading', { name: note.title })).toBeNull();
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
      await screen.findByRole('heading', { name: '笔记不存在或已删除' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: '返回首页' })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
