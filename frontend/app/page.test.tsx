import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Home from './page';

type JsonResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

function response(body: unknown, status = 200): JsonResponse {
  return {
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

function guestSession() {
  return response({
    authenticated: false,
    user: null,
    pendingRegistration: false,
  });
}

describe('Home', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => guestSession()) as unknown as typeof fetch,
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the confirmed desktop shell, menu, channels and local cards', async () => {
    render(<Home />);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(screen.getByAltText('小蓝书')).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: '主要功能' }),
    ).toHaveTextContent('发现视频直播发布通知登录');
    expect(
      screen.getByRole('navigation', { name: '其他功能' }),
    ).toHaveTextContent('更多关于我们');
    expect(
      screen.getByRole('navigation', { name: '内容频道' }),
    ).toHaveTextContent(
      '推荐数码汽车游戏运动健身户外穿搭美食职场情感家居旅行视频',
    );
    expect(screen.getAllByRole('button', { name: '登录' })).toHaveLength(1);
    expect(document.querySelectorAll('.note-card')).toHaveLength(10);
    expect(
      screen.getByRole('button', {
        name: '查看内容：一套真正适合通勤的轻量装备',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText('视频内容')).toHaveLength(3);
  });

  it('shows the shared coming-soon feedback without navigation', async () => {
    render(<Home />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    fireEvent.click(
      screen.getByRole('button', { name: '搜索，登录探索更多内容' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('功能开发中');

    fireEvent.click(screen.getByRole('button', { name: '业务合作' }));
    expect(screen.getByRole('status')).toHaveTextContent('功能开发中');
  });

  it('enforces agreement and email validation before sending a code', async () => {
    render(<Home />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    fireEvent.click(screen.getByRole('button', { name: '获取验证码' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      '请先阅读并同意用户协议与隐私政策',
    );

    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByLabelText('同意用户协议与隐私政策'));
    fireEvent.click(screen.getByRole('button', { name: '获取验证码' }));
    expect(screen.getByRole('alert')).toHaveTextContent('请输入有效的邮箱地址');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shows sending state and starts the resend countdown after success', async () => {
    let finishSending: ((value: JsonResponse) => void) | undefined;
    const fetchMock = vi.fn(
      (input: string | URL | Request, init?: RequestInit) => {
        void init;
        const url = String(input);
        if (url.endsWith('/auth/session')) {
          return Promise.resolve(guestSession());
        }
        if (url.endsWith('/auth/email-code/request')) {
          return new Promise<JsonResponse>((resolve) => {
            finishSending = resolve;
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Home />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: { value: ' User@Example.com ' },
    });
    fireEvent.click(screen.getByLabelText('同意用户协议与隐私政策'));
    fireEvent.click(screen.getByRole('button', { name: '获取验证码' }));

    expect(screen.getByRole('button', { name: '发送中…' })).toBeDisabled();
    expect(screen.getByLabelText('邮箱')).toBeDisabled();

    finishSending?.(response({ message: '验证码已发送' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '60秒后重发' })).toBeDisabled(),
    );
    expect(screen.getByRole('status')).toHaveTextContent('验证码已发送');
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/auth/email-code/request');
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        email: 'user@example.com',
        acceptedTerms: true,
      }),
    });
  });

  it('logs an existing user in and logs only the current browser out', async () => {
    const user = {
      id: 'user-1',
      email: 'user@example.com',
      nickname: '蓝海',
    };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/auth/session')) return guestSession();
      if (url.endsWith('/auth/email-code/verify')) {
        return response({ status: 'authenticated', user });
      }
      if (url.endsWith('/auth/logout')) return response({ success: true });
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Home />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText('验证码'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByLabelText('同意用户协议与隐私政策'));
    fireEvent.click(screen.getByRole('button', { name: '登录/注册' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    const identity = screen.getByRole('button', { name: /蓝海/ });
    expect(identity).toHaveTextContent('蓝海');
    expect(identity).toHaveTextContent('蓝');

    fireEvent.click(identity);
    fireEvent.click(screen.getByRole('menuitem', { name: '退出登录' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument(),
    );
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith('/auth/logout'),
      ),
    ).toBe(true);
  });

  it('keeps a completed login when the initial guest session resolves late', async () => {
    const user = {
      id: 'user-race-login',
      email: 'race-login@example.com',
      nickname: '竞速登录',
    };
    let resolveInitialSession: ((value: JsonResponse) => void) | undefined;
    const initialSessionPromise = new Promise<JsonResponse>((resolve) => {
      resolveInitialSession = resolve;
    });
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/auth/session')) return initialSessionPromise;
      if (url.endsWith('/auth/email-code/verify')) {
        return Promise.resolve(response({ status: 'authenticated', user }));
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Home />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: { value: 'race-login@example.com' },
    });
    fireEvent.change(screen.getByLabelText('验证码'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByLabelText('同意用户协议与隐私政策'));
    fireEvent.click(screen.getByRole('button', { name: '登录/注册' }));

    expect(
      await screen.findByRole('button', { name: /竞速登录/ }),
    ).toBeInTheDocument();

    await act(async () => {
      resolveInitialSession?.(guestSession());
      await initialSessionPromise;
    });

    expect(
      screen.getByRole('button', { name: /竞速登录/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '登录' }),
    ).not.toBeInTheDocument();
  });

  it('continues a new account through nickname validation and registration', async () => {
    const user = {
      id: 'user-2',
      email: 'new@example.com',
      nickname: '新蓝友',
    };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/auth/session')) return guestSession();
      if (url.endsWith('/auth/email-code/verify')) {
        return response({ status: 'registration_required' });
      }
      if (url.endsWith('/auth/registration/complete')) {
        return response({ status: 'authenticated', user });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Home />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: { value: 'new@example.com' },
    });
    fireEvent.change(screen.getByLabelText('验证码'), {
      target: { value: '654321' },
    });
    fireEvent.click(screen.getByLabelText('同意用户协议与隐私政策'));
    fireEvent.click(screen.getByRole('button', { name: '登录/注册' }));

    expect(
      await screen.findByRole('heading', { name: '完善资料' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('昵称'), {
      target: { value: '!' },
    });
    fireEvent.click(screen.getByRole('button', { name: '完成注册' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      '昵称需为2～20个中文、字母、数字或下划线',
    );

    fireEvent.change(screen.getByLabelText('昵称'), {
      target: { value: '新蓝友' },
    });
    fireEvent.click(screen.getByRole('button', { name: '完成注册' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /新蓝友/ }),
      ).toBeInTheDocument(),
    );
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith('/auth/registration/complete'),
      ),
    ).toBe(true);
  });

  it('keeps a completed registration when the initial guest session resolves late', async () => {
    const user = {
      id: 'user-race-registration',
      email: 'race-registration@example.com',
      nickname: '竞速注册',
    };
    let resolveInitialSession: ((value: JsonResponse) => void) | undefined;
    const initialSessionPromise = new Promise<JsonResponse>((resolve) => {
      resolveInitialSession = resolve;
    });
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/auth/session')) return initialSessionPromise;
      if (url.endsWith('/auth/email-code/verify')) {
        return Promise.resolve(response({ status: 'registration_required' }));
      }
      if (url.endsWith('/auth/registration/complete')) {
        return Promise.resolve(response({ status: 'authenticated', user }));
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Home />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: { value: 'race-registration@example.com' },
    });
    fireEvent.change(screen.getByLabelText('验证码'), {
      target: { value: '654321' },
    });
    fireEvent.click(screen.getByLabelText('同意用户协议与隐私政策'));
    fireEvent.click(screen.getByRole('button', { name: '登录/注册' }));

    await screen.findByRole('heading', { name: '完善资料' });
    fireEvent.change(screen.getByLabelText('昵称'), {
      target: { value: '竞速注册' },
    });
    fireEvent.click(screen.getByRole('button', { name: '完成注册' }));
    expect(
      await screen.findByRole('button', { name: /竞速注册/ }),
    ).toBeInTheDocument();

    await act(async () => {
      resolveInitialSession?.(guestSession());
      await initialSessionPromise;
    });

    expect(
      screen.getByRole('button', { name: /竞速注册/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '登录' }),
    ).not.toBeInTheDocument();
  });

  it('restores an authenticated session without opening the modal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          authenticated: true,
          user: {
            id: 'user-3',
            email: 'returning@example.com',
            nickname: '归航',
          },
          pendingRegistration: false,
        }),
      ) as unknown as typeof fetch,
    );

    render(<Home />);

    expect(
      await screen.findByRole('button', { name: /归航/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('restores the profile step for an unexpired registration credential', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          authenticated: false,
          user: null,
          pendingRegistration: true,
          pendingEmail: 'pending@example.com',
        }),
      ) as unknown as typeof fetch,
    );

    render(<Home />);
    const login = await screen.findByRole('button', { name: '登录' });
    fireEvent.click(login);

    expect(
      screen.getByRole('heading', { name: '完善资料' }),
    ).toBeInTheDocument();
    expect(screen.getByText('已验证邮箱：pending@example.com')).toBeVisible();
  });

  it('returns an expired registration credential to email verification', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          authenticated: false,
          user: null,
          pendingRegistration: false,
          registrationExpired: true,
        }),
      ) as unknown as typeof fetch,
    );

    render(<Home />);
    const login = await screen.findByRole('button', { name: '登录' });
    fireEvent.click(login);

    expect(
      screen.getByRole('heading', { name: '邮箱登录' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      '验证状态已失效，请重新获取验证码',
    );
  });

  it('shows the exact expired-registration message returned by the API', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/auth/session')) return guestSession();
      if (url.endsWith('/auth/email-code/verify')) {
        return response({ status: 'registration_required' });
      }
      if (url.endsWith('/auth/registration/complete')) {
        return response(
          {
            statusCode: 401,
            code: 'REGISTRATION_EXPIRED',
            message: '验证状态已失效，请重新获取验证码',
          },
          401,
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Home />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: { value: 'expired@example.com' },
    });
    fireEvent.change(screen.getByLabelText('验证码'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByLabelText('同意用户协议与隐私政策'));
    fireEvent.click(screen.getByRole('button', { name: '登录/注册' }));
    await screen.findByRole('heading', { name: '完善资料' });

    fireEvent.change(screen.getByLabelText('昵称'), {
      target: { value: '过期用户' },
    });
    fireEvent.click(screen.getByRole('button', { name: '完成注册' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '验证状态已失效，请重新获取验证码',
    );
    expect(
      screen.getByRole('heading', { name: '邮箱登录' }),
    ).toBeInTheDocument();
  });

  it('keeps overlay clicks inert, closes on Escape and restores focus', async () => {
    render(<Home />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const login = screen.getByRole('button', { name: '登录' });
    fireEvent.click(login);
    const dialog = screen.getByRole('dialog');

    const backdrop = document.querySelector('.modal-backdrop');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);
    expect(dialog).toBeInTheDocument();

    const close = screen.getByRole('button', { name: '关闭登录弹窗' });
    const privacy = screen.getByRole('button', { name: '《隐私政策》' });
    privacy.focus();
    fireEvent.keyDown(privacy, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(privacy).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(login).toHaveFocus());
  });

  it('shows the exact remaining-attempt error returned by the API', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/auth/session')) return guestSession();
      if (url.endsWith('/auth/email-code/verify')) {
        return response(
          {
            statusCode: 400,
            code: 'VERIFICATION_CODE_INVALID',
            message: '验证码错误',
            details: { remainingAttempts: 4 },
          },
          400,
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Home />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText('验证码'), {
      target: { value: '111111' },
    });
    fireEvent.click(screen.getByLabelText('同意用户协议与隐私政策'));
    fireEvent.click(screen.getByRole('button', { name: '登录/注册' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '验证码错误，还可尝试 4 次',
    );
  });
});
