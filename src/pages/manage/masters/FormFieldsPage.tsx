import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api';
import { Field, Notice } from '../../../components/ui';
import { useCanEdit } from '../../../session';
import type { FieldType, MasterField } from '../../../types';
import { MastersShell } from '../ManageLayout';
import MasterList from './MasterList';
import { ConfirmDelete, FormDialog, messageOf, orderIssue, StatusSwitch } from './shared';

const TYPE_LABEL: Record<FieldType, string> = {
  TEXT: 'Text',
  TEXTAREA: 'Long text',
  NUMBER: 'Number',
  DATE: 'Date',
  DROPDOWN: 'Dropdown',
};
const STEP_TITLE: Record<number, string> = { 1: 'Step 1 – Basic Details', 2: 'Step 2 – Main Form' };
const CORE_WHY = 'Core field: the program needs it, so it is always asked. It can be renamed, reordered and given a help text.';

function LockIcon() {
  return (
    <svg className="lock" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/* Where a dropdown's choices are managed; null = its own choices (an own field), or none. */
function choicesPage(f: MasterField): string | null {
  if (f.key === 'district_id') return '/manage/masters/districts';
  if (f.key === 'centre_id') return '/manage/centres';
  if (!f.options_kind || f.options_kind.startsWith('FIELD:')) return null;
  return f.options_kind === 'TECHNOLOGY' ? '/manage/masters/technologies' : `/manage/masters/lists/${encodeURIComponent(f.options_kind)}`;
}

interface ChoiceRow {
  name_en: string;
  name_mr: string;
}
const BLANK_CHOICES: ChoiceRow[] = [
  { name_en: '', name_mr: '' },
  { name_en: '', name_mr: '' },
];
const filledChoices = (choices: ChoiceRow[]) => choices.filter((c) => c.name_en.trim() || c.name_mr.trim());
const choicesIssue = (choices: ChoiceRow[]) => {
  const filled = filledChoices(choices);
  if (filled.some((c) => !c.name_en.trim())) return 'Every choice needs an English name';
  return filled.length ? '' : 'Add at least one choice';
};
const choicesBody = (choices: ChoiceRow[]) => filledChoices(choices).map((c) => ({ name_en: c.name_en.trim(), name_mr: c.name_mr.trim() || undefined }));

/* The choices of a new own dropdown, both names each (later they are edited under Choices). */
function ChoiceRows({ choices, onChange, error }: { choices: ChoiceRow[]; onChange: (choices: ChoiceRow[]) => void; error?: string }) {
  const set = (i: number, key: keyof ChoiceRow, v: string) => onChange(choices.map((c, j) => (i === j ? { ...c, [key]: v } : c)));
  return (
    <fieldset className="field radios">
      <legend className="label">
        Choices <span className="req">*</span>
      </legend>
      {choices.map((c, i) => (
        <div className="choice-row" key={i}>
          <input
            className="inp"
            aria-label={`Choice ${i + 1} (English)`}
            placeholder="English"
            maxLength={100}
            value={c.name_en}
            onChange={(e) => set(i, 'name_en', e.target.value)}
          />
          <input
            className="inp"
            aria-label={`Choice ${i + 1} (Marathi)`}
            placeholder="मराठी"
            lang="mr"
            maxLength={100}
            value={c.name_mr}
            onChange={(e) => set(i, 'name_mr', e.target.value)}
          />
          <button
            type="button"
            className="btn ghost sm"
            aria-label={`Remove choice ${i + 1}`}
            disabled={choices.length < 2}
            onClick={() => onChange(choices.filter((_c, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="link-btn" onClick={() => onChange([...choices, { name_en: '', name_mr: '' }])}>
        + Add a choice
      </button>
      {error ? (
        <span className="err" role="alert">
          {error}
        </span>
      ) : null}
    </fieldset>
  );
}

/* Add an own field: its step, names, type, whether it is required, and a dropdown's choices. */
function AddFieldDialog({ step: at, onClose, onSaved }: { step: number; onClose: () => void; onSaved: (message: string) => void }) {
  const [step, setStep] = useState(String(at));
  const [labelEn, setLabelEn] = useState('');
  const [labelMr, setLabelMr] = useState('');
  const [type, setType] = useState<FieldType>('TEXT');
  const [required, setRequired] = useState(false);
  const [choices, setChoices] = useState<ChoiceRow[]>(BLANK_CHOICES);
  const check = () => ({
    label_en: !labelEn.trim() ? 'English label is required' : '',
    options: type === 'DROPDOWN' ? choicesIssue(choices) : '',
  });
  const save = async () => {
    await api('/manage/fields', {
      method: 'POST',
      realm: 'manage',
      body: {
        step: Number(step),
        label_en: labelEn.trim(),
        label_mr: labelMr.trim() || undefined,
        type,
        required,
        options: type === 'DROPDOWN' ? choicesBody(choices) : undefined,
      },
    });
    onSaved(`Field ${labelEn.trim()} added.`);
  };
  return (
    <FormDialog title="Add a field" submit="Add" check={check} save={save} onClose={onClose}>
      {(errors) => (
        <div className="grid one">
          <Field id="ff-label-en" label="Label (English)" error={errors.label_en}>
            <input id="ff-label-en" className="inp" maxLength={150} value={labelEn} onChange={(e) => setLabelEn(e.target.value)} data-autofocus />
          </Field>
          <Field id="ff-label-mr" label="Label (Marathi)" required={false} error={errors.label_mr} hint="Left blank: the English label is shown in Marathi too.">
            <input id="ff-label-mr" className="inp" maxLength={150} lang="mr" value={labelMr} onChange={(e) => setLabelMr(e.target.value)} />
          </Field>
          <Field id="ff-step" label="Step" error={errors.step} hint='It is asked at the end of the step, under "Additional details".'>
            <select id="ff-step" className="inp" value={step} onChange={(e) => setStep(e.target.value)}>
              <option value="1">{STEP_TITLE[1]}</option>
              <option value="2">{STEP_TITLE[2]}</option>
            </select>
          </Field>
          <Field id="ff-type" label="Type" error={errors.type}>
            <select id="ff-type" className="inp" value={type} onChange={(e) => setType(e.target.value as FieldType)}>
              {Object.entries(TYPE_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {type === 'DROPDOWN' ? <ChoiceRows choices={choices} onChange={setChoices} error={errors.options} /> : null}
          <label className="check">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
            <span>Required: the step cannot be completed without it</span>
          </label>
        </div>
      )}
    </FormDialog>
  );
}

/* Edit a field: names, help, order; required and on / off unless it is core; an own field's step and type too. */
function EditFieldDialog({ field: f, onClose, onSaved }: { field: MasterField; onClose: () => void; onSaved: (message: string) => void }) {
  const [v, setV] = useState({
    label_en: f.label_en,
    label_mr: f.label_mr ?? '',
    help_en: f.help_en ?? '',
    help_mr: f.help_mr ?? '',
    order: String(f.order),
    required: f.required,
    is_active: f.is_active,
    step: String(f.step),
    type: f.type,
  });
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV((old) => ({ ...old, [k]: value }));
  /* Becoming a dropdown: it needs its choices at once. */
  const [choices, setChoices] = useState<ChoiceRow[]>(BLANK_CHOICES);
  const newDropdown = f.custom && v.type === 'DROPDOWN' && f.type !== 'DROPDOWN';
  const save = async () => {
    /* Only what changed. */
    const body: Record<string, unknown> = {};
    if (v.label_en.trim() !== f.label_en) body.label_en = v.label_en.trim();
    for (const k of ['label_mr', 'help_en', 'help_mr'] as const) if (v[k].trim() !== (f[k] ?? '')) body[k] = v[k].trim() || null;
    if (v.order.trim() && Number(v.order) !== f.order) body.order = Number(v.order);
    if (!f.core) {
      if (v.required !== f.required) body.required = v.required;
      if (v.is_active !== f.is_active) body.is_active = v.is_active;
    }
    if (f.custom) {
      if (Number(v.step) !== f.step) body.step = Number(v.step);
      if (v.type !== f.type) body.type = v.type;
      if (newDropdown) body.options = choicesBody(choices);
    }
    if (Object.keys(body).length) await api(`/manage/fields/${encodeURIComponent(f.id)}`, { method: 'PATCH', realm: 'manage', body });
    onSaved(`Field ${v.label_en.trim()} saved.`);
  };
  return (
    <FormDialog
      title={`Edit ${f.label_en}`}
      submit="Save"
      check={() => ({
        label_en: !v.label_en.trim() ? 'English label is required' : '',
        order: orderIssue(v.order),
        options: newDropdown ? choicesIssue(choices) : '',
      })}
      save={save}
      onClose={onClose}
    >
      {(errors) => (
        <div className="grid one">
          {f.core ? (
            <p className="hint core-why">
              <LockIcon /> {CORE_WHY}
            </p>
          ) : null}
          <Field id="fe-label-en" label="Label (English)" error={errors.label_en}>
            <input id="fe-label-en" className="inp" maxLength={150} value={v.label_en} onChange={(e) => set('label_en', e.target.value)} data-autofocus />
          </Field>
          <Field id="fe-label-mr" label="Label (Marathi)" required={false} error={errors.label_mr} hint="Left blank: the English label is shown in Marathi too.">
            <input id="fe-label-mr" className="inp" maxLength={150} lang="mr" value={v.label_mr} onChange={(e) => set('label_mr', e.target.value)} />
          </Field>
          <Field id="fe-help-en" label="Help text (English)" required={false} error={errors.help_en} hint="Shown under the field.">
            <input id="fe-help-en" className="inp" maxLength={300} value={v.help_en} onChange={(e) => set('help_en', e.target.value)} />
          </Field>
          <Field id="fe-help-mr" label="Help text (Marathi)" required={false} error={errors.help_mr}>
            <input id="fe-help-mr" className="inp" maxLength={300} lang="mr" value={v.help_mr} onChange={(e) => set('help_mr', e.target.value)} />
          </Field>
          <Field id="fe-order" label="Order" required={false} error={errors.order} hint="Its place within the step.">
            <input id="fe-order" className="inp" inputMode="numeric" style={{ maxWidth: 140 }} value={v.order} onChange={(e) => set('order', e.target.value)} />
          </Field>
          {f.custom ? (
            <>
              <Field id="fe-step" label="Step" error={errors.step}>
                <select id="fe-step" className="inp" value={v.step} onChange={(e) => set('step', e.target.value)}>
                  <option value="1">{STEP_TITLE[1]}</option>
                  <option value="2">{STEP_TITLE[2]}</option>
                </select>
              </Field>
              <Field id="fe-type" label="Type" error={errors.type} hint="Answers already given are kept as they are.">
                <select id="fe-type" className="inp" value={v.type} onChange={(e) => set('type', e.target.value as FieldType)}>
                  {Object.entries(TYPE_LABEL).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              {newDropdown ? <ChoiceRows choices={choices} onChange={setChoices} error={errors.options} /> : null}
            </>
          ) : null}
          {f.core ? null : (
            <>
              <label className="check">
                <input type="checkbox" checked={v.required} onChange={(e) => set('required', e.target.checked)} />
                <span>Required</span>
              </label>
              <label className="check">
                <input type="checkbox" checked={v.is_active} onChange={(e) => set('is_active', e.target.checked)} />
                <span>Active: asked in the form</span>
              </label>
            </>
          )}
        </div>
      )}
    </FormDialog>
  );
}

/* Masters → Form fields: what the form asks, by step, and under which names. */
export default function FormFieldsPage() {
  const canEdit = useCanEdit();
  const [rows, setRows] = useState<MasterField[] | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  /* Add to a step, edit or delete a field; null = closed. */
  const [adding, setAdding] = useState<number | null>(null);
  const [editing, setEditing] = useState<MasterField | null>(null);
  const [deleting, setDeleting] = useState<MasterField | null>(null);
  /* The own dropdown whose choices are open. */
  const [choicesOf, setChoicesOf] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<MasterField[]>('/manage/fields', { realm: 'manage' });
      setRows([...res.data].sort((a, b) => a.step - b.step || a.order - b.order));
      setError('');
    } catch (e) {
      setError(messageOf(e, 'Could not load the fields'));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const changed = (message: string) => {
    setAdding(null);
    setEditing(null);
    setDeleting(null);
    setDone(message);
    void load();
  };
  const setActive = async (f: MasterField, on: boolean) => {
    setDone('');
    setError('');
    try {
      await api(`/manage/fields/${encodeURIComponent(f.id)}`, { method: 'PATCH', realm: 'manage', body: { is_active: on } });
      setRows((list) => list?.map((x) => (x.id === f.id ? { ...x, is_active: on } : x)) ?? null);
    } catch (e) {
      setError(messageOf(e, 'Could not save'));
    }
  };

  const choices = (f: MasterField) => {
    if (f.type !== 'DROPDOWN') return null;
    const page = choicesPage(f);
    if (page)
      return (
        <Link className="btn ghost sm" to={page} aria-label={`Choices of ${f.label_en}`}>
          Choices
        </Link>
      );
    return f.custom ? (
      <button
        type="button"
        className="btn ghost sm"
        aria-expanded={choicesOf === f.id}
        aria-label={`Choices of ${f.label_en}`}
        onClick={() => setChoicesOf(choicesOf === f.id ? null : f.id)}
      >
        Choices
      </button>
    ) : null;
  };

  return (
    <MastersShell>
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Form fields</h2>
      </div>
      <p className="hint" style={{ marginTop: -4 }}>
        Labels, help texts and own fields appear in every login. <LockIcon /> {CORE_WHY}
      </p>
      {!canEdit ? <Notice tone="info">View only: your account can see the masters but not change them.</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {done ? <Notice tone="ok">{done}</Notice> : null}
      {!rows && !error ? <div className="loading">Loading…</div> : null}
      {rows
        ? [1, 2].map((step) => (
            <section key={step} aria-labelledby={`fields-step-${step}`} style={{ marginBottom: 24 }}>
              <div className="row" style={{ marginBottom: 8 }}>
                <h3 id={`fields-step-${step}`} style={{ margin: 0 }}>
                  {STEP_TITLE[step]}
                </h3>
                <span className="spacer" />
                {canEdit ? (
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => {
                      setDone('');
                      setAdding(step);
                    }}
                    aria-label={`Add a field to ${STEP_TITLE[step]}`}
                  >
                    + Add field
                  </button>
                ) : null}
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Label (English)</th>
                      <th>Label (Marathi)</th>
                      <th>Type</th>
                      <th>Required</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows
                      .filter((f) => f.step === step)
                      .map((f) => (
                        <Fragment key={f.id}>
                          <tr>
                            <td>{f.order}</td>
                            <td>
                              <b>{f.label_en}</b>
                              {f.core ? (
                                <span className="core-mark" title={CORE_WHY}>
                                  <LockIcon /> Core
                                </span>
                              ) : f.custom ? (
                                <span className="badge own-mark">Own field</span>
                              ) : null}
                              {f.help_en ? <div className="hint">{f.help_en}</div> : null}
                            </td>
                            <td lang="mr">{f.label_mr || '—'}</td>
                            <td>{TYPE_LABEL[f.type] ?? f.type}</td>
                            <td>{f.required ? 'Required' : 'Optional'}</td>
                            <td>
                              <StatusSwitch
                                name={f.label_en}
                                on={f.is_active}
                                canEdit={canEdit}
                                why={f.core ? CORE_WHY : undefined}
                                onChange={(on) => setActive(f, on)}
                              />
                            </td>
                            <td>
                              <div className="row-actions">
                                {canEdit ? (
                                  <button
                                    type="button"
                                    className="btn ghost sm"
                                    aria-label={`Edit ${f.label_en}`}
                                    onClick={() => {
                                      setDone('');
                                      setEditing(f);
                                    }}
                                  >
                                    Edit
                                  </button>
                                ) : null}
                                {choices(f)}
                                {canEdit && f.custom ? (
                                  <button
                                    type="button"
                                    className="btn danger sm"
                                    aria-label={`Delete ${f.label_en}`}
                                    onClick={() => {
                                      setDone('');
                                      setDeleting(f);
                                    }}
                                  >
                                    Delete
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                          {choicesOf === f.id ? (
                            <tr>
                              <td colSpan={7} className="history-cell">
                                <MasterList kind={f.options_kind ?? `FIELD:${f.key}`} title={`Choices of ${f.label_en}`} />
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        : null}
      {adding !== null && canEdit ? <AddFieldDialog step={adding} onClose={() => setAdding(null)} onSaved={changed} /> : null}
      {editing && canEdit ? <EditFieldDialog field={editing} onClose={() => setEditing(null)} onSaved={changed} /> : null}
      {deleting && canEdit ? (
        <ConfirmDelete
          name={deleting.label_en}
          note="It is no longer asked or shown. Answers already given stay stored."
          remove={async () => {
            await api(`/manage/fields/${encodeURIComponent(deleting.id)}`, { method: 'DELETE', realm: 'manage' });
            changed(`Field ${deleting.label_en} deleted.`);
          }}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </MastersShell>
  );
}
