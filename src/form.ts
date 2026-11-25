/*
 * The form as the masters define it (tracking panel → Masters): which fields are asked in which order, what each is called
 * in the chosen language, whether it is required, and the choices of every dropdown — GET /edp/options. An API that does
 * not send them yet gives today's fields under today's names.
 */
import { ddmmyyyy } from './components/ui';
import { pickName, type Lang, type Pick } from './i18n';
import {
  BASIC_FIELDS,
  type FieldConfig,
  type FieldType,
  type Form,
  type FormField,
  type ListItem,
  type Options,
  type ViewField,
} from './types';
import { FIELD_LABELS, isAsked, type FieldRule } from './validation';

export interface Choice {
  value: string;
  label: string;
}
/* A field as shown: its label and help in the chosen language. */
export interface FieldDef {
  key: string;
  step: 1 | 2;
  label: string;
  help: string;
  required: boolean;
  type: FieldType;
  custom: boolean;
  kind: string | null;
}

/* Today's order of the fields, used when the API does not send them. */
const DEFAULT_ORDER: FormField[] = [
  'first_name',
  'last_name',
  'father_name',
  'mother_name',
  'email',
  'date_of_birth',
  'current_address',
  'permanent_address',
  'landmark',
  'pin_code',
  'district_id',
  'taluka',
  'aadhaar_number',
  'mobile_number',
  'religion',
  'caste_id',
  'gender',
  'marital_status',
  'alternate_mobile_number',
  'alternate_email',
  'disability_status',
  'disability_type',
  'disability_certificate_number',
  'region_id',
  'centre_id',
  'technology',
  'education_id',
  'educational_status',
  'qualification_name',
  'qualification_stream',
  'qualification_board',
  'qualification_completed_on',
  'grading_type',
  'cgpa_scale',
  'score',
  'qualification_class',
];
const OPTIONAL = new Set<string>(['landmark', 'taluka', 'alternate_mobile_number', 'alternate_email']);
/* The dropdown list each known field takes its choices from. */
const KINDS: Record<string, string> = {
  religion: 'RELIGION',
  caste_id: 'CASTE',
  gender: 'GENDER',
  marital_status: 'MARITAL_STATUS',
  region_id: 'REGION',
  technology: 'TECHNOLOGY',
  education_id: 'EDUCATION',
  educational_status: 'EDUCATIONAL_STATUS',
  grading_type: 'GRADING_TYPE',
  cgpa_scale: 'CGPA_SCALE',
  qualification_class: 'QUALIFICATION_CLASS',
};
const TYPES: Record<string, FieldType> = {
  date_of_birth: 'DATE',
  qualification_completed_on: 'DATE',
  current_address: 'TEXTAREA',
  permanent_address: 'TEXTAREA',
  district_id: 'DROPDOWN',
  centre_id: 'DROPDOWN',
  disability_status: 'DROPDOWN',
};
/* Asked depending on another field's answer. */
const PARENT: Record<string, string> = {
  disability_type: 'disability_status',
  disability_certificate_number: 'disability_status',
  cgpa_scale: 'grading_type',
};
const KNOWN = new Set<string>(DEFAULT_ORDER);
/* A field this portal has its own control for; any other (an own field) is drawn by its type. */
export const isKnown = (key: string) => KNOWN.has(key);

/* Before the masters: the lists as GET /edp/options has always sent them. */
function plainList(kind: string, o: Options): Choice[] | null {
  const same = (items: readonly (string | number)[] | undefined) => items?.map((v) => ({ value: String(v), label: String(v) })) ?? null;
  const refs = (items: { id: string; name: string }[] | undefined) => items?.map((x) => ({ value: x.id, label: x.name })) ?? null;
  const codes = (items: { code: string; name: string }[] | undefined) => items?.map((x) => ({ value: x.code, label: x.name })) ?? null;
  switch (kind) {
    case 'RELIGION':
      return same(o.religions);
    case 'CASTE':
      return refs(o.castes);
    case 'GENDER':
      return same(o.genders);
    case 'MARITAL_STATUS':
      return same(o.marital_statuses);
    case 'REGION':
      return refs(o.regions);
    case 'EDUCATION':
      return refs(o.educations);
    case 'EDUCATIONAL_STATUS':
      return codes(o.educational_statuses);
    case 'GRADING_TYPE':
      return codes(o.grading_types);
    case 'CGPA_SCALE':
      return same(o.cgpa_scales);
    case 'QUALIFICATION_CLASS':
      return same(o.qualification_classes);
    case 'TECHNOLOGY':
      return codes(o.technologies ?? o.tracks);
    default:
      return null;
  }
}

/*
 * Castes and religions are written in Marathi in both languages, as on the sign-in page, the lists and the submitted form
 * (their official names): a student picks and later sees the same word.
 */
const MARATHI_LISTS = new Set(['CASTE', 'RELIGION']);

/* A dropdown list's choices in the chosen language; null = the API has no such list. */
export function listChoices(kind: string, o: Options, lang: Lang): Choice[] | null {
  const items: ListItem[] | undefined = o.lists?.[kind];
  if (items) return items.map((i) => ({ value: i.value, label: pickName(MARATHI_LISTS.has(kind) ? 'mr' : lang, i.name_en, i.name_mr) }));
  if (kind === 'EDUCATIONAL_STATUS' && o.educational_statuses)
    return o.educational_statuses.map((s) => ({ value: s.code, label: pickName(lang, s.name, s.name_mr) }));
  return plainList(kind, o);
}

/* Today's fields, as if the master had sent them. Educational Status only where its choices are known. */
function defaultFields(o: Options): FieldConfig[] {
  return DEFAULT_ORDER.filter((key) => key !== 'educational_status' || !!listChoices('EDUCATIONAL_STATUS', o, 'en')?.length).map((key, i) => ({
    key,
    step: (BASIC_FIELDS as readonly string[]).includes(key) ? 1 : 2,
    label_en: FIELD_LABELS[key],
    label_mr: null,
    required: !OPTIONAL.has(key),
    type: KINDS[key] ? 'DROPDOWN' : (TYPES[key] ?? 'TEXT'),
    core: false,
    custom: false,
    order: i,
    options_kind: KINDS[key] ?? null,
    help_en: null,
    help_mr: null,
  }));
}

export interface FormModel {
  lang: Lang;
  T: Pick;
  /* The active fields, in order. */
  fields: FieldDef[];
  step: (n: number) => FieldDef[];
  get: (key: string) => FieldDef | undefined;
  /* The step a field belongs to; 3 (documents) for anything else. */
  stepOf: (key: string) => number;
  /* A field's current name (today's name for one that is switched off). */
  label: (key: string) => string;
  /* Whether a field is asked now: some depend on the answer to another one (which must be switched on). */
  asked: (key: string, form: Form) => boolean;
  /* A dropdown's choices for this form; null = not a dropdown, or its list is not known. */
  choices: (key: string, form: Form) => Choice[] | null;
  /* The fields as the checks need them. */
  rules: (defs: FieldDef[], form: Form) => FieldRule[];
  /* A value as people read it (dropdown names, dates, the score with its scale); '' = empty. */
  text: (key: string, form: Form) => string;
}

/* The technologies a student of this district may choose: the district's selection, else every active technology. */
function technologyChoices(o: Options, lang: Lang, districtId: string): Choice[] | null {
  const all = listChoices('TECHNOLOGY', o, lang);
  const codes = districtId ? o.district_technologies?.[districtId] : undefined;
  return all && codes?.length ? all.filter((t) => codes.includes(t.value)) : all;
}

/* "72.50%", "8.2 / 10". */
export const scoreText = (score: string, gradingType: string, scale: string) =>
  !/^\d+(\.\d+)?$/.test(score)
    ? score
    : gradingType === 'CGPA'
      ? `${score}${scale ? ` / ${scale}` : ''}`
      : gradingType === 'PERCENTAGE'
        ? `${score}%`
        : score;
const groupedAadhaar = (v: string) => v.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');

export function buildModel(options: Options, lang: Lang): FormModel {
  const T: Pick = (mr, en) => (lang === 'mr' ? mr : en);
  const configs = options.fields?.length ? options.fields : defaultFields(options);
  const fields: FieldDef[] = [...configs]
    .sort((a, b) => a.step - b.step || a.order - b.order)
    .map((f) => ({
      key: f.key,
      step: f.step === 1 ? 1 : 2,
      label: pickName(lang, f.label_en, f.label_mr),
      help: pickName(lang, f.help_en ?? '', f.help_mr),
      required: f.required,
      type: f.type,
      custom: f.custom,
      kind: f.options_kind ?? KINDS[f.key] ?? (f.type === 'DROPDOWN' && !isKnown(f.key) ? `FIELD:${f.key}` : null),
    }));
  const byKey = new Map(fields.map((f) => [f.key, f]));

  const asked = (key: string, form: Form) => (!PARENT[key] || byKey.has(PARENT[key]!)) && isAsked(key, form);
  const choices = (key: string, form: Form): Choice[] | null => {
    switch (key) {
      case 'district_id':
        return options.districts?.map((d) => ({ value: d.id, label: d.name })) ?? null;
      case 'centre_id':
        return options.centres?.map((c) => ({ value: c.id, label: c.district_name ? `${c.name} (${c.district_name})` : c.name })) ?? null;
      case 'technology':
        return technologyChoices(options, lang, form.district_id ?? '');
      case 'disability_status':
        return [
          { value: 'Yes', label: T('होय', 'Yes') },
          { value: 'No', label: T('नाही', 'No') },
        ];
      case 'cgpa_scale':
        return (
          listChoices('CGPA_SCALE', options, lang)?.map((c) => ({
            ...c,
            label: /^\d+(\.\d+)?$/.test(c.label) ? T(`${c.label} पैकी`, `Out of ${c.label}`) : c.label,
          })) ?? null
        );
      default: {
        const kind = byKey.get(key)?.kind;
        return kind ? listChoices(kind, options, lang) : null;
      }
    }
  };

  const text = (key: string, form: Form): string => {
    const v = form[key] ?? '';
    if (!v) return '';
    if (key === 'aadhaar_number') return groupedAadhaar(v);
    if (key === 'score') return scoreText(v, form.grading_type ?? '', form.cgpa_scale ?? '');
    if (key === 'cgpa_scale') return v;
    /* Also a technology the district no longer offers. */
    const list = key === 'technology' ? listChoices('TECHNOLOGY', options, lang) : choices(key, form);
    if (list) return list.find((c) => c.value === v)?.label ?? (['caste_id', 'district_id', 'region_id', 'centre_id', 'education_id'].includes(key) ? '—' : v);
    return byKey.get(key)?.type === 'DATE' ? ddmmyyyy(v) : v;
  };

  return {
    lang,
    T,
    fields,
    step: (n) => fields.filter((f) => f.step === n),
    get: (key) => byKey.get(key),
    stepOf: (key) => byKey.get(key)?.step ?? 3,
    label: (key) => byKey.get(key)?.label ?? FIELD_LABELS[key as FormField] ?? key,
    asked,
    choices,
    rules: (defs, form) =>
      defs.filter((f) => asked(f.key, form)).map((f) => ({
        key: f.key,
        label: f.label,
        required: f.required,
        type: f.type,
        choices: choices(f.key, form)?.map((c) => c.value) ?? null,
      })),
    text,
  };
}

/* ---------- The form as shown (GET /edp/application, GET /manage/applicants/:id → view_fields) ---------- */

/* The names the API sends for the ids and codes of a form, for an API that does not send view_fields yet. */
const DISPLAY_KEY: Record<string, string> = {
  caste_id: 'caste',
  region_id: 'course_centre',
  education_id: 'education',
  centre_id: 'centre',
  district_id: 'district',
  taluka: 'taluka',
  religion: 'religion',
  technology: 'technology',
  gender: 'gender',
  marital_status: 'marital_status',
};
export function fallbackView(form: Form, display: Record<string, string | null | undefined>, aadhaarMasked: string | null): ViewField[] {
  const grading: Record<string, string> = { PERCENTAGE: 'Percentage', CGPA: 'CGPA' };
  return DEFAULT_ORDER.map((key) => {
    const value = form[key] ?? '';
    const named = DISPLAY_KEY[key] ? display[DISPLAY_KEY[key]] : null;
    return {
      key,
      step: (BASIC_FIELDS as readonly string[]).includes(key) ? 1 : 2,
      label_en: FIELD_LABELS[key],
      label_mr: null,
      type: KINDS[key] ? 'DROPDOWN' : (TYPES[key] ?? 'TEXT'),
      value,
      text: key === 'aadhaar_number' ? aadhaarMasked : key === 'grading_type' ? (grading[value] ?? value) : (named ?? value),
      custom: false,
    };
  });
}

/* One line of the form as shown: its label and text in the chosen language. */
export interface ViewRow {
  key: string;
  step: number;
  label: string;
  text: string;
  custom: boolean;
}
/* The lines to show, in order: dates as people write them, the score with its scale; what was not asked is left out. */
export function viewRows(view: ViewField[], lang: Lang): ViewRow[] {
  const valueOf = (key: string) => view.find((f) => f.key === key)?.value ?? '';
  const form = { disability_status: valueOf('disability_status'), grading_type: valueOf('grading_type') } as Form;
  return view
    .filter((f) => isAsked(f.key, form))
    .map((f) => {
      const raw = f.text ?? '';
      const text =
        f.type === 'DATE' ? (raw ? ddmmyyyy(raw) : '') : f.key === 'score' ? scoreText(raw, form.grading_type, valueOf('cgpa_scale') ?? '') : raw;
      return { key: f.key, step: f.step, label: pickName(lang, f.label_en, f.label_mr), text, custom: f.custom || !isKnown(f.key) };
    });
}
