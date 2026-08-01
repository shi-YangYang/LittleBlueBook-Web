import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProfilePage from './page';

const { pushMock, replaceMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
  }),
}));

type JsonResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

function response(body: unknown, status = 200): JsonResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const profile = {
  nickname: '蓝海',
  littleBlueBookId: '0123456789',
  gender: '保密',
  avatar: { type: 'initial', value: '蓝' },
  stats: {
    following: 0,
    followers: 0,
    receivedLikesAndFavorites: 0,
  },
};

describe('ProfilePage', () => {
  beforeEach(() => {
    pushMock.mockReset();
    replaceMock.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) =>
        String(input).includes('/notes/')
          ? response({ items: [], nextCursor: null })
          : response(profile),
      ) as unknown as typeof fetch,
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows only the necessary profile fields and real zero statistics', async () => {
    render(<ProfilePage />);

    expect(screen.getByLabelText('正在加载个人资料')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '蓝海' })).toBeVisible();
    expect(screen.getByText('小蓝书号：0123456789')).toBeVisible();
    expect(screen.getByText('性别：保密')).toBeVisible();
    expect(
      screen.getByRole('img', { name: '蓝海的默认头像' }),
    ).toHaveTextContent('蓝');
    expect(screen.getByRole('link', { name: '我' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByLabelText('个人统计')).toHaveTextContent(
      '关注0粉丝0获赞与收藏0',
    );
    expect(screen.queryByText(/example\.com/)).not.toBeInTheDocument();
    expect(screen.queryByText(/编辑|上传|生日|年龄/)).not.toBeInTheDocument();
  });

  it('renders Discover as a homepage link instead of an unfinished action', async () => {
    render(<ProfilePage />);
    await screen.findByRole('heading', { name: '蓝海' });

    expect(screen.getByRole('link', { name: '发现' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.queryByText('功能开发中')).not.toBeInTheDocument();
  });

  it('supports pointer and keyboard tab switching with real empty states', async () => {
    render(<ProfilePage />);
    await screen.findByRole('heading', { name: '蓝海' });

    const notes = screen.getByRole('tab', { name: '笔记' });
    const favorites = screen.getByRole('tab', { name: '收藏' });
    const likes = screen.getByRole('tab', { name: '点赞' });
    expect(notes).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('还没有发布笔记')).toBeVisible();

    fireEvent.click(favorites);
    expect(favorites).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('还没有收藏内容')).toBeVisible();

    fireEvent.keyDown(favorites, { key: 'ArrowRight' });
    expect(likes).toHaveFocus();
    expect(likes).toHaveAttribute('aria-selected', 'false');
    fireEvent.keyDown(likes, { key: 'Enter' });
    expect(likes).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('还没有点赞内容')).toBeVisible();
  });

  it('closes the settings menu on Escape and restores trigger focus', async () => {
    render(<ProfilePage />);
    await screen.findByRole('heading', { name: '蓝海' });

    const settings = screen.getByRole('button', { name: '个人主页设置' });
    fireEvent.click(settings);
    const editProfile = screen.getByRole('menuitem', { name: '编辑资料' });
    await waitFor(() => expect(editProfile).toHaveFocus());

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      screen.queryByRole('menuitem', { name: '退出登录' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(settings).toHaveFocus());
  });

  it('logs out from the profile menu and returns to the guest homepage', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/profile/me')) return response(profile);
      if (String(input).includes('/notes/mine')) {
        return response({ items: [], nextCursor: null });
      }
      if (String(input).endsWith('/auth/logout')) {
        return response({ success: true });
      }
      throw new Error(`Unexpected URL: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    render(<ProfilePage />);
    await screen.findByRole('heading', { name: '蓝海' });

    fireEvent.click(screen.getByRole('button', { name: '个人主页设置' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '退出登录' }));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/auth/logout'),
      ),
    ).toBe(true);
  });

  it('keeps the profile visible and reports a failed logout', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/profile/me')) return response(profile);
      if (String(input).includes('/notes/mine')) {
        return response({ items: [], nextCursor: null });
      }
      if (String(input).endsWith('/auth/logout')) {
        return response(
          {
            statusCode: 500,
            code: 'INTERNAL_ERROR',
            message: '网络异常，请稍后重试',
          },
          500,
        );
      }
      throw new Error(`Unexpected URL: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    render(<ProfilePage />);
    await screen.findByRole('heading', { name: '蓝海' });

    fireEvent.click(screen.getByRole('button', { name: '个人主页设置' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '退出登录' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '退出登录失败，请稍后重试',
    );
    expect(screen.getByRole('heading', { name: '蓝海' })).toBeVisible();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('redirects a 401 without ever rendering protected profile fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response(
          {
            statusCode: 401,
            code: 'AUTHENTICATION_REQUIRED',
            message: '请先登录',
          },
          401,
        ),
      ) as unknown as typeof fetch,
    );

    render(<ProfilePage />);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/?login=1'));
    expect(screen.queryByRole('heading', { name: '蓝海' })).toBeNull();
    expect(screen.queryByText('小蓝书号：0123456789')).toBeNull();
  });

  it('clears protected data and requests login when the session expires', async () => {
    let profileReads = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/notes/mine')) {
        return response({ items: [], nextCursor: null });
      }
      if (url.endsWith('/profile/me') && profileReads++ === 0) {
        return response(profile);
      }
      if (url.endsWith('/profile/me')) {
        return response(
          {
            statusCode: 401,
            code: 'AUTHENTICATION_REQUIRED',
            message: '请先登录',
          },
          401,
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<ProfilePage />);
    await screen.findByRole('heading', { name: '蓝海' });
    fireEvent(window, new Event('focus'));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/?login=1'));
    expect(screen.queryByRole('heading', { name: '蓝海' })).toBeNull();
    expect(screen.queryByText('小蓝书号：0123456789')).toBeNull();
  });

  it('distinguishes an ordinary load failure and retries only the profile', async () => {
    let profileReads = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/notes/mine')) {
        return response({ items: [], nextCursor: null });
      }
      if (url.endsWith('/profile/me') && profileReads++ === 0) {
        return response(
          {
            statusCode: 500,
            code: 'INTERNAL_ERROR',
            message: '网络异常，请稍后重试',
          },
          500,
        );
      }
      if (url.endsWith('/profile/me')) return response(profile);
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<ProfilePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '个人资料加载失败，请稍后重试',
    );
    fireEvent.click(screen.getByRole('button', { name: '重试' }));

    expect(await screen.findByRole('heading', { name: '蓝海' })).toBeVisible();
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith('/profile/me'),
      ),
    ).toHaveLength(2);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes('/notes/mine'),
      ),
    ).toBe(true);
  });
});
