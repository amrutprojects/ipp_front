import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, apiAll, ApiError } from '../../api';
import { Field, Modal, Notice } from '../../components/ui';
import type { BatchDetail, BatchSettings, Centre } from '../../types';
import { choseOther, pickedDistrict, type BatchPick } from './batchPicks';
import { NO_PLAN, otherCentreText, planBody } from './batchPlan';
import BatchPlanFields, { checkPlan, useTechnologies } from './BatchPlanFields';

/* The boxes of a batch, which the API's errors are shown at (also on the batch page). */
export const BATCH_FIELDS = ['name', 'centre_id', 'start_date', 'end_date', 'delivery_mode', 'technology'];

/* Every active Center Master centre, for a batch's centre (also used by the batch page). */
export function useActiveCentres() {
  const [centres, setCentres] = useState<Centre[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    apiAll<Centre>('/manage/centres', { realm: 'manage', query: { isActive: 'true', sortBy: 'name', sortOrder: 'ASC' } })
      .then((rows) => live && setCentres(rows.filter((c) => c.isActive)))
      .catch((e: Error) => live && setError(e.message || 'Could not load the centres'));
    return () => {
      live = false;
    };
  }, []);
  return { centres, error };
}

/*
 * The batch size setting (Settings → Batch size): the exact number of students of a new batch; null = not loaded. And whether
 * each of them must have a district (the form requires it).
 */
export function useBatchSize(wanted: boolean) {
  const [size, setSize] = useState<number | null>(null);
  const [districtRequired, setDistrictRequired] = useState(true);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    if (!wanted) return;
    api<BatchSettings>('/manage/settings/batch', { realm: 'manage' })
      .then((r) => {
        setSize(r.data.size);
        setDistrictRequired(r.data.district_required ?? true);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [wanted]);
  useEffect(load, [load]);
  return { size, districtRequired, failed: failed && size === null, reload: load };
}

/*
 * "Create batch": the selected students (approved by the Auditor, waiting for a batch, all of one district, exactly the
 * batch size) become a named batch at an active Center Master centre, which goes to the Divisional Officer of that district
 * at once — POST /manage/batches. Its dates, delivery mode and technology may be given now or later. The API checks the
 * number, the district and that each student still waits for a batch.
 */
export default function CreateBatchDialog({
  students,
  onClose,
  onDone,
}: {
  students: BatchPick[];
  /* `refused` = the API refused to create it (the list may be out of date). */
  onClose: (refused: boolean) => void;
  onDone: (message: string) => void;
}) {
  const { centres, error: centresError } = useActiveCentres();
  const { technologies, failed: technologiesFailed } = useTechnologies(true);
  const [name, setName] = useState('');
  const [centreId, setCentreId] = useState('');
  const [plan, setPlan] = useState(NO_PLAN);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [refused, setRefused] = useState(false);
  const [busy, setBusy] = useState(false);
  const n = students.length;
  const centre = centres?.find((c) => c.id === centreId);
  /* Of students without a district: the centre's. */
  const district = pickedDistrict(students) ?? centre?.districtName ?? null;
  const otherCentre = centre ? otherCentreText(choseOther(students, centre), n) : '';

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const local = checkPlan(e.currentTarget, 'batch', plan);
    if (name.trim().length < 2) local.name = 'Enter a batch name (at least 2 characters)';
    if (!centreId) local.centre_id = 'Choose a centre';
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    setError('');
    try {
      const res = await api<BatchDetail>('/manage/batches', {
        method: 'POST',
        realm: 'manage',
        body: { name: name.trim(), centre_id: centreId, ids: students.map((s) => s.id), ...planBody(plan) },
      });
      const { name: saved, students: count } = res.data;
      onDone(`Batch "${saved}" created with ${count} student${count === 1 ? '' : 's'} and sent to the Divisional Officer of ${res.data.district?.name ?? district ?? '—'}.`);
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fields();
        setErrors(fields);
        setError(fields.ids ?? (err.status === 422 && BATCH_FIELDS.some((k) => fields[k]) ? 'Please correct the highlighted fields.' : err.message));
        setRefused(true);
      } else setError('Could not create the batch');
      setBusy(false);
    }
  };

  return (
    <Modal title={`Create a batch of ${n} student${n === 1 ? '' : 's'}`} onClose={() => !busy && onClose(refused)}>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {centresError ? <Notice tone="error">{centresError}</Notice> : null}
      {centres && !centres.length ? <Notice tone="warn">No active centre yet: add one in Center Master first.</Notice> : null}
      <p>
        When it is created, the batch is sent to the Divisional Officer of <b>{district ?? 'the district of its centre'}</b>. Its students cannot be
        changed after that.
      </p>
      <form onSubmit={(e) => void submit(e)} noValidate>
        <div className="grid one">
          <Field id="batch-name" label="Batch name" error={errors.name}>
            <input id="batch-name" className="inp" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
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
          {otherCentre ? (
            <p className="approve-why" role="status">
              {otherCentre}
            </p>
          ) : null}
        </div>
        <div className="grid" style={{ marginTop: 14 }}>
          <BatchPlanFields id="batch" value={plan} onChange={setPlan} errors={errors} technologies={technologies} failed={technologiesFailed} />
        </div>
        <p className="hint" style={{ margin: '10px 0 6px' }}>
          Students ({n}):
        </p>
        <ul className="approve-list">
          {students.map((s) => (
            <li key={s.id}>
              {s.name}
              {s.registration_id ? <span className="hint"> · {s.registration_id}</span> : null}
            </li>
          ))}
        </ul>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={() => onClose(refused)} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={busy || (centres !== null && !centres.length)}>
            {busy ? 'Creating…' : 'Create batch'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
