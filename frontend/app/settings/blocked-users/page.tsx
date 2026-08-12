'use client';

import { useCallback, useEffect, useState } from 'react';

import { type AuthenticatedUser } from '../../_components/auth-dialog';
import { Avatar, type ProfileAvatar } from '../../_components/avatar';
import { PageSidebar, PageTopbar } from '../../_components/page-chrome';
import { useSafetyDialog } from '../../_components/use-safety-dialog';
import { apiRequest, ApiRequestError } from '../../_lib/api';

type BlockedUser = {
  id: string;
  nickname: string;
  littleBlueBookId: string;
  avatar: ProfileAvatar;
  blockedAt: string;
};
type BlockedPage = { items: BlockedUser[]; nextCursor: string | null };

export default function BlockedUsersPage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [items, setItems] = useState<BlockedUser[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<
    'loading' | 'ready' | 'error' | 'unauthorized'
  >('loading');
  const [confirm, setConfirm] = useState<BlockedUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const confirmDialogRef = useSafetyDialog(
    confirm !== null,
    () => setConfirm(null),
    busy,
  );

  const load = useCallback(async (next?: string) => {
    try {
      const [session, page] = await Promise.all([
        apiRequest<{ authenticated: boolean; user: AuthenticatedUser | null }>(
          '/auth/session',
        ),
        apiRequest<BlockedPage>(
          `/safety/blocked-users${next ? `?cursor=${encodeURIComponent(next)}` : ''}`,
        ),
      ]);
      setUser(session.user);
      setItems((current) => (next ? [...current, ...page.items] : page.items));
      setCursor(page.nextCursor);
      setState('ready');
    } catch (error) {
      setState(
        error instanceof ApiRequestError && error.status === 401
          ? 'unauthorized'
          : 'error',
      );
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const unblock = async () => {
    if (!confirm || busy) return;
    setBusy(true);
    try {
      await apiRequest(
        `/safety/users/${encodeURIComponent(confirm.id)}/block`,
        { method: 'DELETE' },
      );
      setItems((current) => current.filter((item) => item.id !== confirm.id));
      setConfirm(null);
      setToast('已解除拉黑，关注关系不会自动恢复');
    } catch {
      setToast('解除拉黑失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="home-shell safety-page-shell">
      <PageSidebar
        user={user}
        onLogin={() => setToast('请先登录')}
        onToast={setToast}
      />
      <main className="content-shell safety-page-content">
        <PageTopbar onToast={setToast} />
        <section className="safety-settings-page">
          <header>
            <p>用户安全</p>
            <h1>黑名单管理</h1>
            <span>这里只显示由你主动拉黑的用户。</span>
          </header>
          {state === 'loading' ? <p aria-busy="true">正在加载…</p> : null}
          {state === 'unauthorized' ? (
            <p role="alert">请登录后管理黑名单。</p>
          ) : null}
          {state === 'error' ? (
            <div role="alert">
              <p>黑名单加载失败</p>
              <button onClick={() => void load()}>重试</button>
            </div>
          ) : null}
          {state === 'ready' && items.length === 0 ? (
            <p className="safety-empty">黑名单为空</p>
          ) : null}
          <ul className="blocked-user-list">
            {items.map((item) => (
              <li key={item.id}>
                <Avatar avatar={item.avatar} className="blocked-avatar" />
                <div>
                  <strong>{item.nickname}</strong>
                  <span>小蓝书号：{item.littleBlueBookId}</span>
                </div>
                <button onClick={() => setConfirm(item)}>解除拉黑</button>
              </li>
            ))}
          </ul>
          {cursor ? (
            <button
              className="safety-load-more"
              onClick={() => void load(cursor)}
            >
              加载更多
            </button>
          ) : null}
        </section>
      </main>
      {confirm ? (
        <div className="safety-dialog-layer">
          <div
            ref={confirmDialogRef}
            className="safety-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unblock-user-title"
            tabIndex={-1}
          >
            <h2 id="unblock-user-title">解除拉黑</h2>
            <p>解除后不会恢复双方关注关系，私信需要重新互相关注。</p>
            <div className="safety-dialog-actions">
              <button disabled={busy} onClick={() => setConfirm(null)}>
                取消
              </button>
              <button disabled={busy} onClick={() => void unblock()}>
                {busy ? '处理中…' : '确认解除'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
