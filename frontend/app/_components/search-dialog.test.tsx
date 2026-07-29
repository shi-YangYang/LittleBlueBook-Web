import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SearchDialog, SearchTrigger } from './search-dialog';

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
}));

afterEach(() => {
  cleanup();
  navigation.push.mockReset();
});

describe('SearchDialog', () => {
  it('validates empty and Unicode-overlength input without navigation', () => {
    render(<SearchTrigger />);
    fireEvent.click(
      screen.getByRole('button', { name: '搜索：搜索感兴趣的内容' }),
    );
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    expect(screen.getByRole('alert')).toHaveTextContent('请输入搜索内容');
    expect(navigation.push).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('搜索内容'), {
      target: { value: '蓝'.repeat(51) },
    });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      '搜索内容不能超过50个字符',
    );
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it('normalizes spaces, closes and navigates to the note result URL', async () => {
    render(<SearchTrigger />);
    fireEvent.click(
      screen.getByRole('button', { name: '搜索：搜索感兴趣的内容' }),
    );
    const input = screen.getByLabelText('搜索内容');
    fireEvent.change(input, { target: { value: '  蓝色   装备  ' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    expect(navigation.push).toHaveBeenCalledWith(
      '/search?keyword=%E8%93%9D%E8%89%B2%20%E8%A3%85%E5%A4%87&type=note',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('prefills the current keyword and restores focus after Escape', async () => {
    const focusRef = createRef<HTMLButtonElement>();
    const close = vi.fn();
    render(
      <>
        <button ref={focusRef} type="button">
          打开搜索
        </button>
        <SearchDialog
          open
          initialKeyword="户外"
          onClose={close}
          returnFocusRef={focusRef}
        />
      </>,
    );

    expect(screen.getByLabelText('搜索内容')).toHaveValue('户外');
    await waitFor(() =>
      expect(screen.getByLabelText('搜索内容')).toHaveFocus(),
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(focusRef.current).toHaveFocus());
  });

  it('closes when the backdrop itself is clicked', () => {
    const focusRef = createRef<HTMLButtonElement>();
    const close = vi.fn();
    render(<SearchDialog open onClose={close} returnFocusRef={focusRef} />);
    const layer = document.querySelector('.search-modal-layer') as Element;
    expect(layer.parentElement).toBe(document.body);
    fireEvent.mouseDown(layer);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
