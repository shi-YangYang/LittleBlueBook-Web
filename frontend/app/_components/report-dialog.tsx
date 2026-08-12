'use client';

import { type FormEvent, useState } from 'react';

import { ApiRequestError } from '../_lib/api';
import {
  REPORT_REASONS,
  submitReport,
  type ReportTargetType,
} from '../_lib/safety';
import { useSafetyDialog } from './use-safety-dialog';

type ReportDialogProps = {
  open: boolean;
  targetType: ReportTargetType;
  targetId: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
};

export function ReportDialog({
  open,
  targetType,
  targetId,
  onClose,
  onSuccess,
}: ReportDialogProps) {
  const [reason, setReason] =
    useState<(typeof REPORT_REASONS)[number][0]>('HARASSMENT');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useSafetyDialog(open, onClose, busy);

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await submitReport({ targetType, targetId, reason, details });
      onClose();
      setDetails('');
      onSuccess('举报已提交，可在“我的举报”查看进度');
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError
          ? (cause.payload.message ?? '举报提交失败')
          : '举报提交失败，请稍后重试',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="safety-dialog-layer" role="presentation">
      <div
        ref={dialogRef}
        className="safety-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-dialog-title"
      >
        <h2 id="report-dialog-title">提交举报</h2>
        <p>请选择最符合实际情况的原因，平台将由管理员人工审核。</p>
        <form onSubmit={(event) => void submit(event)}>
          <fieldset>
            <legend>举报原因</legend>
            {REPORT_REASONS.map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="report-reason"
                  value={value}
                  checked={reason === value}
                  onChange={() => setReason(value)}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          <label className="safety-dialog-details">
            补充说明（选填）
            <textarea
              value={details}
              maxLength={200}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="请勿填写隐私信息"
            />
            <span>{Array.from(details).length}/200</span>
          </label>
          {error ? <p role="alert">{error}</p> : null}
          <div className="safety-dialog-actions">
            <button type="button" disabled={busy} onClick={onClose}>
              取消
            </button>
            <button type="submit" disabled={busy}>
              {busy ? '提交中…' : '提交举报'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
