import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearAuthenticatedSession,
  setAuthenticatedSession,
} from '../_lib/auth-session-state';
import { PageSidebar } from './page-chrome';

afterEach(() => {
  cleanup();
  act(() => clearAuthenticatedSession());
});

describe('PageSidebar session entry', () => {
  it('keeps the authenticated identity when a page navigation remounts the sidebar', () => {
    const properties = {
      user: null,
      onLogin: vi.fn(),
      onToast: vi.fn(),
    };
    const firstPage = render(<PageSidebar {...properties} />);

    expect(screen.queryByRole('button', { name: '登录' })).toBeNull();
    expect(screen.getByTestId('session-entry-placeholder')).toBeInTheDocument();

    act(() =>
      setAuthenticatedSession({
        id: 'user-navigation',
        email: 'navigation@example.com',
        nickname: '导航用户',
        avatar: { type: 'initial', value: '导' },
      }),
    );
    expect(screen.getByRole('link', { name: '我' })).toBeInTheDocument();

    firstPage.unmount();
    render(<PageSidebar {...properties} />);

    expect(screen.getByRole('link', { name: '我' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '登录' })).toBeNull();
  });

  it('shows the login action after the session is confirmed anonymous', () => {
    act(() => clearAuthenticatedSession());
    render(
      <PageSidebar user={null} onLogin={vi.fn()} onToast={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
  });
});
