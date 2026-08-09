'use client';

import { useSyncExternalStore } from 'react';

import type { AuthenticatedUser } from '../_components/auth-dialog';

type AuthSessionState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: AuthenticatedUser }
  | { status: 'anonymous'; user: null };

const loadingState: AuthSessionState = { status: 'loading', user: null };
let currentState: AuthSessionState = loadingState;
const listeners = new Set<() => void>();

function publish(nextState: AuthSessionState): void {
  currentState = nextState;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): AuthSessionState {
  return currentState;
}

export function useAuthSessionState(): AuthSessionState {
  return useSyncExternalStore(subscribe, getSnapshot, () => loadingState);
}

export function setAuthenticatedSession(user: AuthenticatedUser): void {
  publish({ status: 'authenticated', user });
}

export function recordSessionResult(result: unknown): void {
  if (!result || typeof result !== 'object' || !('authenticated' in result)) {
    return;
  }

  const session = result as {
    authenticated: unknown;
    user?: AuthenticatedUser | null;
  };
  if (session.authenticated === true && session.user) {
    setAuthenticatedSession(session.user);
  } else if (session.authenticated === false) {
    publish({ status: 'anonymous', user: null });
  }
}

export function clearAuthenticatedSession(): void {
  publish({ status: 'anonymous', user: null });
}
