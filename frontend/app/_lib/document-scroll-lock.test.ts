import { afterEach, describe, expect, it } from 'vitest';

import { lockDocumentScroll } from './document-scroll-lock';

describe('lockDocumentScroll', () => {
  afterEach(() => {
    Reflect.deleteProperty(document.documentElement, 'clientWidth');
    document.documentElement.removeAttribute('style');
    document.body.removeAttribute('style');
  });

  it('locks both root containers, compensates the gutter and restores styles', () => {
    document.documentElement.style.overflow = 'clip';
    document.body.style.overflow = 'auto';
    document.body.style.paddingRight = '6px';
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: window.innerWidth - 14,
    });

    const release = lockDocumentScroll();

    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.paddingRight).toBe('20px');

    release();

    expect(document.documentElement.style.overflow).toBe('clip');
    expect(document.body.style.overflow).toBe('auto');
    expect(document.body.style.paddingRight).toBe('6px');
  });

  it('keeps a shared lock active until every consumer releases it', () => {
    const releaseFirst = lockDocumentScroll();
    const releaseSecond = lockDocumentScroll();

    releaseFirst();
    expect(document.documentElement.style.overflow).toBe('hidden');

    releaseSecond();
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.body.style.overflow).toBe('');
  });
});
