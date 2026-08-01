'use client';

import { useRouter } from 'next/navigation';
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { lockDocumentScroll } from '../_lib/document-scroll-lock';
import { normalizeSearchInput } from '../_lib/search';
import { Icon } from './icon';

type SearchDialogProps = {
  open: boolean;
  initialKeyword?: string;
  onClose: () => void;
  onNavigate?: (path: string) => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
};

export function SearchDialog({
  open,
  initialKeyword = '',
  onClose,
  onNavigate,
  returnFocusRef,
}: SearchDialogProps) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <OpenSearchDialog
      initialKeyword={initialKeyword}
      onClose={onClose}
      onNavigate={onNavigate}
      returnFocusRef={returnFocusRef}
    />,
    document.body,
  );
}

function OpenSearchDialog({
  initialKeyword = '',
  onClose,
  onNavigate,
  returnFocusRef,
}: Omit<SearchDialogProps, 'open'>) {
  const router = useRouter();
  const [value, setValue] = useState(initialKeyword);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    return lockDocumentScroll();
  }, []);

  const close = () => {
    onClose();
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const keyword = normalizeSearchInput(value);
    const length = Array.from(keyword).length;
    if (length === 0) {
      setError('请输入搜索内容');
      return;
    }
    if (length > 50) {
      setError('搜索内容不能超过50个字符');
      return;
    }
    setError('');
    onClose();
    const path = `/search?keyword=${encodeURIComponent(keyword)}&type=note`;
    if (onNavigate) {
      onNavigate(path);
    } else {
      router.push(path);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    <div
      className="search-modal-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        className="search-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-dialog-title"
        onKeyDown={handleKeyDown}
      >
        <div className="search-modal-heading">
          <div>
            <p>发现感兴趣的笔记与创作者</p>
            <h1 id="search-dialog-title">搜索小蓝书</h1>
          </div>
          <button type="button" aria-label="关闭搜索" onClick={close}>
            <Icon name="close" size={23} />
          </button>
        </div>
        <form className="search-modal-form" onSubmit={submit}>
          <label className="sr-only" htmlFor="global-search-input">
            搜索内容
          </label>
          <div className="search-modal-input">
            <Icon name="search" size={21} />
            <input
              ref={inputRef}
              id="global-search-input"
              value={value}
              maxLength={100}
              autoComplete="off"
              placeholder="搜索笔记、频道或用户"
              aria-describedby={error ? 'search-dialog-error' : undefined}
              onChange={(event) => {
                setValue(event.target.value);
                if (error) setError('');
              }}
            />
          </div>
          <button className="search-submit" type="submit">
            搜索
          </button>
        </form>
        <div className="search-dialog-feedback" aria-live="polite">
          {error ? (
            <p id="search-dialog-error" role="alert">
              {error}
            </p>
          ) : (
            <p>支持多个关键词，使用空格分隔</p>
          )}
        </div>
      </div>
    </div>
  );
}

type SearchTriggerProps = {
  currentKeyword?: string;
  onNavigate?: (path: string, origin: HTMLButtonElement | null) => void;
};

export function SearchTrigger({
  currentKeyword = '',
  onNavigate,
}: SearchTriggerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const text = currentKeyword || '搜索感兴趣的内容';

  return (
    <>
      <button
        ref={triggerRef}
        className="search-box"
        type="button"
        aria-label={`搜索：${text}`}
        onClick={() => setOpen(true)}
      >
        <span>{text}</span>
        <Icon name="search" size={23} />
      </button>
      <SearchDialog
        open={open}
        initialKeyword={currentKeyword}
        onClose={() => setOpen(false)}
        onNavigate={
          onNavigate
            ? (path) => onNavigate(path, triggerRef.current)
            : undefined
        }
        returnFocusRef={triggerRef}
      />
    </>
  );
}
