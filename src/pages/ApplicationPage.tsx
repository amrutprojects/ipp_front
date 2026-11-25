import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, openFile } from '../api';
import { LangToggle } from '../components/AuthLayout';
import { DocumentField, kb } from '../components/DocumentField';
import { StepFields, useFocusWrong, useFormRules } from '../components/FormFields';
import { HelpButton } from '../components/HelpButton';
import { SupportMessage } from '../components/SupportMessage';
import { WelcomeDialog } from '../components/WelcomeDialog';
import { DocumentsReady, fmtDate, Footer, Header, Modal, Notice, useOptions } from '../components/ui';
import { buildModel, fallbackView, viewRows, type FormModel } from '../form';
import { docName, useLang, type Lang } from '../i18n';
import { useStudent } from '../session';
import type { Application, DocumentType, Form, Options, Submitted } from '../types';
import { checkFields, fileIssue } from '../validation';
import { settleWelcome, welcomeOwed } from '../welcome';

const STEPS = ['Basic Details', 'Main Form', 'Upload Documents'] as const;
const DECLARATION =
  'I hereby declare that all the above information is true to my personal knowledge and belief. Also, these are true copies of the original documents. I am aware that if the said information and documents are found to be false, a case will be registered against me under the Indian Penal Code and/or the relevant law, and I will be liable for punishment accordingly.';
const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: 'Submitted',
  REGISTRATION_PENDING: 'Received – pending verification',
  RECEIVED: 'Received',
};

/* The documents of step 3 are exactly the server's list, in its order; a document is required when it is mandatory. */
export const docRequired = (t: DocumentType) => t.is_mandatory;

/* The name of a field error key, for the list of what to correct. */
function labelOf(key: string, options: Options, model: FormModel): string {
  if (key === 'declaration') return 'Declaration';
  const [kind, code] = key.split('.');
  if (kind === 'files' && code) {
    const doc = options.document_types.find((t) => t.code === code);
    return doc ? docName(doc, model.lang) : code;
  }
  return model.label(key);
}
const correctThese = (e: Record<string, string>, options: Options, model: FormModel) => {
  const keys = Object.keys(e).filter((k) => e[k]);
  return keys.length ? `Please correct the highlighted fields: ${keys.map((k) => labelOf(k, options, model)).join(', ')}.` : '';
};

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
      <LangToggle />
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
  const { lang, T } = useLang();
  /* What is asked, under which names and with which choices, in the student's language. */
  const model = useMemo(() => buildModel(options, lang), [options, lang]);

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

  const setField = (f: string, value: string) => {
    setForm((old) => ({ ...old, [f]: value }));
    clearErrors(f);
    markDirty(model.stepOf(f), f, value);
  };
  const clearErrors = (...keys: string[]) => {
    if (keys.some((k) => errors[k])) setErrors((e) => ({ ...e, ...Object.fromEntries(keys.map((k) => [k, ''])) }));
  };
  const rules = useFormRules({ form, model, set: setField, clearErrors });
  const focusWrong = useFocusWrong();

  /*
   * On resume: a saved centre or technology that is no longer offered is cleared (and saved), and the student told. One that is
   * not asked any more is left alone.
   */
  useEffect(() => {
    const centres = model.get('centre_id') && model.choices('centre_id', form);
    if (form.centre_id && centres && !centres.some((c) => c.value === form.centre_id)) {
      setField('centre_id', '');
      rules.setWarning(
        T('आपण निवडलेले केंद्र आता उपलब्ध नाही. कृपया केंद्र पुन्हा निवडा.', 'The center you chose earlier is no longer available. Please choose the center again.'),
      );
    }
    const technologies = model.get('technology') && model.choices('technology', form);
    if (form.technology && technologies?.length && !technologies.some((t) => t.value === form.technology)) {
      setField('technology', '');
      rules.setWarning(
        T(
          'आपण निवडलेले तंत्रज्ञान आता आपल्या जिल्ह्यात उपलब्ध नाही. कृपया तंत्रज्ञान पुन्हा निवडा.',
          'The technology you chose earlier is no longer offered in your district. Please choose a technology again.',
        ),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  const go = (s: number) => {
    setStep(s);
    setFailure('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* Save & Next: the step is checked here first; only a complete step asks "are you sure?". */
  const requestNext = () => {
    const local = checkFields(form, model.rules(model.step(step), form), { T });
    setErrors(local);
    setFailure(correctThese(local, options, model));
    focusWrong(local);
    if (!Object.keys(local).length) setConfirmNext(true);
  };

  /* What is said on top of a refused save: in the student's language when it is the message of one field's check. */
  const refusal = (err: Error) => {
    const key = err instanceof ApiError ? Object.entries(err.fields()).find(([, m]) => m === err.message)?.[0] : undefined;
    return key ? model.said(key, err.message) : err.message;
  };

  /* Confirmed: saved and checked on the server (which also checks active masters and the Aadhaar), then the next step. */
  const saveAndNext = async () => {
    const fields = model.step(step);
    setBusy(true);
    try {
      if (!(await flush())) {
        setConfirmNext(false);
        return fail(NOT_SAVED);
      }
      const data = Object.fromEntries(fields.map((f) => [f.key, form[f.key] ?? '']));
      const res = await api<Application>(`/application/steps/${step}`, { method: 'PUT', realm: 'student', body: { complete: true, data } });
      setConfirmNext(false);
      onApp(res.data);
      go(step + 1);
    } catch (err) {
      setConfirmNext(false);
      if (err instanceof ApiError && err.details.length) {
        setErrors(err.fields());
        focusWrong(err.fields(), true);
      }
      fail(err instanceof Error ? refusal(err) : 'Could not save this step');
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
    const e: Record<string, string> = checkFields(form, model.rules(model.fields, form), { T });
    const has = (code: string) => app.draft_files.some((f) => f.doc_type === code);
    /* Only the listed types count: a draft file of a type no longer listed is ignored (as on the server). */
    for (const t of options.document_types) {
      if (docRequired(t) && !has(t.code)) e[`files.${t.code}`] = T(`${docName(t, lang)} आवश्यक आहे`, `${docName(t, lang)} is required`);
    }
    if (!declaration) e.declaration = 'Please accept the declaration';
    setErrors(e);
    const first = Object.keys(e).map(model.stepOf).sort()[0];
    if (first && first !== step) go(first);
    setFailure(correctThese(e, options, model));
    focusWrong(e);
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
      const first = Object.keys(fields).map(model.stepOf).sort()[0];
      if (first) go(first);
      focusWrong(fields, true);
      fail(err instanceof Error ? refusal(err) : 'Submission failed');
      return;
    }
    /* Submitted: shown as such even if reloading the page afterwards fails. */
    writePending(accountId, {});
    setConfirmSubmit(false);
    setPreview(false);
    setBusy(false);
    await onDone(`Your form has been submitted successfully. Registration ID: ${res.data.registration_id}.`);
  };

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

        {step === 1 || step === 2 ? (
          model.step(step).length ? (
            <StepFields key={step} step={step} model={model} form={form} errors={errors} rules={rules} />
          ) : (
            <p>{T('या टप्प्यात भरण्यासाठी काही नाही. पुढे जाण्यासाठी Save & Next निवडा.', 'There is nothing to fill in here. Choose Save & Next to go on.')}</p>
          )
        ) : null}

        {step === 3 ? (
          <DocumentsStep
            app={app}
            options={options}
            lang={lang}
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
          <FormPreview form={form} options={options} app={app} model={model} />
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
export function docLabel(t: DocumentType, lang: Lang): string {
  const name = docName(t, lang);
  return t.is_mandatory || /optional|ऐच्छिक/i.test(name) ? name : `${name} (${lang === 'mr' ? 'ऐच्छिक' : 'optional'})`;
}

function DocumentsStep(props: {
  app: Application;
  options: Options;
  lang: Lang;
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
            name={docName(t, props.lang)}
            label={docLabel(t, props.lang)}
            file={app.draft_files.find((f) => f.doc_type === t.code)}
            fileError={errors[`files.${t.code}`]}
            uploading={uploading === t.code}
            onUpload={props.onUpload}
            onView={(code) => void openFile(`/application/documents/${code}/file`, 'student').catch(() => undefined)}
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
function FormPreview({ form, options, app, model }: { form: Form; options: Options; app: Application; model: FormModel }) {
  const rows = (step: number): [string, string][] =>
    model
      .step(step)
      .filter((f) => model.asked(f.key, form))
      .map((f) => [f.label, model.text(f.key, form)]);
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
      {section(`Step 1 of 3 – ${STEPS[0]}`, rows(1))}
      {section(`Step 2 of 3 – ${STEPS[1]}`, rows(2))}
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
                      {docLabel(t, model.lang)}
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

/* The submitted form, under the current names of the fields. */
function FormDetails({ app, lang }: { app: Application; lang: Lang }) {
  const reg = app.registration!;
  const view = app.view_fields ?? fallbackView(app.form, reg.display, reg.aadhaar_masked);
  return (
    <dl className="details">
      {viewRows(view, lang).map((r) => (
        <div key={r.key}>
          <dt>{r.label}</dt>
          <dd>{r.text || '—'}</dd>
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
  const { lang } = useLang();
  const reg = app.registration;
  /* A document's current name; one no longer in the list keeps the name it was sent with. */
  const nameOf = (code: string, name: string) => {
    const doc = options.document_types.find((t) => t.code === code);
    return doc ? docName(doc, lang) : name;
  };
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
            <FormDetails app={app} lang={lang} />
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
                      <td>{nameOf(f.doc_type, f.name)}</td>
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
