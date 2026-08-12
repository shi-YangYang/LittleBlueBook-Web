import {
  clearAuthenticatedSession,
  recordSessionResult,
} from './auth-session-state';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api/v1';

export type ApiErrorPayload = {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
};

export class ApiRequestError extends Error {
  readonly status: number;
  readonly payload: ApiErrorPayload;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.code ?? 'UNKNOWN_ERROR');
    this.status = status;
    this.payload = payload;
  }
}

const SESSION_RETRY_DELAYS_MS = [100, 250] as const;
const EMAIL_CODE_REQUEST_RETRY_DELAYS_MS = [150] as const;

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(
      new DOMException('The operation was aborted', 'AbortError'),
    );
  }

  return new Promise((resolve, reject) => {
    const abort = () => {
      globalThis.clearTimeout(timer);
      reject(new DOMException('The operation was aborted', 'AbortError'));
    };
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function isRetryableSessionError(error: unknown): boolean {
  return (
    (error instanceof Error && error.message === 'NETWORK_ERROR') ||
    (error instanceof ApiRequestError && error.status >= 500)
  );
}

async function requestOnce<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  const isFormData = init?.body instanceof FormData;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      cache: init?.cache ?? 'no-store',
      credentials: 'include',
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...init?.headers,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    throw new Error('NETWORK_ERROR');
  }

  const payload = (await response.json().catch(() => ({}))) as
    ({ data?: T } & Record<string, unknown>) | ApiErrorPayload;

  if (!response.ok) {
    const errorPayload = payload as ApiErrorPayload;
    if (
      typeof window !== 'undefined' &&
      (errorPayload.code === 'LEGAL_ACCEPTANCE_REQUIRED' ||
        errorPayload.code === 'ACCOUNT_AGE_RESTRICTED')
    ) {
      window.dispatchEvent(new Event('lbb:legal-status-required'));
    }
    throw new ApiRequestError(response.status, errorPayload);
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'data' in payload &&
    payload.data !== undefined
  ) {
    return payload.data;
  }

  return payload as T;
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const method = init?.method?.toUpperCase() ?? 'GET';
  const retryDelays =
    path === '/auth/session' && method === 'GET'
      ? SESSION_RETRY_DELAYS_MS
      : path === '/auth/email-code/request' && method === 'POST'
        ? EMAIL_CODE_REQUEST_RETRY_DELAYS_MS
        : [];

  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await requestOnce<T>(path, init);
      if (path === '/auth/session' && method === 'GET') {
        recordSessionResult(result);
      } else if (path === '/auth/logout' && method === 'POST') {
        clearAuthenticatedSession();
      }
      return result;
    } catch (error) {
      const delayMs = retryDelays[attempt];
      const retryable =
        path === '/auth/session'
          ? isRetryableSessionError(error)
          : error instanceof Error && error.message === 'NETWORK_ERROR';
      if (delayMs === undefined || !retryable) {
        throw error;
      }
      await waitForRetry(delayMs, init?.signal ?? undefined);
    }
  }
}
