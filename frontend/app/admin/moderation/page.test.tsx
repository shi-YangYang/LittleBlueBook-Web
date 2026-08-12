import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ModerationPage from './page';

vi.mock('../../_components/avatar', () => ({
  Avatar: () => <span>头像</span>,
}));

function response(data: unknown) {
  return { ok: true, json: async () => ({ data }) };
}

describe('ModerationPage', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders Chinese reason and target labels instead of internal enums', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/auth/session')) {
          return response({
            authenticated: true,
            user: { id: 'admin', nickname: '管理员', role: 'ADMIN' },
          });
        }
        if (url.includes('/admin/moderation?')) {
          return response({
            items: [
              {
                id: 'report-1',
                targetType: 'NOTE',
                targetId: 'note-1',
                reason: 'HARASSMENT',
                details: null,
                status: 'PENDING',
                result: '处理中',
                createdAt: '2026-08-10T00:00:00.000Z',
                reporter: {
                  id: 'reporter',
                  nickname: '举报者',
                  littleBlueBookId: '0000000001',
                  avatar: { type: 'initial', value: '举' },
                },
                target: {
                  available: true,
                  label: '被举报笔记',
                  state: 'VISIBLE',
                },
              },
            ],
            nextCursor: null,
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }) as unknown as typeof fetch,
    );

    render(<ModerationPage />);

    expect(await screen.findByText('举报原因：骚扰')).toBeVisible();
    expect(screen.getAllByText('笔记')).toHaveLength(2);
    expect(document.body).not.toHaveTextContent('HARASSMENT');
  });
});
