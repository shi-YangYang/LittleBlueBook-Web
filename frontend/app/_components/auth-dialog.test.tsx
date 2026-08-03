import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LEGAL_STATUS_REFRESH_EVENT } from '../_lib/legal-status-events';
import { AuthDialog, type AuthenticatedUser } from './auth-dialog';

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

const user: AuthenticatedUser = {
  id: 'shared-dialog-user',
  email: 'shared@example.test',
  nickname: '共享蓝友',
  avatar: { type: 'initial', value: '共' },
};

function completeVerificationFields() {
  fireEvent.change(screen.getByLabelText('邮箱'), {
    target: { value: user.email },
  });
  fireEvent.change(screen.getByLabelText('验证码'), {
    target: { value: '246810' },
  });
  fireEvent.click(screen.getByLabelText('同意用户协议与隐私政策'));
}

describe('AuthDialog legal status synchronization', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('requests a global legal-status refresh after login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/auth/session')) {
          return response({
            authenticated: false,
            user: null,
            pendingRegistration: false,
            registrationExpired: false,
          });
        }
        if (url.endsWith('/auth/email-code/verify')) {
          return response({ status: 'authenticated', user });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }) as unknown as typeof fetch,
    );
    const onAuthenticated = vi.fn();
    const legalStatusRefresh = vi.fn();
    window.addEventListener(LEGAL_STATUS_REFRESH_EVENT, legalStatusRefresh);

    render(
      <AuthDialog open onClose={vi.fn()} onAuthenticated={onAuthenticated} />,
    );
    completeVerificationFields();
    fireEvent.click(screen.getByRole('button', { name: '登录/注册' }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(user));
    expect(legalStatusRefresh).toHaveBeenCalledTimes(1);
    window.removeEventListener(LEGAL_STATUS_REFRESH_EVENT, legalStatusRefresh);
  });

  it('requests a global legal-status refresh after registration', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith('/auth/session')) {
          return response({
            authenticated: false,
            user: null,
            pendingRegistration: false,
            registrationExpired: false,
          });
        }
        if (url.endsWith('/auth/email-code/verify')) {
          return response({ status: 'registration_required' });
        }
        if (url.endsWith('/auth/registration/complete')) {
          return response({ status: 'authenticated', user });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }) as unknown as typeof fetch,
    );
    const onAuthenticated = vi.fn();
    const legalStatusRefresh = vi.fn();
    window.addEventListener(LEGAL_STATUS_REFRESH_EVENT, legalStatusRefresh);

    render(
      <AuthDialog open onClose={vi.fn()} onAuthenticated={onAuthenticated} />,
    );
    completeVerificationFields();
    fireEvent.click(screen.getByRole('button', { name: '登录/注册' }));
    await screen.findByRole('heading', { name: '完善资料' });
    fireEvent.change(screen.getByLabelText('昵称'), {
      target: { value: user.nickname },
    });
    fireEvent.click(screen.getByRole('button', { name: '完成注册' }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(user));
    expect(legalStatusRefresh).toHaveBeenCalledTimes(1);
    window.removeEventListener(LEGAL_STATUS_REFRESH_EVENT, legalStatusRefresh);
  });
});
