import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FollowingDialog } from './following-dialog';

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

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

afterEach(() => {
  cleanup();
  navigation.push.mockReset();
  vi.unstubAllGlobals();
});

describe('FollowingDialog', () => {
  it('uses stable user-row skeletons during the initial request', async () => {
    let resolveRequest!: (value: ReturnType<typeof response>) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<ReturnType<typeof response>>((resolve) => {
            resolveRequest = resolve;
          }),
      ) as unknown as typeof fetch,
    );

    render(
      <FollowingDialog
        open
        onClose={vi.fn()}
        onFollowingCountChange={vi.fn()}
      />,
    );

    const skeleton = await screen.findByTestId('following-skeleton');
    expect(skeleton).toHaveAccessibleName('正在加载关注列表');
    expect(skeleton.querySelectorAll('.following-skeleton-row')).toHaveLength(
      4,
    );
    expect(
      skeleton.querySelectorAll('.following-skeleton-avatar'),
    ).toHaveLength(4);
    expect(
      skeleton.querySelectorAll('.following-skeleton-action'),
    ).toHaveLength(4);

    resolveRequest(response({ items: [], nextCursor: null }));
    expect(await screen.findByText('还没有关注任何人')).toBeVisible();
  });

  it('loads private following rows and confirms an authoritative unfollow', async () => {
    const onClose = vi.fn();
    const onFollowingCountChange = vi.fn();
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/profile/me/following')) {
          return response({
            items: [
              {
                id: '00000000-0000-4000-8000-000000000201',
                nickname: '户外蓝友',
                littleBlueBookId: '10002001',
                bio: '周末去露营',
                avatar: { type: 'initial', value: '户' },
              },
            ],
            nextCursor: null,
          });
        }
        if (
          url.endsWith('/users/00000000-0000-4000-8000-000000000201/follow') &&
          init?.method === 'DELETE'
        ) {
          return response({ following: false, followingCount: 3 });
        }
        throw new Error(`Unexpected URL: ${url}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(
      <FollowingDialog
        open
        onClose={onClose}
        onFollowingCountChange={onFollowingCountChange}
      />,
    );

    expect(
      await screen.findByRole('heading', { name: '我的关注' }),
    ).toBeVisible();
    expect(await screen.findByText('户外蓝友')).toBeVisible();
    expect(screen.getByText('小蓝书号：10002001')).toBeVisible();
    expect(screen.getByText('周末去露营')).toBeVisible();

    const unfollowTrigger = screen.getByRole('button', { name: '已关注' });
    fireEvent.click(unfollowTrigger);
    expect(screen.getByRole('alertdialog', { name: '取消关注' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /^取消$/ }));
    await waitFor(() => expect(unfollowTrigger).toHaveFocus());

    fireEvent.click(unfollowTrigger);
    fireEvent.click(screen.getByRole('button', { name: '确认取消关注' }));

    await waitFor(() => expect(onFollowingCountChange).toHaveBeenCalledWith(3));
    expect(screen.queryByText('户外蓝友')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('navigates from a user row without exposing a standalone following URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          items: [
            {
              id: '00000000-0000-4000-8000-000000000202',
              nickname: '数码蓝友',
              littleBlueBookId: '10002002',
              bio: null,
              avatar: { type: 'initial', value: '数' },
            },
          ],
          nextCursor: null,
        }),
      ) as unknown as typeof fetch,
    );
    const onClose = vi.fn();
    render(
      <FollowingDialog
        open
        onClose={onClose}
        onFollowingCountChange={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /数码蓝友/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(navigation.push).toHaveBeenCalledWith(
      '/users/00000000-0000-4000-8000-000000000202',
    );
  });

  it('keeps the row and starts login recovery when unfollowing loses its session', async () => {
    const onAuthenticationRequired = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          return response(
            {
              statusCode: 401,
              code: 'AUTHENTICATION_REQUIRED',
              message: '请先登录',
            },
            401,
          );
        }
        return response({
          items: [
            {
              id: '00000000-0000-4000-8000-000000000203',
              nickname: '会话保留蓝友',
              littleBlueBookId: '10002003',
              bio: null,
              avatar: { type: 'initial', value: '会' },
            },
          ],
          nextCursor: null,
        });
      }) as unknown as typeof fetch,
    );
    render(
      <FollowingDialog
        open
        onClose={vi.fn()}
        onFollowingCountChange={vi.fn()}
        onAuthenticationRequired={onAuthenticationRequired}
      />,
    );

    await screen.findByText('会话保留蓝友');
    fireEvent.click(screen.getByRole('button', { name: '已关注' }));
    fireEvent.click(screen.getByRole('button', { name: '确认取消关注' }));

    expect(
      await screen.findByText('登录状态已失效，请重新登录后重试'),
    ).toBeVisible();
    expect(screen.getByText('会话保留蓝友')).toBeVisible();
    expect(onAuthenticationRequired).toHaveBeenCalledTimes(1);
  });
});
