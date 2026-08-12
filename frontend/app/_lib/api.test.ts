import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiRequest } from './api';

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('apiRequest email-code replay', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('retries one network interruption for the idempotent email-code request', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(response({ message: '验证码已发送' }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    await expect(
      apiRequest<{ message: string }>('/auth/email-code/request', {
        method: 'POST',
        body: JSON.stringify({
          email: 'user@example.com',
          acceptedTerms: true,
        }),
      }),
    ).resolves.toEqual({ message: '验证码已发送' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry an authoritative API rejection', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        response(
          { code: 'RATE_LIMITED', message: '操作过于频繁，请稍后再试' },
          429,
        ),
      );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    await expect(
      apiRequest('/auth/email-code/request', { method: 'POST' }),
    ).rejects.toMatchObject({ message: 'RATE_LIMITED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
