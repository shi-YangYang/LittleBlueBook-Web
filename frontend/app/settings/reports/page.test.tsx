import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import MyReportsPage from './page';

vi.mock('../../_components/page-chrome', () => ({
  PageSidebar: () => <aside>侧栏</aside>,
  PageTopbar: () => <header>顶栏</header>,
}));

function response(data: unknown) {
  return { ok: true, json: async () => ({ data }) };
}

describe('MyReportsPage', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders confirmed Chinese labels instead of internal report enums', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/auth/session')) {
          return response({ authenticated: true, user: null });
        }
        if (url.endsWith('/safety/reports')) {
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
              },
            ],
            nextCursor: null,
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }) as unknown as typeof fetch,
    );

    render(<MyReportsPage />);

    expect(await screen.findByText('笔记举报')).toBeVisible();
    expect(screen.getByText('原因：骚扰')).toBeVisible();
    expect(document.body).not.toHaveTextContent('HARASSMENT');
  });
});
