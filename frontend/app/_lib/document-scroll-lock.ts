type ScrollLockSnapshot = {
  bodyOverflow: string;
  bodyPaddingRight: string;
  rootOverflow: string;
};

let activeLockCount = 0;
let snapshot: ScrollLockSnapshot | null = null;

export function lockDocumentScroll(): () => void {
  const root = document.documentElement;
  const body = document.body;

  if (activeLockCount === 0) {
    snapshot = {
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
      rootOverflow: root.style.overflow,
    };

    const scrollbarWidth = Math.max(0, window.innerWidth - root.clientWidth);
    if (scrollbarWidth > 0) {
      const currentPadding =
        Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    }
    root.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
  }

  activeLockCount += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    activeLockCount = Math.max(0, activeLockCount - 1);

    if (activeLockCount !== 0 || !snapshot) return;
    root.style.overflow = snapshot.rootOverflow;
    body.style.overflow = snapshot.bodyOverflow;
    body.style.paddingRight = snapshot.bodyPaddingRight;
    snapshot = null;
  };
}
