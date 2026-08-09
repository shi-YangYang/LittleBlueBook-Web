import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NoteManageMenu } from './note-manage-menu';

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
}));

afterEach(() => {
  cleanup();
  navigation.push.mockReset();
  navigation.replace.mockReset();
  vi.unstubAllGlobals();
});

describe('NoteManageMenu', () => {
  it('opens an author menu without parent navigation and enters edit mode', () => {
    const parentClick = vi.fn();
    render(
      <button type="button" onClick={parentClick}>
        打开笔记
        <NoteManageMenu noteId="note-1" contentVersion={2} />
      </button>,
    );

    fireEvent.click(screen.getByRole('button', { name: '更多笔记操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '编辑笔记' }));
    expect(parentClick).not.toHaveBeenCalled();
    expect(navigation.push).toHaveBeenCalledWith('/publish?edit=note-1');
  });

  it('requires confirmation and binds the current version to permanent deletion', async () => {
    const onDeleted = vi.fn();
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      expect(init?.method).toBe('DELETE');
      expect(JSON.parse(String(init?.body))).toEqual({
        expectedContentVersion: 5,
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'note-5', deleted: true }),
      };
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    const { container } = render(
      <NoteManageMenu
        noteId="note-5"
        contentVersion={5}
        onDeleted={onDeleted}
      />,
    );

    const trigger = screen.getByRole('button', { name: '更多笔记操作' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: '删除笔记' }));
    expect(
      screen.getByRole('alertdialog', { name: '永久删除笔记' }),
    ).toBeVisible();
    const confirmationLayer = document.querySelector('.confirm-layer');
    expect(confirmationLayer?.parentElement).toBe(document.body);
    expect(container.querySelector('.confirm-layer')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: '删除笔记' }));
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('note-5'));
  });

  it('invalidates a stale confirmation instead of reusing a refreshed version', async () => {
    const onVersionConflict = vi.fn();
    const requests: number[] = [];
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const version = JSON.parse(String(init?.body)).expectedContentVersion;
      requests.push(version);
      if (requests.length === 1) {
        return {
          ok: false,
          status: 409,
          json: async () => ({
            code: 'NOTE_EDIT_CONFLICT',
            message: '笔记已被更新',
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 'note-stale', deleted: true } }),
      };
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { rerender } = render(
      <NoteManageMenu
        noteId="note-stale"
        contentVersion={4}
        onVersionConflict={onVersionConflict}
      />,
    );
    const openDelete = () => {
      fireEvent.click(screen.getByRole('button', { name: '更多笔记操作' }));
      fireEvent.click(screen.getByRole('menuitem', { name: '删除笔记' }));
    };

    openDelete();
    rerender(
      <NoteManageMenu
        noteId="note-stale"
        contentVersion={5}
        onVersionConflict={onVersionConflict}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(onVersionConflict).toHaveBeenCalledTimes(1));
    expect(requests).toEqual([4]);
    expect(
      screen.queryByRole('alertdialog', { name: '永久删除笔记' }),
    ).toBeNull();
    expect(
      screen.getByText('笔记已被更新，请重新打开删除确认'),
    ).toBeVisible();

    openDelete();
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(requests).toEqual([4, 5]));
  });
});
