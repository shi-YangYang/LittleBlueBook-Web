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

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
}));

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

function emptyNotes() {
  return response({ items: [], nextCursor: null });
}

function channelList() {
  return response({
    items: [
      { code: 'digital', name: '数码', displayOrder: 1 },
      { code: 'automotive', name: '汽车', displayOrder: 2 },
      { code: 'gaming', name: '游戏', displayOrder: 3 },
      { code: 'sports', name: '运动', displayOrder: 4 },
      { code: 'fitness', name: '健身', displayOrder: 5 },
      { code: 'outdoors', name: '户外', displayOrder: 6 },
      { code: 'fashion', name: '穿搭', displayOrder: 7 },
      { code: 'food', name: '美食', displayOrder: 8 },
      { code: 'workplace', name: '职场', displayOrder: 9 },
      { code: 'relationships', name: '情感', displayOrder: 10 },
      { code: 'home', name: '家居', displayOrder: 11 },
      { code: 'travel', name: '旅行', displayOrder: 12 },
      { code: 'other', name: '其它', displayOrder: 13 },
    ],
  });
}

describe('Home', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    navigation.push.mockReset();
    navigation.replace.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/channels')) return channelList();
        if (url.includes('/notes/channels/')) return emptyNotes();
        if (url.includes('/notes/recommendations')) return emptyNotes();
        return guestSession();
      }) as unknown as typeof fetch,
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the confirmed desktop shell and a real empty note feed', async () => {
    render(<Home />);

    await screen.findByText('还没有笔记，发布第一篇内容吧');
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
      '推荐数码汽车游戏运动健身户外穿搭美食职场情感家居旅行其它',
    );
    expect(screen.getAllByRole('button', { name: '登录' })).toHaveLength(1);
    expect(document.querySelectorAll('.note-card')).toHaveLength(0);
    expect(
      screen.getByRole('button', { name: '发布笔记' }),
    ).toBeInTheDocument();
  });

  it('opens the shared search dialog and keeps unrelated placeholders unchanged', async () => {
    render(<Home />);
    await screen.findByText('还没有笔记，发布第一篇内容吧');

    fireEvent.click(
      screen.getByRole('button', {
        name: '搜索：搜索感兴趣的内容',
      }),
    );
    expect(
      screen.getByRole('dialog', { name: '搜索小蓝书' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '业务合作' }));
    expect(screen.getByRole('status')).toHaveTextContent('功能开发中');
  });

  it('drives channel feeds from the URL and restores browser history state', async () => {
    render(<Home />);
    await screen.findByText('还没有笔记，发布第一篇内容吧');

    fireEvent.click(screen.getByRole('button', { name: '数码' }));
    expect(window.location.search).toBe('?channel=digital');
    expect(screen.getByRole('button', { name: '数码' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(await screen.findByText('该频道还没有笔记')).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/notes/channels/digital?limit=20'),
      expect.objectContaining({ credentials: 'include' }),
    );

    window.history.replaceState(null, '', '/?channel=automotive');
    fireEvent(window, new PopStateEvent('popstate'));
    expect(screen.getByRole('button', { name: '汽车' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(window.location.search).toBe('?channel=automotive');

    window.history.replaceState(null, '', '/');
    fireEvent(window, new PopStateEvent('popstate'));
    expect(screen.getByRole('button', { name: '推荐' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('does not substitute recommendation data for an invalid channel URL', async () => {
    window.history.replaceState(null, '', '/?channel=uncategorized');
    render(<Home />);

    expect(await screen.findByText('频道不存在或已停用')).toBeVisible();
    expect(screen.queryByText('还没有笔记，发布第一篇内容吧')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '返回推荐' }));
    expect(window.location.search).toBe('');
    expect(
      await screen.findByText('还没有笔记，发布第一篇内容吧'),
    ).toBeVisible();
  });

  it('shows and retries an authoritative channel-list failure', async () => {
    let channelAttempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/channels')) {
          channelAttempts += 1;
          return channelAttempts === 1
            ? response({ code: 'INTERNAL_ERROR' }, 500)
            : channelList();
        }
        if (url.endsWith('/auth/session')) return guestSession();
        if (url.includes('/notes/recommendations')) return emptyNotes();
        throw new Error(`Unexpected URL: ${url}`);
      }) as unknown as typeof fetch,
    );
    render(<Home />);

    expect(await screen.findByText('频道加载失败，请重试')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(
      await screen.findByText('还没有笔记，发布第一篇内容吧'),
    ).toBeVisible();
    expect(channelAttempts).toBe(2);
  });

  it('enforces agreement and email validation before sending a code', async () => {
    render(<Home />);
    await screen.findByText('还没有笔记，发布第一篇内容吧');
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
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('shows sending state and starts the resend countdown after success', async () => {
    let finishSending: ((value: JsonResponse) => void) | undefined;
    const fetchMock = vi.fn(
      (input: string | URL | Request, init?: RequestInit) => {
        void init;
        const url = String(input);
        if (url.endsWith('/channels')) {
          return Promise.resolve(channelList());
        }
        if (url.endsWith('/auth/session')) {
          return Promise.resolve(guestSession());
        }
        if (url.includes('/notes/recommendations')) {
          return Promise.resolve(emptyNotes());
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
    await screen.findByText('还没有笔记，发布第一篇内容吧');
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
    const requestCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/auth/email-code/request'),
    );
    expect(requestCall?.[0]).toContain('/auth/email-code/request');
    expect(requestCall?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        email: 'user@example.com',
        acceptedTerms: true,
      }),
    });
  });

  it('shows the fixed profile link after an existing user logs in', async () => {
    const user = {
      id: 'user-1',
      email: 'user@example.com',
      nickname: '蓝海',
    };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/channels')) return channelList();
      if (url.endsWith('/auth/session')) return guestSession();
      if (url.includes('/notes/recommendations')) return emptyNotes();
      if (url.endsWith('/auth/email-code/verify')) {
        return response({ status: 'authenticated', user });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Home />);
    await screen.findByText('还没有笔记，发布第一篇内容吧');
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
    const identity = screen.getByRole('link', { name: '我' });
    expect(identity).toHaveTextContent('我');
    expect(identity).toHaveTextContent('蓝');
    expect(identity).toHaveAttribute('href', '/profile');
    expect(
      screen.queryByRole('menuitem', { name: '退出登录' }),
    ).not.toBeInTheDocument();
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
      if (url.endsWith('/channels')) {
        return Promise.resolve(channelList());
      }
      if (url.endsWith('/auth/session')) return initialSessionPromise;
      if (url.includes('/notes/recommendations')) {
        return Promise.resolve(emptyNotes());
      }
      if (url.endsWith('/auth/email-code/verify')) {
        return Promise.resolve(response({ status: 'authenticated', user }));
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<Home />);
    await screen.findByText('还没有笔记，发布第一篇内容吧');
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    fireEvent.change(screen.getByLabelText('邮箱'), {
      target: { value: 'race-login@example.com' },
    });
    fireEvent.change(screen.getByLabelText('验证码'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByLabelText('同意用户协议与隐私政策'));
    fireEvent.click(screen.getByRole('button', { name: '登录/注册' }));

    expect(await screen.findByRole('link', { name: '我' })).toBeInTheDocument();

    await act(async () => {
      resolveInitialSession?.(guestSession());
      await initialSessionPromise;
    });

    expect(screen.getByRole('link', { name: '我' })).toBeInTheDocument();
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
      if (url.endsWith('/channels')) return channelList();
      if (url.endsWith('/auth/session')) return guestSession();
      if (url.includes('/notes/recommendations')) return emptyNotes();
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
    await screen.findByText('还没有笔记，发布第一篇内容吧');
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
      expect(screen.getByRole('link', { name: '我' })).toBeInTheDocument(),
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
      if (url.endsWith('/channels')) {
        return Promise.resolve(channelList());
      }
      if (url.endsWith('/auth/session')) return initialSessionPromise;
      if (url.includes('/notes/recommendations')) {
        return Promise.resolve(emptyNotes());
      }
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
    await screen.findByText('还没有笔记，发布第一篇内容吧');
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
    expect(await screen.findByRole('link', { name: '我' })).toBeInTheDocument();

    await act(async () => {
      resolveInitialSession?.(guestSession());
      await initialSessionPromise;
    });

    expect(screen.getByRole('link', { name: '我' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '登录' }),
    ).not.toBeInTheDocument();
  });

  it('restores an authenticated session without opening the modal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/channels')) return channelList();
        return url.includes('/notes/recommendations')
          ? emptyNotes()
          : response({
              authenticated: true,
              user: {
                id: 'user-3',
                email: 'returning@example.com',
                nickname: '归航',
              },
              pendingRegistration: false,
            });
      }) as unknown as typeof fetch,
    );

    render(<Home />);

    expect(await screen.findByRole('link', { name: '我' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not flash the login action while restoring an authenticated session', async () => {
    let resolveSession:
      ((value: JsonResponse | PromiseLike<JsonResponse>) => void) | undefined;
    const sessionPromise = new Promise<JsonResponse>((resolve) => {
      resolveSession = resolve;
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/channels')) return channelList();
        if (url.includes('/notes/recommendations')) return emptyNotes();
        if (url.endsWith('/auth/session')) return sessionPromise;
        return guestSession();
      }) as unknown as typeof fetch,
    );

    render(<Home />);

    expect(
      screen.queryByRole('button', { name: '登录' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('session-entry-placeholder')).toBeInTheDocument();

    await act(async () => {
      resolveSession?.(
        response({
          authenticated: true,
          user: {
            id: 'user-delayed-session',
            email: 'delayed@example.com',
            nickname: '归航',
          },
          pendingRegistration: false,
        }),
      );
      await sessionPromise;
    });

    expect(await screen.findByRole('link', { name: '我' })).toBeInTheDocument();
    expect(
      screen.queryByTestId('session-entry-placeholder'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '登录' }),
    ).not.toBeInTheDocument();
  });

  it('automatically opens login after a protected-route redirect', async () => {
    window.history.replaceState(null, '', '/?login=1');

    render(<Home />);

    expect(
      await screen.findByRole('dialog', { name: '邮箱登录' }),
    ).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('restores the profile step for an unexpired registration credential', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/channels')) return channelList();
        return url.includes('/notes/recommendations')
          ? emptyNotes()
          : response({
              authenticated: false,
              user: null,
              pendingRegistration: true,
              pendingEmail: 'pending@example.com',
            });
      }) as unknown as typeof fetch,
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
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/channels')) return channelList();
        return url.includes('/notes/recommendations')
          ? emptyNotes()
          : response({
              authenticated: false,
              user: null,
              pendingRegistration: false,
              registrationExpired: true,
            });
      }) as unknown as typeof fetch,
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
      if (url.endsWith('/channels')) return channelList();
      if (url.endsWith('/auth/session')) return guestSession();
      if (url.includes('/notes/recommendations')) return emptyNotes();
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
    await screen.findByText('还没有笔记，发布第一篇内容吧');
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
    await screen.findByText('还没有笔记，发布第一篇内容吧');
    const login = screen.getByRole('button', { name: '登录' });
    fireEvent.click(login);
    const dialog = screen.getByRole('dialog');
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.body.style.overflow).toBe('hidden');

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
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.body.style.overflow).toBe('');
  });

  it('shows the exact remaining-attempt error returned by the API', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/channels')) return channelList();
      if (url.endsWith('/auth/session')) return guestSession();
      if (url.includes('/notes/recommendations')) return emptyNotes();
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
    await screen.findByText('还没有笔记，发布第一篇内容吧');
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
