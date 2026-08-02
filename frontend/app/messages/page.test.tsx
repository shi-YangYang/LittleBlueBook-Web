import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MessagesPage from './page';

const conversationId = '00000000-0000-4000-8000-000000000501';
const userId = '00000000-0000-4000-8000-000000000502';
const opponentId = '00000000-0000-4000-8000-000000000503';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(`conversation=${conversationId}`),
}));

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];
  private readonly listeners = new Map<
    string,
    Array<(event: { data?: string }) => void>
  >();
  addEventListener = vi.fn(
    (type: string, listener: (event: { data?: string }) => void) => {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    },
  );
  close = vi.fn();
  constructor() {
    FakeWebSocket.instances.push(this);
  }

  emit(type: string, event: { data?: string } = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function response(data: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify({ data }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('MessagesPage', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubGlobal('crypto', { randomUUID: () => 'opaque-request-id' });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows one owned conversation and sends through the authoritative HTTP endpoint', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/session')) {
        return response({
          authenticated: true,
          user: {
            id: userId,
            email: 'private@example.test',
            nickname: '当前用户',
            avatar: { type: 'initial', value: '当' },
          },
        });
      }
      if (url.includes('/messages/unread-count')) {
        return response({ unreadCount: 1 });
      }
      if (url.includes('/messages/conversations?limit=20')) {
        return response({
          items: [
            {
              id: conversationId,
              opponent: {
                id: opponentId,
                nickname: '对方用户',
                avatar: { type: 'initial', value: '对' },
              },
              lastMessage: {
                id: '00000000-0000-4000-8000-000000000504',
                conversationId,
                senderId: opponentId,
                content: '已有消息',
                createdAt: '2026-08-01T12:00:00.000Z',
                mine: false,
                read: false,
              },
              unreadCount: 1,
              canSend: true,
            },
          ],
          nextCursor: null,
        });
      }
      if (
        url.endsWith(`/messages/conversations/${conversationId}`) &&
        (!init?.method || init.method === 'GET')
      ) {
        return response({
          id: conversationId,
          opponent: {
            id: opponentId,
            nickname: '对方用户',
            avatar: { type: 'initial', value: '对' },
          },
          canSend: true,
        });
      }
      if (
        url.endsWith(`/messages/conversations/${conversationId}/messages`) &&
        (!init?.method || init.method === 'GET')
      ) {
        return response({
          items: [],
          nextCursor: null,
          syncCursor: null,
          hasMoreAfter: false,
        });
      }
      if (
        url.endsWith(`/messages/conversations/${conversationId}/messages`) &&
        init?.method === 'POST'
      ) {
        return response(
          {
            conversationId,
            message: {
              id: '00000000-0000-4000-8000-000000000505',
              conversationId,
              senderId: userId,
              content: '新消息',
              createdAt: '2026-08-01T12:01:00.000Z',
              mine: true,
              read: false,
            },
          },
          201,
        );
      }
      return response({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<MessagesPage />);
    expect((await screen.findAllByText('对方用户')).length).toBeGreaterThan(0);
    const composer = await screen.findByLabelText('消息内容');
    fireEvent.change(composer, { target: { value: '新消息' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText('新消息')).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(
          `/messages/conversations/${conversationId}/messages`,
        ),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            content: '新消息',
            clientRequestId: 'opaque-request-id',
          }),
        }),
      ),
    );
  });

  it('advances a background message read boundary after visibility recovery', async () => {
    const messageId = '00000000-0000-4000-8000-000000000506';
    let visibility: DocumentVisibilityState = 'visible';
    let unreadCount = 0;
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
      () => visibility,
    );
    const incoming = {
      id: messageId,
      conversationId,
      senderId: opponentId,
      content: '后台收到的消息',
      createdAt: '2026-08-01T12:02:00.000Z',
      mine: false,
      read: false,
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/session')) {
        return response({
          authenticated: true,
          user: {
            id: userId,
            email: 'private@example.test',
            nickname: '当前用户',
            avatar: { type: 'initial', value: '当' },
          },
        });
      }
      if (url.includes('/messages/unread-count')) {
        return response({ unreadCount });
      }
      if (url.includes('/messages/conversations?limit=20')) {
        return response({
          items: [
            {
              id: conversationId,
              opponent: {
                id: opponentId,
                nickname: '对方用户',
                avatar: { type: 'initial', value: '对' },
              },
              lastMessage: incoming,
              unreadCount,
              canSend: true,
            },
          ],
          nextCursor: null,
        });
      }
      if (
        url.endsWith(`/messages/conversations/${conversationId}`) &&
        (!init?.method || init.method === 'GET')
      ) {
        return response({
          id: conversationId,
          opponent: {
            id: opponentId,
            nickname: '对方用户',
            avatar: { type: 'initial', value: '对' },
          },
          canSend: true,
        });
      }
      if (
        url.endsWith(`/messages/conversations/${conversationId}/messages`) &&
        (!init?.method || init.method === 'GET')
      ) {
        return response({
          items: [],
          nextCursor: null,
          syncCursor: 'cursor-before',
          hasMoreAfter: false,
        });
      }
      if (url.includes('after=cursor-before')) {
        return response({
          items: [incoming],
          nextCursor: null,
          syncCursor: 'cursor-after',
          hasMoreAfter: false,
        });
      }
      if (url.includes('after=cursor-after')) {
        return response({
          items: [],
          nextCursor: null,
          syncCursor: 'cursor-after',
          hasMoreAfter: false,
        });
      }
      if (
        url.endsWith(`/messages/conversations/${conversationId}/read`) &&
        init?.method === 'PUT'
      ) {
        unreadCount = 0;
        return response({ unreadCount });
      }
      return response({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    render(<MessagesPage />);
    await screen.findByLabelText('消息内容');
    await waitFor(() =>
      expect(FakeWebSocket.instances.length).toBeGreaterThan(0),
    );
    const socket = FakeWebSocket.instances.at(-1)!;

    visibility = 'hidden';
    unreadCount = 1;
    document.dispatchEvent(new Event('visibilitychange'));
    socket.emit('message', {
      data: JSON.stringify({
        type: 'message.created',
        data: { message: incoming },
      }),
    });
    expect(await screen.findByText('后台收到的消息')).toBeVisible();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('after=cursor-before'),
        expect.anything(),
      ),
    );
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith(
            `/messages/conversations/${conversationId}/read`,
          ) && init?.method === 'PUT',
      ),
    ).toBe(false);

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(
          `/messages/conversations/${conversationId}/read`,
        ),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ messageId }),
        }),
      ),
    );
  });
});
