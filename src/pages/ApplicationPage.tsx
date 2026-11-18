import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { api, ApiError, openFile } from '../api';
import { HelpButton } from '../components/HelpButton';
import { SupportMessage } from '../components/SupportMessage';
import { WelcomeDialog } from '../components/WelcomeDialog';
import { ddmmyyyy, DocumentsReady, Field, fmtDate, Footer, Header, Modal, Notice, useOptions, useRemoteList } from '../components/ui';
import { useStudent } from '../session';
import {
  BASIC_FIELDS,
  MAIN_FIELDS,
  type Application,
  type DocumentType,
  type Form,
  type FormField,
  type Options,
  type Submitted,
  type TechnologyOption,
} from '../types';
import { checkFields, FIELD_LABELS, fileIssue, fileRule, isCgpa, isDisabled, localToday } from '../validation';
import { settleWelcome, welcomeOwed } from '../welcome';

const STEPS = ['Basic Details', 'Main Form', 'Upload Documents'] as const;
const STEP_FIELDS: Record<number, readonly FormField[]> = { 1: BASIC_FIELDS, 2: MAIN_FIELDS };
const DECLARATION =
  'I hereby declare that all the above information is true to my personal knowledge and belief. Also, these are true copies of the original documents. I am aware that if the said information and documents are found to be false, a case will be registered against me under the Indian Penal Code and/or the relevant law, and I will be liable for punishment accordingly.';
const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: 'Submitted',
  REGISTRATION_PENDING: 'Received – pending verification',
  RECEIVED: 'Received',
};
const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/* The documents of step 3 are exactly the server's list, in its order; a document is required when it is mandatory. */
export const docRequired = (t: DocumentType) => t.is_mandatory;
const YES_NO = ['Yes', 'No'];

/* The name of a field error key, for the list of what to correct. */
function labelOf(key: string, options: Options): string {
  if (key === 'declaration') return 'Declaration';
  const [kind, code] = key.split('.');
  const doc = options.document_types.find((t) => t.code === code)?.name ?? code;
  if (kind === 'files' && code) return doc ?? key;
  return FIELD_LABELS[key as FormField] ?? key;
}
const correctThese = (e: Record<string, string>, options: Options) => {
  const keys = Object.keys(e).filter((k) => e[k]);
  return keys.length ? `Please correct the highlighted fields: ${keys.map((k) => labelOf(k, options)).join(', ')}.` : '';
};

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
  /*
   * Arrived straight from /verify: congratulate the student on the account just created. Read on every mount, so a
   * remount while the dialog is open keeps it open; closing it settles the marker, so it does not come back.
   */
  const [showWelcome, setShowWelcome] = useState(welcomeOwed);
  const closeWelcome = useCallback(() => {
    settleWelcome();
    setShowWelcome(false);
  }, []);

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
      {/* Waits for the options, so the dialog opens with the admins' wording rather than the portal's and then changing. */}
      {showWelcome && options ? <WelcomeDialog welcome={options.welcome} onClose={closeWelcome} /> : null}
      <HelpButton />
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
  const ruleCtx = { options };
  /* "Same as current address": the permanent address follows the current one while ticked. */
  const [sameAddress, setSameAddress] = useState(() => !!app.form.current_address && app.form.permanent_address === app.form.current_address);
  /* Why a saved choice was cleared (no longer offered). */
  const [technologyWarning, setTechnologyWarning] = useState('');
  const technologies = useRemoteList<TechnologyOption>(
    form.centre_id ? `/centres/${encodeURIComponent(form.centre_id)}/technologies` : null,
  );

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
    /* Step 3 has nothing to autosave any more: an entry left by an older portal version is dropped, not sent. */
    delete saved[3];
    writePending(accountId, saved);
    if (!Object.keys(saved).length) return;
    pending.current = saved;
    setForm((f) => ({ ...f, ...(saved[1] ?? {}), ...(saved[2] ?? {}) }));
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
  /* A dependent value is cleared at once (and saved) when what it depends on changes. */
  const clearField = (f: FormField) => {
    if (form[f]) setField(f)('');
  };
  const onCurrentAddress = (v: string) => {
    setField('current_address')(v);
    if (sameAddress) setField('permanent_address')(v);
  };
  const onSameAddress = (checked: boolean) => {
    setSameAddress(checked);
    if (checked) setField('permanent_address')(form.current_address ?? '');
  };
  const onDisability = (v: string) => {
    setField('disability_status')(v);
    if (v !== 'Yes') {
      clearField('disability_type');
      clearField('disability_certificate_number');
      setErrors((e) => ({ ...e, disability_type: '', disability_certificate_number: '' }));
    }
  };
  const onCentre = (v: string) => {
    setField('centre_id')(v);
    setField('technology')('');
    setTechnologyWarning('');
  };
  const onGrading = (v: string) => {
    setField('grading_type')(v);
    if (v !== 'CGPA') {
      clearField('cgpa_scale');
      setErrors((e) => ({ ...e, cgpa_scale: '' }));
    }
  };

  /* A saved centre that is no longer active (not in the options) is cleared, with its technology. */
  useEffect(() => {
    if (!Array.isArray(options.centres) || !form.centre_id || options.centres.some((c) => c.id === form.centre_id)) return;
    setField('centre_id')('');
    clearField('technology');
    setTechnologyWarning('The center you chose earlier is no longer available. Please choose the center and technology again.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.centres]);
  /* On resume (or after a reload of the list): a saved technology the centre no longer offers is cleared, and said so. */
  useEffect(() => {
    if (!technologies.path) return;
    if (technologies.status === 'ok' && form.technology && !technologies.items.some((t) => t.code === form.technology)) {
      setField('technology')('');
      setTechnologyWarning('The technology you chose earlier is no longer offered at this center. Please choose a technology again.');
    } else if (technologies.status === 'error' && technologies.error?.status === 404) {
      clearField('technology');
      setTechnologyWarning('The selected center is not available any more. Please choose another center.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [technologies.status, technologies.path]);

  const go = (s: number) => {
    setStep(s);
    setFailure('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* Save & Next: the step is checked here first; only a complete step asks "are you sure?". */
  const requestNext = () => {
    const local = checkFields(form, STEP_FIELDS[step]!, ruleCtx);
    setErrors(local);
    setFailure(correctThese(local, options));
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
      const data = Object.fromEntries(fields.map((f) => [f, form[f] ?? '']));
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
    const issue = fileIssue(
      file,
      options.document_types.find((t) => t.code === code),
    );
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
    const e: Record<string, string> = checkFields(form, [...BASIC_FIELDS, ...MAIN_FIELDS], ruleCtx);
    const has = (code: string) => app.draft_files.some((f) => f.doc_type === code);
    /* Only the listed types count: a draft file of a type no longer listed is ignored (as on the server). */
    for (const t of options.document_types) {
      if (docRequired(t) && !has(t.code)) e[`files.${t.code}`] = `${t.name} is required`;
    }
    if (!declaration) e.declaration = 'Please accept the declaration';
    setErrors(e);
    const first = Object.keys(e).map(stepOf).sort()[0];
    if (first && first !== step) go(first);
    setFailure(correctThese(e, options));
    return !Object.keys(e).length;
  };

  /*
   * The previewed values must be the saved ones: anything still unsaved is sent first, and if that fails nothing is
   * submitted (the server registers the saved draft).
   */
  /* Set synchronously, so a second click (or Enter) before React re-renders cannot send the form twice. */
  const submitting = useRef(false);
  const requestSubmit = () => {
    if (!submitting.current && checkAll()) setConfirmSubmit(true);
  };
  const submit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setFailure('');
    let res: { data: Submitted };
    try {
      if (!(await flush())) {
        submitting.current = false;
        setConfirmSubmit(false);
        setPreview(false);
        setBusy(false);
        return fail(NOT_SAVED);
      }
      const body = { declaration_accepted: true };
      res = await api<Submitted>('/application/submit', { method: 'POST', realm: 'student', body });
    } catch (err) {
      submitting.current = false;
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
  const select = (
    f: FormField,
    items: { value: string; label: string }[],
    placeholder: string,
    extra: { onChange?: (v: string) => void; disabled?: boolean } = {},
  ) => (
    <select
      id={`f-${f}`}
      className="inp"
      value={form[f] ?? ''}
      onChange={(e) => (extra.onChange ?? setField(f))(e.target.value)}
      aria-invalid={!!errors[f] || undefined}
      disabled={extra.disabled}
    >
      <option value="">{placeholder}</option>
      {items.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  const field = (f: FormField, control: ReactNode, wide = false, hint?: ReactNode, required = true, label = FIELD_LABELS[f]) => (
    <Field id={`f-${f}`} label={label} error={errors[f]} wide={wide} hint={hint} required={required}>
      {control}
    </Field>
  );
  /* Yes / No (or any short choice) as radio buttons: a fieldset named by its legend, arrow keys move between them. */
  const radios = (f: FormField, items: string[], onPick: (v: string) => void = setField(f), hint?: ReactNode) => {
    const described = errors[f] ? `f-${f}-err` : hint ? `f-${f}-hint` : undefined;
    return (
      <fieldset className="field radios" aria-describedby={described}>
        <legend className="label">
          {FIELD_LABELS[f]} <span className="req">*</span>
        </legend>
        <div className="radio-row">
          {items.map((v, i) => (
            <label key={v} className="radio">
              <input
                type="radio"
                id={i === 0 ? `f-${f}` : `f-${f}-${i}`}
                name={`f-${f}`}
                value={v}
                checked={form[f] === v}
                onChange={() => onPick(v)}
                aria-invalid={!!errors[f] || undefined}
              />
              {v}
            </label>
          ))}
        </div>
        {errors[f] ? (
          <span className="err" role="alert" id={`f-${f}-err`}>
            {errors[f]}
          </span>
        ) : hint ? (
          <span className="hint" id={`f-${f}-hint`}>
            {hint}
          </span>
        ) : null}
      </fieldset>
    );
  };
  const today = localToday();
  const listOf = (items: string[] | undefined) => (items ?? []).map((v) => ({ value: v, label: v }));

  const allCentres = options.centres ?? [];
  const technologyState = !form.centre_id ? 'none' : technologies.status;
  const noTechnologies = technologyState === 'ok' && technologies.items.length === 0;

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
          <h2 id="step-title">{step === 3 ? STEPS[2] : `Step ${step} of 3 – ${STEPS[step - 1]}`}</h2>
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
            ? 'Please fill in all required fields marked with *'
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
                onChange={(e) => onCurrentAddress(e.target.value)}
                aria-invalid={!!errors.current_address || undefined}
              />,
              true,
            )}
            <label className="check-row wide">
              <input type="checkbox" checked={sameAddress} onChange={(e) => onSameAddress(e.target.checked)} />
              Permanent address is the same as the current address
            </label>
            {field(
              'permanent_address',
              <textarea
                id="f-permanent_address"
                className="inp"
                maxLength={500}
                value={form.permanent_address ?? ''}
                onChange={(e) => setField('permanent_address')(e.target.value)}
                readOnly={sameAddress}
                aria-invalid={!!errors.permanent_address || undefined}
              />,
              true,
              sameAddress ? 'Copied from the current address. Untick the box above to enter a different address.' : undefined,
            )}
            {field('landmark', input('landmark', 'text', { maxLength: 150 }), false, undefined, false)}
            {field(
              'pin_code',
              input('pin_code', 'text', {
                inputMode: 'numeric',
                maxLength: 6,
                placeholder: '6-digit PIN code',
                autoComplete: 'postal-code',
                onChange: (e: ChangeEvent<HTMLInputElement>) => setField('pin_code')(e.target.value.replace(/\D/g, '').slice(0, 6)),
              }),
            )}
            {field(
              'district_id',
              select(
                'district_id',
                (options.districts ?? []).map((d) => ({ value: d.id, label: d.name })),
                'Select district',
              ),
            )}
            {field('taluka', input('taluka', 'text', { maxLength: 100 }), false, undefined, false)}
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
            {field('gender', select('gender', listOf(options.genders), 'Select gender'))}
            {field('marital_status', select('marital_status', listOf(options.marital_statuses), 'Select marital status'))}
            {field(
              'alternate_mobile_number',
              input('alternate_mobile_number', 'tel', { maxLength: 15 }),
              false,
              'Optional. A different number we can reach you on.',
              false,
            )}
            {field(
              'alternate_email',
              input('alternate_email', 'email', { maxLength: 254 }),
              false,
              'Optional. Different from the email ID of your account.',
              false,
            )}
            {radios('disability_status', YES_NO, onDisability)}
            {isDisabled(form) ? (
              <>
                {field('disability_type', input('disability_type', 'text', { maxLength: 100 }))}
                {field(
                  'disability_certificate_number',
                  input('disability_certificate_number', 'text', { maxLength: 50 }),
                  false,
                  'As printed on the certificate: letters, digits, / and - (4–50 characters). You will upload the certificate in step 3.',
                )}
              </>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid">
            {field(
              'region_id',
              select(
                'region_id',
                options.regions.map((r) => ({ value: r.id, label: r.name })),
                'Select course district',
              ),
            )}
            {field(
              'centre_id',
              select(
                'centre_id',
                allCentres.map((c) => ({ value: c.id, label: c.district_name ? `${c.name} (${c.district_name})` : c.name })),
                'Select center',
                { onChange: onCentre },
              ),
            )}
            {field(
              'technology',
              select(
                'technology',
                technologies.items.map((t) => ({ value: t.code, label: t.name })),
                technologyState === 'none'
                  ? 'Select a center first'
                  : technologyState === 'loading'
                    ? 'Loading technologies…'
                    : noTechnologies
                      ? 'No technologies at this center'
                      : 'Select technology',
                {
                  disabled: technologyState !== 'ok' || noTechnologies,
                  onChange: (v) => {
                    setField('technology')(v);
                    setTechnologyWarning('');
                  },
                },
              ),
              false,
              technologyState === 'none' ? 'Choose a center to see the technologies it offers.' : undefined,
            )}
            {technologyWarning ? (
              <div className="wide">
                <Notice tone="warn">{technologyWarning}</Notice>
              </div>
            ) : null}
            {noTechnologies ? (
              <div className="wide">
                <Notice tone="warn">No technologies are currently offered at this center. Please choose another center.</Notice>
              </div>
            ) : technologyState === 'error' && technologies.error?.status !== 404 ? (
              <div className="wide">
                <Notice tone="error">Could not load the technologies for this center. Check your connection and choose the center again.</Notice>
              </div>
            ) : null}
            {field(
              'education_id',
              select(
                'education_id',
                options.educations.map((r) => ({ value: r.id, label: r.name })),
                'Select education qualification',
              ),
            )}
            <h3 className="wide form-section">Qualification details</h3>
            {field(
              'qualification_name',
              input('qualification_name', 'text', { maxLength: 150 }),
              false,
              'Specify the exact qualification, e.g. "B.Sc. Agriculture" when you chose "Other Graduate".',
            )}
            {field('qualification_stream', input('qualification_stream', 'text', { maxLength: 150 }))}
            {field('qualification_board', input('qualification_board', 'text', { maxLength: 200 }))}
            {field('qualification_completed_on', input('qualification_completed_on', 'date', { max: today, min: '1950-01-01' }))}
            {field(
              'grading_type',
              select(
                'grading_type',
                (options.grading_types ?? []).map((g) => ({ value: g.code, label: g.name })),
                'Select grading type',
                { onChange: onGrading },
              ),
            )}
            {isCgpa(form)
              ? field(
                  'cgpa_scale',
                  select(
                    'cgpa_scale',
                    (options.cgpa_scales ?? []).map((n) => ({ value: String(n), label: `Out of ${n}` })),
                    'Select CGPA scale',
                  ),
                )
              : null}
            {field(
              'score',
              input('score', 'text', {
                inputMode: 'decimal',
                maxLength: 6,
                onChange: (e: ChangeEvent<HTMLInputElement>) => {
                  const v = e.target.value.trim();
                  if (/^\d{0,3}(\.\d{0,2})?$/.test(v)) setField('score')(v);
                },
              }),
              false,
              isCgpa(form)
                ? `CGPA, up to 2 decimal places${form.cgpa_scale ? ` (0–${form.cgpa_scale})` : ''}.`
                : form.grading_type === 'PERCENTAGE'
                  ? 'Percentage, 0–100, up to 2 decimal places.'
                  : 'Choose the grading type first.',
              true,
              isCgpa(form) ? 'Score (CGPA)' : form.grading_type === 'PERCENTAGE' ? 'Score (Percentage)' : FIELD_LABELS.score,
            )}
            {field('qualification_class', select('qualification_class', listOf(options.qualification_classes), 'Select class / division'))}
          </div>
        ) : null}

        {step === 3 ? (
          <DocumentsStep
            app={app}
            options={options}
            errors={errors}
            uploading={uploading}
            onUpload={upload}
            onRemove={remove}
            declaration={declaration}
            onDeclaration={(v) => {
              setDeclaration(v);
              setErrors((e) => ({ ...e, declaration: '' }));
            }}
          />
        ) : null}

        <div className="actions">
          {step > 1 ? (
            <button type="button" className="btn ghost" onClick={() => go(step - 1)} disabled={busy}>
              {step === 3 ? 'Previous' : '← Back'}
            </button>
          ) : (
            <span />
          )}
          {step < 3 ? (
            <button type="button" className="btn" onClick={requestNext} disabled={busy}>
              Save &amp; Next →
            </button>
          ) : (
            <div className="row">
              <button type="button" className="btn ghost" onClick={() => checkAll() && setPreview(true)} disabled={busy || !!uploading}>
                Preview Application
              </button>
              <button type="button" className="btn" onClick={requestSubmit} disabled={busy || !!uploading}>
                Submit Application
              </button>
            </div>
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
        <Modal wide title="Preview of your application" onClose={() => setPreview(false)}>
          <p className="hint" style={{ marginTop: -6 }}>
            This is your application as it will be submitted. To change anything, close the preview and edit it; when everything
            is correct, choose Submit Application.
          </p>
          <FormPreview form={form} options={options} app={app} technologies={technologies.items} />
          <div className="actions sticky">
            <span />
            <button className="btn" onClick={() => setPreview(false)} data-autofocus>
              Close
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
              No, go back
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

/* The name of a document as shown: an optional one says so (unless the name already does). */
const docLabel = (t: DocumentType) => (t.is_mandatory || /optional/i.test(t.name) ? t.name : `${t.name} (optional)`);

/*
 * One document: its label, a file area (click, Enter / Space, or drop a file on it) showing the uploaded file's name or
 * "No file chosen", View / Replace / Remove for an uploaded file, and the error.
 */
function DocumentField(props: {
  type: DocumentType;
  draft: Application['draft_files'][number] | undefined;
  fileError?: string;
  uploading: boolean;
  onUpload: (code: string, f: File | undefined) => void;
  onRemove: (code: string) => void;
}) {
  const { type: t, draft, uploading } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const required = docRequired(t);
  const rule = fileRule(t);
  const id = `doc-${t.code}`;
  const pick = () => {
    if (!uploading) inputRef.current?.click();
  };
  const described = [`${id}-hint`, props.fileError ? `${id}-err` : ''].filter(Boolean).join(' ');
  return (
    <div className={`doc-field${props.fileError ? ' invalid' : ''}`}>
      <div className="label" id={`${id}-label`}>
        {docLabel(t)} {required ? <span className="req">*</span> : null}
      </div>
      <button
        type="button"
        id={id}
        className={`dropzone${dragging ? ' dragging' : ''}${draft ? ' has-file' : ''}`}
        aria-labelledby={`${id}-label ${id}-file ${id}-prompt`}
        aria-describedby={described}
        aria-invalid={!!props.fileError || undefined}
        aria-busy={uploading || undefined}
        disabled={uploading}
        onClick={pick}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          if (!dragging) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!uploading) props.onUpload(t.code, e.dataTransfer.files?.[0]);
        }}
      >
        <span className="dz-file" id={`${id}-file`} title={draft?.original_name}>
          {uploading ? 'Uploading…' : (draft?.original_name ?? 'No file chosen')}
        </span>
        {draft && !uploading ? (
          <span className="dz-meta">
            <span aria-hidden="true">✓</span> Uploaded · {kb(draft.size_bytes)}
          </span>
        ) : null}
        <span className="dz-prompt" id={`${id}-prompt`}>
          Click or drag file
        </span>
        <span className="dz-types">
          {rule.short} · max {rule.maxMb}MB
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={rule.accept}
        className="sr-only"
        tabIndex={-1}
        aria-label={`Upload ${t.name}`}
        disabled={uploading}
        onChange={(e) => {
          props.onUpload(t.code, e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {uploading ? (
        <div className="hint" role="status">
          Uploading {t.name}…
        </div>
      ) : null}
      {draft ? (
        <div className="doc-file-actions">
          <button
            type="button"
            className="btn ghost sm"
            aria-label={`View ${t.name}`}
            onClick={() => void openFile(`/application/documents/${t.code}/file`, 'student').catch(() => undefined)}
          >
            View
          </button>
          <button type="button" className="btn ghost sm" aria-label={`Replace ${t.name}`} onClick={pick} disabled={uploading}>
            Replace
          </button>
          <button type="button" className="btn danger sm" aria-label={`Remove ${t.name}`} onClick={() => props.onRemove(t.code)} disabled={uploading}>
            Remove
          </button>
        </div>
      ) : null}
      <span className="hint" id={`${id}-hint`}>
        Accepted formats: {rule.formats.join(', ')} (max {rule.maxMb}MB)
      </span>
      {props.fileError ? (
        <span className="err" role="alert" id={`${id}-err`}>
          {props.fileError}
        </span>
      ) : null}
    </div>
  );
}

function DocumentsStep(props: {
  app: Application;
  options: Options;
  errors: Record<string, string>;
  uploading: string | null;
  onUpload: (code: string, f: File | undefined) => void;
  onRemove: (code: string) => void;
  declaration: boolean;
  onDeclaration: (v: boolean) => void;
}) {
  const { app, options, errors, uploading } = props;
  return (
    <>
      <div className="doc-list">
        {options.document_types.map((t) => (
          <DocumentField
            key={t.code}
            type={t}
            draft={app.draft_files.find((f) => f.doc_type === t.code)}
            fileError={errors[`files.${t.code}`]}
            uploading={uploading === t.code}
            onUpload={props.onUpload}
            onRemove={props.onRemove}
          />
        ))}
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
 * none), and the declaration. Aadhaar is shown in full here so the student can check it.
 */
function FormPreview({
  form,
  options,
  app,
  technologies,
}: {
  form: Form;
  options: Options;
  app: Application;
  technologies: TechnologyOption[];
}) {
  const name = (list: { id: string; name: string }[] | undefined, id: string) => list?.find((x) => x.id === id)?.name ?? '—';
  const aadhaar = (form.aadhaar_number ?? '').replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
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
    ...basicExtraRows(form, name(options.districts, form.district_id)),
  ];
  const main: [string, string][] = [
    [FIELD_LABELS.region_id, name(options.regions, form.region_id)],
    [FIELD_LABELS.centre_id, centreLabel(options, form.centre_id)],
    [FIELD_LABELS.technology, technologies.find((t) => t.code === form.technology)?.name ?? '—'],
    ['Education Qualification', name(options.educations, form.education_id)],
    ...qualificationRows(form, options),
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
              </tr>
            </thead>
            <tbody>
              {options.document_types.map((t) => {
                const draft = app.draft_files.find((f) => f.doc_type === t.code);
                const required = docRequired(t);
                return (
                  <tr key={t.code}>
                    <td>
                      {docLabel(t)}
                      {required ? <span className="req"> *</span> : null}
                    </td>
                    <td>
                      {draft ? (
                        <>
                          {draft.original_name} <span className="muted">({kb(draft.size_bytes)})</span>
                        </>
                      ) : (
                        <span className="muted">Not uploaded</span>
                      )}
                    </td>
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

/* Step 1 rows after Caste, shared by the preview and the submitted view (the district's name given; the taluka is typed). */
function basicExtraRows(form: Form, district: string, display?: Record<string, string | null>): [string, string][] {
  const L = FIELD_LABELS;
  return [
    [L.gender, display?.gender ?? form.gender],
    [L.marital_status, display?.marital_status ?? form.marital_status],
    [L.alternate_mobile_number, form.alternate_mobile_number],
    [L.alternate_email, form.alternate_email],
    ['Current Address', form.current_address],
    [L.permanent_address, form.permanent_address],
    [L.landmark, form.landmark],
    [L.district_id, district],
    [L.taluka, display?.taluka ?? form.taluka],
    [L.pin_code, form.pin_code],
    [L.disability_status, form.disability_status],
    ...(isDisabled(form)
      ? ([
          [L.disability_type, form.disability_type],
          [L.disability_certificate_number, form.disability_certificate_number],
        ] as [string, string][])
      : []),
  ];
}
function centreLabel(options: Options, id: string): string {
  const c = options.centres?.find((x) => x.id === id);
  return c ? `${c.name}${c.district_name ? ` (${c.district_name})` : ''}` : '—';
}
/* The qualification block of step 2. */
function qualificationRows(form: Form, options: Options): [string, string][] {
  const L = FIELD_LABELS;
  const grading = options.grading_types?.find((g) => g.code === form.grading_type)?.name ?? form.grading_type;
  const score = !form.score ? '' : isCgpa(form) ? `${form.score}${form.cgpa_scale ? ` / ${form.cgpa_scale}` : ''}` : form.grading_type === 'PERCENTAGE' ? `${form.score}%` : form.score;
  return [
    [L.qualification_name, form.qualification_name],
    [L.qualification_stream, form.qualification_stream],
    [L.qualification_board, form.qualification_board],
    [L.qualification_completed_on, form.qualification_completed_on ? ddmmyyyy(form.qualification_completed_on) : ''],
    [L.grading_type, grading],
    ...(isCgpa(form) ? ([[L.cgpa_scale, form.cgpa_scale]] as [string, string][]) : []),
    [L.score, score],
    [L.qualification_class, form.qualification_class],
  ];
}

function FormDetails({ form, options, display, aadhaar }: { form: Form; options: Options; display?: Record<string, string | null>; aadhaar?: string | null }) {
  const name = (list: { id: string; name: string }[] | undefined, id: string) => list?.find((x) => x.id === id)?.name;
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
    ...basicExtraRows(form, display?.district ?? name(options.districts, form.district_id) ?? '—', display),
    [FIELD_LABELS.region_id, display?.course_centre ?? name(options.regions, form.region_id) ?? '—'],
    [FIELD_LABELS.centre_id, display?.centre ?? centreLabel(options, form.centre_id)],
    ['Technology', display?.technology ?? options.tracks.find((t) => t.code === form.technology)?.name ?? '—'],
    ['Education Qualification', display?.education ?? name(options.educations, form.education_id) ?? '—'],
    ...qualificationRows(form, options),
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
 * Whom to contact about a submitted form: the message, email and mobile the EDP admins set on /manage/settings (sent
 * with the options), {email} / {mobile} shown as links. No message → nothing.
 */
function SupportContact({ support }: { support?: Options['support'] }) {
  if (!support?.message?.trim()) return null;
  return (
    <Notice tone="info">
      <SupportMessage support={support} />
    </Notice>
  );
}

/* The submitted form, read-only: a submission is final (no edit, no resubmission). */
function SubmittedView({ app, options }: { app: Application; options: Options }) {
  const [error, setError] = useState('');
  const reg = app.registration;
  const anyVerified = app.submitted_files.some((f) => f.verified);

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
              As submitted with your registration.
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
                    {anyVerified ? <th>Verification</th> : null}
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
                      </td>
                      <td className="nowrap">{fmtDate(f.uploaded_at, false)}</td>
                      {/* Only a verified document is marked; nothing is shown while no verification has happened. */}
                      {anyVerified ? <td>{f.verified ? <span className="badge SUBMITTED">Verified</span> : null}</td> : null}
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
