import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiRequestError } from '../_lib/api';
import { ReportDialog } from './report-dialog';

const safety = vi.hoisted(() => ({ submitReport: vi.fn() }));

vi.mock('../_lib/safety', async (importOriginal) => {
  const original = await importOriginal<typeof import('../_lib/safety')>();
  return { ...original, submitReport: safety.submitReport };
});

afterEach(() => {
  cleanup();
  safety.submitReport.mockReset();
});

describe('ReportDialog', () => {
  it('offers the eight fixed reasons and submits the selected plain text fields', async () => {
    safety.submitReport.mockResolvedValue({ id: 'report-id' });
    const close = vi.fn();
    const success = vi.fn();
    render(
      <ReportDialog
        open
        targetType="NOTE"
        targetId="note-id"
        onClose={close}
        onSuccess={success}
      />,
    );

    expect(screen.getAllByRole('radio')).toHaveLength(8);
    fireEvent.click(screen.getByRole('radio', { name: '侵权' }));
    fireEvent.change(screen.getByLabelText(/补充说明/), {
      target: { value: '<b>仅作为纯文本</b>' },
    });
    fireEvent.click(screen.getByRole('button', { name: '提交举报' }));

    await waitFor(() =>
      expect(safety.submitReport).toHaveBeenCalledWith({
        targetType: 'NOTE',
        targetId: 'note-id',
        reason: 'INFRINGEMENT',
        details: '<b>仅作为纯文本</b>',
      }),
    );
    expect(close).toHaveBeenCalledTimes(1);
    expect(success).toHaveBeenCalledWith('举报已提交，可在“我的举报”查看进度');
  });

  it('retains input on a stable API error and traps then restores focus', async () => {
    safety.submitReport.mockRejectedValue(
      new ApiRequestError(429, {
        code: 'REPORT_RATE_LIMITED',
        message: '举报提交过于频繁，请稍后再试',
      }),
    );
    const close = vi.fn();
    const view = render(
      <>
        <button type="button" autoFocus>
          举报入口
        </button>
        <ReportDialog
          open
          targetType="USER"
          targetId="user-id"
          onClose={close}
          onSuccess={vi.fn()}
        />
      </>,
    );

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: '色情低俗' })).toHaveFocus(),
    );
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: '提交举报' })).toHaveFocus();
    const details = screen.getByLabelText(/补充说明/);
    fireEvent.change(details, { target: { value: '保留输入' } });
    fireEvent.click(screen.getByRole('button', { name: '提交举报' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '举报提交过于频繁，请稍后再试',
    );
    expect(details).toHaveValue('保留输入');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(1);
    view.rerender(
      <>
        <button type="button">举报入口</button>
        <ReportDialog
          open={false}
          targetType="USER"
          targetId="user-id"
          onClose={close}
          onSuccess={vi.fn()}
        />
      </>,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '举报入口' })).toHaveFocus(),
    );
  });
});
