import { useState } from 'react';
import { api, ApiError } from '../../api';
import { Field, Modal, Notice } from '../../components/ui';
import type { Applicant } from '../../types';

/*
 * Why the Auditor approves a form a second time (after a rejection or a return to the candidate): kept in the form's
 * approval history and sent to Sarthi with it. A first approval asks for none (as the API checks it).
 */
export const APPROVAL_REASON_MIN = 3;
export const APPROVAL_REASON_MAX = 500;

/* What is approved: one form (its row's Approve) or the ticked rows (Approve selected). */
export type ApproveTarget = { kind: 'one'; applicant: Applicant } | { kind: 'selected'; applicants: Applicant[] };

/*
 * The confirmation before approving — POST /manage/applicants/:id/approve or /manage/applicants/approve-selected on Yes. A
 * second approval (approval.reason_required, or the API says so: 422) asks for the reason, one for all the selected forms.
 * An approved form waits for a batch, which then goes to the Divisional Officer (in Sarthi). A student sent back to the
 * Auditor is already in a batch: approving sends them straight back to the Divisional Officer in it.
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
  const applicants = target.kind === 'one' ? [target.applicant] : target.applicants;
  /* Approved again after a rejection: the reason is asked (the API may say so too, for a form approved meanwhile). */
  const again = applicants.filter((a) => a.approval?.reason_required).length;
  const [asked, setAsked] = useState(again > 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const typed = asked ? reason.trim() : '';
  const batch = target.kind === 'one' ? (target.applicant.approval?.batch ?? null) : null;
  /* Already in a batch (sent back to the Auditor), and the others, which will wait for one. */
  const back = applicants.filter((a) => a.approval?.batch).length;
  const wait = applicants.length - back;

  const confirm = async () => {
    if (asked && [...typed].length < APPROVAL_REASON_MIN) {
      setReasonError(`Enter an approval reason of at least ${APPROVAL_REASON_MIN} characters.`);
      return;
    }
    if (typed.length > APPROVAL_REASON_MAX) {
      setReasonError(`The approval reason can have at most ${APPROVAL_REASON_MAX} characters.`);
      return;
    }
    setBusy(true);
    setError('');
    setReasonError('');
    try {
      if (target.kind === 'one') {
        await api<{ approved: number }>(`/manage/applicants/${target.applicant.id}/approve`, {
          method: 'POST',
          realm: 'manage',
          body: typed ? { reason: typed } : {},
        });
        onDone(
          batch
            ? `${target.applicant.name}'s form approved and sent back to the Divisional Officer in batch ${batch.name}.`
            : `${target.applicant.name}'s form approved. Put it into a batch to send it to the Divisional Officer.`,
        );
        return;
      }
      const res = await api<{ approved: number; skipped: number }>('/manage/applicants/approve-selected', {
        method: 'POST',
        realm: 'manage',
        body: { ids: target.applicants.map((a) => a.id), ...(typed ? { reason: typed } : {}) },
      });
      const { approved, skipped } = res.data;
      const it = approved === 1 ? 'it' : 'them';
      const next = !back
        ? `Put ${it} into a batch to send ${it} to the Divisional Officer.`
        : !wait
          ? 'Sent straight back to the Divisional Officer, in the same batch as before.'
          : 'Put those not in a batch yet into one to send them to the Divisional Officer; those already in a batch went straight back to the Divisional Officer.';
      onDone(
        (approved
          ? `${approved} form${approved === 1 ? '' : 's'} approved. ${next}`
          : 'None of the selected forms was waiting for approval.') +
          (skipped ? ` ${skipped} selected form${skipped === 1 ? ' was' : 's were'} skipped (already approved or not submitted).` : ''),
      );
    } catch (e) {
      /* A reason the API refused is said at the box; anything else above it. */
      const onReason = e instanceof ApiError ? e.fields().reason : undefined;
      if (onReason) {
        setAsked(true);
        setReasonError(onReason);
      } else setError(e instanceof ApiError || e instanceof Error ? e.message : 'Could not approve');
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
          ? batch
            ? `The submitted form${target.applicant.registration_id ? ` (${target.applicant.registration_id})` : ''} will go straight back to the Divisional Officer, in the same batch (${batch.name}).`
            : `The submitted form${target.applicant.registration_id ? ` (${target.applicant.registration_id})` : ''} will be approved and wait for a batch. Put it into a batch to send it to the Divisional Officer.`
          : [
              wait ? `${wait} form${wait === 1 ? '' : 's'} will be approved and wait for a batch, to be sent to the Divisional Officer.` : '',
              back
                ? `${back} student${back === 1 ? ' is' : 's are'} already in a batch and will go straight back to the Divisional Officer in it.`
                : '',
            ]
              .filter(Boolean)
              .join(' ')}{' '}
        This cannot be undone.
      </p>
      {target.kind === 'selected' ? (
        <ul className="approve-list">
          {target.applicants.map((a) => (
            <li key={a.id}>
              {a.name}
              {a.registration_id ? <span className="hint"> · {a.registration_id}</span> : null}
              {a.approval?.batch ? <span className="hint"> · back to {a.approval.batch.name}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {asked ? (
        <Field
          id="approve-reason"
          label="Approval reason"
          error={reasonError}
          hint={`${
            again && n > 1
              ? `${again} of these forms ${again === 1 ? 'was' : 'were'} rejected before, so this is a second approval. `
              : ''
          }Why you approve it again${n > 1 ? ' (the same reason is kept for each form)' : ''}: shown in the approval history and sent to Sarthi. ${typed.length}/${APPROVAL_REASON_MAX}`}
        >
          <textarea
            id="approve-reason"
            className="inp"
            rows={3}
            maxLength={APPROVAL_REASON_MAX + 20}
            value={reason}
            disabled={busy}
            aria-invalid={reasonError ? true : undefined}
            onChange={(e) => {
              setReason(e.target.value);
              setReasonError('');
            }}
            placeholder="e.g. All documents verified against the originals"
            data-autofocus
          />
        </Field>
      ) : null}
      <div className="actions">
        <button className="btn ghost" onClick={onClose} disabled={busy} data-autofocus={asked ? undefined : true}>
          Cancel
        </button>
        <button className="btn" onClick={() => void confirm()} disabled={busy || (asked && !typed)}>
          {busy ? 'Approving…' : target.kind === 'selected' ? 'Yes, approve selected' : 'Yes, approve'}
        </button>
      </div>
    </Modal>
  );
}
