import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { isKnown, type Choice, type FieldDef, type FormModel } from '../form';
import { MAIN_FIELDS, type Form, type RuleType } from '../types';
import {
  chosen,
  chosenText,
  dateLimits,
  isCgpa,
  localToday,
  OWN_TEXTAREA_MAX,
  OWN_TEXT_MAX,
  YEAR_MAX,
  YEAR_MIN,
} from '../validation';
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

/*
 * Moves the focus to the first wrong field as shown (the first box of a group) once it is drawn. `still` = without scrolling
 * to it: the page shows what is said on top.
 */
export function useFocusWrong() {
  const [wrong, setWrong] = useState<{ keys: string[]; still: boolean } | null>(null);
  useEffect(() => {
    const boxes = (wrong?.keys ?? []).map((k) => document.getElementById(`f-${k}`)).filter((el) => el !== null);
    boxes.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    boxes[0]?.focus({ preventScroll: wrong?.still });
  }, [wrong]);
  return (errors: Record<string, string>, still = false) => {
    const keys = Object.keys(errors).filter((k) => errors[k]);
    if (keys.length) setWrong({ keys, still });
  };
}

/*
 * Step 2's known fields: the course (and what was moved there from step 1), then the qualification; step 1 is one group. Own
 * (unknown) fields come last.
 */
const COURSE = ['region_id', 'centre_id', 'technology', 'education_id'];
/* The longest label a dropdown's empty choice repeats ("Select Educational Status"); a longer one says "Select an option". */
export const PLACEHOLDER_LABEL_MAX = 30;
const QUALIFICATION: readonly string[] = MAIN_FIELDS.filter((k) => !COURSE.includes(k));
function groupsOf(step: number, defs: FieldDef[], T: FormModel['T']): { title: string; fields: FieldDef[] }[] {
  const known = defs.filter((f) => isKnown(f.key) && !f.custom);
  const own = defs.filter((f) => !known.includes(f));
  return [
    ...(step === 1
      ? [{ title: '', fields: known }]
      : [
          { title: '', fields: known.filter((f) => !QUALIFICATION.includes(f.key)) },
          { title: T('पात्रतेचा तपशील', 'Qualification details'), fields: known.filter((f) => QUALIFICATION.includes(f.key)) },
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

  const errorOf = (f: FieldDef) => (errors[f.key] ? model.said(f.key, errors[f.key]!) : undefined);
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
  /*
   * A dropdown's empty choice: "Select <label>" while the label is short. A long label or a question (e.g. "Do you belong to
   * one of the four eligible categories?(…)") would read oddly and make the open list wider than the form, so it says only
   * "Select an option" then.
   */
  const pickOne = (f: FieldDef) =>
    f.label.length <= PLACEHOLDER_LABEL_MAX && !f.label.includes('?')
      ? T(`${f.label} निवडा`, `Select ${f.label}`)
      : T('पर्याय निवडा', 'Select an option');
  const select = (f: FieldDef, placeholder = pickOne(f)) => (
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
      error={errorOf(f)}
      wide={opts.wide}
      hint={locked[f.key] || f.help || opts.hint}
      required={opts.required ?? f.required}
    >
      {control}
    </Field>
  );
  /* What describes a field of boxes: its error, else its hint. */
  const describedBy = (f: FieldDef) => (errors[f.key] ? `f-${f.key}-err` : locked[f.key] || f.help ? `f-${f.key}-hint` : undefined);
  const note = (f: FieldDef) =>
    errors[f.key] ? (
      <span className="err" role="alert" id={`f-${f.key}-err`}>
        {errorOf(f)}
      </span>
    ) : locked[f.key] || f.help ? (
      <span className="hint" id={`f-${f.key}-hint`}>
        {locked[f.key] || f.help}
      </span>
    ) : null;
  /* A fieldset of boxes, named by its legend; the first box is the one the focus goes to. */
  const boxes = (f: FieldDef, items: Choice[], box: (o: Choice) => { type: string; checked: boolean; onChange: () => void }, wide = false) => (
    <fieldset className={wide ? 'field radios wide' : 'field radios'} aria-describedby={describedBy(f)}>
      <legend className="label">
        {f.label} {f.required ? <span className="req">*</span> : null}
      </legend>
      <div className="radio-row">
        {items.map((o, i) => (
          <label key={o.value} className="radio">
            <input
              {...box(o)}
              id={i === 0 ? `f-${f.key}` : `f-${f.key}-${i}`}
              name={`f-${f.key}`}
              value={o.value}
              disabled={!!locked[f.key]}
              aria-invalid={!!errors[f.key] || undefined}
            />
            {o.label}
          </label>
        ))}
      </div>
      {note(f)}
    </fieldset>
  );
  /* Yes / No (or any short choice) as radio buttons: arrow keys move between them. */
  const radios = (f: FieldDef) =>
    boxes(f, choicesOf(f), (o) => ({ type: 'radio', checked: form[f.key] === o.value, onChange: () => change(f.key, o.value) }));
  /* Several choices, kept in the list's order; one that is no longer offered stays shown until it is unticked. */
  const checkboxes = (f: FieldDef) => {
    const list = model.choices(f.key, form) ?? [];
    const picked = chosen(form[f.key] ?? '') ?? [];
    const gone = picked.filter((v) => !list.some((c) => c.value === v));
    const items = [...list, ...gone.map((v) => ({ value: v, label: T(`${v} (आता उपलब्ध नाही)`, `${v} (no longer offered)`) }))];
    const toggle = (value: string) =>
      change(f.key, chosenText(items.map((c) => c.value).filter((v) => (v === value ? !picked.includes(v) : picked.includes(v)))));
    return boxes(f, items, (o) => ({ type: 'checkbox', checked: picked.includes(o.value), onChange: () => toggle(o.value) }), true);
  };
  /* A declaration: one box, its label beside it. */
  const consent = (f: FieldDef) => (
    <div className="field wide">
      <label className="check-row">
        <input
          type="checkbox"
          id={`f-${f.key}`}
          checked={form[f.key] === 'Yes'}
          onChange={(e) => change(f.key, e.target.checked ? 'Yes' : '')}
          disabled={!!locked[f.key]}
          aria-invalid={!!errors[f.key] || undefined}
          aria-required={f.required || undefined}
          aria-describedby={describedBy(f)}
        />
        <span>
          {f.label} {f.required ? <span className="req">*</span> : null}
        </span>
      </label>
      {note(f)}
    </div>
  );
  /* The student's own details are offered by the browser; the Auditor types somebody else's. */
  const auto = (name: string) => ({ autoComplete: editing ? 'off' : name });
  const digits = (n: number) => (v: string) => v.replace(/\D/g, '').slice(0, n);
  const limitIn = (f: FieldDef, type: RuleType) => {
    const value = f.validation?.rules?.find((r) => r.type === type)?.value;
    return typeof value === 'number' ? value : undefined;
  };
  /* The longest answer of a field: its own limit (which is also checked), else what the API takes. */
  const longest = (f: FieldDef, most: number) => {
    const limit = limitIn(f, 'max_length');
    return limit && limit > 0 ? Math.min(limit, most) : most;
  };
  /* A date's calendar: the days its checks allow. */
  const dateInput = (f: FieldDef) => {
    const { min, max } = dateLimits(f.validation?.rules ?? [], today);
    return input(f, 'date', { min, max });
  };
  /* Whether the field has this check (Masters → Form fields): the box is made for it then. */
  const has = (f: FieldDef, type: RuleType) => !!f.validation?.rules?.some((r) => r.type === type);
  /* A box for a number made of digits, by its check: as long as the check allows, typed on the number pad. */
  const textInput = (f: FieldDef, extra: Record<string, unknown> = {}) => {
    if (has(f, 'pin_code'))
      return input(f, 'text', { inputMode: 'numeric', maxLength: 6, placeholder: T('६ अंकी पिन कोड', '6-digit PIN code'), ...extra }, digits(6));
    if (has(f, 'aadhaar'))
      return input(f, 'text', { inputMode: 'numeric', maxLength: 14, placeholder: T('१२ अंकी आधार क्रमांक', '12-digit Aadhaar number'), ...extra });
    if (has(f, 'indian_mobile')) return input(f, 'tel', { maxLength: 15, ...extra });
    /* A PAN (ABCDE1234F) and an IFSC code (SBIN0001234) are written in capitals: typed so, no longer than they are. */
    if (has(f, 'pan')) return input(f, 'text', { maxLength: 10, autoCapitalize: 'characters', spellCheck: false, ...extra }, (v) => v.toUpperCase());
    if (has(f, 'ifsc')) return input(f, 'text', { maxLength: 11, autoCapitalize: 'characters', spellCheck: false, ...extra }, (v) => v.toUpperCase());
    if (has(f, 'uppercase')) return input(f, 'text', { maxLength: longest(f, OWN_TEXT_MAX), autoCapitalize: 'characters', ...extra });
    return input(f, 'text', { maxLength: longest(f, OWN_TEXT_MAX), ...(has(f, 'digits') ? { inputMode: 'numeric' } : {}), ...extra });
  };

  const optional = (f: FieldDef, mr: string, en: string) => (f.required ? T(mr, en) : T(`ऐच्छिक. ${mr}`, `Optional. ${en}`));
  const control = (f: FieldDef): ReactNode => {
    switch (f.plain ? '' : f.key) {
      case 'first_name':
        return field(f, textInput(f, auto('given-name')));
      case 'last_name':
        return field(f, textInput(f, auto('family-name')));
      case 'father_name':
      case 'mother_name':
        return field(f, textInput(f));
      /* Read-only: the email ID the account was created and verified with (the API ignores any other value). */
      case 'email':
        return field(f, <input id="f-email" className="inp" type="email" value={form.email ?? ''} readOnly aria-readonly="true" />, {
          hint: T(
            'आपल्या खात्याचा ईमेल आयडी (OTP ने पडताळलेला); तो बदलता येत नाही.',
            'The email ID of your account (verified with the OTP); it cannot be changed.',
          ),
        });
      case 'date_of_birth':
      case 'qualification_completed_on':
        return field(f, dateInput(f));
      case 'current_address':
        return field(f, textarea(f, longest(f, OWN_TEXTAREA_MAX)), { wide: true });
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
            {field(f, textarea(f, longest(f, OWN_TEXTAREA_MAX), { readOnly: same }), {
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
      case 'taluka':
        return field(f, textInput(f));
      case 'pin_code':
        return field(f, textInput(f, auto('postal-code')));
      case 'aadhaar_number':
        return field(
          f,
          textInput(f, { autoComplete: 'off', ...(editing ? { placeholder: aadhaarMasked ?? '' } : {}) }),
          editing ? { required: false, hint: 'Leave it empty to keep the number on record; enter it again to change it.' } : {},
        );
      case 'mobile_number':
        return field(f, has(f, 'indian_mobile') ? input(f, 'tel', { maxLength: 15, ...auto('tel') }) : textInput(f, auto('tel')));
      case 'alternate_mobile_number':
        return field(f, has(f, 'indian_mobile') ? input(f, 'tel', { maxLength: 15 }) : textInput(f), {
          hint: optional(f, 'आपल्याशी संपर्कासाठी क्रमांक; तो मोबाईल क्रमांकासारखाच असू शकतो.', 'A number we can reach you on; it may be the same as your mobile number.'),
        });
      case 'alternate_email':
        return field(f, input(f, has(f, 'email') ? 'email' : 'text', { maxLength: longest(f, OWN_TEXT_MAX) }), {
          hint: optional(f, 'खात्याच्या ईमेल आयडीपेक्षा वेगळा.', 'Different from the email ID of your account.'),
        });
      case 'disability_status':
        return radios(f);
      case 'disability_type':
        return field(f, textInput(f));
      case 'disability_certificate_number':
        return field(f, textInput(f), {
          hint: T('प्रमाणपत्रावर छापल्याप्रमाणे. प्रमाणपत्र टप्पा ३ मध्ये अपलोड करा.', 'As printed on the certificate. You will upload the certificate in step 3.'),
        });
      case 'technology': {
        const none = !choicesOf(f).length;
        return (
          <>
            {f.type === 'RADIO'
              ? radios(f)
              : field(f, select(f, none ? T('या जिल्ह्यात तंत्रज्ञान उपलब्ध नाही', 'No technologies in this district') : undefined))}
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
        return field(f, textInput(f), {
          hint: T(
            'नेमकी पात्रता लिहा, उदा. "Other Graduate" निवडल्यास "B.Sc. Agriculture".',
            'Specify the exact qualification, e.g. "B.Sc. Agriculture" when you chose "Other Graduate".',
          ),
        });
      case 'qualification_stream':
      case 'qualification_board':
        return field(f, textInput(f));
      case 'score': {
        const grading = model.get('grading_type') ? model.text('grading_type', form) : '';
        /* What its checks allow, said beside it: its range by the grading, and its decimal places. */
        const places = limitIn(f, 'max_decimals');
        const range = has(f, 'grading_scale') ? (isCgpa(form) ? (form.cgpa_scale ? `0–${form.cgpa_scale}` : '') : form.grading_type === 'PERCENTAGE' ? '0–100' : '') : '';
        const parts = [range, places === undefined ? '' : places === 0 ? T('पूर्णांक', 'a whole number') : T(`जास्तीत जास्त ${places} दशांश स्थळे`, `up to ${places} decimal places`)].filter(Boolean);
        const kind = isCgpa(form) ? 'CGPA' : form.grading_type === 'PERCENTAGE' ? T('टक्केवारी', 'Percentage') : '';
        return field(f, input(f, 'text', { inputMode: 'decimal', maxLength: 20 }), {
          label: grading ? `${f.label} (${grading})` : f.label,
          hint: kind
            ? `${kind}${parts.length ? `, ${parts.join(', ')}` : ''}.`
            : model.get('grading_type') && has(f, 'grading_scale')
              ? T('आधी गुणांकन पद्धत निवडा.', 'Choose the grading type first.')
              : undefined,
        });
      }
      default:
        /* The other lists, and the fields drawn by their type (one this portal does not know: a text box). */
        switch (f.type) {
          case 'DROPDOWN':
            return field(f, select(f));
          case 'RADIO':
          case 'YES_NO':
            return radios(f);
          case 'CHECKBOXES':
            return checkboxes(f);
          case 'CONSENT':
            return consent(f);
          case 'EMAIL':
            return field(f, input(f, 'email', { maxLength: 254 }));
          case 'MOBILE':
            return field(f, input(f, 'tel', { maxLength: 15 }));
          case 'URL':
            return field(f, input(f, 'url', { maxLength: OWN_TEXTAREA_MAX, placeholder: 'https://' }));
          case 'TIME':
            return field(f, input(f, 'time'));
          case 'MONTH':
            /* A browser without a month picker shows a text box. */
            return field(f, input(f, 'month', { placeholder: 'YYYY-MM' }));
          case 'YEAR':
            return field(
              f,
              input(f, 'number', { min: limitIn(f, 'min_value') ?? YEAR_MIN, max: limitIn(f, 'max_value') ?? YEAR_MAX, step: 1, inputMode: 'numeric' }),
            );
          case 'TEXTAREA':
            return field(f, textarea(f, longest(f, OWN_TEXTAREA_MAX)), { wide: true });
          case 'NUMBER':
            return field(f, input(f, 'text', { inputMode: limitIn(f, 'max_decimals') === 0 || has(f, 'whole_number') ? 'numeric' : 'decimal', maxLength: 20 }));
          case 'DATE':
            return field(f, dateInput(f));
          default:
            return field(f, textInput(f));
        }
    }
  };

  return (
    <div className="grid aligned">
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
