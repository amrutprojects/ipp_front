import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api';
import { Field, fmtDate, Modal, Notice } from '../../components/ui';
import { useCanEdit } from '../../session';
import type { Applicant, BatchDetail } from '../../types';
import { useActiveCentres } from './CreateBatchDialog';
import { ManageShell } from './ManageLayout';

/*
 * One batch (/manage/batches/:id): its students, and for an ADMIN account the edits — name and centre, students
 * removed (at least one stays), finally approved students added (in no batch yet; within the batch size).
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
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [available, setAvailable] = useState<Applicant[] | null>(null);
  const [adding, setAdding] = useState<Set<string>>(new Set());

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
  const loadAvailable = useCallback(async () => {
    if (!canEdit) return;
    try {
      const res = await api<Applicant[]>('/manage/applicants', { realm: 'manage', query: { page: 1, limit: 100, approval: 'UNBATCHED' } });
      setAvailable(res.data.filter((r) => r.can_batch));
    } catch {
      setAvailable([]);
    }
  }, [canEdit]);
  useEffect(() => {
    void load();
    void loadAvailable();
  }, [load, loadAvailable]);

  /* One PATCH: the batch comes back as saved, or the reason it was refused. */
  const patch = async (body: Record<string, unknown>, message: string) => {
    setBusy(true);
    setError('');
    setDone('');
    try {
      const res = await api<BatchDetail>(`/manage/batches/${encodeURIComponent(id)}`, { method: 'PATCH', realm: 'manage', body });
      setBatch(res.data);
      setName(res.data.name);
      setCentreId(res.data.centre.id);
      setRemoving(new Set());
      setAdding(new Set());
      setDone(message);
      void loadAvailable();
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fields();
        setErrors({ name: fields.name ?? '', centre_id: fields.centre_id ?? '' });
        setError(fields.ids ?? fields.remove_ids ?? (err.status === 422 && (fields.name || fields.centre_id) ? 'Please correct the highlighted fields.' : err.message));
      } else setError('Could not save the batch');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveDetails = (e: FormEvent) => {
    e.preventDefault();
    if (!batch || busy) return;
    const local: Record<string, string> = {};
    if (name.trim().length < 2) local.name = 'Enter a batch name (at least 2 characters)';
    if (!centreId) local.centre_id = 'Choose a centre';
    setErrors(local);
    if (Object.keys(local).length) return;
    const body: Record<string, unknown> = {};
    if (name.trim() !== batch.name) body.name = name.trim();
    if (centreId !== batch.centre.id) body.centre_id = centreId;
    if (!Object.keys(body).length) {
      setDone('Nothing to save: the name and centre are unchanged.');
      return;
    }
    void patch(body, 'Batch details saved.');
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

  const room = batch.max_size - batch.members.length;
  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };
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
        <span className="spacer" />
        <span className="muted">
          {batch.members.length} of at most {batch.max_size} students
        </span>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        Centre: <b>{batch.centre.name ?? '—'}</b>
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
          <form onSubmit={saveDetails} noValidate>
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

      <div className="row" style={{ margin: '18px 0 8px' }}>
        <h3 style={{ margin: 0 }}>Students in this batch</h3>
        <span className="spacer" />
        {canEdit ? (
          <button className="btn ghost sm" disabled={!removing.size || busy} onClick={() => setConfirmRemove(true)}>
            Remove selected ({removing.size})
          </button>
        ) : null}
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {canEdit ? <th className="sel-cell" aria-label="Select" /> : null}
              <th>#</th>
              <th>Student</th>
              <th>Mobile</th>
              <th>District</th>
              <th>Registration</th>
              <th>Student register</th>
            </tr>
          </thead>
          <tbody>
            {batch.members.map((m, i) => (
              <tr key={m.id} className={removing.has(m.id) ? 'row-selected' : undefined}>
                {canEdit ? (
                  <td className="sel-cell">
                    <input
                      type="checkbox"
                      aria-label={`Select ${m.name} to remove`}
                      checked={removing.has(m.id)}
                      onChange={() => toggle(removing, setRemoving, m.id)}
                    />
                  </td>
                ) : null}
                <td>{i + 1}</td>
                <td>
                  <b>{m.name}</b>
                  <div className="hint">{m.email}</div>
                </td>
                <td className="nowrap">{m.mobile_number}</td>
                <td>{m.district ?? '—'}</td>
                <td className="mono nowrap">{m.registration_id ?? '—'}</td>
                <td className="mono nowrap">{m.register_id ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit ? (
        <>
          <div className="row" style={{ margin: '22px 0 8px' }}>
            <h3 style={{ margin: 0 }}>Add students</h3>
            <span className="spacer" />
            <span className="muted fs13">{room > 0 ? `Room for ${room} more` : 'This batch is full'}</span>
            <button
              className="btn sm"
              disabled={!adding.size || busy || adding.size > room}
              onClick={() => void patch({ add_ids: [...adding] }, `${adding.size} student${adding.size === 1 ? '' : 's'} added.`)}
            >
              Add selected ({adding.size})
            </button>
          </div>
          {adding.size > room ? (
            <Notice tone="warn">
              Only {Math.max(room, 0)} more fit (Settings → Batch size is {batch.max_size}). Untick {adding.size - Math.max(room, 0)}.
            </Notice>
          ) : null}
          {available === null ? (
            <div className="loading">Loading…</div>
          ) : available.length === 0 ? (
            <p className="muted">No finally approved student is waiting for a batch.</p>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="sel-cell" aria-label="Select" />
                    <th>Student</th>
                    <th>Mobile</th>
                    <th>Student register</th>
                  </tr>
                </thead>
                <tbody>
                  {available.map((a) => (
                    <tr key={a.id} className={adding.has(a.id) ? 'row-selected' : undefined}>
                      <td className="sel-cell">
                        <input
                          type="checkbox"
                          aria-label={`Select ${a.name} to add`}
                          checked={adding.has(a.id)}
                          onChange={() => toggle(adding, setAdding, a.id)}
                        />
                      </td>
                      <td>
                        <b>{a.name}</b>
                        <div className="hint">{a.email}</div>
                      </td>
                      <td className="nowrap">{a.mobile_number}</td>
                      <td className="mono nowrap">{a.approval?.register_id ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      {confirmRemove ? (
        <Modal alert title={`Remove ${removing.size} student${removing.size === 1 ? '' : 's'} from ${batch.name}?`} onClose={() => !busy && setConfirmRemove(false)}>
          <p>They stay finally approved and can be put into another batch. A batch keeps at least one student.</p>
          <div className="actions">
            <button className="btn ghost" onClick={() => setConfirmRemove(false)} disabled={busy} data-autofocus>
              Cancel
            </button>
            <button
              className="btn danger"
              disabled={busy}
              onClick={() =>
                void patch({ remove_ids: [...removing] }, `${removing.size} student${removing.size === 1 ? '' : 's'} removed.`).then(() =>
                  setConfirmRemove(false),
                )
              }
            >
              {busy ? 'Removing…' : 'Yes, remove'}
            </button>
          </div>
        </Modal>
      ) : null}
    </ManageShell>
  );
}
