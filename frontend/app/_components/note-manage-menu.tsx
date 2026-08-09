'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { apiRequest, ApiRequestError } from '../_lib/api';
import { lockDocumentScroll } from '../_lib/document-scroll-lock';

type NoteManageMenuProps = {
  noteId: string;
  contentVersion: number;
  placement?: 'card' | 'detail';
  onDeleted?: (noteId: string) => void;
  onVersionConflict?: () => void;
};

export function NoteManageMenu({
  noteId,
  contentVersion,
  placement = 'card',
  onDeleted,
  onVersionConflict,
}: NoteManageMenuProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmationVersion, setConfirmationVersion] = useState<number | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstMenuItemRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const closeConfirm = useCallback(() => {
    if (deleting) return;
    setConfirmOpen(false);
    setConfirmationVersion(null);
    setError('');
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, [deleting]);

  useEffect(() => {
    if (!menuOpen) return;
    window.setTimeout(() => firstMenuItemRef.current?.focus(), 0);
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setMenuOpen(false);
      window.setTimeout(() => triggerRef.current?.focus(), 0);
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [menuOpen]);

  useEffect(() => {
    if (!confirmOpen) return;
    const unlock = lockDocumentScroll();
    window.setTimeout(() => confirmRef.current?.focus(), 0);
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deleting) {
        event.preventDefault();
        closeConfirm();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const controls = Array.from(
        dialogRef.current.querySelectorAll<HTMLButtonElement>(
          'button:not([disabled])',
        ),
      );
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', handleKeys);
    return () => {
      unlock();
      document.removeEventListener('keydown', handleKeys);
    };
  }, [closeConfirm, confirmOpen, deleting]);

  const remove = async () => {
    if (deleting || confirmationVersion === null) return;
    setDeleting(true);
    setError('');
    try {
      await apiRequest<{ id: string; deleted: true }>(`/notes/${noteId}`, {
        method: 'DELETE',
        body: JSON.stringify({
          expectedContentVersion: confirmationVersion,
        }),
      });
      setConfirmOpen(false);
      setConfirmationVersion(null);
      window.sessionStorage.setItem(
        'littlebluebook:profile-toast',
        '笔记已删除',
      );
      if (onDeleted) onDeleted(noteId);
      else router.replace('/profile');
    } catch (deleteError) {
      if (
        deleteError instanceof ApiRequestError &&
        deleteError.payload.code === 'NOTE_EDIT_CONFLICT'
      ) {
        setConfirmOpen(false);
        setConfirmationVersion(null);
        setNotice('笔记已被更新，请重新打开删除确认');
        onVersionConflict?.();
        window.setTimeout(() => triggerRef.current?.focus(), 0);
      } else if (
        deleteError instanceof ApiRequestError &&
        deleteError.status === 404
      ) {
        setConfirmOpen(false);
        setConfirmationVersion(null);
        window.sessionStorage.setItem(
          'littlebluebook:profile-toast',
          '笔记不存在或已删除',
        );
        if (onDeleted) onDeleted(noteId);
        else router.replace('/profile');
      } else {
        setError('删除失败，请稍后重试');
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className={`note-manage-wrap note-manage-${placement}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <button
        ref={triggerRef}
        className="note-manage-trigger"
        type="button"
        aria-label="更多笔记操作"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span aria-hidden="true">•••</span>
      </button>
      {menuOpen ? (
        <div className="note-manage-menu" role="menu">
          <button
            ref={firstMenuItemRef}
            type="button"
            role="menuitem"
            onClick={() =>
              router.push(`/publish?edit=${encodeURIComponent(noteId)}`)
            }
          >
            编辑笔记
          </button>
          <button
            className="danger"
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setNotice('');
              setConfirmationVersion(contentVersion);
              setConfirmOpen(true);
            }}
          >
            删除笔记
          </button>
        </div>
      ) : null}

      {notice ? (
        <span className="note-manage-notice" role="status">
          {notice}
        </span>
      ) : null}

      {confirmOpen && typeof document !== 'undefined'
        ? createPortal(
            <div className="confirm-layer">
              <button
                className="modal-backdrop"
                type="button"
                aria-label="关闭删除确认"
                disabled={deleting}
                onClick={closeConfirm}
              />
              <div
                ref={dialogRef}
                className="confirm-dialog"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={`delete-note-title-${noteId}`}
                aria-describedby={`delete-note-description-${noteId}`}
              >
                <h2 id={`delete-note-title-${noteId}`}>永久删除笔记</h2>
                <p id={`delete-note-description-${noteId}`}>
                  笔记、媒体、评论和互动数据会被永久删除，且无法恢复。
                </p>
                {error ? <p role="alert">{error}</p> : null}
                <div>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={closeConfirm}
                  >
                    取消
                  </button>
                  <button
                    ref={confirmRef}
                    type="button"
                    data-confirm-delete
                    disabled={deleting}
                    aria-busy={deleting}
                    onClick={() => void remove()}
                  >
                    {deleting ? '删除中…' : '确认删除'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
