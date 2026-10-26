import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api';
import { Field, fmtDate, Modal, Notice } from '../../components/ui';
import { FOLLOW_UP_NOTE_MAX, FOLLOW_UP_STATUS, type Applicant, type FollowUp, type FollowUpStatus } from '../../types';

/*
 * Follow-up of one student: record a status (Pending follow-up, Follow-up call, Second follow-up, Form filled) with an
 * optional note, and see every earlier follow-up (newest first, who recorded it and when). Each save adds to the history.
 */
export default function FollowUpDialog({ applicant, onClose, onSaved }: { applicant: Applicant; onClose: () => void; onSaved: () => void }) {
  const [history, setHistory] = useState<FollowUp[] | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);
  /* Starts from the list row; replaced by the latest saved status once the history arrives, unless already changed. */
  const [status, setStatus] = useState<FollowUpStatus>(applicant.follow_up?.status ?? 'PENDING');
  const touched = useRef(false);
  /* Once a save has started, its answer is the history; a slower first load must not overwrite it. */
  const saving = useRef(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const url = `/manage/applicants/${applicant.id}/follow-ups`;

  useEffect(() => {
    let live = true;
    api<FollowUp[]>(url, { realm: 'manage' })
      .then((r) => {
        if (!live || saving.current) return;
        setHistory(r.data);
        if (!touched.current) setStatus(r.data[0]?.status ?? 'PENDING');
      })
      .catch(() => live && !saving.current && setHistoryFailed(true));
    return () => {
      live = false;
    };
  }, [url]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    saving.current = true;
    setError('');
    setFieldErrors({});
    setSaved(false);
    setBusy(true);
    try {
      const res = await api<FollowUp[]>(url, { method: 'POST', realm: 'manage', body: { status, note: note.trim() || undefined } });
      setHistory(res.data);
      setHistoryFailed(false);
      setNote('');
      setSaved(true);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.details.length) setFieldErrors(err.fields());
      setError(err instanceof Error ? err.message : 'Could not save the follow-up');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Follow-up – ${applicant.name}`} onClose={() => !busy && onClose()}>
      <p className="fu-contact">
        <span className={`badge ${applicant.stage}`}>{applicant.stage_label}</span>{' '}
        <a href={`tel:${applicant.mobile_number}`}>{applicant.mobile_number}</a> ·{' '}
        <a href={`mailto:${applicant.email}`}>{applicant.email}</a>
      </p>
      <form onSubmit={save} noValidate>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {saved ? <Notice tone="ok">Follow-up saved.</Notice> : null}
        <div className="grid one">
          <Field id="fu-status" label="Follow-up status" error={fieldErrors.status}>
            <select
              id="fu-status"
              className="inp"
              value={status}
              onChange={(e) => {
                touched.current = true;
                setStatus(e.target.value as FollowUpStatus);
                setSaved(false);
              }}
              data-autofocus
            >
              {Object.entries(FOLLOW_UP_STATUS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id="fu-note"
            label="Note"
            required={false}
            error={fieldErrors.note}
            hint={`What was discussed, the next step, a callback time… (${note.length}/${FOLLOW_UP_NOTE_MAX})`}
          >
            <textarea
              id="fu-note"
              className="inp"
              rows={3}
              maxLength={FOLLOW_UP_NOTE_MAX}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setSaved(false);
              }}
              placeholder="e.g. Called at 11 am, will upload documents by Friday"
            />
          </Field>
        </div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? 'Saving…' : 'Save follow-up'}
          </button>
        </div>
      </form>

      <section className="fu-history" aria-labelledby="fu-history-title">
        <h4 id="fu-history-title">History</h4>
        {history === null && historyFailed ? (
          <p className="err">Could not load the history. Close and open the follow-up again.</p>
        ) : history === null ? (
          <p className="muted">Loading…</p>
        ) : history.length === 0 ? (
          <p className="muted">No follow-up recorded yet.</p>
        ) : (
          <ol>
            {history.map((f, i) => (
              <li key={`${f.at}-${i}`}>
                <div className="row">
                  <span className={`badge fu-${f.status}`}>{f.status_label}</span>
                  <span className="hint">
                    {fmtDate(f.at)}
                    {f.by ? ` · ${f.by}` : ''}
                  </span>
                </div>
                {f.note ? <p className="fu-note-full">{f.note}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </Modal>
  );
}
