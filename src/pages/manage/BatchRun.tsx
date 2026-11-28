import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api';
import { ddmmyyyy, Field, fmtDate, Modal, Notice, PasswordInput } from '../../components/ui';
import type { Batch, BatchDetail, BatchRunEntry } from '../../types';

/*
 * Where a batch is, and starting or ending it (POST /manage/batches/:id/start and /end). A batch starts once every student of
 * it is final approved; the Auditor confirms with Yes, then with their e-mail and password and the date and time it started
 * (or ended). Every start and end is kept (the batch's history).
 */

type Action = 'START' | 'END';

/* "1 Dec 2026 – 28 Feb 2027", the batch's planned dates; '' when it has none. */
const planned = (b: Batch) =>
  b.start_date && b.end_date
    ? `${ddmmyyyy(b.start_date)} – ${ddmmyyyy(b.end_date)}`
    : b.start_date
      ? `from ${ddmmyyyy(b.start_date)}`
      : b.end_date
        ? `until ${ddmmyyyy(b.end_date)}`
        : '';

/* The batch's flag: Not started, Ready to start, Ongoing, Ended. */
export function runLabel(b: Batch): { label: string; tone: string } {
  const run = b.run;
  if (!run || run.status === 'NOT_STARTED')
    return run?.ready ? { label: 'Ready to start', tone: 'READY' } : { label: 'Not started', tone: 'NOT_STARTED' };
  return run.status === 'ONGOING' ? { label: 'Ongoing', tone: 'ONGOING' } : { label: 'Ended', tone: 'ENDED' };
}

/* The batch's flag with when it started or ended, and the button that starts or ends it (an admin's). */
export function BatchRunCell({ batch, canEdit, onChanged }: { batch: Batch; canEdit: boolean; onChanged: (b: BatchDetail) => void }) {
  const [action, setAction] = useState<Action | null>(null);
  const run = batch.run;
  if (!run) return <span className="muted">—</span>;
  const { label, tone } = runLabel(batch);
  const dates = planned(batch);
  return (
    <div className="run-cell">
      <span className={`badge run-${tone}`}>{label}</span>
      {run.status === 'NOT_STARTED' ? (
        run.ready ? (
          <div className="hint">{dates ? `Planned ${dates}` : 'No planned dates'}</div>
        ) : (
          <div className="hint">
            Starts once all {batch.students} student{batch.students === 1 ? ' is' : 's are'} final approved ({batch.stages.APPROVED} now)
          </div>
        )
      ) : (
        <>
          <div className="hint">
            Started {fmtDate(run.started_at)}
            {run.started_by ? ` · ${run.started_by}` : ''}
          </div>
          {run.status === 'ENDED' ? (
            <div className="hint">
              Ended {fmtDate(run.ended_at)}
              {run.ended_by ? ` · ${run.ended_by}` : ''}
            </div>
          ) : dates ? (
            <div className="hint">Planned {dates}</div>
          ) : null}
        </>
      )}
      {canEdit && run.status === 'NOT_STARTED' && run.ready ? (
        <button type="button" className="btn sm" onClick={() => setAction('START')}>
          Start batch
        </button>
      ) : null}
      {canEdit && run.status === 'ONGOING' ? (
        <button type="button" className="btn ghost sm" onClick={() => setAction('END')}>
          End batch
        </button>
      ) : null}
      {action ? (
        <BatchRunDialog
          batch={batch}
          action={action}
          onClose={() => setAction(null)}
          onDone={(b) => {
            setAction(null);
            onChanged(b);
          }}
        />
      ) : null}
    </div>
  );
}

/* The browser's date and time now, as a datetime-local input takes it (YYYY-MM-DDTHH:mm). */
function localNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/*
 * Step 1: "Are you sure?" with the students of the batch and where each one is; No closes, Yes goes on. Step 2: the
 * signed-in user's e-mail and password and the date and time; a wrong password or date is shown at its field.
 */
export function BatchRunDialog({
  batch,
  action,
  onClose,
  onDone,
}: {
  batch: Batch;
  action: Action;
  onClose: () => void;
  onDone: (b: BatchDetail) => void;
}) {
  const verb = action === 'START' ? 'start' : 'end';
  const [step, setStep] = useState<1 | 2>(1);
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [at, setAt] = useState(localNow);
  /* The e-mail is typed by the user: read-only (so no browser fills it) until they click or tab into it. */
  const [emailArmed, setEmailArmed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api<BatchDetail>(`/manage/batches/${encodeURIComponent(batch.id)}`, { realm: 'manage' })
      .then((res) => live && setDetail(res.data))
      .catch((e) => live && setLoadError(e instanceof Error ? e.message : 'Could not load the students of the batch'));
    return () => {
      live = false;
    };
  }, [batch.id]);

  const submit = async () => {
    const missing: Record<string, string> = {};
    if (!email.trim()) missing.email = 'Email is required';
    if (!password) missing.password = 'Password is required';
    if (!at || Number.isNaN(Date.parse(at))) missing.at = 'Enter a valid date and time';
    setErrors(missing);
    if (Object.keys(missing).length) return;
    setBusy(true);
    setError('');
    try {
      const res = await api<BatchDetail>(`/manage/batches/${encodeURIComponent(batch.id)}/${verb}`, {
        method: 'POST',
        realm: 'manage',
        body: { email: email.trim(), password, at: new Date(at).toISOString() },
      });
      onDone(res.data);
    } catch (e) {
      const fields = e instanceof ApiError ? e.fields() : {};
      if (Object.keys(fields).length) setErrors(fields);
      else setError(e instanceof Error ? e.message : `Could not ${verb} the batch`);
      setPassword('');
      setBusy(false);
    }
  };

  const title =
    step === 1
      ? `${action === 'START' ? 'Start' : 'End'} batch ${batch.code ?? batch.name}?`
      : `${action === 'START' ? 'Start' : 'End'} batch: please confirm`;
  return (
    <Modal alert wide title={title} onClose={() => !busy && onClose()}>
      {step === 1 ? (
        <>
          <p>
            Are you sure you want to {verb} <b>{batch.name}</b>
            {batch.code ? ` (${batch.code})` : ''}? It has these students:
          </p>
          {loadError ? <Notice tone="error">{loadError}</Notice> : null}
          {!detail && !loadError ? <p className="muted">Loading the students…</p> : null}
          {detail ? (
            <div className="tbl-wrap run-students">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Student</th>
                    <th>Registration</th>
                    <th>Approval status</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.members.map((m, i) => (
                    <tr key={m.id}>
                      <td>{i + 1}</td>
                      <td>{m.name}</td>
                      <td className="mono">{m.registration_id ?? '—'}</td>
                      <td>
                        {m.final_verified ? (
                          <span className="badge run-READY">Final approved</span>
                        ) : (
                          <span className="badge">{m.approval?.stage_label ?? 'With the Auditor'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="actions">
            <button className="btn ghost" onClick={onClose} data-autofocus>
              No
            </button>
            <button className="btn" onClick={() => setStep(2)} disabled={!detail}>
              Yes, continue
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            To {verb} the batch, confirm your login details: the e-mail and password you are signed in with, and the date and time the batch{' '}
            {action === 'START' ? 'starts' : 'ended'}.
          </p>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Field id="run-email" label="Email" error={errors.email}>
            <input
              id="run-email"
              name="run-email-confirm"
              className="inp"
              type="text"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              readOnly={!emailArmed}
              onFocus={() => setEmailArmed(true)}
              data-lpignore="true"
              data-1p-ignore="true"
              value={email}
              disabled={busy}
              aria-invalid={errors.email ? true : undefined}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field id="run-password" label="Password" error={errors.password}>
            <PasswordInput
              id="run-password"
              noFill
              autoComplete="off"
              value={password}
              invalid={!!errors.password}
              onChange={(v) => setPassword(v)}
            />
          </Field>
          <Field id="run-at" label={action === 'START' ? 'Start date and time' : 'End date and time'} error={errors.at}>
            <input
              id="run-at"
              className="inp"
              type="datetime-local"
              value={at}
              disabled={busy}
              aria-invalid={errors.at ? true : undefined}
              onChange={(e) => setAt(e.target.value)}
            />
          </Field>
          <div className="actions">
            <button className="btn ghost" onClick={() => setStep(1)} disabled={busy}>
              Back
            </button>
            <button className="btn" onClick={() => void submit()} disabled={busy}>
              {busy ? (action === 'START' ? 'Starting…' : 'Ending…') : action === 'START' ? 'Start batch' : 'End batch'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

/* Every start and end of the batch, oldest first. */
export function BatchRunHistory({ runs }: { runs: BatchRunEntry[] | undefined }) {
  if (!runs) return null;
  return (
    <section aria-labelledby="batch-runs-title">
      <h3 id="batch-runs-title" style={{ margin: '18px 0 8px' }}>
        Start and end history
      </h3>
      {runs.length ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>What</th>
                <th>Date and time</th>
                <th>By</th>
                <th>Recorded</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r, i) => (
                <tr key={i}>
                  <td>
                    <span className={`badge run-${r.action === 'START' ? 'ONGOING' : 'ENDED'}`}>
                      {r.action === 'START' ? 'Batch started' : 'Batch ended'}
                    </span>
                  </td>
                  <td className="nowrap">{fmtDate(r.at)}</td>
                  <td>{r.by}</td>
                  <td className="nowrap hint">{fmtDate(r.recorded_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Not started yet.</p>
      )}
    </section>
  );
}
