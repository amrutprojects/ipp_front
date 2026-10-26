import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, openFile } from '../api';
import { ddmmyyyy, DocumentsReady, Field, fmtDate, Footer, Header, Modal, Notice, useOptions } from '../components/ui';
import { useStudent } from '../session';
import { BASIC_FIELDS, MAIN_FIELDS, type Application, type Form, type FormField, type Options, type Submitted } from '../types';
import { ACCEPT, BARCODE_RE, checkFields, FIELD_LABELS, fileIssue, MAX_FILE_MB } from '../validation';

const STEPS = ['Basic Details', 'Main Form', 'Upload Documents'] as const;
const STEP_FIELDS: Record<number, readonly FormField[]> = { 1: BASIC_FIELDS, 2: MAIN_FIELDS };
const DECLARATION =
  'I hereby declare that all the above information is true to my personal knowledge and belief. Also, these are true copies of the original documents. I am aware that if the said information and documents are found to be false, a case will be registered against me under the Indian Penal Code and/or the relevant law, and I will be liable for punishment accordingly.';
const STATUS_LABEL: Record<string, string> = {
  REGISTRATION_PENDING: 'Received – pending verification',
  RECEIVED: 'Received',
};
const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/* Which step a server field error belongs to. */
function stepOf(field: string): number {
  if ((BASIC_FIELDS as readonly string[]).includes(field)) return 1;
  if ((MAIN_FIELDS as readonly string[]).includes(field)) return 2;
  return 3;
}

/* Values typed but not yet saved on the server (e.g. the connection dropped), kept in this browser until they are. */
const pendingKey = (accountId: string) => `edp.pending.${accountId}`;
function readPending(accountId: string): Record<number, Record<string, string>> {
  try {
    return JSON.parse(localStorage.getItem(pendingKey(accountId)) ?? '{}');
  } catch {
    return {};
  }
}
function writePending(accountId: string, p: Record<number, Record<string, string>>) {
  try {
    if (Object.keys(p).length) localStorage.setItem(pendingKey(accountId), JSON.stringify(p));
    else localStorage.removeItem(pendingKey(accountId));
  } catch {
    /* storage unavailable: autosave still works online */
  }
}

export default function ApplicationPage() {
  const { user, signOut } = useStudent();
  const options = useOptions();
  const [app, setApp] = useState<Application | null>(null);
  const [loadError, setLoadError] = useState('');
  const [flash, setFlash] = useState('');

  const reload = useCallback(async () => {
    const { data } = await api<Application>('/application', { realm: 'student' });
    setApp(data);
    return data;
  }, []);
  useEffect(() => {
    reload().catch((e: Error) => setLoadError(e.message));
  }, [reload]);

  const right = (
    <>
      <span className="who">
        {user?.first_name} {user?.last_name}
        <br />
        <small>{user?.email}</small>
      </span>
      <button className="btn light sm" onClick={signOut}>
        Logout
      </button>
    </>
  );

  return (
    <>
      <Header right={right} />
      <main className="page">
        {flash ? <Notice tone="ok">{flash}</Notice> : null}
        {loadError ? (
          <Notice tone="error">{loadError}</Notice>
        ) : !app || !options ? (
          <div className="loading">Loading your application…</div>
        ) : app.editable ? (
          <FormWizard
            app={app}
            options={options}
            accountId={user!.id}
            onApp={setApp}
            onDone={async (message) => {
              setFlash(message);
              window.scrollTo({ top: 0, behavior: 'smooth' });
              await reload().catch(() =>
                setFlash(`${message} Please refresh the page to see your registration.`),
              );
            }}
          />
        ) : (
          <SubmittedView app={app} options={options} />
        )}
        <DocumentsReady />
      </main>
      <Footer />
    </>
  );
}

/* ---------- The three steps ---------- */

function FormWizard({
  app,
  options,
  accountId,
  onApp,
  onDone,
}: {
  app: Application;
  options: Options;
  accountId: string;
  onApp: (a: Application) => void;
  onDone: (message: string) => Promise<void>;
}) {
  /* Resume where the student stopped. */
  const [step, setStep] = useState(() => Math.min(Math.max(app.current_step, 1), 3));
  const [form, setForm] = useState<Form>(app.form);
  const [barcodes, setBarcodes] = useState<Record<string, string>>(app.barcodes ?? {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'offline'>('idle');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [declaration, setDeclaration] = useState(false);
  /* The dialogs: "save this step and go on?", the preview of the whole form, and the final "submit now?" on top of it. */
  const [confirmNext, setConfirmNext] = useState(false);
  const [preview, setPreview] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const maxStep = app.current_step;

  /* Autosave: changed values per step, sent 1.2 s after the last keystroke (complete=false: kept as typed). */
  const pending = useRef<Record<number, Record<string, string>>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>();
  /* The autosave being sent right now, so a save or a submit waits for it instead of racing it. */
  const inFlight = useRef<Promise<boolean> | null>(null);
  /* Sends everything typed but not yet saved; false when that failed (the values stay pending in this browser). */
  const flush = useCallback(async (): Promise<boolean> => {
    while (inFlight.current) await inFlight.current;
    clearTimeout(timer.current);
    const steps = Object.keys(pending.current).map(Number);
    if (!steps.length) return true;
    const run = (async () => {
      setSaveState('saving');
      for (const s of steps) {
        const data = pending.current[s]!;
        delete pending.current[s];
        try {
          await api<Application>(`/application/steps/${s}`, { method: 'PUT', realm: 'student', body: { complete: false, data } });
        } catch {
          pending.current[s] = { ...data, ...pending.current[s] };
          writePending(accountId, pending.current);
          setSaveState('offline');
          return false;
        }
      }
      writePending(accountId, pending.current);
      setSaveState('saved');
      return true;
    })();
    inFlight.current = run;
    try {
      return await run;
    } finally {
      inFlight.current = null;
    }
  }, [accountId]);
  const NOT_SAVED = 'Your latest changes could not be saved. Check your internet connection and try again.';
  /* An error that belongs to no field: shown at the top of the step, scrolled into view. */
  const fail = (message: string) => {
    setFailure(message);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const markDirty = (s: number, key: string, value: string) => {
    pending.current[s] = { ...pending.current[s], [key]: value };
    writePending(accountId, pending.current);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 1200);
  };

  /* Unsaved values from an earlier visit (connection lost) come back and are saved now. */
  useEffect(() => {
    const saved = readPending(accountId);
    if (!Object.keys(saved).length) return;
    pending.current = saved;
    setForm((f) => ({ ...f, ...(saved[1] ?? {}), ...(saved[2] ?? {}) }));
    setBarcodes((b) => ({ ...b, ...(saved[3] ?? {}) }));
    void flush();
  }, [accountId, flush]);
  useEffect(() => {
    const online = () => void flush();
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('online', online);
      clearTimeout(timer.current);
    };
  }, [flush]);

  const setField = (f: FormField) => (value: string) => {
    setForm((old) => ({ ...old, [f]: value }));
    if (errors[f]) setErrors((e) => ({ ...e, [f]: '' }));
    markDirty(stepOf(f), f, value);
  };
  const setBarcode = (code: string, value: string) => {
    const v = value.replace(/\D/g, '').slice(0, 18);
    setBarcodes((b) => ({ ...b, [code]: v }));
    setErrors((e) => ({ ...e, [`barcodes.${code}`]: '' }));
    markDirty(3, code, v);
  };

  const go = (s: number) => {
    setStep(s);
    setFailure('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* Save & Next: the step is checked here first; only a complete step asks "are you sure?". */
  const requestNext = () => {
    const local = checkFields(form, STEP_FIELDS[step]!);
    setErrors(local);
    setFailure(Object.keys(local).length ? 'Please correct the highlighted fields.' : '');
    if (!Object.keys(local).length) setConfirmNext(true);
  };

  /* Confirmed: saved and checked on the server (which also checks active masters and the Aadhaar), then the next step. */
  const saveAndNext = async () => {
    const fields = STEP_FIELDS[step]!;
    setBusy(true);
    try {
      if (!(await flush())) {
        setConfirmNext(false);
        return fail(NOT_SAVED);
      }
      const data = Object.fromEntries(fields.map((f) => [f, form[f]]));
      const res = await api<Application>(`/application/steps/${step}`, { method: 'PUT', realm: 'student', body: { complete: true, data } });
      setConfirmNext(false);
      onApp(res.data);
      go(step + 1);
    } catch (err) {
      setConfirmNext(false);
      if (err instanceof ApiError && err.details.length) setErrors(err.fields());
      fail(err instanceof Error ? err.message : 'Could not save this step');
    } finally {
      setBusy(false);
    }
  };

  const upload = async (code: string, file: File | undefined) => {
    if (!file) return;
    const issue = fileIssue(file);
    if (issue) return setErrors((e) => ({ ...e, [`files.${code}`]: issue }));
    setUploading(code);
    setErrors((e) => ({ ...e, [`files.${code}`]: '' }));
    try {
      const fd = new FormData();
      fd.append(code, file);
      const res = await api<Application>('/application/documents', { method: 'POST', realm: 'student', body: fd });
      onApp(res.data);
    } catch (err) {
      setErrors((e) => ({ ...e, [`files.${code}`]: err instanceof ApiError ? (err.fields()[`files.${code}`] ?? err.message) : 'Upload failed' }));
    } finally {
      setUploading(null);
    }
  };
  const remove = async (code: string) => {
    try {
      const res = await api<Application>(`/application/documents/${code}`, { method: 'DELETE', realm: 'student' });
      onApp(res.data);
    } catch (err) {
      setFailure(err instanceof Error ? err.message : 'Could not remove the file');
    }
  };

  /* Before the preview: everything the server will check, so the student is sent to the right step. */
  const checkAll = (): boolean => {
    const e: Record<string, string> = checkFields(form, [...BASIC_FIELDS, ...MAIN_FIELDS]);
    const has = (code: string) => app.draft_files.some((f) => f.doc_type === code);
    for (const t of options.document_types) {
      if (t.is_mandatory && !has(t.code)) e[`files.${t.code}`] = `${t.name} is required`;
      const bc = barcodes[t.code]?.trim() ?? '';
      if (bc && !BARCODE_RE.test(bc)) e[`barcodes.${t.code}`] = 'Barcode must be exactly 18 digits';
      else if (has(t.code) && t.barcode === 'required' && !bc) e[`barcodes.${t.code}`] = `${t.name} barcode is required`;
    }
    if (!declaration) e.declaration = 'Please accept the declaration';
    setErrors(e);
    const first = Object.keys(e).map(stepOf).sort()[0];
    if (first && first !== step) go(first);
    setFailure(Object.keys(e).length ? 'Please correct the highlighted fields.' : '');
    return !Object.keys(e).length;
  };

  /*
   * The previewed values must be the saved ones: anything still unsaved is sent first, and if that fails nothing is
   * submitted (the server registers the saved draft).
   */
  const submit = async () => {
    setBusy(true);
    setFailure('');
    let res: { data: Submitted };
    try {
      if (!(await flush())) {
        setConfirmSubmit(false);
        setPreview(false);
        return fail(NOT_SAVED);
      }
      const body = { declaration_accepted: true, barcodes: Object.fromEntries(Object.entries(barcodes).filter(([, v]) => v !== undefined)) };
      res = await api<Submitted>('/application/submit', { method: 'POST', realm: 'student', body });
    } catch (err) {
      setConfirmSubmit(false);
      setPreview(false);
      setBusy(false);
      const fields = err instanceof ApiError && err.details.length ? err.fields() : {};
      setErrors(fields);
      const first = Object.keys(fields).map(stepOf).sort()[0];
      if (first) go(first);
      fail(err instanceof Error ? err.message : 'Submission failed');
      return;
    }
    /* Submitted: shown as such even if reloading the page afterwards fails. */
    writePending(accountId, {});
    setConfirmSubmit(false);
    setPreview(false);
    setBusy(false);
    await onDone(`Your form has been submitted successfully. Registration ID: ${res.data.registration_id}.`);
  };

  const input = (f: FormField, type = 'text', extra: Record<string, unknown> = {}) => (
    <input
      id={`f-${f}`}
      className="inp"
      type={type}
      value={form[f] ?? ''}
      onChange={(e) => setField(f)(e.target.value)}
      aria-invalid={!!errors[f] || undefined}
      {...extra}
    />
  );
  const select = (f: FormField, items: { value: string; label: string }[], placeholder: string) => (
    <select id={`f-${f}`} className="inp" value={form[f] ?? ''} onChange={(e) => setField(f)(e.target.value)} aria-invalid={!!errors[f] || undefined}>
      <option value="">{placeholder}</option>
      {items.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  const field = (f: FormField, control: ReactNode, wide = false, hint?: string) => (
    <Field id={`f-${f}`} label={FIELD_LABELS[f]} error={errors[f]} wide={wide} hint={hint}>
      {control}
    </Field>
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <ol className="steps" aria-label="Steps">
        {STEPS.map((s, i) => {
          const n = i + 1;
          return (
            <li key={s} className={n === step ? 'on' : n < maxStep || (n === 1 && app.steps.basic_completed) ? 'done' : ''}>
              <button type="button" disabled={n > maxStep} onClick={() => go(n)} aria-current={n === step ? 'step' : undefined}>
                <small>
                  Step {n} of 3{n < maxStep ? ' ✓' : ''}
                </small>
                {s}
              </button>
            </li>
          );
        })}
      </ol>

      <section className="card" aria-labelledby="step-title">
        <div className="row">
          <h2 id="step-title">
            Step {step} of 3 – {STEPS[step - 1]}
          </h2>
          <span className="spacer" />
          <span className="save-state" aria-live="polite">
            {saveState === 'saving'
              ? 'Saving…'
              : saveState === 'saved'
                ? 'All changes saved'
                : saveState === 'offline'
                  ? 'Not saved – no connection. It will be saved when you are back online.'
                  : ''}
          </span>
        </div>
        <p className="sub">
          {step === 3
            ? 'Upload a scanned copy of each document. Fields marked * are mandatory.'
            : 'Your answers are saved as you type, so you can log out and continue later. Fields marked * are mandatory.'}
        </p>
        {failure ? <Notice tone="error">{failure}</Notice> : null}

        {step === 1 ? (
          <div className="grid">
            {field('first_name', input('first_name', 'text', { maxLength: 100, autoComplete: 'given-name' }))}
            {field('last_name', input('last_name', 'text', { maxLength: 100, autoComplete: 'family-name' }))}
            {field('father_name', input('father_name', 'text', { maxLength: 150 }))}
            {field('mother_name', input('mother_name', 'text', { maxLength: 150 }))}
            {/* Read-only: the email ID the account was created and verified with (the API ignores any other value). */}
            {field(
              'email',
              <input id="f-email" className="inp" type="email" value={form.email ?? ''} readOnly aria-readonly="true" />,
              false,
              'The email ID of your account (verified with the OTP); it cannot be changed.',
            )}
            {field('date_of_birth', input('date_of_birth', 'date', { max: today, min: '1920-01-01' }))}
            {field(
              'current_address',
              <textarea
                id="f-current_address"
                className="inp"
                maxLength={500}
                value={form.current_address ?? ''}
                onChange={(e) => setField('current_address')(e.target.value)}
                aria-invalid={!!errors.current_address || undefined}
              />,
              true,
            )}
            {field('aadhaar_number', input('aadhaar_number', 'text', { inputMode: 'numeric', maxLength: 14, placeholder: '12-digit Aadhaar number' }))}
            {field('mobile_number', input('mobile_number', 'tel', { maxLength: 15, autoComplete: 'tel' }))}
            {field(
              'religion',
              select(
                'religion',
                options.religions.map((r) => ({ value: r, label: r })),
                'Select religion',
              ),
            )}
            {field(
              'caste_id',
              select(
                'caste_id',
                options.castes.map((c) => ({ value: c.id, label: c.name })),
                'Select caste',
              ),
            )}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid">
            {field(
              'region_id',
              select(
                'region_id',
                options.regions.map((r) => ({ value: r.id, label: r.name })),
                'Select course centre',
              ),
            )}
            {field(
              'technology',
              select(
                'technology',
                options.tracks.map((t) => ({ value: t.code, label: t.name })),
                'Select technology',
              ),
            )}
            {field(
              'education_id',
              select(
                'education_id',
                options.educations.map((r) => ({ value: r.id, label: r.name })),
                'Select education qualification',
              ),
            )}
          </div>
        ) : null}

        {step === 3 ? (
          <DocumentsStep
            app={app}
            options={options}
            barcodes={barcodes}
            errors={errors}
            uploading={uploading}
            onUpload={upload}
            onRemove={remove}
            onBarcode={setBarcode}
            declaration={declaration}
            onDeclaration={(v) => {
              setDeclaration(v);
              setErrors((e) => ({ ...e, declaration: '' }));
            }}
          />
        ) : null}

        <div className="actions">
          {step > 1 ? (
            <button type="button" className="btn ghost" onClick={() => go(step - 1)}>
              ← Back
            </button>
          ) : (
            <span />
          )}
          {step < 3 ? (
            <button type="button" className="btn" onClick={requestNext} disabled={busy}>
              Save &amp; Next →
            </button>
          ) : (
            <button type="button" className="btn" onClick={() => checkAll() && setPreview(true)} disabled={busy || !!uploading}>
              Preview &amp; Submit
            </button>
          )}
        </div>
      </section>

      {confirmNext ? (
        <Modal alert title={`Save Step ${step} of 3 – ${STEPS[step - 1]}?`} onClose={() => !busy && setConfirmNext(false)}>
          <p>
            Are you sure you want to save these details and go to{' '}
            <b>
              Step {step + 1} of 3 – {STEPS[step]}
            </b>
            ?
          </p>
          <p className="hint">You can come back to this step and change it until you submit the form.</p>
          <div className="actions">
            <button className="btn ghost" onClick={() => setConfirmNext(false)} disabled={busy}>
              No, stay here
            </button>
            <button className="btn" onClick={() => void saveAndNext()} disabled={busy} data-autofocus>
              {busy ? 'Saving…' : 'Yes, save & next'}
            </button>
          </div>
        </Modal>
      ) : null}

      {preview ? (
        <Modal wide title="Preview of your form before submitting" onClose={() => !busy && setPreview(false)}>
          <p className="hint" style={{ marginTop: -6 }}>
            This is your form as it will be submitted. Check every detail; to change anything, go back and edit it now.
          </p>
          <FormPreview form={form} options={options} app={app} barcodes={barcodes} />
          <Notice tone="warn">
            <b>The submission is final.</b> Once you submit, the form cannot be edited or submitted again.
          </Notice>
          <div className="actions sticky">
            <button className="btn ghost" onClick={() => setPreview(false)} disabled={busy}>
              ← Go back and edit
            </button>
            <button className="btn" onClick={() => setConfirmSubmit(true)} disabled={busy} data-autofocus>
              Submit
            </button>
          </div>
        </Modal>
      ) : null}

      {confirmSubmit ? (
        <Modal alert title="Submit your form?" onClose={() => !busy && setConfirmSubmit(false)}>
          <p>
            Are you sure you want to submit your form? It goes to the programme office for verification.{' '}
            <b>Once submitted, it cannot be edited or submitted again.</b>
          </p>
          <div className="actions">
            <button className="btn ghost" onClick={() => setConfirmSubmit(false)} disabled={busy} data-autofocus>
              No, go back to the preview
            </button>
            <button className="btn" onClick={() => void submit()} disabled={busy}>
              {busy ? 'Submitting…' : 'Yes, submit'}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function DocumentsStep(props: {
  app: Application;
  options: Options;
  barcodes: Record<string, string>;
  errors: Record<string, string>;
  uploading: string | null;
  onUpload: (code: string, f: File | undefined) => void;
  onRemove: (code: string) => void;
  onBarcode: (code: string, v: string) => void;
  declaration: boolean;
  onDeclaration: (v: boolean) => void;
}) {
  const { app, options, barcodes, errors, uploading } = props;
  return (
    <>
      <Notice tone="info">
        <b>File upload guidelines.</b> Accepted formats: PDF, JPG, JPEG, PNG. Maximum file size: {MAX_FILE_MB} MB per document.
      </Notice>
      <div className="tbl-wrap mt16">
        <table className="tbl">
          <thead>
            <tr>
              <th>Sr.</th>
              <th>Document</th>
              <th>Required</th>
              <th>File</th>
            </tr>
          </thead>
          <tbody>
            {options.document_types.map((t, i) => {
              const draft = app.draft_files.find((f) => f.doc_type === t.code);
              const fileErr = errors[`files.${t.code}`];
              const bcErr = errors[`barcodes.${t.code}`];
              return (
                <tr key={t.code}>
                  <td>{i + 1}</td>
                  <td>
                    {t.name}
                    {t.barcode ? (
                      <div className="field mt8">
                        <label htmlFor={`bc-${t.code}`}>
                          {t.name} Barcode {t.barcode === 'required' ? <span className="req">*</span> : null}
                        </label>
                        <input
                          id={`bc-${t.code}`}
                          className="inp mono"
                          inputMode="numeric"
                          maxLength={18}
                          placeholder="18-digit barcode number"
                          value={barcodes[t.code] ?? ''}
                          onChange={(e) => props.onBarcode(t.code, e.target.value)}
                          aria-invalid={!!bcErr || undefined}
                        />
                        {bcErr ? <span className="err">{bcErr}</span> : null}
                      </div>
                    ) : null}
                  </td>
                  <td>{t.is_mandatory ? <span className="badge SUBMITTED">Mandatory</span> : <span className="badge">If applicable</span>}</td>
                  <td style={{ minWidth: 240 }}>
                    {draft ? (
                      <div className="row">
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => void openFile(`/application/documents/${t.code}/file`, 'student').catch(() => undefined)}
                        >
                          {draft.original_name}
                        </button>
                        <span className="muted">({kb(draft.size_bytes)})</span>
                        <button type="button" className="btn danger sm" onClick={() => props.onRemove(t.code)}>
                          Remove
                        </button>
                      </div>
                    ) : null}
                    <input
                      type="file"
                      accept={ACCEPT}
                      className="mt8"
                      aria-label={`Upload ${t.name}`}
                      disabled={uploading === t.code}
                      onChange={(e) => {
                        props.onUpload(t.code, e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                    {uploading === t.code ? <div className="hint">Uploading…</div> : null}
                    {fileErr ? <div className="err">{fileErr}</div> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <label className="row mt16" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <input
          type="checkbox"
          aria-label="I accept the declaration"
          checked={props.declaration}
          onChange={(e) => props.onDeclaration(e.target.checked)}
          style={{ marginTop: 4 }}
        />
        <span>
          <b>Declaration:</b> {DECLARATION} <span className="req">*</span>
        </span>
      </label>
      {errors.declaration ? <div className="err">{errors.declaration}</div> : null}
    </>
  );
}

/* ---------- Read-only ---------- */

/*
 * The whole form as it will be submitted, step by step: the details, every document type with the file (or why there is
 * none) and its barcode, and the declaration. Aadhaar is shown in full here so the student can check it.
 */
function FormPreview({
  form,
  options,
  app,
  barcodes,
}: {
  form: Form;
  options: Options;
  app: Application;
  barcodes: Record<string, string>;
}) {
  const name = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? '—';
  const aadhaar = form.aadhaar_number.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
  const basic: [string, string][] = [
    ['First Name', form.first_name],
    ['Last Name', form.last_name],
    ['Father Name', form.father_name],
    ['Mother Name', form.mother_name],
    ['Email', form.email],
    ['Date of Birth', ddmmyyyy(form.date_of_birth)],
    ['Aadhaar Number', aadhaar],
    ['Mobile Number', form.mobile_number],
    ['Religion', form.religion],
    ['Caste', name(options.castes, form.caste_id)],
    ['Current Address', form.current_address],
  ];
  const main: [string, string][] = [
    ['Course Centre', name(options.regions, form.region_id)],
    ['Technology / 3rd module selection', options.tracks.find((t) => t.code === form.technology)?.name ?? '—'],
    ['Education Qualification', name(options.educations, form.education_id)],
  ];
  const section = (title: string, rows: [string, string][]) => (
    <section className="preview-section">
      <h4>{title}</h4>
      <dl className="details">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v || '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
  return (
    <>
      {section(`Step 1 of 3 – ${STEPS[0]}`, basic)}
      {section(`Step 2 of 3 – ${STEPS[1]}`, main)}
      <section className="preview-section">
        <h4>Step 3 of 3 – {STEPS[2]}</h4>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Document</th>
                <th>File</th>
                <th>Barcode</th>
              </tr>
            </thead>
            <tbody>
              {options.document_types.map((t) => {
                const draft = app.draft_files.find((f) => f.doc_type === t.code);
                return (
                  <tr key={t.code}>
                    <td>
                      {t.name}
                      {t.is_mandatory ? <span className="req"> *</span> : null}
                    </td>
                    <td>
                      {draft ? (
                        <>
                          {draft.original_name} <span className="muted">({kb(draft.size_bytes)})</span>
                        </>
                      ) : (
                        <span className="muted">Not uploaded{t.is_mandatory ? '' : ' (if applicable)'}</span>
                      )}
                    </td>
                    {/* A barcode counts only with its document (that is what is stored), so it is shown only then. */}
                    <td className="mono">{draft ? barcodes[t.code] || (t.barcode ? '—' : '') : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="preview-section">
        <h4>Declaration</h4>
        <p className="declared">✓ {DECLARATION}</p>
      </section>
    </>
  );
}

function FormDetails({ form, options, display, aadhaar }: { form: Form; options: Options; display?: Record<string, string | null>; aadhaar?: string | null }) {
  const name = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name;
  const rows: [string, string][] = [
    ['First Name', form.first_name],
    ['Last Name', form.last_name],
    ['Father Name', form.father_name],
    ['Mother Name', form.mother_name],
    ['Email', form.email],
    ['Date of Birth', ddmmyyyy(form.date_of_birth)],
    ['Aadhaar Number', aadhaar ?? (form.aadhaar_number ? `XXXX-XXXX-${form.aadhaar_number.replace(/\D/g, '').slice(-4)}` : '—')],
    ['Mobile Number', form.mobile_number],
    ['Religion', form.religion],
    ['Caste', display?.caste ?? name(options.castes, form.caste_id) ?? '—'],
    ['Course Centre', display?.course_centre ?? name(options.regions, form.region_id) ?? '—'],
    ['Technology / 3rd module', display?.technology ?? options.tracks.find((t) => t.code === form.technology)?.name ?? '—'],
    ['Education Qualification', display?.education ?? name(options.educations, form.education_id) ?? '—'],
    ['Current Address', form.current_address],
  ];
  return (
    <dl className="details">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/*
 * Whom to contact about a submitted form: EDP_SUPPORT_EMAIL / EDP_SUPPORT_MOBILE in the API's .env (sent with the
 * options), so the office can change them without a new portal build. Neither set → the programme office, unnamed.
 */
function SupportContact({ support }: { support?: Options['support'] }) {
  const email = support?.email;
  const mobile = support?.mobile;
  if (!email && !mobile)
    return <Notice tone="info">If you have any query related to your registration, please contact the programme office.</Notice>;
  return (
    <Notice tone="info">
      If you have any query related to your registration, you can contact us on{' '}
      {email ? (
        <>
          email ID <a href={`mailto:${email}`}>{email}</a>
        </>
      ) : null}
      {email && mobile ? ' or ' : null}
      {mobile ? (
        <>
          mobile number{' '}
          <a href={`tel:${mobile.replace(/[^\d+]/g, '')}`} className="nowrap">
            {mobile}
          </a>
        </>
      ) : null}
      .
    </Notice>
  );
}

/* The submitted form, read-only: a submission is final (no edit, no resubmission). */
function SubmittedView({ app, options }: { app: Application; options: Options }) {
  const [error, setError] = useState('');
  const reg = app.registration;

  return (
    <>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <SupportContact support={options.support} />
      <section className="card">
        <div>
          <h2>Your registration</h2>
          <p className="sub" style={{ margin: 0 }}>
            Submitted on {fmtDate(app.submitted_at)}. The submission is final; the form cannot be changed.
          </p>
        </div>
        {reg ? (
          <dl className="details mt16">
            <div>
              <dt>Registration ID</dt>
              <dd className="mono">{reg.registration_id}</dd>
            </div>
            <div>
              <dt>Registration Number</dt>
              <dd className="mono">{reg.registration_number ?? '—'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{STATUS_LABEL[reg.status] ?? reg.status}</dd>
            </div>
            <div>
              <dt>Submitted on</dt>
              <dd>{fmtDate(app.submitted_at)}</dd>
            </div>
          </dl>
        ) : (
          <Notice tone="warn">Your registration is no longer available. Please contact the programme office.</Notice>
        )}
      </section>
      {reg ? (
        <>
          <section className="card">
            <h3>Details</h3>
            <p className="hint" style={{ marginTop: -6 }}>
              As currently recorded by the programme office (including any correction made by them).
            </p>
            <FormDetails form={app.form} options={options} display={reg.display} aadhaar={reg.aadhaar_masked} />
          </section>
          <section className="card">
            <h3>Documents</h3>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>File</th>
                    <th>Uploaded</th>
                    <th>Verification</th>
                  </tr>
                </thead>
                <tbody>
                  {app.submitted_files.map((f) => (
                    <tr key={f.doc_type}>
                      <td>{f.name}</td>
                      <td>
                        <button
                          className="link-btn"
                          onClick={() => void openFile(`/application/documents/${f.doc_type}/file`, 'student').catch(() => setError('Could not open the file'))}
                        >
                          {f.original_name}
                        </button>
                        {app.barcodes[f.doc_type] ? <div className="mono hint">Barcode {app.barcodes[f.doc_type]}</div> : null}
                      </td>
                      <td className="nowrap">{fmtDate(f.uploaded_at, false)}</td>
                      <td>{f.verified ? <span className="badge SUBMITTED">Verified</span> : <span className="badge VERIFIED">Pending</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
