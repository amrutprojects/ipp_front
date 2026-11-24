import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api';
import { Field, Modal, Notice } from '../../components/ui';
import type { Applicant, BatchDetail, Centre } from '../../types';

/* Active Center Master centres, for a batch's centre (also used by the batch page). */
export function useActiveCentres() {
  const [centres, setCentres] = useState<Centre[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    api<Centre[]>('/manage/centres', { realm: 'manage', query: { page: 1, limit: 100, isActive: 'true', sortBy: 'name', sortOrder: 'ASC' } })
      .then((r) => live && setCentres(r.data.filter((c) => c.isActive)))
      .catch((e: Error) => live && setError(e.message || 'Could not load the centres'));
    return () => {
      live = false;
    };
  }, []);
  return { centres, error };
}

/* The batch size setting (Settings → Batch size). */
export function useBatchSize() {
  const [max, setMax] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    api<{ max_size: number }>('/manage/settings/batch', { realm: 'manage' })
      .then((r) => live && setMax(r.data.max_size))
      .catch(() => live && setMax(null));
    return () => {
      live = false;
    };
  }, []);
  return max;
}

/*
 * "Create batch": the ticked finally approved students (Head Office approved, in no batch) become a named batch at an
 * active Center Master centre — POST /manage/batches. At most the batch size from Settings; more is refused here and by
 * the API.
 */
export default function CreateBatchDialog({
  students,
  onClose,
  onDone,
}: {
  students: Applicant[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { centres, error: centresError } = useActiveCentres();
  const max = useBatchSize();
  const [name, setName] = useState('');
  const [centreId, setCentreId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const tooMany = max !== null && students.length > max;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const local: Record<string, string> = {};
    if (name.trim().length < 2) local.name = 'Enter a batch name (at least 2 characters)';
    if (!centreId) local.centre_id = 'Choose a centre';
    setErrors(local);
    if (Object.keys(local).length || tooMany) return;
    setBusy(true);
    setError('');
    try {
      const res = await api<BatchDetail>('/manage/batches', {
        method: 'POST',
        realm: 'manage',
        body: { name: name.trim(), centre_id: centreId, ids: students.map((s) => s.id) },
      });
      onDone(`Batch "${res.data.name}" created with ${res.data.students} student${res.data.students === 1 ? '' : 's'}.`);
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fields();
        setErrors({ name: fields.name ?? '', centre_id: fields.centre_id ?? '' });
        setError(fields.ids ?? err.message);
      } else setError('Could not create the batch');
      setBusy(false);
    }
  };

  return (
    <Modal title={`Create a batch of ${students.length} student${students.length === 1 ? '' : 's'}`} onClose={() => !busy && onClose()}>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {centresError ? <Notice tone="error">{centresError}</Notice> : null}
      {tooMany ? (
        <Notice tone="warn">
          A batch can hold at most {max} students (Settings → Batch size). Untick {students.length - (max ?? 0)} or raise the batch size.
        </Notice>
      ) : null}
      {centres && !centres.length ? (
        <Notice tone="warn">No active centre yet: add one in Center Master first.</Notice>
      ) : null}
      <form onSubmit={(e) => void submit(e)} noValidate>
        <div className="grid one">
          <Field id="batch-name" label="Batch name" error={errors.name}>
            <input id="batch-name" className="inp" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field id="batch-centre" label="Centre" error={errors.centre_id} hint="From Center Master (active centres).">
            <select id="batch-centre" className="inp" value={centreId} onChange={(e) => setCentreId(e.target.value)} disabled={!centres}>
              <option value="">{centres ? 'Choose a centre' : 'Loading…'}</option>
              {(centres ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code}) – {c.districtName}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="hint" style={{ margin: '10px 0 6px' }}>
          Students ({students.length}
          {max !== null ? ` of at most ${max}` : ''}):
        </p>
        <ul className="approve-list">
          {students.map((s) => (
            <li key={s.id}>
              {s.name}
              {s.approval?.register_id ? <span className="hint"> · {s.approval.register_id}</span> : null}
            </li>
          ))}
        </ul>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={busy || tooMany || (centres !== null && !centres.length)}>
            {busy ? 'Creating…' : 'Create batch'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
