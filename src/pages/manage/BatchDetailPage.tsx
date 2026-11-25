import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api';
import { Field, fmtDate, Notice } from '../../components/ui';
import { useCanEdit } from '../../session';
import type { ApplicantDetail, ApprovalEvent, BatchDetail } from '../../types';
import ApprovalHistory from './ApprovalHistory';
import ApprovalStageCell from './ApprovalStageCell';
import { batchPlaces } from './BatchesPage';
import { useActiveCentres } from './CreateBatchDialog';
import { ManageShell } from './ManageLayout';

/* A student's whole approval history, loaded when it is opened (GET /manage/applicants/:id). */
function MemberHistory({ id }: { id: string }) {
  const [events, setEvents] = useState<ApprovalEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    api<ApplicantDetail>(`/manage/applicants/${encodeURIComponent(id)}`, { realm: 'manage' })
      .then((r) => live && setEvents(r.data.history ?? []))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [id]);
  if (failed) return <p className="err">Could not load the history. Close and open it again.</p>;
  return events ? <ApprovalHistory events={events} /> : <p className="muted">Loading…</p>;
}

/*
 * One batch (/manage/batches/:id): where its students are now, each with the approval stage, a rejection's reason and the
 * whole history; an ADMIN account can change the name and the centre. The students of a batch are fixed.
 */
export default function BatchDetailPage() {
  const { id = '' } = useParams();
  const canEdit = useCanEdit();
  const { centres } = useActiveCentres();
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [centreId, setCentreId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  /* The students whose history is open. */
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await api<BatchDetail>(`/manage/batches/${encodeURIComponent(id)}`, { realm: 'manage' });
      setBatch(res.data);
      setName(res.data.name);
      setCentreId(res.data.centre.id);
      setLoadError('');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load the batch');
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!batch || busy) return;
    const local: Record<string, string> = {};
    if (name.trim().length < 2) local.name = 'Enter a batch name (at least 2 characters)';
    if (!centreId) local.centre_id = 'Choose a centre';
    setErrors(local);
    setError('');
    setDone('');
    if (Object.keys(local).length) return;
    const body: Record<string, unknown> = {};
    if (name.trim() !== batch.name) body.name = name.trim();
    if (centreId !== batch.centre.id) body.centre_id = centreId;
    if (!Object.keys(body).length) {
      setDone('Nothing to save: the name and centre are unchanged.');
      return;
    }
    setBusy(true);
    try {
      const res = await api<BatchDetail>(`/manage/batches/${encodeURIComponent(id)}`, { method: 'PATCH', realm: 'manage', body });
      setBatch(res.data);
      setName(res.data.name);
      setCentreId(res.data.centre.id);
      setDone('Batch details saved.');
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fields();
        setErrors({ name: fields.name ?? '', centre_id: fields.centre_id ?? '' });
        setError(err.status === 422 && (fields.name || fields.centre_id) ? 'Please correct the highlighted fields.' : err.message);
      } else setError('Could not save the batch');
    } finally {
      setBusy(false);
    }
  };

  if (loadError)
    return (
      <ManageShell wide>
        <p>
          <Link to="/manage/batches">← Batches</Link>
        </p>
        <Notice tone="error">{loadError}</Notice>
      </ManageShell>
    );
  if (!batch)
    return (
      <ManageShell wide>
        <div className="loading">Loading…</div>
      </ManageShell>
    );

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  /* The centre may be inactive now: it still shows, so the current value stays selectable. */
  const centreOptions = [
    ...(centres ?? []),
    ...(centres && !centres.some((c) => c.id === batch.centre.id)
      ? [{ id: batch.centre.id, name: `${batch.centre.name ?? 'Current centre'} (inactive)`, code: batch.centre.code ?? '', districtName: '' }]
      : []),
  ];

  return (
    <ManageShell wide>
      <p style={{ margin: '0 0 8px' }}>
        <Link to="/manage/batches">← Batches</Link>
      </p>
      <div className="row" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>{batch.name}</h2>
        {batch.rejected ? <span className="badge do-REJECTED">{batch.rejected} rejected</span> : null}
        <span className="spacer" />
        <span className="muted">
          {batch.students} student{batch.students === 1 ? '' : 's'}
        </span>
      </div>
      <p style={{ margin: '0 0 4px' }}>
        Where it is now: <b>{batchPlaces(batch)}</b>
      </p>
      <p className="hint" style={{ marginTop: 0 }}>
        District: <b>{batch.district?.name ?? '—'}</b> · Centre: <b>{batch.centre.name ?? '—'}</b>
        {batch.centre.code ? ` (${batch.centre.code})` : ''} · Created {fmtDate(batch.created_at)}
        {batch.created_by ? ` by ${batch.created_by}` : ''} · Last changed {fmtDate(batch.updated_at)}
        {batch.updated_by ? ` by ${batch.updated_by}` : ''}
      </p>
      {done ? <Notice tone="ok">{done}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {canEdit ? (
        <section className="card" aria-labelledby="batch-details-title">
          <h3 id="batch-details-title" style={{ marginTop: 0 }}>
            Batch details
          </h3>
          <form onSubmit={(e) => void save(e)} noValidate>
            <div className="grid">
              <Field id="batch-edit-name" label="Batch name" error={errors.name}>
                <input id="batch-edit-name" className="inp" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field id="batch-edit-centre" label="Centre" error={errors.centre_id}>
                <select id="batch-edit-centre" className="inp" value={centreId} onChange={(e) => setCentreId(e.target.value)}>
                  {centreOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.code ? ` (${c.code})` : ''}
                      {c.districtName ? ` – ${c.districtName}` : ''}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="actions">
              <button type="submit" className="btn" disabled={busy}>
                {busy ? 'Saving…' : 'Save details'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <h3 style={{ margin: '18px 0 8px' }}>Students in this batch</h3>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Student</th>
              <th>Mobile</th>
              <th>Details</th>
              <th>Approval stage</th>
              <th>Registration</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {batch.members.map((m, i) => (
              <Fragment key={m.id}>
                <tr>
                  <td>{i + 1}</td>
                  <td>
                    <b>{m.name}</b>
                    <div className="hint">{m.email}</div>
                  </td>
                  <td className="nowrap">{m.mobile_number}</td>
                  <td>
                    <dl className="row-facts">
                      <dt>District</dt>
                      <dd>{m.district ?? '—'}</dd>
                      <dt>Category</dt>
                      <dd>{m.category ?? '—'}</dd>
                      <dt>Centre</dt>
                      <dd>{m.centre ?? '—'}</dd>
                      <dt>Documents</dt>
                      <dd>
                        <span className={m.documents_verified ? 'badge active' : 'badge'}>{m.documents_verified ? 'Verified' : 'Not verified'}</span>
                      </dd>
                    </dl>
                  </td>
                  <td>
                    <ApprovalStageCell approval={m.approval} waiting batch={false} />
                  </td>
                  <td className="mono nowrap">{m.registration_id ?? '—'}</td>
                  <td>
                    <div className="row-actions">
                      <Link className="btn ghost sm" to={`/manage/applicants/${encodeURIComponent(m.id)}`} aria-label={`View ${m.name}`}>
                        View
                      </Link>
                      <button
                        type="button"
                        className="btn ghost sm"
                        aria-expanded={open.has(m.id)}
                        aria-label={`History of ${m.name}`}
                        onClick={() => toggle(m.id)}
                      >
                        {open.has(m.id) ? 'Hide history' : 'History'}
                      </button>
                    </div>
                  </td>
                </tr>
                {open.has(m.id) ? (
                  <tr>
                    <td colSpan={7} className="history-cell">
                      <MemberHistory id={m.id} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint mt16">
        The students of a batch are fixed. One student can be rejected without stopping the rest: a student sent back to the Auditor is
        approved again in <Link to="/manage?application_stage=RETURNED">Applicants (sent back)</Link> and goes straight back to the Divisional
        Officer in this batch.
      </p>
    </ManageShell>
  );
}
