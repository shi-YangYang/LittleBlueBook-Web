'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useSafetyDialog(
  open: boolean,
  onClose: () => void,
  busy = false,
): RefObject<HTMLDivElement | null> {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    if (open) return;
    const rememberTarget = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return;
      const focusTarget = target.closest<HTMLElement>(FOCUSABLE);
      if (focusTarget) returnFocusRef.current = focusTarget;
    };
    const onFocusIn = (event: FocusEvent) => rememberTarget(event.target);
    const onPointerDown = (event: PointerEvent) => rememberTarget(event.target);
    rememberTarget(document.activeElement);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const activeElement =
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body &&
      document.activeElement !== document.documentElement
        ? document.activeElement
        : null;
    const returnFocus = activeElement ?? returnFocusRef.current;
    const timer = window.setTimeout(() => {
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }, 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = dialogRef.current
        ? Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        : [];
      if (controls.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = controls[0];
      const last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialogRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [open]);

  return dialogRef;
}
