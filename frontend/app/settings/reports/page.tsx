'use client';

import { useCallback, useEffect, useState } from 'react';

import { type AuthenticatedUser } from '../../_components/auth-dialog';
import { PageSidebar, PageTopbar } from '../../_components/page-chrome';
import { apiRequest, ApiRequestError } from '../../_lib/api';
import {
  REPORT_TARGET_LABELS,
  reportReasonLabel,
  type ReportItem,
  type ReportPage,
} from '../../_lib/safety';

export default function MyReportsPage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [items, setItems] = useState<ReportItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<
    'loading' | 'ready' | 'error' | 'unauthorized'
  >('loading');
  const [toast, setToast] = useState('');

  const load = useCallback(async (next?: string) => {
    try {
      const [session, page] = await Promise.all([
        apiRequest<{ authenticated: boolean; user: AuthenticatedUser | null }>(
          '/auth/session',
        ),
        apiRequest<ReportPage>(
          `/safety/reports${next ? `?cursor=${encodeURIComponent(next)}` : ''}`,
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
            <p>内容治理</p>
            <h1>我的举报</h1>
            <span>举报结果不会发送站内通知，请在这里主动查看。</span>
          </header>
          {state === 'loading' ? <p aria-busy="true">正在加载…</p> : null}
          {state === 'unauthorized' ? (
            <p role="alert">请登录后查看我的举报。</p>
          ) : null}
          {state === 'error' ? (
            <div role="alert">
              <p>举报记录加载失败</p>
              <button onClick={() => void load()}>重试</button>
            </div>
          ) : null}
          {state === 'ready' && items.length === 0 ? (
            <p className="safety-empty">暂无举报记录</p>
          ) : null}
          {items.length > 0 ? (
            <ul className="safety-list">
              {items.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{REPORT_TARGET_LABELS[item.targetType]}举报</strong>
                    <span>{item.result}</span>
                  </div>
                  <p>原因：{reportReasonLabel(item.reason)}</p>
                  <time dateTime={item.createdAt}>
                    {new Date(item.createdAt).toLocaleString('zh-CN')}
                  </time>
                </li>
              ))}
            </ul>
          ) : null}
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
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
