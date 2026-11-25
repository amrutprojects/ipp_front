import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api';
import { Field, Notice } from '../../../components/ui';
import { hasChoices } from '../../../form';
import { useCanEdit } from '../../../session';
import type { FieldType, MasterField } from '../../../types';
import { MastersShell } from '../ManageLayout';
import { checksText } from './fieldChecks';
import MasterList from './MasterList';
import { ConfirmDelete, FormDialog, messageOf, orderIssue, StatusSwitch, ViewOnlyNotice } from './shared';
import ValidationSection, { useValidation } from './ValidationSection';

const TYPES: [group: string, types: [FieldType, string][]][] = [
  [
    'Writing',
    [
      ['TEXT', 'Text'],
      ['TEXTAREA', 'Long text'],
      ['EMAIL', 'Email'],
      ['MOBILE', 'Mobile number'],
      ['URL', 'Web address (URL)'],
    ],
  ],
  [
    'Numbers and dates',
    [
      ['NUMBER', 'Number'],
      ['DATE', 'Date'],
      ['TIME', 'Time'],
      ['MONTH', 'Month and year'],
      ['YEAR', 'Year'],
    ],
  ],
  [
    'Choosing',
    [
      ['DROPDOWN', 'Dropdown (choose one)'],
      ['RADIO', 'Radio buttons (choose one)'],
      ['CHECKBOXES', 'Checkboxes (choose several)'],
      ['YES_NO', 'Yes / No'],
      ['CONSENT', 'Tick box (declaration)'],
    ],
  ],
];
const TYPE_LABEL = Object.fromEntries(TYPES.flatMap(([, types]) => types)) as Partial<Record<FieldType, string>>;
/* In the table without what explains it in the list: "Dropdown". A type of a newer API is shown as it is named there. */
const typeName = (type: FieldType) => TYPE_LABEL[type]?.replace(/ \((choose|declaration).*\)$/, '') ?? type;
const FILE_HINT = 'For a file, add a document in Masters → Documents.';

function TypeOptions({ current, types }: { current: FieldType; types?: FieldType[] }) {
  const groups = TYPES.map(([group, all]) => [group, types ? all.filter(([k]) => types.includes(k)) : all] as const);
  return (
    <>
      {TYPE_LABEL[current] ? null : <option value={current}>{current}</option>}
      {groups
        .filter(([, all]) => all.length)
        .map(([group, all]) => (
          <optgroup key={group} label={group}>
            {all.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </optgroup>
        ))}
    </>
  );
}
const STEP_TITLE: Record<number, string> = { 1: 'Step 1 – Basic Details', 2: 'Step 2 – Main Form' };
/* What the rest of the program does without an answer to the field. */
const WITHOUT: Record<string, string> = {
  first_name: "Not asked: the name of the student's account is used.",
  last_name: "Not asked: the name of the student's account is used.",
  mobile_number: "Not asked: the mobile number of the student's account is used.",
  email: "It is the email ID of the student's account, which students cannot change here. Not asked: the account keeps it.",
  aadhaar_number: 'Not asked, or left blank: a second form of the same person is not noticed.',
  district_id: 'Not asked, or left blank: every technology is offered, and a batch is of the district of its centre.',
  disability_status: 'Not asked: neither are the disability details.',
  grading_type: 'Not asked: neither is the CGPA scale.',
};

/* The types a field can be given. */
const typesOf = (f: MasterField): FieldType[] | undefined => f.types ?? (f.custom ? undefined : [f.type]);
function typeHint(f: MasterField): string {
  const types = typesOf(f);
  if (!types || types.length > 2) return `Answers already given are kept as they are. ${FILE_HINT}`;
  return types.length === 1 ? 'The type of this field stays: its answers are used elsewhere too.' : 'One choice of its list.';
}

/* Where a dropdown's choices are managed; null = its own choices (FIELD:<key>), or none. */
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

/* The choices of a new dropdown, radio buttons or checkboxes, both names each (later they are edited under Choices). */
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

/* Add an own field: its step, names, type, choices, validation, and whether it is required. */
function AddFieldDialog({ step: at, onClose, onSaved }: { step: number; onClose: () => void; onSaved: (message: string) => void }) {
  const [step, setStep] = useState(String(at));
  const [labelEn, setLabelEn] = useState('');
  const [labelMr, setLabelMr] = useState('');
  const [type, setType] = useState<FieldType>('TEXT');
  const [required, setRequired] = useState(false);
  const [choices, setChoices] = useState<ChoiceRow[]>(BLANK_CHOICES);
  const validation = useValidation(null, type);
  const check = () => ({
    label_en: !labelEn.trim() ? 'English label is required' : '',
    options: hasChoices(type) ? choicesIssue(choices) : '',
    ...validation.check(),
  });
  const save = async () => {
    await validation.sending((v) =>
      api('/manage/fields', {
        method: 'POST',
        realm: 'manage',
        body: {
          step: Number(step),
          label_en: labelEn.trim(),
          label_mr: labelMr.trim() || undefined,
          type,
          required,
          options: hasChoices(type) ? choicesBody(choices) : undefined,
          validation: v ?? undefined,
        },
      }),
    );
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
          <Field id="ff-type" label="Type" error={errors.type} hint={FILE_HINT}>
            <select id="ff-type" className="inp" value={type} onChange={(e) => setType(e.target.value as FieldType)}>
              <TypeOptions current={type} />
            </select>
          </Field>
          {hasChoices(type) ? <ChoiceRows choices={choices} onChange={setChoices} error={errors.options} /> : null}
          <ValidationSection v={validation} type={type} label={labelEn} />
          <label className="check">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
            <span>Required: the step cannot be completed without it</span>
          </label>
        </div>
      )}
    </FormDialog>
  );
}

/* Edit a field: names, help, order, step, type, choices, validation, whether it is required and asked at all. */
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
  /* Given choices for the first time (a dropdown, radio buttons and checkboxes keep them between themselves): at once. */
  const [choices, setChoices] = useState<ChoiceRow[]>(BLANK_CHOICES);
  const newChoices = hasChoices(v.type) && !hasChoices(f.type);
  const validation = useValidation(f.validation, v.type);
  const save = async () => {
    /* Only what changed. */
    const body: Record<string, unknown> = {};
    if (v.label_en.trim() !== f.label_en) body.label_en = v.label_en.trim();
    for (const k of ['label_mr', 'help_en', 'help_mr'] as const) if (v[k].trim() !== (f[k] ?? '')) body[k] = v[k].trim() || null;
    if (v.order.trim() && Number(v.order) !== f.order) body.order = Number(v.order);
    if (v.required !== f.required) body.required = v.required;
    if (v.is_active !== f.is_active) body.is_active = v.is_active;
    if (Number(v.step) !== f.step) body.step = Number(v.step);
    if (v.type !== f.type) body.type = v.type;
    if (newChoices) body.options = choicesBody(choices);
    if (Object.keys(body).length || validation.changed)
      await validation.sending((sent) =>
        api(`/manage/fields/${encodeURIComponent(f.id)}`, {
          method: 'PATCH',
          realm: 'manage',
          /* null clears it. */
          body: validation.changed ? { ...body, validation: sent } : body,
        }),
      );
    onSaved(`Field ${v.label_en.trim()} saved.`);
  };
  return (
    <FormDialog
      title={`Edit ${f.label_en}`}
      submit="Save"
      check={() => ({
        label_en: !v.label_en.trim() ? 'English label is required' : '',
        order: orderIssue(v.order),
        options: newChoices ? choicesIssue(choices) : '',
        ...validation.check(),
      })}
      save={save}
      onClose={onClose}
    >
      {(errors) => (
        <div className="grid one">
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
          <Field id="fe-step" label="Step" error={errors.step}>
            <select id="fe-step" className="inp" value={v.step} onChange={(e) => set('step', e.target.value)}>
              <option value="1">{STEP_TITLE[1]}</option>
              <option value="2">{STEP_TITLE[2]}</option>
            </select>
          </Field>
          <Field id="fe-type" label="Type" error={errors.type} hint={typeHint(f)}>
            <select
              id="fe-type"
              className="inp"
              value={v.type}
              onChange={(e) => set('type', e.target.value as FieldType)}
              disabled={typesOf(f)?.length === 1}
            >
              <TypeOptions current={f.type} types={typesOf(f)} />
            </select>
          </Field>
          {newChoices ? <ChoiceRows choices={choices} onChange={setChoices} error={errors.options} /> : null}
          <ValidationSection v={validation} type={v.type} label={v.label_en} />
          <label className="check">
            <input type="checkbox" checked={v.required} onChange={(e) => set('required', e.target.checked)} />
            <span>Required</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={v.is_active} onChange={(e) => set('is_active', e.target.checked)} />
            <span>Active: asked in the form</span>
          </label>
          {WITHOUT[f.key] ? <p className="hint">{WITHOUT[f.key]}</p> : null}
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
  /* The field whose own choices are open. */
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
    if (!hasChoices(f.type)) return null;
    const page = choicesPage(f);
    if (page)
      return (
        <Link className="btn ghost sm" to={page} aria-label={`Choices of ${f.label_en}`}>
          Choices
        </Link>
      );
    return f.custom || f.options_kind?.startsWith('FIELD:') ? (
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
        Labels, help texts and own fields appear in every login. Every field can be changed, made optional or switched off; a field
        that is off is not asked, and answers already given stay stored.
      </p>
      {!canEdit ? <ViewOnlyNotice /> : null}
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
                              {f.custom ? <span className="badge own-mark">Own field</span> : null}
                              {f.help_en ? <div className="hint">{f.help_en}</div> : null}
                              {checksText(f.validation) ? <div className="hint">Checks: {checksText(f.validation)}</div> : null}
                            </td>
                            <td lang="mr">{f.label_mr || '—'}</td>
                            <td>{typeName(f.type)}</td>
                            <td>{f.required ? 'Required' : 'Optional'}</td>
                            <td>
                              <StatusSwitch
                                name={f.label_en}
                                on={f.is_active}
                                canEdit={canEdit}
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
