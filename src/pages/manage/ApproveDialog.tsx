import { useState } from 'react';
import { api, ApiError } from '../../api';
import { Modal, Notice } from '../../components/ui';
import type { Applicant } from '../../types';

/* What is approved: one form (its row's Approve) or the ticked rows (Approve selected). */
export type ApproveTarget = { kind: 'one'; applicant: Applicant } | { kind: 'selected'; applicants: Applicant[] };

/*
 * The confirmation before approving — POST /manage/applicants/:id/approve or /manage/applicants/approve-selected on
 * Yes. An approved form goes to the Division Officer (Admin Panel → Student Registration), who approves or rejects it;
 * the list then shows the Division Officer status.
 */
export default function ApproveDialog({
  target,
  onClose,
  onDone,
}: {
  target: ApproveTarget;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      if (target.kind === 'one') {
        await api<{ approved: number }>(`/manage/applicants/${target.applicant.id}/approve`, { method: 'POST', realm: 'manage' });
        onDone(`${target.applicant.name}'s form approved and sent to the Division Officer.`);
        return;
      }
      const res = await api<{ approved: number; skipped: number }>('/manage/applicants/approve-selected', {
        method: 'POST',
        realm: 'manage',
        body: { ids: target.applicants.map((a) => a.id) },
      });
      const { approved, skipped } = res.data;
      onDone(
        (approved
          ? `${approved} form${approved === 1 ? '' : 's'} approved and sent to the Division Officer.`
          : 'None of the selected forms was waiting for approval.') +
          (skipped ? ` ${skipped} selected form${skipped === 1 ? ' was' : 's were'} skipped (already approved or not submitted).` : ''),
      );
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Could not approve');
      setBusy(false);
    }
  };

  const n = target.kind === 'selected' ? target.applicants.length : 1;
  return (
    <Modal
      alert
      title={target.kind === 'one' ? `Approve ${target.applicant.name}'s form?` : `Approve ${n} selected form${n === 1 ? '' : 's'}?`}
      onClose={() => !busy && onClose()}
    >
      {error ? <Notice tone="error">{error}</Notice> : null}
      <p>
        {target.kind === 'one'
          ? `The submitted form${target.applicant.registration_id ? ` (${target.applicant.registration_id})` : ''} will be sent to the Division Officer for approval.`
          : 'The selected forms will be sent to the Division Officer for approval.'}{' '}
        This cannot be undone.
      </p>
      {target.kind === 'selected' ? (
        <ul className="approve-list">
          {target.applicants.map((a) => (
            <li key={a.id}>
              {a.name}
              {a.registration_id ? <span className="hint"> · {a.registration_id}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="actions">
        <button className="btn ghost" onClick={onClose} disabled={busy} data-autofocus>
          Cancel
        </button>
        <button className="btn" onClick={() => void confirm()} disabled={busy}>
          {busy ? 'Approving…' : target.kind === 'selected' ? 'Yes, approve selected' : 'Yes, approve'}
        </button>
      </div>
    </Modal>
  );
}
