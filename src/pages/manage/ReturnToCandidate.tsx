import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../api';
import { Field, fmtDate, Modal, Notice } from '../../components/ui';
import { EMAIL_STATUS_TEXT, REASON_MAX, REASON_MIN, type FormReturn, type Returns } from '../../returns';

/*
 * The Auditor rejects a submitted form back to the candidate (setting "Enable Rejection Email Notification and
 * Resubmission"): POST /manage/applicants/:id/return with the reason, which the candidate gets by e-mail. While it is with the
 * candidate the form cannot be approved or edited here; their save sends it back to the Auditor. The history lists every time.
 */

/* GET /manage/applicants/:id/returns, loaded once the student is; `reload` after a change. */
export function useReturns(id: string, ready: boolean) {
  const [data, setData] = useState<Returns | null>(null);
  const reload = useCallback(() => {
    api<Returns>(`/manage/applicants/${encodeURIComponent(id)}/returns`, { realm: 'manage' })
      .then((r) => setData(r.data))
      .catch(() => setData(null));
  }, [id]);
  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);
  return { data, reload };
}

/* The header's button, for a form that is with the Auditor while the setting is on; opens the dialog. */
export function RejectButton({ id, name, returns, onDone }: { id: string; name: string; returns: Returns | null; onDone: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!returns?.can_return) return null;
  return (
    <>
      <button type="button" className="btn ghost sm danger" onClick={() => setOpen(true)}>
        Reject and send back to candidate
      </button>
      {open ? (
        <RejectDialog
          id={id}
          name={name}
          onClose={() => setOpen(false)}
          onDone={(message) => {
            setOpen(false);
            onDone(message);
          }}
        />
      ) : null}
    </>
  );
}

function RejectDialog({ id, name, onClose, onDone }: { id: string; name: string; onClose: () => void; onDone: (message: string) => void }) {
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const typed = reason.trim();

  const confirm = async () => {
    if ([...typed].length < REASON_MIN) return setReasonError(`Enter a rejection reason of at least ${REASON_MIN} characters.`);
    if (typed.length > REASON_MAX) return setReasonError(`The rejection reason can have at most ${REASON_MAX} characters.`);
    setBusy(true);
    setError('');
    setReasonError('');
    try {
      const res = await api<{ email: FormReturn['email_status'] }>(`/manage/applicants/${encodeURIComponent(id)}/return`, {
        method: 'POST',
        realm: 'manage',
        body: { reason: typed },
      });
      const mail =
        res.data.email === 'SENT'
          ? 'An e-mail with the reason was sent to the candidate.'
          : res.data.email === 'FAILED'
            ? 'The e-mail to the candidate could not be sent: please contact them.'
            : 'No e-mail was sent (no mail server is set up).';
      onDone(`${name}'s form was sent back to the candidate. ${mail}`);
    } catch (e) {
      const onReason = e instanceof ApiError ? e.fields().reason : undefined;
      if (onReason) setReasonError(onReason);
      else setError(e instanceof Error ? e.message : 'Could not send the form back');
      setBusy(false);
    }
  };

  return (
    <Modal alert title={`Reject ${name}'s form and send it back?`} onClose={() => !busy && onClose()}>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <p>
        The candidate gets an e-mail with this reason. They log in with their existing credentials, correct the details and save;
        saving sends the form back to you for review and approval. Until then it cannot be approved or edited here.
      </p>
      <Field id="reject-reason" label="Rejection reason" error={reasonError} hint={`What the candidate must correct. ${typed.length}/${REASON_MAX}`}>
        <textarea
          id="reject-reason"
          className="inp"
          rows={4}
          maxLength={REASON_MAX + 20}
          value={reason}
          disabled={busy}
          aria-invalid={reasonError ? true : undefined}
          onChange={(e) => {
            setReason(e.target.value);
            setReasonError('');
          }}
          placeholder="e.g. The Aadhaar card photo is not readable; upload a clear copy"
          data-autofocus
        />
      </Field>
      <div className="actions">
        <button className="btn ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn danger" onClick={() => void confirm()} disabled={busy || !typed}>
          {busy ? 'Sending back…' : 'Yes, reject and send back'}
        </button>
      </div>
    </Modal>
  );
}

/* The times the form was sent back: reason, who, when, the e-mail, and when the candidate resubmitted it. */
export function ReturnsCard({ returns }: { returns: Returns | null }) {
  if (!returns?.returns.length) return null;
  return (
    <section className="card" aria-label="Sent back to the candidate">
      <h3>Sent back to the candidate</h3>
      {returns.open ? (
        <Notice tone="warn">
          With the candidate for correction since {fmtDate(returns.open.at)}. It can be approved or edited once they save it, which
          resubmits it.
        </Notice>
      ) : null}
      <div className="fu-history approval-history">
        <ol>
          {returns.returns.map((r) => (
            <li key={r.seq}>
              <div className="row">
                <span className="badge do-REJECTED">Rejected by {r.by}</span>
                <span className="fs13">Sent back to the candidate</span>
                <span className="hint">{fmtDate(r.at)}</span>
              </div>
              <p className="fu-note-full">
                <b>Reason:</b> {r.reason}
              </p>
              <p className="hint" style={{ margin: 0 }}>
                {EMAIL_STATUS_TEXT[r.email_status]}
                {' · '}
                {r.resubmitted_at ? `Corrected and resubmitted by the candidate ${fmtDate(r.resubmitted_at)}` : 'Waiting for the candidate'}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
