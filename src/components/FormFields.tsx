import { Fragment, useState, type ReactNode } from 'react';
import { isKnown, type Choice, type FieldDef, type FormModel } from '../form';
import type { Form } from '../types';
import { isCgpa, localToday, OWN_TEXTAREA_MAX, OWN_TEXT_MAX } from '../validation';
import { Field, Notice } from './ui';

/*
 * The fields of steps 1 and 2, shared by the student's form and the tracking panel's Edit form. What is asked, in which
 * order, under which name, whether it is required and the choices come from the masters (src/form.ts); the controls and the
 * grouping of the known fields are the portal's own. Own fields come last in their step, under "Additional details".
 */

/*
 * What changes together with a field: the permanent address while it is "the same", the disability details and the CGPA
 * scale when they are no longer asked, and a technology the (new) district does not offer. `set` stores one value.
 */
export function useFormRules({
  form,
  model,
  set,
  clearErrors,
}: {
  form: Form;
  model: FormModel;
  set: (key: string, value: string) => void;
  clearErrors: (...keys: string[]) => void;
}) {
  const { T } = model;
  /* A switched-off field is left alone: its stored value is kept. */
  const put = (key: string, value: string) => {
    if (model.get(key)) set(key, value);
  };
  /* "Same as current address": the permanent address follows the current one while ticked. */
  const [sameAddress, setSameAddress] = useState(() => !!form.current_address && form.permanent_address === form.current_address);
  /* Why a chosen value was cleared (no longer offered); shown at the technology. */
  const [warning, setWarning] = useState('');
  const clear = (...keys: string[]) => {
    for (const k of keys) if (form[k]) put(k, '');
    clearErrors(...keys);
  };

  const change = (key: string, value: string) => {
    put(key, value);
    switch (key) {
      case 'current_address':
        if (sameAddress) put('permanent_address', value);
        break;
      case 'disability_status':
        if (value !== 'Yes') clear('disability_type', 'disability_certificate_number');
        break;
      case 'grading_type':
        if (value !== 'CGPA') clear('cgpa_scale');
        break;
      case 'technology':
      case 'centre_id':
        setWarning('');
        break;
      case 'district_id': {
        const offered = model.choices('technology', { ...form, district_id: value });
        if (form.technology && offered && !offered.some((t) => t.value === form.technology)) {
          clear('technology');
          setWarning(
            T(
              'आपण निवडलेले तंत्रज्ञान या जिल्ह्यात उपलब्ध नाही. कृपया तंत्रज्ञान पुन्हा निवडा.',
              'The technology you chose is not offered in this district. Please choose a technology again.',
            ),
          );
        }
        break;
      }
    }
  };
  const onSameAddress = (checked: boolean) => {
    setSameAddress(checked);
    if (checked) put('permanent_address', form.current_address ?? '');
  };
  return { change, sameAddress, onSameAddress, warning, setWarning };
}

/* Step 2's known fields: the course, then the qualification; step 1 is one group. Own (unknown) fields come last. */
const COURSE = ['region_id', 'centre_id', 'technology', 'education_id'];
function groupsOf(step: number, defs: FieldDef[], T: FormModel['T']): { title: string; fields: FieldDef[] }[] {
  const known = defs.filter((f) => isKnown(f.key) && !f.custom);
  const own = defs.filter((f) => !known.includes(f));
  return [
    ...(step === 1
      ? [{ title: '', fields: known }]
      : [
          { title: '', fields: known.filter((f) => COURSE.includes(f.key)) },
          { title: T('पात्रतेचा तपशील', 'Qualification details'), fields: known.filter((f) => !COURSE.includes(f.key)) },
        ]),
    { title: T('अतिरिक्त तपशील', 'Additional details'), fields: own },
  ].filter((g) => g.fields.length);
}

export function StepFields({
  step,
  model,
  form,
  errors,
  rules,
  locked = {},
  current = {},
  aadhaarMasked,
}: {
  step: 1 | 2;
  model: FormModel;
  form: Form;
  errors: Record<string, string>;
  rules: ReturnType<typeof useFormRules>;
  /* Fields that cannot be changed, with the reason (the Edit form). */
  locked?: Record<string, string>;
  /* The texts of the saved values: a value no longer among the choices stays selectable (the Edit form). */
  current?: Record<string, { value: string; text: string }>;
  /* The stored Aadhaar, masked: an empty field keeps it (the Edit form). */
  aadhaarMasked?: string | null;
}) {
  const { T } = model;
  const editing = aadhaarMasked !== undefined;
  const today = localToday();
  const { change } = rules;

  const common = (f: FieldDef) => ({
    id: `f-${f.key}`,
    className: 'inp',
    value: form[f.key] ?? '',
    'aria-invalid': !!errors[f.key] || undefined,
    disabled: !!locked[f.key],
  });
  const input = (f: FieldDef, type = 'text', extra: Record<string, unknown> = {}, clean: (v: string) => string | null = (v) => v) => (
    <input
      {...common(f)}
      type={type}
      onChange={(e) => {
        const v = clean(e.target.value);
        if (v !== null) change(f.key, v);
      }}
      {...extra}
    />
  );
  const textarea = (f: FieldDef, maxLength: number, extra: Record<string, unknown> = {}) => (
    <textarea {...common(f)} maxLength={maxLength} onChange={(e) => change(f.key, e.target.value)} {...extra} />
  );
  const choicesOf = (f: FieldDef): Choice[] => {
    const list = model.choices(f.key, form) ?? [];
    const saved = current[f.key];
    return saved?.value && form[f.key] === saved.value && !list.some((c) => c.value === saved.value)
      ? [...list, { value: saved.value, label: `${saved.text || saved.value} (no longer offered)` }]
      : list;
  };
  const select = (f: FieldDef, placeholder = T(`${f.label} निवडा`, `Select ${f.label}`)) => (
    <select {...common(f)} onChange={(e) => change(f.key, e.target.value)}>
      <option value="">{placeholder}</option>
      {choicesOf(f).map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  const field = (f: FieldDef, control: ReactNode, opts: { wide?: boolean; hint?: ReactNode; label?: string; required?: boolean } = {}) => (
    <Field
      id={`f-${f.key}`}
      label={opts.label ?? f.label}
      error={errors[f.key]}
      wide={opts.wide}
      hint={locked[f.key] || f.help || opts.hint}
      required={opts.required ?? f.required}
    >
      {control}
    </Field>
  );
  /* Yes / No (or any short choice) as radio buttons: a fieldset named by its legend, arrow keys move between them. */
  const radios = (f: FieldDef) => {
    const hint = locked[f.key] || f.help;
    const described = errors[f.key] ? `f-${f.key}-err` : hint ? `f-${f.key}-hint` : undefined;
    return (
      <fieldset className="field radios" aria-describedby={described}>
        <legend className="label">
          {f.label} {f.required ? <span className="req">*</span> : null}
        </legend>
        <div className="radio-row">
          {choicesOf(f).map((o, i) => (
            <label key={o.value} className="radio">
              <input
                type="radio"
                id={i === 0 ? `f-${f.key}` : `f-${f.key}-${i}`}
                name={`f-${f.key}`}
                value={o.value}
                checked={form[f.key] === o.value}
                onChange={() => change(f.key, o.value)}
                disabled={!!locked[f.key]}
                aria-invalid={!!errors[f.key] || undefined}
              />
              {o.label}
            </label>
          ))}
        </div>
        {errors[f.key] ? (
          <span className="err" role="alert" id={`f-${f.key}-err`}>
            {errors[f.key]}
          </span>
        ) : hint ? (
          <span className="hint" id={`f-${f.key}-hint`}>
            {hint}
          </span>
        ) : null}
      </fieldset>
    );
  };
  /* The student's own details are offered by the browser; the Auditor types somebody else's. */
  const auto = (name: string) => ({ autoComplete: editing ? 'off' : name });
  const digits = (n: number) => (v: string) => v.replace(/\D/g, '').slice(0, n);

  const control = (f: FieldDef): ReactNode => {
    switch (f.key) {
      case 'first_name':
        return field(f, input(f, 'text', { maxLength: 100, ...auto('given-name') }));
      case 'last_name':
        return field(f, input(f, 'text', { maxLength: 100, ...auto('family-name') }));
      case 'father_name':
      case 'mother_name':
        return field(f, input(f, 'text', { maxLength: 150 }));
      /* Read-only: the email ID the account was created and verified with (the API ignores any other value). */
      case 'email':
        return field(f, <input id="f-email" className="inp" type="email" value={form.email ?? ''} readOnly aria-readonly="true" />, {
          hint: T(
            'आपल्या खात्याचा ईमेल आयडी (OTP ने पडताळलेला); तो बदलता येत नाही.',
            'The email ID of your account (verified with the OTP); it cannot be changed.',
          ),
        });
      case 'date_of_birth':
        return field(f, input(f, 'date', { max: today, min: '1920-01-01' }));
      case 'qualification_completed_on':
        return field(f, input(f, 'date', { max: today, min: '1950-01-01' }));
      case 'current_address':
        return field(f, textarea(f, 500), { wide: true });
      case 'permanent_address': {
        const canCopy = !!model.get('current_address') && !locked.current_address && !locked.permanent_address;
        const same = canCopy && rules.sameAddress;
        return (
          <>
            {canCopy ? (
              <label className="check-row wide">
                <input type="checkbox" checked={same} onChange={(e) => rules.onSameAddress(e.target.checked)} />
                {T('कायमचा पत्ता सध्याच्या पत्त्यासारखाच आहे', 'Permanent address is the same as the current address')}
              </label>
            ) : null}
            {field(f, textarea(f, 500, { readOnly: same }), {
              wide: true,
              hint: same
                ? T(
                    'सध्याच्या पत्त्यावरून घेतला आहे. वेगळा पत्ता टाकण्यासाठी वरील खूण काढा.',
                    'Copied from the current address. Untick the box above to enter a different address.',
                  )
                : undefined,
            })}
          </>
        );
      }
      case 'landmark':
        return field(f, input(f, 'text', { maxLength: 150 }));
      case 'taluka':
        return field(f, input(f, 'text', { maxLength: 100 }));
      case 'pin_code':
        return field(
          f,
          input(
            f,
            'text',
            { inputMode: 'numeric', maxLength: 6, placeholder: T('६ अंकी पिन कोड', '6-digit PIN code'), ...auto('postal-code') },
            digits(6),
          ),
        );
      case 'aadhaar_number':
        return field(
          f,
          input(f, 'text', {
            inputMode: 'numeric',
            maxLength: 14,
            placeholder: editing ? (aadhaarMasked ?? '') : T('१२ अंकी आधार क्रमांक', '12-digit Aadhaar number'),
            autoComplete: 'off',
          }),
          editing ? { required: false, hint: 'Leave it empty to keep the number on record; enter all 12 digits to change it.' } : {},
        );
      case 'mobile_number':
        return field(f, input(f, 'tel', { maxLength: 15, ...auto('tel') }));
      case 'alternate_mobile_number':
        return field(f, input(f, 'tel', { maxLength: 15 }), {
          hint: T('ऐच्छिक. आपल्याशी संपर्कासाठी दुसरा क्रमांक.', 'Optional. A different number we can reach you on.'),
        });
      case 'alternate_email':
        return field(f, input(f, 'email', { maxLength: 254 }), {
          hint: T('ऐच्छिक. खात्याच्या ईमेल आयडीपेक्षा वेगळा.', 'Optional. Different from the email ID of your account.'),
        });
      case 'disability_status':
        return radios(f);
      case 'disability_type':
        return field(f, input(f, 'text', { maxLength: 100 }));
      case 'disability_certificate_number':
        return field(f, input(f, 'text', { maxLength: 50 }), {
          hint: T(
            'प्रमाणपत्रावर छापल्याप्रमाणे: इंग्रजी अक्षरे, अंक, / आणि - (४–५० वर्ण). प्रमाणपत्र टप्पा ३ मध्ये अपलोड करा.',
            'As printed on the certificate: letters, digits, / and - (4–50 characters). You will upload the certificate in step 3.',
          ),
        });
      case 'technology': {
        const none = !choicesOf(f).length;
        return (
          <>
            {field(f, select(f, none ? T('या जिल्ह्यात तंत्रज्ञान उपलब्ध नाही', 'No technologies in this district') : undefined))}
            {rules.warning ? (
              <div className="wide">
                <Notice tone="warn">{rules.warning}</Notice>
              </div>
            ) : null}
            {none ? (
              <div className="wide">
                <Notice tone="warn">
                  {T(
                    'आपल्या जिल्ह्यात सध्या कोणतेही तंत्रज्ञान उपलब्ध नाही.',
                    'No technologies are currently offered in the chosen district.',
                  )}
                </Notice>
              </div>
            ) : null}
          </>
        );
      }
      case 'qualification_name':
        return field(f, input(f, 'text', { maxLength: 150 }), {
          hint: T(
            'नेमकी पात्रता लिहा, उदा. "Other Graduate" निवडल्यास "B.Sc. Agriculture".',
            'Specify the exact qualification, e.g. "B.Sc. Agriculture" when you chose "Other Graduate".',
          ),
        });
      case 'qualification_stream':
        return field(f, input(f, 'text', { maxLength: 150 }));
      case 'qualification_board':
        return field(f, input(f, 'text', { maxLength: 200 }));
      case 'score': {
        const grading = model.get('grading_type') ? model.text('grading_type', form) : '';
        return field(
          f,
          input(f, 'text', { inputMode: 'decimal', maxLength: 6 }, (v) => (/^\d{0,3}(\.\d{0,2})?$/.test(v.trim()) ? v.trim() : null)),
          {
            label: grading ? `${f.label} (${grading})` : f.label,
            hint: isCgpa(form)
              ? T(
                  `CGPA, जास्तीत जास्त २ दशांश स्थळे${form.cgpa_scale ? ` (०–${form.cgpa_scale})` : ''}.`,
                  `CGPA, up to 2 decimal places${form.cgpa_scale ? ` (0–${form.cgpa_scale})` : ''}.`,
                )
              : form.grading_type === 'PERCENTAGE'
                ? T('टक्केवारी, ०–१००, जास्तीत जास्त २ दशांश स्थळे.', 'Percentage, 0–100, up to 2 decimal places.')
                : model.get('grading_type')
                  ? T('आधी गुणांकन पद्धत निवडा.', 'Choose the grading type first.')
                  : undefined,
          },
        );
      }
      default:
        /* The other dropdowns, and the own fields by their type. */
        switch (f.type) {
          case 'DROPDOWN':
            return field(f, select(f));
          case 'TEXTAREA':
            return field(f, textarea(f, OWN_TEXTAREA_MAX), { wide: true });
          case 'NUMBER':
            return field(f, input(f, 'text', { inputMode: 'decimal', maxLength: 20 }));
          case 'DATE':
            return field(f, input(f, 'date'));
          default:
            return field(f, input(f, 'text', { maxLength: OWN_TEXT_MAX }));
        }
    }
  };

  return (
    <div className="grid">
      {groupsOf(step, model.step(step), T).map((g) => (
        <Fragment key={g.title}>
          {g.title ? <h3 className="wide form-section">{g.title}</h3> : null}
          {g.fields
            .filter((f) => model.asked(f.key, form))
            .map((f) => (
              <Fragment key={f.key}>{control(f)}</Fragment>
            ))}
        </Fragment>
      ))}
    </div>
  );
}
