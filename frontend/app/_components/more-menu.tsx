'use client';

import Link from 'next/link';
import {
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import { apiRequest, ApiRequestError } from '../_lib/api';
import { Icon } from './icon';

type MoreMenuProps = {
  authenticated: boolean;
  onLoggedOut?: () => void;
  onToast?: (message: string) => void;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
};

export function MoreMenu({
  authenticated,
  onLoggedOut,
  onToast,
  returnFocusRef,
}: MoreMenuProps) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const localTriggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = returnFocusRef ?? localTriggerRef;

  const close = useCallback(
    (restoreFocus = true) => {
      setOpen(false);
      if (restoreFocus) {
        window.setTimeout(() => triggerRef.current?.focus(), 0);
      }
    },
    [triggerRef],
  );

  useEffect(() => {
    const closeOtherMenu = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== menuId) {
        setOpen(false);
      }
    };
    window.addEventListener('lbb:popup-open', closeOtherMenu);
    return () => window.removeEventListener('lbb:popup-open', closeOtherMenu);
  }, [menuId]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        close(false);
      }
    };
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onEscape);
    window.setTimeout(() => {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }, 0);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [close, open]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"])',
      ) ?? [],
    );
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (current + 1 + items.length) % items.length
            : (current - 1 + items.length) % items.length;
    items[index]?.focus();
  };

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await apiRequest<{ success: true }>('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setOpen(false);
      window.dispatchEvent(new Event('lbb:logged-out'));
      if (onLoggedOut) onLoggedOut();
      else window.location.assign('/');
    } catch (error) {
      onToast?.(
        error instanceof ApiRequestError
          ? (error.payload.message ?? '退出失败，请稍后重试')
          : '退出失败，请稍后重试',
      );
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div ref={containerRef} className="more-menu-wrap">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setOpen((current) => {
            const next = !current;
            if (next) {
              window.dispatchEvent(
                new CustomEvent('lbb:popup-open', { detail: menuId }),
              );
            }
            return next;
          });
        }}
      >
        <Icon name="more" />
        <span>更多</span>
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          className="more-menu"
          role="menu"
          aria-label="更多功能"
          onKeyDown={handleKeyDown}
        >
          {authenticated ? (
            <Link
              role="menuitem"
              href="/settings/profile"
              onClick={() => close(false)}
            >
              编辑资料
            </Link>
          ) : null}
          {authenticated ? (
            <Link
              role="menuitem"
              href="/settings/reports"
              onClick={() => close(false)}
            >
              我的举报
            </Link>
          ) : null}
          {authenticated ? (
            <Link
              role="menuitem"
              href="/settings/blocked-users"
              onClick={() => close(false)}
            >
              黑名单管理
            </Link>
          ) : null}
          <Link role="menuitem" href="/help" onClick={() => close(false)}>
            帮助与反馈
          </Link>
          <a
            role="menuitem"
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => close(false)}
          >
            用户协议
          </a>
          <a
            role="menuitem"
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => close(false)}
          >
            隐私政策
          </a>
          {authenticated ? (
            <button
              role="menuitem"
              type="button"
              disabled={loggingOut}
              aria-disabled={loggingOut}
              onClick={logout}
            >
              {loggingOut ? '退出中…' : '退出登录'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
