import '@testing-library/jest-dom/vitest';

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MoreMenu } from './more-menu';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('MoreMenu', () => {
  it('shows the confirmed logged-out item order and restores focus on Escape', async () => {
    render(<MoreMenu authenticated={false} />);
    const trigger = screen.getByRole('button', { name: '更多' });
    fireEvent.click(trigger);

    expect(
      screen.getAllByRole('menuitem').map((item) => item.textContent),
    ).toEqual(['帮助与反馈', '用户协议', '隐私政策']);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('logs out an authenticated user once and keeps the confirmed item order', async () => {
    const onLoggedOut = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { success: true } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    render(
      <MoreMenu authenticated onLoggedOut={onLoggedOut} onToast={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '更多' }));

    expect(
      screen.getAllByRole('menuitem').map((item) => item.textContent),
    ).toEqual([
      '编辑资料',
      '我的举报',
      '黑名单管理',
      '帮助与反馈',
      '用户协议',
      '隐私政策',
      '退出登录',
    ]);
    fireEvent.click(screen.getByRole('menuitem', { name: '退出登录' }));
    await waitFor(() => expect(onLoggedOut).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
