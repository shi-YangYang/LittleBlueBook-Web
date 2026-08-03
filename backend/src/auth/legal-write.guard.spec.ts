import type { ExecutionContext } from '@nestjs/common';

import type { AuthService } from './auth.service.js';
import { LegalWriteGuard } from './legal-write.guard.js';

function context(method: string, originalUrl: string, cookie?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        originalUrl,
        headers: cookie ? { cookie } : {},
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('LegalWriteGuard', () => {
  it('checks authenticated protected writes', async () => {
    const auth = { assertWriteAllowed: jest.fn().mockResolvedValue(undefined) };
    const guard = new LegalWriteGuard(auth as unknown as AuthService);

    await expect(
      guard.canActivate(
        context('POST', '/api/v1/notes', 'lbb_session=session-id'),
      ),
    ).resolves.toBe(true);
    expect(auth.assertWriteAllowed).toHaveBeenCalledWith('session-id');
  });

  it.each([
    ['GET', '/api/v1/profile/me'],
    ['POST', '/api/v1/auth/legal-acceptance'],
    ['POST', '/api/v1/auth/logout'],
    ['POST', '/api/v1/auth/email-code/request'],
    ['POST', '/api/v1/notes/00000000-0000-4000-8000-000000000001/views'],
  ])(
    'allows safe or explicitly public operation %s %s',
    async (method, url) => {
      const auth = { assertWriteAllowed: jest.fn() };
      const guard = new LegalWriteGuard(auth as unknown as AuthService);

      await expect(
        guard.canActivate(context(method, url, 'lbb_session=session-id')),
      ).resolves.toBe(true);
      expect(auth.assertWriteAllowed).not.toHaveBeenCalled();
    },
  );
});
