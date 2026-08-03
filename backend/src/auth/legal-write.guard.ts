import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthService } from './auth.service.js';
import { SESSION_COOKIE_NAME } from './auth.constants.js';
import { readCookie } from './cookies.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class LegalWriteGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request || SAFE_METHODS.has(request.method)) return true;

    const path = request.originalUrl.split('?')[0] ?? '';
    if (this.isExempt(path)) return true;

    const sessionId = readCookie(request, SESSION_COOKIE_NAME);
    if (!sessionId) return true;
    await this.auth.assertWriteAllowed(sessionId);
    return true;
  }

  private isExempt(path: string): boolean {
    return (
      /^\/api\/v1\/auth\/(?:email-code\/|registration\/complete|logout$|legal-acceptance$)/.test(
        path,
      ) || /^\/api\/v1\/notes\/[0-9a-f-]+\/views$/i.test(path)
    );
  }
}
