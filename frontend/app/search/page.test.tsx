import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SearchPage from './page';

const navigation = vi.hoisted(() => ({
  query: 'keyword=%E8%93%9D%E4%B9%A6&type=video',
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

function note(id: string, title: string) {
  return {
    id,
    contentType: 'IMAGE',
    title,
    cover: {
      url: `https://media.example.test/${id}.png`,
      width: 4,
      height: 5,
    },
    author: {
      id: '00000000-0000-4000-8000-000000000099',
      nickname: '搜索作者',
      avatar: { type: 'initial', value: '搜' },
    },
    likes: 0,
    liked: false,
    canLike: true,
    views: 0,
    videoDurationMs: null,
  };
}

describe('SearchPage', () => {
  beforeEach(() => {
    navigation.query = 'keyword=%E8%93%9D%E4%B9%A6&type=video';
    navigation.push.mockReset();
    navigation.replace.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/auth/session')) {
          return response({ authenticated: false, user: null });
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

  it('keeps the real video search skeleton stable for at least 300ms', async () => {
    vi.useFakeTimers();
    const videoRequest = deferred<ReturnType<typeof response>>();
    vi.mocked(fetch).mockImplementation((async (
      input: string | URL | Request,
    ) => {
      const url = String(input);
      if (url.endsWith('/auth/session')) {
        return response({ authenticated: false, user: null });
      }
      if (url.includes('/search/videos?keyword=')) return videoRequest.promise;
      throw new Error(`Unexpected URL: ${url}`);
    }) as unknown as typeof fetch);
    render(<SearchPage />);

    expect(screen.getByRole('tab', { name: '视频' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByLabelText('与蓝书相关的视频')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.queryByText('暂无视频内容')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(screen.queryByText('暂无视频内容')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      videoRequest.resolve(response({ items: [], nextCursor: null }));
      await Promise.resolve();
    });
    expect(screen.getByText('没有找到与“蓝书”相关的视频')).toBeVisible();
    expect(
      screen.queryByRole('navigation', { name: '内容频道' }),
    ).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('aborts an obsolete keyword request and ignores its late response', async () => {
    vi.useFakeTimers();
    navigation.query = 'keyword=%E6%97%A7%E8%AF%8D&type=note';
    const oldRequest = deferred<ReturnType<typeof response>>();
    const newRequest = deferred<ReturnType<typeof response>>();
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/auth/session')) {
          return response({ authenticated: false, user: null });
        }
        if (url.includes('/search/notes?keyword=%E6%97%A7%E8%AF%8D')) {
          return oldRequest.promise;
        }
        if (url.includes('/search/notes?keyword=%E6%96%B0%E8%AF%8D')) {
          return newRequest.promise;
        }
        throw new Error(`Unexpected URL: ${url} ${String(init?.signal)}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const view = render(<SearchPage />);
    await act(async () => {
      await Promise.resolve();
    });
    const oldCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes('/search/notes?keyword=%E6%97%A7%E8%AF%8D'),
    );
    expect(oldCall).toBeDefined();

    navigation.query = 'keyword=%E6%96%B0%E8%AF%8D&type=note';
    view.rerender(<SearchPage />);
    await act(async () => {
      await Promise.resolve();
    });

    expect((oldCall?.[1]?.signal as AbortSignal).aborted).toBe(true);
    await act(async () => {
      newRequest.resolve(
        response({
          items: [note('00000000-0000-4000-8000-000000000002', '最新搜索结果')],
          nextCursor: null,
        }),
      );
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.getByText('最新搜索结果')).toBeVisible();

    await act(async () => {
      oldRequest.resolve(
        response({
          items: [note('00000000-0000-4000-8000-000000000001', '过期搜索结果')],
          nextCursor: null,
        }),
      );
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.queryByText('过期搜索结果')).toBeNull();
    expect(screen.getByText('最新搜索结果')).toBeVisible();
  });

  it('aborts the previous tab request and keeps the latest tab results', async () => {
    vi.useFakeTimers();
    navigation.query = 'keyword=%E8%93%9D%E4%B9%A6&type=user';
    const userRequest = deferred<ReturnType<typeof response>>();
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/auth/session')) {
          return response({ authenticated: false, user: null });
        }
        if (url.includes('/search/users?')) return userRequest.promise;
        if (url.includes('/search/notes?')) {
          return response({
            items: [
              note('00000000-0000-4000-8000-000000000003', '笔记分类结果'),
            ],
            nextCursor: null,
          });
        }
        throw new Error(`Unexpected URL: ${url} ${String(init?.signal)}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const view = render(<SearchPage />);
    await act(async () => {
      await Promise.resolve();
    });
    const userCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes('/search/users?'),
    );
    expect(userCall).toBeDefined();

    navigation.query = 'keyword=%E8%93%9D%E4%B9%A6&type=note';
    view.rerender(<SearchPage />);
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(300);
    });

    expect((userCall?.[1]?.signal as AbortSignal).aborted).toBe(true);
    expect(screen.getByText('笔记分类结果')).toBeVisible();

    await act(async () => {
      userRequest.resolve(
        response({
          items: [
            {
              id: '00000000-0000-4000-8000-000000000004',
              nickname: '过期用户结果',
              littleBlueBookId: '0000000004',
              avatar: { type: 'initial', value: '过' },
              followers: 0,
              notes: 0,
              viewer: {
                authenticated: false,
                isSelf: false,
                following: false,
                canFollow: false,
              },
            },
          ],
          nextCursor: null,
        }),
      );
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.queryByText('过期用户结果')).toBeNull();
    expect(screen.getByText('笔记分类结果')).toBeVisible();
  });

  it('renders a private-safe user card and routes the current user to profile', async () => {
    navigation.query = 'keyword=%E6%90%9C%E7%B4%A2%E8%80%85&type=user';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/auth/session')) {
          return response({
            authenticated: true,
            user: {
              id: 'self-user',
              email: 'private@example.com',
              nickname: '搜索者',
            },
          });
        }
        if (url.includes('/search/users?')) {
          return response({
            items: [
              {
                id: 'self-user',
                nickname: '搜索者',
                littleBlueBookId: '0000000123',
                avatar: { type: 'initial', value: '搜' },
                followers: 2,
                notes: 3,
                viewer: {
                  authenticated: true,
                  isSelf: true,
                  following: false,
                  canFollow: false,
                },
              },
            ],
            nextCursor: null,
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }) as unknown as typeof fetch,
    );

    render(<SearchPage />);

    const link = await screen.findByRole(
      'link',
      { name: '查看搜索者的主页' },
      { timeout: 1500 },
    );
    expect(link).toHaveAttribute('href', '/profile');
    expect(screen.getByText('小蓝书号：0000000123')).toBeVisible();
    expect(screen.queryByRole('button', { name: '关注' })).toBeNull();
    expect(document.body).not.toHaveTextContent('private@example.com');
  });
});
