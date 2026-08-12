import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

type SessionPayload = {
  data?: {
    authenticated?: boolean;
    user?: { role?: 'ADMIN' | 'USER' } | null;
  };
};

export default async function ModerationLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('lbb_session')?.value;
  if (!sessionId) notFound();

  const backendOrigin = (
    process.env.BACKEND_URL ?? 'http://127.0.0.1:3001'
  ).replace(/\/$/, '');
  const response = await fetch(`${backendOrigin}/api/v1/auth/session`, {
    cache: 'no-store',
    headers: { cookie: `lbb_session=${encodeURIComponent(sessionId)}` },
  });
  if (response.status === 401 || response.status === 404) notFound();
  if (!response.ok) throw new Error('MODERATION_AUTHORIZATION_UNAVAILABLE');

  const payload = (await response.json()) as SessionPayload;
  if (
    payload.data?.authenticated !== true ||
    payload.data.user?.role !== 'ADMIN'
  ) {
    notFound();
  }
  return children;
}
