import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from '../../api';
import { DEFAULT_SUPPORT_MESSAGE, SupportMessage } from '../../components/SupportMessage';
import { Field, fmtDate, Notice } from '../../components/ui';
import { useCanEdit } from '../../session';
import { HELP_FIELDS, type BatchSettings, type HelpSettings, type SupportSettings, type WelcomeSettings } from '../../types';
import {
  helpIssues,
  supportIssues,
  welcomeIssues,
  type HelpForm,
  type SupportForm,
  type WelcomeForm,
} from '../../validation';
import { ManageShell } from './ManageLayout';

/*
 * Settings (/manage/settings): the content the student portal shows — the support contact line after a submission, the
 * congratulations dialog once an account is created, and the Help button's contact details. Each is its own
 * /manage/settings row: everyone can read it, only an admin can save it (a viewer sees the values read-only).
 */

interface Options<T, F> {
  /* The endpoint under /manage/settings, the same path for GET and PUT. */
  path: string;
  blank: F;
  toForm: (saved: T) => F;
  toBody: (form: F) => unknown;
  issues: (form: F) => Record<string, string>;
  saved: string;
}

/*
 * One settings row as a form: loaded on mount, checked here before it is sent, and saved with PUT. Field errors from
 * the API are keyed as this form keys them (body.fields.0.label → fields.0.label), so a 422 highlights the same boxes.
 */
function useSettingsForm<T extends { updated_at: string | null; updated_by: string | null }, F>(o: Options<T, F>) {
  const [saved, setSaved] = useState<T | null>(null);
  const [form, setForm] = useState<F>(o.blank);
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState(false);
  /* The conversions change identity on every render; a ref keeps them out of the effect's dependencies. */
  const opts = useRef(o);
  opts.current = o;

  useEffect(() => {
    let live = true;
    api<T>(o.path, { realm: 'manage' })
      .then((r) => {
        if (!live) return;
        setSaved(r.data);
        setForm(opts.current.toForm(r.data));
      })
      .catch((e: Error) => live && setLoadError(e.message || 'Could not load the settings'));
    return () => {
      live = false;
    };
  }, [o.path]);

  /* Edits the form, drops the "Saved" flash and clears the errors of the boxes being edited. */
  const edit = (next: (f: F) => F, ...clear: string[]) => {
    setForm(next);
    setFlash('');
    if (clear.some((k) => errors[k])) setErrors((e) => ({ ...e, ...Object.fromEntries(clear.map((k) => [k, ''])) }));
  };

  const save = async () => {
    if (busy) return;
    const local = opts.current.issues(form);
    setErrors(local);
    setFlash('');
    if (Object.values(local).some(Boolean)) {
      setFailure('Please correct the highlighted fields.');
      return;
    }
    setBusy(true);
    setFailure('');
    try {
      const res = await api<T>(o.path, { method: 'PUT', realm: 'manage', body: opts.current.toBody(form) });
      setSaved(res.data);
      setForm(opts.current.toForm(res.data));
      setFlash(opts.current.saved);
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fields();
        if (Object.keys(fields).length) setErrors(fields);
        setFailure(err.status === 422 && Object.keys(fields).length ? 'Please correct the highlighted fields.' : err.message);
      } else setFailure('Could not save the settings');
    } finally {
      setBusy(false);
    }
  };

  return { saved, form, edit, errors, loadError, failure, flash, busy, save };
}

/* The frame every section shares: heading, what it is for, the load state and the save messages. */
function SettingsCard<T extends { updated_at: string | null; updated_by: string | null }, F>({
  id,
  title,
  sub,
  state,
  extraAction,
  unsaved = 'Not saved yet: the portal is using its default wording.',
  children,
}: {
  id: string;
  title: string;
  sub: string;
  state: ReturnType<typeof useSettingsForm<T, F>>;
  /* A button beside Save, for whatever this section alone offers (e.g. Reset to default text). */
  extraAction?: ReactNode;
  /* Shown while the row has never been saved (the defaults are in use). */
  unsaved?: string;
  children: ReactNode;
}) {
  const canEdit = useCanEdit();
  const { saved, loadError, failure, flash } = state;
  return (
    <section className="card" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      <p className="sub">{sub}</p>
      {loadError ? <Notice tone="error">{loadError}</Notice> : null}
      {!saved && !loadError ? <div className="loading">Loading…</div> : null}
      {saved ? (
        <>
          {!canEdit ? <Notice tone="info">View only: your account can see these settings but not change them.</Notice> : null}
          {flash ? <Notice tone="ok">{flash}</Notice> : null}
          {failure ? <Notice tone="error">{failure}</Notice> : null}
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void state.save();
            }}
          >
            {children}
            {saved.updated_at ? (
              <p className="hint">
                Last updated {fmtDate(saved.updated_at)}
                {saved.updated_by ? ` by ${saved.updated_by}` : ''}
              </p>
            ) : (
              <p className="hint">{unsaved}</p>
            )}
            <SaveRow busy={state.busy}>{extraAction}</SaveRow>
          </form>
        </>
      ) : null}
    </section>
  );
}

/* Save (and any section-specific button beside it); nothing for a viewer, who cannot change these settings. */
function SaveRow({ busy, children }: { busy: boolean; children?: ReactNode }) {
  const canEdit = useCanEdit();
  if (!canEdit) return null;
  return (
    <div className="actions">
      {children}
      <button type="submit" className="btn" disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

/* "Show this to students": the content is kept, it just stops being shown. */
function ShownToggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  const canEdit = useCanEdit();
  return (
    <label className="check">
      <input type="checkbox" checked={on} disabled={!canEdit} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/* ---------- The support contact line (shown after a submission and in the portal's emails) ---------- */

function SupportSection() {
  const canEdit = useCanEdit();
  const state = useSettingsForm<SupportSettings, SupportForm>({
    path: '/manage/settings/support',
    blank: { message: '', email: '', mobile: '' },
    toForm: (s) => ({ message: s.message ?? '', email: s.email ?? '', mobile: s.mobile ?? '' }),
    toBody: (f) => ({ message: f.message.trim(), email: f.email.trim() || null, mobile: f.mobile.trim() || null }),
    issues: supportIssues,
    saved: 'Support contact saved.',
  });
  const { form, edit, errors, busy } = state;
  const preview = { message: form.message, email: form.email.trim() || null, mobile: form.mobile.trim() || null };

  return (
    <SettingsCard
      id="s-support"
      title="Support contact"
      sub="The contact line students see after submitting their registration."
      state={state}
      extraAction={
        <button type="button" className="btn ghost" onClick={() => edit((f) => ({ ...f, message: DEFAULT_SUPPORT_MESSAGE }), 'message')} disabled={busy}>
          Reset to default text
        </button>
      }
    >
      <div className="grid">
        <Field id="s-message" label="Message" wide error={errors.message} hint="Use {email} and {mobile} where the email and mobile number should appear.">
          <textarea
            id="s-message"
            className="inp"
            value={form.message}
            maxLength={500}
            readOnly={!canEdit}
            onChange={(e) => edit((f) => ({ ...f, message: e.target.value }), 'message')}
            aria-invalid={!!errors.message || undefined}
          />
        </Field>
        <Field id="s-email" label="Email" required={false} error={errors.email}>
          <input
            id="s-email"
            className="inp"
            type="email"
            value={form.email}
            maxLength={254}
            autoComplete="off"
            readOnly={!canEdit}
            onChange={(e) => edit((f) => ({ ...f, email: e.target.value }), 'email')}
            aria-invalid={!!errors.email || undefined}
          />
        </Field>
        <Field id="s-mobile" label="Mobile" required={false} error={errors.mobile}>
          <input
            id="s-mobile"
            className="inp"
            type="tel"
            value={form.mobile}
            maxLength={20}
            autoComplete="off"
            readOnly={!canEdit}
            onChange={(e) => edit((f) => ({ ...f, mobile: e.target.value }), 'mobile')}
            aria-invalid={!!errors.mobile || undefined}
          />
        </Field>
      </div>
      <div className="mt16" role="group" aria-labelledby="s-preview-title">
        <h3 id="s-preview-title">Preview</h3>
        {preview.message.trim() ? (
          <Notice tone="info">
            <SupportMessage support={preview} />
          </Notice>
        ) : (
          <p className="hint">No message: students will not see a support contact.</p>
        )}
      </div>
    </SettingsCard>
  );
}

/* ---------- The congratulations dialog (shown once the mobile OTP is verified and the account exists) ---------- */

function WelcomeSection() {
  const canEdit = useCanEdit();
  const state = useSettingsForm<WelcomeSettings, WelcomeForm>({
    path: '/manage/settings/welcome',
    blank: { enabled: true, title: '', message: '', button_label: '' },
    toForm: (s) => ({
      enabled: s.enabled !== false,
      title: s.title ?? '',
      message: s.message ?? '',
      button_label: s.button_label ?? '',
    }),
    toBody: (f) => ({
      enabled: f.enabled,
      title: f.title.trim(),
      message: f.message.trim(),
      button_label: f.button_label.trim(),
    }),
    issues: welcomeIssues,
    saved: 'Welcome message saved.',
  });
  const { form, edit, errors } = state;

  return (
    <SettingsCard
      id="s-welcome"
      title="Welcome message"
      sub="The congratulations popup students see right after the OTP is verified and their account is created."
      state={state}
    >
      <ShownToggle on={form.enabled} label="Show this popup to students" onChange={(v) => edit((f) => ({ ...f, enabled: v }))} />
      <div className="grid mt16">
        <Field id="w-title" label="Title" wide error={errors.title} hint="The heading of the popup, e.g. Congratulations!">
          <input
            id="w-title"
            className="inp"
            value={form.title}
            maxLength={120}
            readOnly={!canEdit}
            onChange={(e) => edit((f) => ({ ...f, title: e.target.value }), 'title')}
            aria-invalid={!!errors.title || undefined}
          />
        </Field>
        <Field id="w-message" label="Message" wide error={errors.message} hint="What the student reads below the heading. Line breaks are kept.">
          <textarea
            id="w-message"
            className="inp"
            rows={4}
            value={form.message}
            maxLength={1000}
            readOnly={!canEdit}
            onChange={(e) => edit((f) => ({ ...f, message: e.target.value }), 'message')}
            aria-invalid={!!errors.message || undefined}
          />
        </Field>
        <Field id="w-button" label="Button label" required={false} error={errors.button_label} hint="Leave blank for the portal's own wording.">
          <input
            id="w-button"
            className="inp"
            value={form.button_label}
            maxLength={60}
            readOnly={!canEdit}
            onChange={(e) => edit((f) => ({ ...f, button_label: e.target.value }), 'button_label')}
            aria-invalid={!!errors.button_label || undefined}
          />
        </Field>
      </div>
      <div className="mt16" role="group" aria-labelledby="w-preview-title">
        <h3 id="w-preview-title">Preview</h3>
        {form.enabled ? (
          <div className="setting-preview">
            <b>{form.title.trim() || 'Congratulations! Your account is created'}</b>
            <p>{form.message.trim() || 'Your mobile number is verified and your account is ready.'}</p>
            <span className="btn sm">{form.button_label.trim() || 'Start filling my form'}</span>
          </div>
        ) : (
          <p className="hint">Switched off: students go straight to the form after verifying their mobile number.</p>
        )}
      </div>
    </SettingsCard>
  );
}

/* ---------- The Help button (bottom-right on every portal screen) ---------- */

const blankHelpRows = () => Array.from({ length: HELP_FIELDS }, () => ({ label: '', value: '' }));

function HelpSection() {
  const canEdit = useCanEdit();
  const state = useSettingsForm<HelpSettings, HelpForm>({
    path: '/manage/settings/help',
    blank: { enabled: true, title: '', intro: '', fields: blankHelpRows() },
    toForm: (s) => ({
      enabled: s.enabled !== false,
      title: s.title ?? '',
      intro: s.intro ?? '',
      /* Always HELP_FIELDS rows, so every line has a box whether or not it has been filled in. */
      fields: blankHelpRows().map((row, i) => ({ label: s.fields?.[i]?.label ?? row.label, value: s.fields?.[i]?.value ?? row.value })),
    }),
    /* All rows go as they are (blank ones included), so a server error on a row points at the row on screen. */
    toBody: (f) => ({
      enabled: f.enabled,
      title: f.title.trim(),
      intro: f.intro.trim(),
      fields: f.fields.map((row) => ({ label: row.label.trim(), value: row.value.trim() })),
    }),
    issues: helpIssues,
    saved: 'Help button saved.',
  });
  const { form, edit, errors } = state;

  const setRow = (i: number, key: 'label' | 'value', v: string) =>
    edit((f) => ({ ...f, fields: f.fields.map((row, j) => (i === j ? { ...row, [key]: v } : row)) }), `fields.${i}.${key}`, 'fields');

  return (
    <SettingsCard
      id="s-help"
      title="Help button"
      sub={`The Help button in the bottom-right corner of every portal screen: a heading and up to ${HELP_FIELDS} contact lines.`}
      state={state}
    >
      <ShownToggle on={form.enabled} label="Show the Help button to students" onChange={(v) => edit((f) => ({ ...f, enabled: v }))} />
      <div className="grid mt16">
        <Field id="h-title" label="Title" error={errors.title} hint="The heading of the panel, e.g. Need help?">
          <input
            id="h-title"
            className="inp"
            value={form.title}
            maxLength={120}
            readOnly={!canEdit}
            onChange={(e) => edit((f) => ({ ...f, title: e.target.value }), 'title')}
            aria-invalid={!!errors.title || undefined}
          />
        </Field>
        <Field id="h-intro" label="Intro" required={false} error={errors.intro} hint="One line above the contact details. Optional.">
          <input
            id="h-intro"
            className="inp"
            value={form.intro}
            maxLength={300}
            readOnly={!canEdit}
            onChange={(e) => edit((f) => ({ ...f, intro: e.target.value }), 'intro')}
            aria-invalid={!!errors.intro || undefined}
          />
        </Field>
      </div>
      <div className="mt16">
        <h3>Contact details</h3>
        <p className="hint">
          Each line is a name and its value, e.g. Contact Number / 8530092236 or Email ID / support@sumago.ai. An email address or a phone number
          is shown as a link. Leave a line blank to drop it.
        </p>
        {errors.fields ? (
          <span className="err" role="alert">
            {errors.fields}
          </span>
        ) : null}
        {form.fields.map((row, i) => (
          <div className="grid mt8" key={i}>
            <Field id={`h-label-${i}`} label={`Field ${i + 1} name`} required={false} error={errors[`fields.${i}.label`]}>
              <input
                id={`h-label-${i}`}
                className="inp"
                value={row.label}
                maxLength={60}
                autoComplete="off"
                readOnly={!canEdit}
                onChange={(e) => setRow(i, 'label', e.target.value)}
                aria-invalid={!!errors[`fields.${i}.label`] || undefined}
              />
            </Field>
            <Field id={`h-value-${i}`} label={`Field ${i + 1} value`} required={false} error={errors[`fields.${i}.value`]}>
              <input
                id={`h-value-${i}`}
                className="inp"
                value={row.value}
                maxLength={200}
                autoComplete="off"
                readOnly={!canEdit}
                onChange={(e) => setRow(i, 'value', e.target.value)}
                aria-invalid={!!errors[`fields.${i}.value`] || undefined}
              />
            </Field>
          </div>
        ))}
      </div>
      <div className="mt16" role="group" aria-labelledby="h-preview-title">
        <h3 id="h-preview-title">Preview</h3>
        {!form.enabled ? (
          <p className="hint">Switched off: students will not see a Help button.</p>
        ) : (
          <div className="setting-preview">
            <b>{form.title.trim() || 'Need help?'}</b>
            {form.intro.trim() ? <p>{form.intro}</p> : null}
            <dl className="help-list">
              {form.fields
                .filter((row) => row.label.trim() && row.value.trim())
                .map((row, i) => (
                  <Fragment key={i}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </Fragment>
                ))}
            </dl>
            {form.fields.every((row) => !row.label.trim() || !row.value.trim()) ? <p className="hint">No contact details yet.</p> : null}
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

/* ---------- Batch size: the exact number of students of a new batch (Batches) ---------- */

function BatchSection() {
  const canEdit = useCanEdit();
  const state = useSettingsForm<BatchSettings, { size: string }>({
    path: '/manage/settings/batch',
    blank: { size: '' },
    toForm: (saved) => ({ size: String(saved.size) }),
    toBody: (form) => ({ size: Number(form.size) }),
    issues: (form) => {
      const n = Number(form.size);
      return { size: form.size.trim() && Number.isInteger(n) && n >= 1 && n <= 100 ? '' : 'Enter a whole number from 1 to 100' };
    },
    saved: 'Batch size saved.',
  });
  return (
    <SettingsCard
      id="batch"
      title="Batch size"
      sub="Every new batch has exactly this many students, all of one district. Existing batches are not changed."
      state={state}
      unsaved="Not saved yet: batches use the default size."
    >
      <Field id="batch-size" label="Number of students in one batch (exact, 1–100)" error={state.errors.size}>
        <input
          id="batch-size"
          className="inp"
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          step={1}
          style={{ maxWidth: 160 }}
          value={state.form.size}
          disabled={!canEdit}
          onChange={(e) => state.edit((f) => ({ ...f, size: e.target.value }), 'size')}
          aria-invalid={!!state.errors.size || undefined}
        />
      </Field>
    </SettingsCard>
  );
}

export default function SettingsPage() {
  return (
    <ManageShell>
      <BatchSection />
      <SupportSection />
      <WelcomeSection />
      <HelpSection />
    </ManageShell>
  );
}
