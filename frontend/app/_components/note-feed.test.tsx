import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NoteFeed } from './note-feed';

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const firstNote = {
  id: '00000000-0000-4000-8000-000000000001',
  title: '<strong>真实纯文本标题</strong>',
  cover: { url: 'https://media.example.test/one.png', width: 4, height: 5 },
  author: {
    id: '00000000-0000-4000-8000-000000000099',
    nickname: '蓝书作者',
    avatar: { type: 'initial', value: '蓝' },
  },
  likes: 0,
  liked: false,
  canLike: true,
};

describe('NoteFeed', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the skeleton visible for 300ms before showing a fast empty feed', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({ items: [], nextCursor: null }),
      ) as unknown as typeof fetch,
    );

    render(
      <NoteFeed
        endpoint="/notes/channels/digital"
        label="数码频道内容"
        emptyMessage="该频道还没有笔记"
        errorMessage="频道内容加载失败"
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(screen.getByLabelText('数码频道内容')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.queryByText('该频道还没有笔记')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(screen.getByText('该频道还没有笔记')).toBeVisible();
  });

  it('renders a keyboard-openable real note card with minimal fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({ items: [firstNote], nextCursor: null }),
      ) as unknown as typeof fetch,
    );

    render(
      <NoteFeed
        endpoint="/notes/recommendations"
        label="推荐内容"
        emptyMessage="没有笔记"
        errorMessage="加载失败"
      />,
    );

    const link = await screen.findByRole('link', {
      name: '查看笔记：<strong>真实纯文本标题</strong>',
    });
    expect(link).toHaveAttribute(
      'href',
      '/explore/00000000-0000-4000-8000-000000000001',
    );
    expect(document.querySelector('.card-title strong')).toBeNull();
    expect(screen.getByText('蓝书作者')).toBeVisible();
    expect(screen.getByLabelText('点赞，当前 0')).toBeVisible();
    expect(screen.queryByText(/正文|分钟前|小时前/)).toBeNull();
  });

  it('keeps existing cards when loading more fails and can retry', async () => {
    let moreAttempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        if (!url.searchParams.has('cursor')) {
          return response({ items: [firstNote], nextCursor: 'opaque-cursor' });
        }
        moreAttempts += 1;
        if (moreAttempts === 1) {
          return response(
            {
              statusCode: 500,
              code: 'INTERNAL_ERROR',
              message: '网络异常，请稍后重试',
            },
            500,
          );
        }
        return response({
          items: [
            {
              ...firstNote,
              id: '00000000-0000-4000-8000-000000000002',
              title: '第二篇笔记',
            },
          ],
          nextCursor: null,
        });
      }) as unknown as typeof fetch,
    );

    render(
      <NoteFeed
        endpoint="/notes/recommendations"
        label="推荐内容"
        emptyMessage="没有笔记"
        errorMessage="加载失败"
      />,
    );
    await screen.findByText('<strong>真实纯文本标题</strong>');
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));

    expect(
      await screen.findByText('加载更多失败，已保留现有内容'),
    ).toBeVisible();
    expect(screen.getByText('<strong>真实纯文本标题</strong>')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(await screen.findByText('第二篇笔记')).toBeVisible();
    expect(document.querySelectorAll('.note-card')).toHaveLength(2);
  });

  it('likes from the card without navigating and uses the server count', async () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/notes/recommendations')) {
          return response({ items: [firstNote], nextCursor: null });
        }
        if (url.includes(`/notes/${firstNote.id}/like`)) {
          expect(init?.method).toBe('PUT');
          return response({ active: true, count: 7 });
        }
        throw new Error(`Unexpected URL: ${url}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(
      <NoteFeed
        endpoint="/notes/recommendations"
        label="推荐内容"
        emptyMessage="没有笔记"
        errorMessage="加载失败"
      />,
    );
    const like = await screen.findByRole('button', {
      name: '点赞，当前 0',
    });
    fireEvent.click(like);

    expect(
      await screen.findByRole('button', { name: '取消点赞，当前 7' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/notes/${firstNote.id}/like`),
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('offers a first-load retry without falling back to demo content', async () => {
    let attempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        attempts += 1;
        return attempts === 1
          ? response({ code: 'INTERNAL_ERROR' }, 500)
          : response({ items: [], nextCursor: null });
      }) as unknown as typeof fetch,
    );

    render(
      <NoteFeed
        endpoint="/notes/recommendations"
        label="推荐内容"
        emptyMessage="没有笔记"
        errorMessage="推荐内容加载失败，请稍后重试"
      />,
    );
    expect(
      await screen.findByText('推荐内容加载失败，请稍后重试'),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('没有笔记')).toBeVisible();
    expect(document.querySelectorAll('.note-card')).toHaveLength(0);
  });
});
