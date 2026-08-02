import type { CookieOptions, Request, Response } from 'express';

import {
  REGISTRATION_COOKIE_NAME,
  REGISTRATION_TTL_SECONDS,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from './auth.constants.js';

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) {
    return undefined;
  }

  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) {
      continue;
    }

    const key = pair.slice(0, separator).trim();
    if (key === name) {
      try {
        return decodeURIComponent(pair.slice(separator + 1).trim());
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

function cookieOptions(secure: boolean, maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge,
  };
}

export function setSessionCookie(
  response: Response,
  value: string,
  secure: boolean,
): void {
  response.cookie(
    SESSION_COOKIE_NAME,
    value,
    cookieOptions(secure, SESSION_TTL_SECONDS * 1000),
  );
}

export function clearSessionCookie(response: Response, secure: boolean): void {
  response.clearCookie(SESSION_COOKIE_NAME, cookieOptions(secure, 0));
}

export function setRegistrationCookie(
  response: Response,
  value: string,
  secure: boolean,
): void {
  response.cookie(
    REGISTRATION_COOKIE_NAME,
    value,
    cookieOptions(secure, REGISTRATION_TTL_SECONDS * 1000),
  );
}

export const VIEW_VISITOR_COOKIE_NAME = 'lbb_view_visitor';

export function setViewVisitorCookie(
  response: Response,
  value: string,
  secure: boolean,
): void {
  response.cookie(
    VIEW_VISITOR_COOKIE_NAME,
    value,
    cookieOptions(secure, 365 * 24 * 60 * 60 * 1000),
  );
}

export function clearRegistrationCookie(
  response: Response,
  secure: boolean,
): void {
  response.clearCookie(REGISTRATION_COOKIE_NAME, cookieOptions(secure, 0));
}
