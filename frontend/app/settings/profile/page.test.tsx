import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProfileSettingsPage from './page';

const push = vi.fn();
const replace = vi.fn();
const router = { push, replace };

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { priority: _priority, ...imageProps } = props;
    void _priority;
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...imageProps} alt={String(props.alt ?? '')} />;
  },
}));

type SettingsFixture = {
  nickname: string;
  littleBlueBookId: string;
  email: string;
  gender: 'MALE' | 'FEMALE' | 'PRIVATE';
  birthDate: string | null;
  showAge: boolean;
  bio: string | null;
  avatar: { type: 'initial'; value: string } | { type: 'image'; value: string };
  profileVersion: string;
};

const initialSettings: SettingsFixture = {
  nickname: '资料蓝友',
  littleBlueBookId: '0000000117',
  email: 'private@example.com',
  gender: 'PRIVATE',
  birthDate: null,
  showAge: false,
  bio: null,
  avatar: { type: 'initial', value: '资' },
  profileVersion: '00000000-0000-4000-8000-000000000117',
};

function response(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => data),
  } as unknown as Response;
}

function successfulFetch(updatedSettings: SettingsFixture = initialSettings) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/profile/me/settings') && init?.method === 'PATCH') {
      return response({ data: { settings: updatedSettings } });
    }
    if (url.endsWith('/profile/me/settings')) {
      return response({ data: initialSettings });
    }
    if (url.endsWith('/auth/session')) {
      return response({
        data: {
          authenticated: true,
          user: {
            id: '00000000-0000-4000-8000-000000000117',
            email: initialSettings.email,
            nickname: initialSettings.nickname,
            avatar: initialSettings.avatar,
          },
        },
      });
    }
    if (url.endsWith('/notifications/unread-count')) {
      return response({ data: { unreadCount: 0 } });
    }
    throw new Error(`Unexpected request ${url}`);
  });
}

describe('ProfileSettingsPage', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockReset();
    replace.mockReset();
    vi.stubGlobal('fetch', successfulFetch());
  });

  it('keeps a stable skeleton before rendering private readonly and editable fields', async () => {
    render(<ProfileSettingsPage />);
    expect(screen.getByLabelText('正在加载个人资料设置')).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: '编辑资料' }),
    ).toBeVisible();
    expect(screen.getByDisplayValue('private@example.com')).toHaveAttribute(
      'readonly',
    );
    expect(screen.getByDisplayValue('0000000117')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('昵称')).toHaveValue('资料蓝友');
    expect(screen.getByRole('checkbox', { name: /公开年龄/ })).toBeDisabled();
  });

  it('keeps the first-load skeleton stable when the settings request fails immediately', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/profile/me/settings')) {
          return response(
            {
              code: 'PROFILE_SAVE_FAILED',
              message: '资料读取失败',
            },
            500,
          );
        }
        return response({
          data: {
            authenticated: true,
            user: null,
          },
        });
      }),
    );

    render(<ProfileSettingsPage />);
    expect(screen.getByLabelText('正在加载个人资料设置')).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(screen.getByLabelText('正在加载个人资料设置')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      '个人资料设置加载失败，请稍后重试',
    );
  });

  it('submits all editable fields once and adopts the returned profile version', async () => {
    const updated = {
      ...initialSettings,
      nickname: '更新蓝友',
      gender: 'MALE' as const,
      birthDate: '2000-07-29',
      showAge: true,
      bio: '新的个人简介',
      avatar: { type: 'initial' as const, value: '更' },
      profileVersion: '00000000-0000-4000-8000-000000000118',
    };
    const fetchMock = successfulFetch(updated);
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileSettingsPage />);
    await screen.findByRole('heading', { name: '编辑资料' });

    fireEvent.change(screen.getByLabelText('昵称'), {
      target: { value: updated.nickname },
    });
    fireEvent.click(screen.getByLabelText('男'));
    fireEvent.click(
      screen.getByRole('combobox', { name: '出生日期，尚未选择' }),
    );
    fireEvent.change(screen.getByLabelText('出生年份'), {
      target: { value: '2000' },
    });
    fireEvent.change(screen.getByLabelText('出生月份'), {
      target: { value: '6' },
    });
    fireEvent.click(screen.getByRole('gridcell', { name: '2000年7月29日' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /公开年龄/ }));
    fireEvent.change(screen.getByLabelText('个人简介'), {
      target: { value: updated.bio },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('status')).toHaveTextContent('资料已保存');
    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith('/profile/me/settings') &&
        init?.method === 'PATCH',
    );
    expect(patchCall).toBeDefined();
    const body = patchCall?.[1]?.body as FormData;
    expect(Object.fromEntries(body.entries())).toMatchObject({
      nickname: updated.nickname,
      gender: 'MALE',
      birthDate: updated.birthDate,
      showAge: 'true',
      bio: updated.bio,
      avatarAction: 'keep',
      profileVersion: initialSettings.profileVersion,
    });
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH'),
    ).toHaveLength(1);
    expect(push).toHaveBeenCalledWith('/profile');
  });

  it('preserves input and exposes a field error when the server rejects saving', async () => {
    const fetchMock = successfulFetch();
    fetchMock.mockImplementationOnce(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/profile/me/settings')) {
        return response({ data: initialSettings });
      }
      return response({
        data: {
          authenticated: true,
          user: {
            id: 'user',
            email: initialSettings.email,
            nickname: initialSettings.nickname,
            avatar: initialSettings.avatar,
          },
        },
      });
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (
          String(input).endsWith('/profile/me/settings') &&
          init?.method === 'PATCH'
        ) {
          return response(
            {
              code: 'PROFILE_VALIDATION_FAILED',
              message: '昵称格式无效',
              details: { field: 'nickname' },
            },
            400,
          );
        }
        return fetchMock(input, init);
      }),
    );
    render(<ProfileSettingsPage />);
    await screen.findByRole('heading', { name: '编辑资料' });

    const nickname = screen.getByLabelText('昵称');
    fireEvent.change(nickname, { target: { value: '保留输入' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('昵称格式无效')).toBeVisible();
    expect(nickname).toHaveValue('保留输入');
  });

  it('associates the global validation fields contract with the matching input', async () => {
    const baseFetch = successfulFetch();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (
          String(input).endsWith('/profile/me/settings') &&
          init?.method === 'PATCH'
        ) {
          return response(
            {
              code: 'VALIDATION_ERROR',
              message: '请求参数无效',
              details: { fields: ['gender'] },
            },
            400,
          );
        }
        return baseFetch(input, init);
      }),
    );

    render(<ProfileSettingsPage />);
    await screen.findByRole('heading', { name: '编辑资料' });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('请求参数无效')).toHaveAttribute(
      'id',
      'gender-error',
    );
    expect(screen.getByRole('group', { name: '性别' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it.each([
    ['gender', 'gender-error', '性别无效'],
    ['birthDate', 'birth-date-error', '出生日期无效'],
    ['showAge', 'show-age-error', '年龄公开状态无效'],
    ['bio', 'bio-error', '个人简介无效'],
  ] as const)(
    'renders and associates the %s server field error',
    async (field, errorId, message) => {
      const baseFetch = successfulFetch();
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          if (
            String(input).endsWith('/profile/me/settings') &&
            init?.method === 'PATCH'
          ) {
            return response(
              {
                code: 'PROFILE_VALIDATION_FAILED',
                message,
                details: { field },
              },
              400,
            );
          }
          return baseFetch(input, init);
        }),
      );

      render(<ProfileSettingsPage />);
      await screen.findByRole('heading', { name: '编辑资料' });
      fireEvent.click(screen.getByRole('button', { name: '保存' }));
      expect(await screen.findByText(message)).toHaveAttribute('id', errorId);

      const control =
        field === 'gender'
          ? screen.getByRole('group', { name: '性别' })
          : field === 'birthDate'
            ? screen.getByRole('combobox', { name: /出生日期/ })
            : field === 'showAge'
              ? screen.getByRole('checkbox', { name: /公开年龄/ })
              : screen.getByLabelText('个人简介');
      expect(control).toHaveAttribute('aria-describedby', errorId);
      expect(control).toHaveAttribute('aria-invalid', 'true');
    },
  );

  it('requires confirmation before canceling dirty form changes', async () => {
    render(<ProfileSettingsPage />);
    await screen.findByRole('heading', { name: '编辑资料' });
    fireEvent.change(screen.getByLabelText('个人简介'), {
      target: { value: '尚未保存' },
    });
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(
      screen.getByRole('dialog', { name: '放弃未保存的修改？' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByLabelText('个人简介')).toHaveValue('尚未保存');

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    fireEvent.click(screen.getByRole('button', { name: '放弃修改' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/profile'));
  });

  it('requires confirmation before a dirty form performs a global search', async () => {
    render(<ProfileSettingsPage />);
    await screen.findByRole('heading', { name: '编辑资料' });
    fireEvent.change(screen.getByLabelText('个人简介'), {
      target: { value: '搜索前尚未保存' },
    });

    const searchTrigger = screen.getByRole('button', {
      name: '搜索：搜索感兴趣的内容',
    });
    fireEvent.click(searchTrigger);
    fireEvent.change(screen.getByLabelText('搜索内容'), {
      target: { value: '蓝色风景' },
    });
    fireEvent.click(
      screen
        .getByRole('dialog', { name: '搜索小蓝书' })
        .querySelector('button[type="submit"]') as HTMLButtonElement,
    );

    expect(
      screen.getByRole('dialog', { name: '放弃未保存的修改？' }),
    ).toBeVisible();
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }));
    await waitFor(() => expect(searchTrigger).toHaveFocus());
    expect(screen.getByLabelText('个人简介')).toHaveValue('搜索前尚未保存');
  });
});
