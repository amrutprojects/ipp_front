import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from '../../api';
import { DEFAULT_SUPPORT_MESSAGE, SupportMessage } from '../../components/SupportMessage';
import { Field, fmtDate, Notice } from '../../components/ui';
import { useCanEdit } from '../../session';
import {
  HELP_FIELDS,
  type BatchSettings,
  type FilterChoice,
  type HelpSettings,
  type ListFilterOptions,
  type SupportSettings,
  type WelcomeSettings,
} from '../../types';
import {
  helpIssues,
  supportIssues,
  welcomeIssues,
  type HelpForm,
  type SupportForm,
  type WelcomeForm,
} from '../../validation';
import { SETTING_TITLE, type RejectionSettings } from '../../returns';
import LinkSection from './LinkSection';
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

/* ---------- Sending a form back to the candidate (rejection e-mail and resubmission) ---------- */

function RejectionSection() {
  const state = useSettingsForm<RejectionSettings, { enabled: boolean }>({
    path: '/manage/settings/rejection',
    blank: { enabled: false },
    toForm: (s) => ({ enabled: s.enabled === true }),
    toBody: (f) => ({ enabled: f.enabled }),
    issues: () => ({}),
    saved: 'Setting saved.',
  });
  const { form, edit } = state;
  return (
    <SettingsCard
      id="s-rejection"
      title={SETTING_TITLE}
      sub="Lets the Auditor reject a submitted form back to the candidate, with a reason. The candidate gets an e-mail with the reason, logs in with their existing credentials, corrects the details and saves — which resubmits the form to the Auditor automatically."
      state={state}
      unsaved="Not saved yet: switched off."
    >
      <ShownToggle on={form.enabled} label={SETTING_TITLE} onChange={(v) => edit(() => ({ enabled: v }))} />
      <p className="hint mt8">
        {form.enabled
          ? 'On: the student page shows "Reject and send back to candidate" for a form that is with the Auditor.'
          : 'Off: no rejection e-mail is sent and the Auditor works as before (approve, or correct the form). Forms already sent back stay with their candidate until they resubmit.'}
      </p>
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

/* ---------- Batch size: the exact number of students of a new batch (Batches), and the districts with another one ---------- */

interface SizeForm {
  size: string;
  /* null = an older API: there is one size only. */
  districts: { district_id: string; name: string; size: string }[] | null;
}
const sizeIssue = (text: string) => {
  const n = Number(text);
  return text.trim() && Number.isInteger(n) && n >= 1 && n <= 100 ? '' : 'Enter a whole number from 1 to 100';
};

/* The active districts, to give one a size of its own; null = not loaded. */
function useDistricts(wanted: boolean) {
  const [districts, setDistricts] = useState<FilterChoice[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    api<ListFilterOptions>('/manage/filters', { realm: 'manage' })
      .then((r) => live && setDistricts(r.data.districts))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [wanted]);
  return { districts, failed };
}

function BatchSection() {
  const canEdit = useCanEdit();
  const state = useSettingsForm<BatchSettings, SizeForm>({
    path: '/manage/settings/batch',
    blank: { size: '', districts: null },
    toForm: (saved) => ({
      size: String(saved.size),
      districts: saved.districts?.map((d) => ({ ...d, size: String(d.size) })) ?? null,
    }),
    toBody: (form) => ({
      size: Number(form.size),
      ...(form.districts ? { districts: form.districts.map((d) => ({ district_id: d.district_id, size: Number(d.size) })) } : {}),
    }),
    issues: (form) => ({
      size: sizeIssue(form.size),
      ...Object.fromEntries((form.districts ?? []).map((d, i) => [`districts.${i}.size`, sizeIssue(d.size)])),
    }),
    saved: 'Batch size saved.',
  });
  const { form, errors } = state;
  const list = form.districts;
  const { districts, failed } = useDistricts(canEdit && !!list);
  const [adding, setAdding] = useState('');
  const free = (districts ?? []).filter((d) => !list?.some((x) => x.district_id === d.id));
  const change = (next: NonNullable<SizeForm['districts']>, ...clear: string[]) =>
    state.edit((f) => ({ ...f, districts: next }), 'districts', ...clear);
  const allKeys = (list ?? []).flatMap((_d, i) => [`districts.${i}.size`, `districts.${i}.district_id`]);

  return (
    <SettingsCard
      id="batch"
      title="Batch size"
      sub="Every new batch has exactly this many students, all of one district. A district can have a size of its own. Existing batches are not changed."
      state={state}
      unsaved="Not saved yet: batches use the default size."
    >
      <Field id="batch-size" label="Number of students in one batch (exact, 1–100)" error={errors.size}>
        <input
          id="batch-size"
          className="inp"
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          step={1}
          style={{ maxWidth: 160 }}
          value={form.size}
          disabled={!canEdit}
          onChange={(e) => state.edit((f) => ({ ...f, size: e.target.value }), 'size')}
          aria-invalid={!!errors.size || undefined}
        />
      </Field>
      {list ? (
        <fieldset className="field radios mt16">
          <legend className="label">Districts with another batch size</legend>
          {list.length ? (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>District</th>
                    <th>Students in one batch</th>
                    {canEdit ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {list.map((d, i) => {
                    const issue = errors[`districts.${i}.size`] || errors[`districts.${i}.district_id`];
                    return (
                      <tr key={d.district_id}>
                        <td>{d.name}</td>
                        <td>
                          <input
                            className="inp"
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={100}
                            step={1}
                            style={{ maxWidth: 120 }}
                            aria-label={`Batch size of ${d.name}`}
                            aria-invalid={!!issue || undefined}
                            aria-describedby={issue ? `batch-district-${i}-err` : undefined}
                            value={d.size}
                            disabled={!canEdit}
                            onChange={(e) =>
                              change(
                                list.map((x, j) => (j === i ? { ...x, size: e.target.value } : x)),
                                `districts.${i}.size`,
                                `districts.${i}.district_id`,
                              )
                            }
                          />
                          {issue ? (
                            <span className="err" role="alert" id={`batch-district-${i}-err`}>
                              {issue}
                            </span>
                          ) : null}
                        </td>
                        {canEdit ? (
                          <td>
                            <button
                              type="button"
                              className="btn ghost sm"
                              aria-label={`Remove the batch size of ${d.name}`}
                              onClick={() => change(list.filter((_x, j) => j !== i), ...allKeys)}
                            >
                              Remove
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="hint">None: every district uses the number above.</p>
          )}
          {errors.districts ? (
            <span className="err" role="alert">
              {errors.districts}
            </span>
          ) : null}
          {canEdit ? (
            <div className="row mt8">
              <select
                className="inp"
                style={{ maxWidth: 260 }}
                aria-label="District to add"
                value={adding}
                disabled={!districts}
                onChange={(e) => setAdding(e.target.value)}
              >
                <option value="">{districts ? 'Choose a district' : failed ? 'Could not load the districts' : 'Loading…'}</option>
                {free.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn ghost sm"
                disabled={!adding}
                onClick={() => {
                  const d = free.find((x) => x.id === adding);
                  if (!d) return;
                  change([...list, { district_id: d.id, name: d.name, size: form.size }].sort((a, b) => a.name.localeCompare(b.name)), ...allKeys);
                  setAdding('');
                }}
              >
                + Add district
              </button>
              <span className="hint">Choose Save to apply the changes.</span>
            </div>
          ) : null}
        </fieldset>
      ) : null}
    </SettingsCard>
  );
}

export default function SettingsPage() {
  return (
    <ManageShell>
      <BatchSection />
      <LinkSection />
      <SupportSection />
      <WelcomeSection />
      <HelpSection />
      <RejectionSection />
    </ManageShell>
  );
}
