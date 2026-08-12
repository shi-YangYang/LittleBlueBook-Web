import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import NotificationsPage from './page';

const navigation = vi.hoisted(() => ({
  query: '',
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function item(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    type: 'NOTE_COMMENTED',
    action: '评论了你的笔记',
    createdAt: '2026-07-29T12:00:00.000Z',
    readAt: null,
    actor: {
      id: '00000000-0000-4000-8000-000000000002',
      nickname: '互动用户',
      littleBlueBookId: '1234567890',
      avatar: { type: 'initial', value: '互' },
    },
    note: {
      id: '00000000-0000-4000-8000-000000000003',
      title: '被评论的笔记',
      thumbnail: {
        url: 'https://media.example.test/cover.png',
        width: 120,
        height: 160,
      },
    },
    comment: { preview: '<script>按纯文本展示</script>', deleted: false },
    ...overrides,
  };
}

const currentUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'private@example.com',
  nickname: '通知接收者',
};

describe('NotificationsPage', () => {
  beforeEach(() => {
    navigation.query = '';
    navigation.push.mockReset();
    navigation.replace.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/auth/session')) {
          return response({ authenticated: true, user: currentUser });
        }
        if (url.endsWith('/notifications/unread-count')) {
          return response({ unreadCount: 2 });
        }
        if (url.includes('/notifications?tab=all')) {
          return response({
            items: [item('00000000-0000-4000-8000-000000000010')],
            nextCursor: null,
          });
        }
        if (url.includes('/notifications/') && url.endsWith('/read')) {
          return response({
            id: '00000000-0000-4000-8000-000000000010',
            readAt: '2026-07-29T13:00:00.000Z',
            unreadCount: 1,
          });
        }
        if (url.endsWith('/notifications/read-all')) {
          return response({ updatedCount: 1, unreadCount: 0 });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }) as unknown as typeof fetch,
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the successful first-load skeleton stable for 300ms and exposes the unread badge', async () => {
    vi.useFakeTimers();
    render(<NotificationsPage />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('notification-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('<script>按纯文本展示</script>')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(screen.getByTestId('notification-skeleton')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText('<script>按纯文本展示</script>')).toBeVisible();
    expect(screen.getByRole('link', { name: '通知，2 条未读' })).toBeVisible();
    expect(document.body).not.toHaveTextContent('private@example.com');
  });

  it('marks one row read before routing and synchronizes the global unread badge', async () => {
    render(<NotificationsPage />);
    const row = await screen.findByRole(
      'button',
      { name: /未读，互动用户评论了你的笔记/ },
      { timeout: 1500 },
    );

    fireEvent.click(row);

    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(
        '/explore/00000000-0000-4000-8000-000000000003',
      ),
    );
    expect(screen.getByRole('link', { name: '通知，1 条未读' })).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: /已读，互动用户评论了你的笔记/,
      }),
    ).toBeVisible();
  });

  it('shows deleted targets safely and still supports one-click read-all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/auth/session')) {
          return response({ authenticated: true, user: currentUser });
        }
        if (url.endsWith('/notifications/unread-count')) {
          return response({ unreadCount: 1 });
        }
        if (url.includes('/notifications?tab=all')) {
          return response({
            items: [
              item('00000000-0000-4000-8000-000000000011', {
                note: null,
                comment: { preview: null, deleted: true },
              }),
            ],
            nextCursor: null,
          });
        }
        if (url.endsWith('/notifications/read-all')) {
          return response({ updatedCount: 1, unreadCount: 0 });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }) as unknown as typeof fetch,
    );

    render(<NotificationsPage />);

    expect(await screen.findByText('相关评论已删除')).toBeVisible();
    expect(screen.getByText('相关内容已不存在')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '一键已读' }));
    await waitFor(() =>
      expect(screen.getByRole('link', { name: '通知' })).toBeVisible(),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      '全部通知已标记为已读',
    );
  });

  it('opens the original note with a deleted-comment fallback marker', async () => {
    const notificationId = '00000000-0000-4000-8000-000000000013';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/auth/session')) {
          return response({ authenticated: true, user: currentUser });
        }
        if (url.endsWith('/notifications/unread-count')) {
          return response({ unreadCount: 1 });
        }
        if (url.includes('/notifications?tab=all')) {
          return response({
            items: [
              item(notificationId, {
                type: 'COMMENT_REPLIED',
                action: '回复了你的评论',
                comment: {
                  id: '00000000-0000-4000-8000-000000000014',
                  rootCommentId: '00000000-0000-4000-8000-000000000014',
                  preview: null,
                  deleted: true,
                },
              }),
            ],
            nextCursor: null,
          });
        }
        if (url.endsWith(`/notifications/${notificationId}/read`)) {
          return response({
            id: notificationId,
            readAt: '2026-07-29T12:10:00.000Z',
            unreadCount: 0,
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }) as unknown as typeof fetch,
    );

    render(<NotificationsPage />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: /未读，互动用户回复了你的评论/,
      }),
    );

    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(
        '/explore/00000000-0000-4000-8000-000000000003?commentDeleted=1',
      ),
    );
  });

  it('restores URL tabs and supports tab keyboard navigation', async () => {
    navigation.query = 'tab=comments';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/auth/session')) {
          return response({ authenticated: true, user: currentUser });
        }
        if (url.endsWith('/notifications/unread-count')) {
          return response({ unreadCount: 0 });
        }
        if (url.includes('/notifications?tab=comments')) {
          return response({ items: [], nextCursor: null });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }) as unknown as typeof fetch,
    );

    render(<NotificationsPage />);

    const comments = screen.getByRole('tab', { name: '评论' });
    expect(comments).toHaveAttribute('aria-selected', 'true');
    await waitFor(() =>
      expect(screen.getByText('暂时没有评论通知')).toBeInTheDocument(),
    );
    fireEvent.keyDown(comments, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: '赞和收藏' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('tab', { name: '赞和收藏' }), {
      key: 'Enter',
    });
    expect(navigation.push).toHaveBeenCalledWith(
      '/notifications?tab=reactions',
    );
  });

  it('ignores an old load-more response after switching to another tab', async () => {
    const oldLoadMore = deferred<ReturnType<typeof response>>();
    const currentTabLoad = deferred<ReturnType<typeof response>>();
    let oldLoadMoreRequested = false;
    let currentTabRequested = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/auth/session')) {
          return response({ authenticated: true, user: currentUser });
        }
        if (url.endsWith('/notifications/unread-count')) {
          return response({ unreadCount: 2 });
        }
        if (url.includes('tab=all') && url.includes('cursor=all-next')) {
          oldLoadMoreRequested = true;
          return oldLoadMore.promise;
        }
        if (url.includes('/notifications?tab=all')) {
          return response({
            items: [
              item('00000000-0000-4000-8000-000000000020', {
                comment: { preview: '旧分类首屏数据', deleted: false },
              }),
            ],
            nextCursor: 'all-next',
          });
        }
        if (url.includes('/notifications?tab=comments')) {
          currentTabRequested = true;
          return currentTabLoad.promise;
        }
        throw new Error(`Unexpected URL: ${url}`);
      }) as unknown as typeof fetch,
    );

    const view = render(<NotificationsPage />);
    expect(await screen.findByText('旧分类首屏数据')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    await waitFor(() => expect(oldLoadMoreRequested).toBe(true));

    fireEvent.click(screen.getByRole('tab', { name: '评论' }));
    expect(navigation.push).toHaveBeenCalledWith('/notifications?tab=comments');
    navigation.query = 'tab=comments';
    view.rerender(<NotificationsPage />);
    await waitFor(() => expect(currentTabRequested).toBe(true));

    currentTabLoad.resolve(
      response({
        items: [
          item('00000000-0000-4000-8000-000000000021', {
            comment: { preview: '新分类当前数据', deleted: false },
          }),
        ],
        nextCursor: null,
      }),
    );
    expect(await screen.findByText('新分类当前数据')).toBeVisible();

    oldLoadMore.resolve(
      response({
        items: [
          item('00000000-0000-4000-8000-000000000022', {
            comment: { preview: '旧分类分页污染', deleted: false },
          }),
        ],
        nextCursor: null,
      }),
    );
    await act(async () => {
      await oldLoadMore.promise;
      await Promise.resolve();
    });

    expect(screen.getByText('新分类当前数据')).toBeVisible();
    expect(screen.queryByText('旧分类首屏数据')).toBeNull();
    expect(screen.queryByText('旧分类分页污染')).toBeNull();
  });
});
