'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiRequest, ApiRequestError } from '../_lib/api';
import { lockDocumentScroll } from '../_lib/document-scroll-lock';
import { LEGAL_STATUS_REFRESH_EVENT } from '../_lib/legal-status-events';

type LegalStatus = {
  authenticated: boolean;
  requiresAcceptance: boolean;
  accountRestricted: boolean;
  termsVersion: string;
  privacyVersion: string;
  termsUrl: string;
  privacyUrl: string;
};

const PUBLIC_INFORMATION_PATHS = new Set([
  '/terms',
  '/privacy',
  '/help',
  '/about',
]);

export function LegalAcceptanceGate() {
  const pathname = usePathname();
  const [status, setStatus] = useState<LegalStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (PUBLIC_INFORMATION_PATHS.has(pathname)) return;
    try {
      const next = await apiRequest<LegalStatus>('/auth/legal-status');
      setStatus(next);
    } catch {
      // Existing page-level recovery remains available when status is offline.
    }
  }, [pathname]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    window.addEventListener(LEGAL_STATUS_REFRESH_EVENT, refresh);
    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener(LEGAL_STATUS_REFRESH_EVENT, refresh);
    };
  }, [refresh]);

  const open = Boolean(
    !PUBLIC_INFORMATION_PATHS.has(pathname) &&
    status?.authenticated &&
    (status.requiresAcceptance || status.accountRestricted),
  );

  useEffect(() => {
    if (!open) return;
    return lockDocumentScroll();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>('a[href], button:not([disabled])')
        ?.focus();
    }, 0);
  }, [open]);

  if (!open || !status) return null;

  const accept = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const next = await apiRequest<LegalStatus>('/auth/legal-acceptance', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setStatus(next);
      window.dispatchEvent(new Event('lbb:legal-accepted'));
    } catch (acceptError) {
      setError(
        acceptError instanceof ApiRequestError
          ? (acceptError.payload.message ?? '确认失败，请稍后重试')
          : '网络异常，请稍后重试',
      );
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      window.location.assign('/');
    } catch {
      setError('退出失败，请稍后重试');
      setBusy(false);
    }
  };

  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      ),
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="modal-layer legal-gate-layer">
      <div className="modal-backdrop" aria-hidden="true" />
      <div
        ref={dialogRef}
        className="legal-gate-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-gate-title"
        aria-describedby="legal-gate-description"
        onKeyDown={trapFocus}
      >
        {status.accountRestricted ? (
          <>
            <p className="legal-gate-eyebrow">账号使用提醒</p>
            <h2 id="legal-gate-title">当前账号因年龄信息受限</h2>
            <p id="legal-gate-description">
              小蓝书当前仅支持年满 14
              周岁的用户。请前往帮助页，通过法律联系邮箱申请处理。
            </p>
            <div className="legal-gate-actions">
              <a href="/help">查看帮助与联系方式</a>
              <button type="button" disabled={busy} onClick={logout}>
                {busy ? '退出中…' : '退出登录'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="legal-gate-eyebrow">条款已更新</p>
            <h2 id="legal-gate-title">请确认最新条款后继续</h2>
            <p id="legal-gate-description">
              用户协议或隐私政策发生了实质更新。你可以先在新标签页阅读，再选择同意并继续或退出登录。
            </p>
            <div className="legal-gate-links">
              <a
                href={status.termsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                用户协议（{status.termsVersion}）
              </a>
              <a
                href={status.privacyUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                隐私政策（{status.privacyVersion}）
              </a>
            </div>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="legal-gate-actions">
              <button type="button" disabled={busy} onClick={logout}>
                退出登录
              </button>
              <button
                className="legal-gate-primary"
                type="button"
                disabled={busy}
                onClick={accept}
              >
                {busy ? '确认中…' : '同意并继续'}
              </button>
            </div>
          </>
        )}
        {status.accountRestricted && error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
