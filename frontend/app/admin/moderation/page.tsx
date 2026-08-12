'use client';

import { useCallback, useEffect, useState } from 'react';

import { type AuthenticatedUser } from '../../_components/auth-dialog';
import { Avatar, type ProfileAvatar } from '../../_components/avatar';
import { useSafetyDialog } from '../../_components/use-safety-dialog';
import { apiRequest, ApiRequestError } from '../../_lib/api';
import type {
  ReportItem,
  ReportStatus,
  ReportTargetType,
} from '../../_lib/safety';
import { REPORT_TARGET_LABELS, reportReasonLabel } from '../../_lib/safety';

type AdminReport = ReportItem & {
  reporter: {
    id: string;
    nickname: string;
    littleBlueBookId: string;
    avatar: ProfileAvatar;
  };
  target: { available: boolean; label: string | null; state: string };
};
type AdminPage = { items: AdminReport[]; nextCursor: string | null };
type Action =
  | 'HIDE_NOTE'
  | 'RESTORE_NOTE'
  | 'HIDE_COMMENT'
  | 'RESTORE_COMMENT'
  | 'SUSPEND_USER'
  | 'RESTORE_USER';

export default function ModerationPage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [items, setItems] = useState<AdminReport[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<ReportStatus | ''>('PENDING');
  const [targetType, setTargetType] = useState<ReportTargetType | ''>('');
  const [state, setState] = useState<
    'loading' | 'ready' | 'error' | 'not-found'
  >('loading');
  const [selection, setSelection] = useState<{
    report: AdminReport;
    action: Action | 'DISMISS_REPORT';
  } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const actionDialogRef = useSafetyDialog(
    selection !== null,
    () => setSelection(null),
    busy,
  );

  const load = useCallback(
    async (next?: string) => {
      setState('loading');
      const query = new URLSearchParams();
      if (status) query.set('status', status);
      if (targetType) query.set('targetType', targetType);
      if (next) query.set('cursor', next);
      try {
        const [session, page] = await Promise.all([
          apiRequest<{
            authenticated: boolean;
            user: AuthenticatedUser | null;
          }>('/auth/session'),
          apiRequest<AdminPage>(`/admin/moderation?${query}`),
        ]);
        setUser(session.user);
        setItems((current) =>
          next ? [...current, ...page.items] : page.items,
        );
        setCursor(page.nextCursor);
        setState('ready');
      } catch (error) {
        setState(
          error instanceof ApiRequestError && error.status === 404
            ? 'not-found'
            : 'error',
        );
      }
    },
    [status, targetType],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const choices = (
    report: AdminReport,
  ): Array<[Action | 'DISMISS_REPORT', string]> => {
    const result: Array<[Action | 'DISMISS_REPORT', string]> = [];
    if (report.status === 'PENDING')
      result.push(['DISMISS_REPORT', '驳回举报']);
    if (!report.target.available) return result;
    if (report.targetType === 'NOTE')
      result.push([
        report.target.state === 'HIDDEN' ? 'RESTORE_NOTE' : 'HIDE_NOTE',
        report.target.state === 'HIDDEN' ? '恢复笔记' : '隐藏笔记',
      ]);
    if (report.targetType === 'COMMENT')
      result.push([
        report.target.state === 'HIDDEN' ? 'RESTORE_COMMENT' : 'HIDE_COMMENT',
        report.target.state === 'HIDDEN' ? '恢复评论' : '隐藏评论',
      ]);
    if (report.targetType === 'USER')
      result.push([
        report.target.state === 'SUSPENDED' ? 'RESTORE_USER' : 'SUSPEND_USER',
        report.target.state === 'SUSPENDED' ? '恢复账号' : '封禁账号',
      ]);
    return result;
  };

  const submit = async () => {
    if (!selection || busy || !reason.trim()) return;
    setBusy(true);
    setActionError('');
    try {
      if (selection.action === 'DISMISS_REPORT') {
        await apiRequest(
          `/admin/moderation/reports/${selection.report.id}/dismiss`,
          { method: 'POST', body: JSON.stringify({ reason }) },
        );
      } else {
        await apiRequest('/admin/moderation/actions', {
          method: 'POST',
          body: JSON.stringify({
            action: selection.action,
            targetType: selection.report.targetType,
            targetId: selection.report.targetId,
            reason,
          }),
        });
      }
      setSelection(null);
      setReason('');
      await load();
    } catch (error) {
      setActionError(
        error instanceof ApiRequestError
          ? (error.payload.message ?? '处置失败，请刷新后重试')
          : '处置失败，请刷新后重试',
      );
    } finally {
      setBusy(false);
    }
  };

  if (state === 'not-found')
    return (
      <main className="admin-not-found">
        <h1>404</h1>
        <p>页面不存在</p>
      </main>
    );
  return (
    <main className="moderation-page">
      <header>
        <div>
          <p>小蓝书管理后台</p>
          <h1>内容治理</h1>
        </div>
        <span>{user?.nickname ?? '管理员'}</span>
      </header>
      <section className="moderation-filters" aria-label="举报筛选">
        <label>
          状态
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ReportStatus | '')}
          >
            <option value="">全部</option>
            <option value="PENDING">待处理</option>
            <option value="ACTIONED">已处置</option>
            <option value="DISMISSED">已驳回</option>
            <option value="TARGET_UNAVAILABLE">目标失效</option>
          </select>
        </label>
        <label>
          目标
          <select
            value={targetType}
            onChange={(e) =>
              setTargetType(e.target.value as ReportTargetType | '')
            }
          >
            <option value="">全部</option>
            <option value="NOTE">笔记</option>
            <option value="COMMENT">评论</option>
            <option value="USER">用户</option>
          </select>
        </label>
      </section>
      {state === 'loading' ? <p aria-busy="true">正在加载举报…</p> : null}
      {state === 'error' ? (
        <div role="alert">
          <p>加载失败</p>
          <button onClick={() => void load()}>重试</button>
        </div>
      ) : null}
      {state === 'ready' && items.length === 0 ? (
        <p className="safety-empty">暂无符合条件的举报</p>
      ) : null}
      <ul className="moderation-list">
        {items.map((item) => (
          <li key={item.id}>
            <div className="moderation-reporter">
              <Avatar
                avatar={item.reporter.avatar}
                className="blocked-avatar"
              />
              <span>
                <strong>{item.reporter.nickname}</strong>
                <small>
                  {new Date(item.createdAt).toLocaleString('zh-CN')}
                </small>
              </span>
              <em>{item.result}</em>
            </div>
            <p>举报原因：{reportReasonLabel(item.reason)}</p>
            {item.details ? <blockquote>{item.details}</blockquote> : null}
            <div className="moderation-target">
              <strong>{REPORT_TARGET_LABELS[item.targetType]}</strong>
              <span>
                {item.target.available
                  ? (item.target.label ?? '目标可用')
                  : '目标已失效'}
              </span>
            </div>
            <div className="moderation-actions">
              {choices(item).map(([action, label]) => (
                <button
                  key={action}
                  onClick={() => {
                    setActionError('');
                    setSelection({ report: item, action });
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {cursor ? (
        <button className="safety-load-more" onClick={() => void load(cursor)}>
          加载更多
        </button>
      ) : null}
      {selection ? (
        <div className="safety-dialog-layer">
          <div
            ref={actionDialogRef}
            className="safety-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="moderation-action-title"
            tabIndex={-1}
          >
            <h2 id="moderation-action-title">确认管理员处置</h2>
            <label className="safety-dialog-details">
              内部理由
              <textarea
                value={reason}
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
              />
              <span>{Array.from(reason).length}/500</span>
            </label>
            {actionError ? <p role="alert">{actionError}</p> : null}
            <div className="safety-dialog-actions">
              <button disabled={busy} onClick={() => setSelection(null)}>
                取消
              </button>
              <button
                disabled={busy || !reason.trim()}
                onClick={() => void submit()}
              >
                {busy ? '处理中…' : '确认处置'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
