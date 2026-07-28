import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bindNoteDetailSource, consumeNoteDetailSource } from '../_lib/notes';
import PublishPage from './page';

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

function imageFile(name: string, type = 'image/png', size = 4) {
  return new File([new Uint8Array(size)], name, { type });
}

const channels = {
  items: [
    { code: 'digital', name: '数码', displayOrder: 1 },
    { code: 'automotive', name: '汽车', displayOrder: 2 },
    { code: 'other', name: '其它', displayOrder: 13 },
  ],
};

function authenticatedSession() {
  return {
    authenticated: true,
    user: {
      id: 'user-1',
      email: 'private@example.com',
      nickname: '蓝书作者',
    },
  };
}

describe('PublishPage', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/publish');
    navigation.push.mockReset();
    navigation.replace.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) =>
        response(
          String(input).includes('/channels')
            ? channels
            : authenticatedSession(),
        ),
      ) as unknown as typeof fetch,
    );
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn((file: File) => `blob:${file.name}`),
        revokeObjectURL: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, 'navigation');
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('redirects an unauthenticated direct visit to homepage login continuation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) =>
        response(
          String(input).includes('/channels')
            ? channels
            : { authenticated: false, user: null },
        ),
      ) as unknown as typeof fetch,
    );

    render(<PublishPage />);

    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(
        '/?login=1&next=/publish',
      ),
    );
    expect(screen.queryByRole('heading', { name: '发布图文笔记' })).toBeNull();
  });

  it('validates files, previews them and offers keyboard-operable ordering', async () => {
    render(<PublishPage />);
    await screen.findByRole('heading', { name: '发布图文笔记' });

    const input = screen.getByLabelText('选择笔记图片');
    fireEvent.change(input, {
      target: {
        files: [imageFile('first.png'), imageFile('second.webp', 'image/webp')],
      },
    });

    expect(screen.getByAltText('第1张预览')).toHaveAttribute(
      'src',
      'blob:first.png',
    );
    expect(screen.getByText('封面')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '将第2张图片前移' }));
    expect(screen.getByAltText('第1张预览')).toHaveAttribute(
      'src',
      'blob:second.webp',
    );

    fireEvent.change(input, {
      target: { files: [imageFile('unsafe.svg', 'image/svg+xml')] },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'unsafe.svg：仅支持JPEG、PNG和WebP',
    );
    expect(screen.getByText('2/9')).toBeVisible();
  });

  it('requires one server-provided channel and supports keyboard selection', async () => {
    render(<PublishPage />);
    await screen.findByRole('heading', { name: '发布图文笔记' });
    const trigger = await screen.findByRole('button', { name: '选择频道' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('必选')).toBeVisible();

    fireEvent.click(trigger);
    const digital = screen.getByRole('radio', { name: '数码' });
    const automotive = screen.getByRole('radio', { name: '汽车' });
    await waitFor(() => expect(digital).toHaveFocus());
    fireEvent.keyDown(digital, { key: 'ArrowRight' });
    expect(automotive).toHaveFocus();
    fireEvent.keyDown(automotive, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('radio', { name: '其它' }));
    expect(trigger).toHaveTextContent('其它');
    expect(screen.getByText('已选择，可在发布前更换')).toBeVisible();
  });

  it('publishes one ordered multipart request and enters its detail', async () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/channels')) {
          return response(channels);
        }
        if (url.endsWith('/auth/session')) {
          return response(authenticatedSession());
        }
        if (url.endsWith('/notes') && init?.method === 'POST') {
          const body = init.body as FormData;
          expect(body.get('title')).toBe('测试标题');
          expect(body.get('content')).toBe('第一行\n第二行');
          expect(body.get('channelCode')).toBe('digital');
          expect(body.getAll('images')).toHaveLength(2);
          expect(body.get('clientRequestId')).toMatch(/^[0-9a-f-]{36}$/i);
          return response(
            {
              id: '00000000-0000-4000-8000-000000000004',
              createdAt: '2026-07-26T12:00:00.000Z',
            },
            201,
          );
        }
        throw new Error(`Unexpected URL: ${url}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    render(<PublishPage />);
    await screen.findByRole('heading', { name: '发布图文笔记' });

    fireEvent.change(screen.getByLabelText('选择笔记图片'), {
      target: { files: [imageFile('one.png'), imageFile('two.png')] },
    });
    fireEvent.change(screen.getByLabelText('标题'), {
      target: { value: ' 测试标题 ' },
    });
    fireEvent.change(screen.getByLabelText('正文'), {
      target: { value: ' 第一行\n第二行 ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '选择频道' }));
    fireEvent.click(screen.getByRole('radio', { name: '数码' }));
    const submit = screen.getByRole('button', { name: '发布笔记' });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(
        '/explore/00000000-0000-4000-8000-000000000004',
      ),
    );
    bindNoteDetailSource('00000000-0000-4000-8000-000000000004');
    expect(
      consumeNoteDetailSource('00000000-0000-4000-8000-000000000004'),
    ).toBe('/publish');
    expect(
      fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).endsWith('/notes') && init?.method === 'POST',
      ),
    ).toHaveLength(1);
  });

  it('keeps the complete form and opens login when publishing returns 401', async () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/channels')) {
          return response(channels);
        }
        if (url.endsWith('/auth/session')) {
          return response(authenticatedSession());
        }
        if (url.endsWith('/notes') && init?.method === 'POST') {
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
      },
    );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    render(<PublishPage />);
    await screen.findByRole('heading', { name: '发布图文笔记' });

    fireEvent.change(screen.getByLabelText('选择笔记图片'), {
      target: { files: [imageFile('kept.png')] },
    });
    fireEvent.change(screen.getByLabelText('标题'), {
      target: { value: '会被保留的标题' },
    });
    fireEvent.change(screen.getByLabelText('正文'), {
      target: { value: '会被保留的正文' },
    });
    fireEvent.click(screen.getByRole('button', { name: '选择频道' }));
    fireEvent.click(screen.getByRole('radio', { name: '汽车' }));
    fireEvent.click(screen.getByRole('button', { name: '发布笔记' }));

    expect(
      await screen.findByRole('dialog', { name: '邮箱登录' }),
    ).toBeVisible();
    await waitFor(() => {
      expect(document.documentElement.style.overflow).toBe('hidden');
      expect(document.body.style.overflow).toBe('hidden');
    });
    expect(screen.getByLabelText('标题')).toHaveValue('会被保留的标题');
    expect(screen.getByLabelText('正文')).toHaveValue('会被保留的正文');
    expect(screen.getByRole('button', { name: /汽车/ })).toHaveTextContent(
      '汽车',
    );
    expect(screen.getByAltText('第1张预览')).toHaveAttribute(
      'src',
      'blob:kept.png',
    );
  });

  it('keeps the draft while retrying a channel-list failure', async () => {
    let channelAttempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/channels')) {
          channelAttempts += 1;
          return channelAttempts === 1
            ? response({ code: 'INTERNAL_ERROR' }, 500)
            : response(channels);
        }
        if (url.endsWith('/auth/session')) {
          return response(authenticatedSession());
        }
        throw new Error(`Unexpected URL: ${url}`);
      }) as unknown as typeof fetch,
    );
    render(<PublishPage />);
    await screen.findByRole('heading', { name: '发布图文笔记' });
    fireEvent.change(screen.getByLabelText('标题'), {
      target: { value: '保留的草稿' },
    });

    expect(await screen.findByText('频道加载失败，请重试')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(
      await screen.findByRole('button', { name: '选择频道' }),
    ).toBeVisible();
    expect(screen.getByLabelText('标题')).toHaveValue('保留的草稿');
    expect(channelAttempts).toBe(2);
  });

  it('warns before leaving a dirty form through in-app navigation', async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    render(<PublishPage />);
    await screen.findByRole('heading', { name: '发布图文笔记' });

    fireEvent.change(screen.getByLabelText('标题'), {
      target: { value: '未发布标题' },
    });
    fireEvent.click(
      document.querySelector<HTMLButtonElement>('.publish-exit')!,
    );

    expect(confirm).toHaveBeenCalledWith('内容尚未发布，确认离开吗？');
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('keeps one stateless unload guard across retries and removes it on unmount', async () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    const view = render(<PublishPage />);
    await screen.findByRole('heading', { name: '发布图文笔记' });

    fireEvent.change(screen.getByLabelText('标题'), {
      target: { value: '浏览器历史导航前保留的标题' },
    });

    const firstAttempt = new Event('beforeunload', { cancelable: true });
    const secondAttempt = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(firstAttempt);
    window.dispatchEvent(secondAttempt);

    expect(firstAttempt.defaultPrevented).toBe(true);
    expect(secondAttempt.defaultPrevented).toBe(true);
    const unloadRegistrations = addEventListener.mock.calls.filter(
      ([type]) => type === 'beforeunload',
    );
    expect(unloadRegistrations).toHaveLength(1);
    const unloadHandler = unloadRegistrations[0]?.[1];

    view.unmount();
    expect(removeEventListener).toHaveBeenCalledWith(
      'beforeunload',
      unloadHandler,
    );

    const afterUnmount = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(afterUnmount);
    expect(afterUnmount.defaultPrevented).toBe(false);
  });
});
