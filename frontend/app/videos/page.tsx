'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { AuthDialog, type AuthenticatedUser } from '../_components/auth-dialog';
import { NoteFeed } from '../_components/note-feed';
import { PageSidebar, PageTopbar } from '../_components/page-chrome';
import { apiRequest } from '../_lib/api';

export default function VideosPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [toast, setToast] = useState('');
  const pendingActionRef = useRef<(() => Promise<void>) | null>(null);
  const pendingDestinationRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void apiRequest<{ authenticated: boolean; user: AuthenticatedUser | null }>(
      '/auth/session',
    )
      .then((session) => {
        if (active) setUser(session.authenticated ? session.user : null);
      })
      .catch(() => {
        if (active) setUser(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const requestLogin = (destination?: string) => {
    pendingDestinationRef.current = destination ?? null;
    setAuthOpen(true);
  };

  const openVideoPublish = () => {
    if (user) router.push('/publish?mode=video');
    else requestLogin('/publish?mode=video');
  };

  return (
    <div className="home-shell videos-shell">
      <PageSidebar
        user={user}
        active="video"
        onLogin={requestLogin}
        onToast={setToast}
      />
      <main className="content-shell">
        <PageTopbar onToast={setToast} />
        <NoteFeed
          endpoint="/notes/videos"
          label="视频内容"
          emptyMessage="还没有视频，发布第一条视频吧"
          errorMessage="视频加载失败，请稍后重试"
          onPublish={openVideoPublish}
          onAuthenticationRequired={(resume) => {
            pendingActionRef.current = resume;
            setAuthOpen(true);
          }}
          onInteractionMessage={setToast}
        />
      </main>
      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
      <AuthDialog
        open={authOpen}
        onClose={() => {
          setAuthOpen(false);
          pendingActionRef.current = null;
          pendingDestinationRef.current = null;
        }}
        onAuthenticated={(authenticatedUser) => {
          setUser(authenticatedUser);
          setAuthOpen(false);
          const destination = pendingDestinationRef.current;
          pendingDestinationRef.current = null;
          if (destination) {
            router.push(destination);
            return;
          }
          const pending = pendingActionRef.current;
          pendingActionRef.current = null;
          if (pending) void pending();
        }}
        onToast={setToast}
      />
    </div>
  );
}
