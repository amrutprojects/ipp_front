/*
 * Client-side checks matching the API's rules (amrut-kalash-api registration.validation.ts and edp.validation.ts), so
 * most mistakes are shown before anything is sent. The server checks everything again.
 */
import type { CustomCheck, DocumentKind, FieldType, FieldValidation, Form, FormField, RuleType, ValidationRule } from './types';

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* Verhoeff checksum (the Aadhaar check digit). */
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
export function verhoeffValid(num: string): boolean {
  let c = 0;
  const digits = num.split('').reverse().map(Number);
  for (let i = 0; i < digits.length; i++) c = D[c]![P[i % 8]![digits[i]!]!]!;
  return c === 0;
}

export const normaliseMobile = (v: string) =>
  v
    .replace(/[\s()-]/g, '')
    .replace(/^\+?91(?=\d{10}$)/, '')
    .replace(/^0(?=\d{10}$)/, '');

/* Picks the message in the screen's language (i18n.tsx T); English when not given. */
type Pick = (mr: string, en: string) => string;
const EN: Pick = (_mr, en) => en;
const mrNum = (n: number) => n.toLocaleString('mr-IN');

export function nameIssue(label: string, v: string, max: number, required = true, T: Pick = EN, labelMr = label): string | null {
  const t = v.trim();
  if (!t) return required ? T(`${labelMr} आवश्यक आहे`, `${label} is required`) : null;
  if (t.length > max) return T(`${labelMr}: जास्तीत जास्त ${mrNum(max)} वर्ण`, `${label} must be at most ${max} characters`);
  if (!NAME_RE.test(t))
    return T(`${labelMr}: फक्त अक्षरे, स्पेस आणि . ' - ही चिन्हे वापरता येतात`, `${label} may contain only letters, spaces and . ' -`);
  return null;
}
export function emailIssue(v: string, T: Pick = EN): string | null {
  if (!v.trim()) return T('ईमेल आवश्यक आहे', 'Email is required');
  return EMAIL_RE.test(v.trim()) ? null : T('योग्य ईमेल पत्ता टाका', 'Enter a valid email address');
}
export function mobileIssue(v: string, T: Pick = EN): string | null {
  if (!v.trim()) return T('मोबाईल क्रमांक आवश्यक आहे', 'Mobile number is required');
  return /^[6-9]\d{9}$/.test(normaliseMobile(v))
    ? null
    : T('मोबाईल क्रमांक ६–९ ने सुरू होणारा १० अंकी भारतीय क्रमांक असावा', 'Mobile number must be a 10-digit Indian number starting 6–9');
}
export function passwordIssue(v: string, T: Pick = EN): string | null {
  if (!v) return T('पासवर्ड आवश्यक आहे', 'Password is required');
  if (v.length < 8) return T('पासवर्ड किमान ८ वर्णांचा असावा', 'Password must be at least 8 characters');
  if (v.length > 72) return T('पासवर्ड जास्तीत जास्त ७२ वर्णांचा असावा', 'Password must be at most 72 characters');
  if (!/[A-Za-z]/.test(v)) return T('पासवर्डमध्ये किमान एक इंग्रजी अक्षर (A–Z किंवा a–z) असावे', 'Password must contain a letter');
  if (!/[0-9]/.test(v)) return T('पासवर्डमध्ये किमान एक अंक (0–9) असावा', 'Password must contain a digit');
  return null;
}
export function aadhaarIssue(v: string, T: Pick = EN): string | null {
  const d = v.replace(/[\s-]/g, '');
  if (!d) return T('आधार क्रमांक आवश्यक आहे', 'Aadhaar number is required');
  return /^[2-9]\d{11}$/.test(d) && verhoeffValid(d)
    ? null
    : T('आधार क्रमांक १२ अंकी व योग्य असावा', 'Aadhaar number must be 12 digits with a valid checksum');
}
export function dobIssue(v: string, today = new Date(), T: Pick = EN): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return T('जन्मतारीख आवश्यक आहे', 'Date of birth is required');
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  if (d.getUTCMonth() !== +m[2]! - 1) return T('जन्मतारीख योग्य नाही', 'Date of birth is not a real date');
  if (d > today) return T('जन्मतारीख भविष्यातील असू शकत नाही', 'Date of birth cannot be in the future');
  const age =
    today.getUTCFullYear() - d.getUTCFullYear() - (today < new Date(Date.UTC(today.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) ? 1 : 0);
  return age < 14 || age > 100 ? T('अर्जदाराचे वय १४ ते १०० वर्षे असावे', 'Applicant must be between 14 and 100 years old') : null;
}

/*
 * The fields' names when the API does not send the Form fields master (GET /edp/options → fields); otherwise its labels
 * are used everywhere.
 */
export const FIELD_LABELS: Record<FormField, string> = {
  first_name: 'First Name',
  last_name: 'Last Name',
  father_name: 'Father Name',
  mother_name: 'Mother Name',
  email: 'Email',
  date_of_birth: 'Date of Birth',
  current_address: 'Current Address',
  aadhaar_number: 'Aadhaar Number',
  mobile_number: 'Mobile Number',
  religion: 'Religion',
  caste_id: 'Caste',
  gender: 'Gender',
  marital_status: 'Marital Status',
  permanent_address: 'Permanent Address',
  landmark: 'Landmark',
  district_id: 'District',
  taluka: 'Taluka',
  pin_code: 'PIN Code',
  alternate_mobile_number: 'Alternate Mobile Number',
  alternate_email: 'Alternate Email',
  disability_status: 'Person with Disability',
  disability_type: 'Type of Disability',
  disability_certificate_number: 'Disability Certificate Number',
  region_id: 'Course District',
  centre_id: 'Center Name',
  technology: 'Technology',
  education_id: 'Education Qualification',
  educational_status: 'Educational Status',
  qualification_name: 'Qualification Name',
  qualification_stream: 'Subject / Stream / Branch',
  qualification_board: 'College Name',
  qualification_completed_on: 'Qualification Completed On',
  grading_type: 'Grading Type',
  cgpa_scale: 'CGPA Scale',
  score: 'Score',
  qualification_class: 'Class / Division',
};

/* Fields shown only in some cases, and checked only then (the API ignores and clears them otherwise). */
export const isDisabled = (form: Form) => form.disability_status === 'Yes';
export const isCgpa = (form: Form) => form.grading_type === 'CGPA';

/* Today as YYYY-MM-DD in this browser's time zone. */
export const localToday = (now = new Date()) => new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

export function pinCodeIssue(v: string, T: Pick = EN): string | null {
  if (!v.trim()) return T('पिन कोड आवश्यक आहे', 'PIN code is required');
  return /^[1-9]\d{5}$/.test(v.trim())
    ? null
    : T('पिन कोड ६ अंकी असावा व ० ने सुरू होऊ नये', 'PIN code must be 6 digits and cannot start with 0');
}
/* A YYYY-MM-DD that is a real day of the calendar. */
export const realDate = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.getUTCMonth() === +m[2]! - 1 && d.getUTCDate() === +m[3]!;
};
export function completedOnIssue(v: string, today = localToday(), T: Pick = EN): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return T('पात्रता पूर्ण झाल्याची तारीख आवश्यक आहे', 'Qualification completion date is required');
  if (!realDate(v)) return T('पात्रता पूर्ण झाल्याची तारीख योग्य नाही', 'Qualification completion date is not a real date');
  return v > today
    ? T('पात्रता पूर्ण झाल्याची तारीख भविष्यातील असू शकत नाही', 'Qualification completion date cannot be in the future')
    : null;
}
export function scoreIssue(v: string, gradingType: string, cgpaScale: string, T: Pick = EN): string | null {
  const t = v.trim();
  if (!t) return T('गुण आवश्यक आहेत', 'Score is required');
  if (!/^\d+(\.\d{1,2})?$/.test(t))
    return T('गुण ही जास्तीत जास्त २ दशांश स्थळे असलेली संख्या असावी', 'Score must be a number with at most 2 decimal places');
  const n = Number(t);
  if (gradingType === 'CGPA') {
    const scale = Number(cgpaScale);
    if (!scale) return null; /* the scale itself is reported missing */
    return n > scale ? T(`CGPA ० ते ${mrNum(scale)} या दरम्यान असावा`, `CGPA must be between 0 and ${scale}`) : null;
  }
  if (gradingType === 'PERCENTAGE') return n > 100 ? T('टक्केवारी ० ते १०० या दरम्यान असावी', 'Percentage must be between 0 and 100') : null;
  return null;
}

/* A field to check, as the masters define it: its current label, whether it must be filled, and its choices (dropdowns). */
export interface FieldRule {
  key: string;
  label: string;
  required: boolean;
  type: FieldType;
  /* The values that can be chosen; null = not a dropdown, or its list is not known. */
  choices: readonly string[] | null;
  /* Checked by its type alone, not by the portal's own format for its key. */
  plain?: boolean;
  /* The field's checks (Masters → Form fields). */
  validation?: FieldValidation | null;
}
interface RuleContext {
  form: Form;
  T: Pick;
  today?: string;
}
/* Longest values of the own fields (amrut-kalash-api CUSTOM_VALUE_MAX). */
export const OWN_TEXT_MAX = 250;
export const OWN_TEXTAREA_MAX = 2000;

const max =
  (n: number): Check =>
  (v, f, { T }) =>
    v.length > n ? T(`${f.label}: जास्तीत जास्त ${mrNum(n)} वर्ण`, `${f.label} must be at most ${n} characters`) : null;
type Check = (v: string, f: FieldRule, ctx: RuleContext) => string | null;

/* What a filled value must look like, beyond being one of the field's choices. */
const FORMAT: Partial<Record<string, Check>> = {
  first_name: (v, f, { T }) => nameIssue(f.label, v, 100, true, T),
  last_name: (v, f, { T }) => nameIssue(f.label, v, 100, true, T),
  father_name: (v, f, { T }) => nameIssue(f.label, v, 150, true, T),
  mother_name: (v, f, { T }) => nameIssue(f.label, v, 150, true, T),
  email: (v, _f, { T }) => emailIssue(v, T),
  date_of_birth: (v, _f, { T }) => dobIssue(v, new Date(), T),
  current_address: max(500),
  aadhaar_number: (v, _f, { T }) => aadhaarIssue(v, T),
  mobile_number: (v, _f, { T }) => mobileIssue(v, T),
  permanent_address: max(500),
  landmark: max(150),
  taluka: max(100),
  pin_code: (v, _f, { T }) => pinCodeIssue(v, T),
  alternate_mobile_number: (v, f, { form, T }) => {
    const alt = normaliseMobile(v);
    if (!/^[6-9]\d{9}$/.test(alt))
      return T(`${f.label} ६–९ ने सुरू होणारा १० अंकी भारतीय क्रमांक असावा`, `${f.label} must be a 10-digit Indian number starting 6–9`);
    return alt === normaliseMobile(form.mobile_number ?? '')
      ? T(`${f.label} मोबाईल क्रमांकापेक्षा वेगळा असावा`, `${f.label} must be different from the mobile number`)
      : null;
  },
  alternate_email: (v, f, { form, T }) => {
    if (v.length > 254 || !EMAIL_RE.test(v)) return T('योग्य ईमेल पत्ता टाका', 'Enter a valid email address');
    return v.toLowerCase() === (form.email ?? '').trim().toLowerCase()
      ? T(`${f.label} खात्याच्या ईमेलपेक्षा वेगळा असावा`, `${f.label} must be different from your account email`)
      : null;
  },
  disability_status: (v, f, { T }) => (v === 'Yes' || v === 'No' ? null : T(`${f.label}: होय किंवा नाही निवडा`, `${f.label}: select Yes or No`)),
  disability_type: max(100),
  disability_certificate_number: (v, f, { T }) =>
    /^[A-Za-z0-9/-]{4,50}$/.test(v)
      ? null
      : T(`${f.label}: ४–५० वर्ण, फक्त इंग्रजी अक्षरे, अंक, / आणि -`, `${f.label} must be 4–50 characters: letters, digits, / and - only`),
  qualification_name: max(150),
  qualification_stream: max(150),
  qualification_board: max(200),
  qualification_completed_on: (v, _f, { today, T }) => completedOnIssue(v, today, T),
  score: (v, _f, { form, T }) => scoreIssue(v, form.grading_type ?? '', form.cgpa_scale ?? '', T),
};
/* The values chosen in a Checkboxes answer (a JSON array, '' = none); null = it is not one. */
export function chosen(v: string): string[] | null {
  if (!v.trim()) return [];
  try {
    const list: unknown = JSON.parse(v);
    return Array.isArray(list) && list.every((x) => typeof x === 'string') ? (list as string[]) : null;
  } catch {
    return null;
  }
}
export const chosenText = (values: readonly string[]) => (values.length ? JSON.stringify(values) : '');
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const YEAR_MIN = 1900;
export const YEAR_MAX = 2100;

/* The fields checked by type: the own ones, and a known one given another type. */
const OWN: Partial<Record<FieldType, Check>> = {
  TEXT: max(OWN_TEXT_MAX),
  TEXTAREA: max(OWN_TEXTAREA_MAX),
  EMAIL: (v, f, { T }) =>
    v.length <= 254 && EMAIL_RE.test(v) ? null : T(`${f.label}: योग्य ईमेल पत्ता टाका`, `${f.label} must be a valid email address`),
  MOBILE: (v, f, { T }) =>
    /^[6-9]\d{9}$/.test(normaliseMobile(v))
      ? null
      : T(`${f.label} ६–९ ने सुरू होणारा १० अंकी भारतीय क्रमांक असावा`, `${f.label} must be a 10-digit Indian number starting 6–9`),
  URL: (v, f, { T }) =>
    /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(v)
      ? null
      : T(`${f.label}: http:// किंवा https:// ने सुरू होणारा वेब पत्ता टाका`, `${f.label} must be a web address starting with http:// or https://`),
  TIME: (v, f, { T }) => (TIME_RE.test(v) ? null : T(`${f.label}: वेळ HH:MM स्वरूपात टाका`, `${f.label} must be a time in HH:MM format`)),
  MONTH: (v, f, { T }) =>
    /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? null : T(`${f.label}: महिना YYYY-MM स्वरूपात टाका`, `${f.label} must be a month in YYYY-MM format`),
  YEAR: (v, f, { T }) =>
    /^\d{4}$/.test(v) && Number(v) >= YEAR_MIN && Number(v) <= YEAR_MAX
      ? null
      : T(`${f.label}: योग्य वर्ष टाका, उदा. २०२६`, `${f.label} must be a year, e.g. 2026`),
  CHECKBOXES: (v, f, { T }) => {
    const list = chosen(v);
    return list && new Set(list).size === list.length && (!f.choices?.length || list.every((x) => f.choices!.includes(x)))
      ? null
      : T(`${f.label}: यादीतील योग्य पर्याय निवडा`, `Select valid choices for ${f.label}`);
  },
  YES_NO: (v, f, { T }) => (v === 'Yes' || v === 'No' ? null : T(`${f.label}: होय किंवा नाही निवडा`, `${f.label}: select Yes or No`)),
  CONSENT: (v, f, { T }) => (v === 'Yes' ? null : notTicked(f.label, T)),
  NUMBER: (v, f, { T }) => (/^-?\d{1,12}(\.\d{1,4})?$/.test(v) ? null : T(`${f.label}: संख्या टाका`, `${f.label} must be a number`)),
  DATE: (v, f, { T }) => (realDate(v) ? null : T(`${f.label}: योग्य तारीख निवडा`, `${f.label} is not a real date`)),
};

const notTicked = (label: string, T: Pick) => T(`${label}: खूण करणे आवश्यक आहे`, `${label} must be ticked`);
/* Their answer is not one value of their choices: checked by type. */
const NOT_ONE_CHOICE = new Set<FieldType>(['CHECKBOXES', 'YES_NO', 'CONSENT']);

/* ---------- The checks of a field (Masters → Form fields → Validation) ---------- */

/* The rules that fit a type of field, in the order they are checked. */
const RULES_BY_TYPE: Partial<Record<FieldType, readonly RuleType[]>> = {
  TEXT: ['letters', 'digits', 'letters_digits', 'no_spaces', 'uppercase', 'pin_code', 'pan', 'ifsc', 'min_length', 'max_length'],
  TEXTAREA: ['letters', 'letters_digits', 'uppercase', 'min_length', 'max_length'],
  NUMBER: ['whole_number', 'min_digits', 'max_digits', 'min_value', 'max_value'],
  DATE: ['not_future', 'not_past', 'min_date', 'max_date', 'min_age', 'max_age'],
  TIME: ['min_time', 'max_time'],
  MONTH: ['not_future', 'not_past'],
  YEAR: ['min_value', 'max_value', 'not_future', 'not_past'],
  CHECKBOXES: ['min_choices', 'max_choices'],
};
/* None of the others: the type itself, or its choices, are checked. */
export const rulesOf = (type: FieldType): readonly RuleType[] => RULES_BY_TYPE[type] ?? [];
/* What a rule's limit is; null = the rule has none. */
export const limitOf = (type: RuleType): 'number' | 'date' | 'time' | null =>
  /^m(in|ax)_date$/.test(type) ? 'date' : /^m(in|ax)_time$/.test(type) ? 'time' : /^m(in|ax)_/.test(type) ? 'number' : null;

const digitsIn = (v: string) => v.replace(/\D/g, '').length;
/* Whole years from the day to today. */
const ageOn = (day: string, today: string) => Number(today.slice(0, 4)) - Number(day.slice(0, 4)) - (today.slice(5) < day.slice(5) ? 1 : 0);

/*
 * Each rule: whether an answer keeps it (n, or at = a day or a time, is its limit), and what is said when it does not, in
 * Marathi and English (with the limit as it is read there).
 */
interface RuleDef {
  ok: (v: string, n: number, today: string, at: string) => boolean;
  says: (label: string, mr: string, en: string) => [mr: string, en: string];
}
const RULES: Record<RuleType, RuleDef> = {
  letters: {
    ok: (v) => /^[\p{L}\p{M} .'’-]+$/u.test(v),
    says: (l) => [`${l}: फक्त अक्षरे आणि स्पेस वापरता येतात`, `${l} may contain only letters and spaces`],
  },
  digits: { ok: (v) => /^[0-9]+$/.test(v), says: (l) => [`${l}: फक्त अंक वापरता येतात`, `${l} may contain only digits`] },
  letters_digits: {
    ok: (v) => /^[\p{L}\p{M}\p{N} ]+$/u.test(v),
    says: (l) => [`${l}: फक्त अक्षरे, अंक आणि स्पेस वापरता येतात`, `${l} may contain only letters, digits and spaces`],
  },
  no_spaces: { ok: (v) => !/\s/.test(v), says: (l) => [`${l}: स्पेस वापरता येत नाही`, `${l} cannot contain spaces`] },
  uppercase: { ok: (v) => v === v.toUpperCase(), says: (l) => [`${l}: मोठ्या (कॅपिटल) अक्षरांत लिहा`, `${l} must be in capital letters`] },
  pin_code: { ok: (v) => /^[1-9]\d{5}$/.test(v), says: (l) => [`${l}: नेमके ६ अंक टाका`, `${l} must be exactly 6 digits`] },
  pan: {
    ok: (v) => /^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(v),
    says: (l) => [`${l}: योग्य PAN टाका, उदा. ABCDE1234F`, `${l} must be a valid PAN, e.g. ABCDE1234F`],
  },
  ifsc: {
    ok: (v) => /^[A-Z]{4}0[A-Z0-9]{6}$/i.test(v),
    says: (l) => [`${l}: योग्य IFSC कोड टाका, उदा. SBIN0001234`, `${l} must be a valid IFSC code, e.g. SBIN0001234`],
  },
  min_length: { ok: (v, n) => v.length >= n, says: (l, mr, en) => [`${l}: किमान ${mr} वर्ण`, `${l} must be at least ${en} characters`] },
  max_length: { ok: (v, n) => v.length <= n, says: (l, mr, en) => [`${l}: जास्तीत जास्त ${mr} वर्ण`, `${l} must be at most ${en} characters`] },
  whole_number: { ok: (v) => /^-?\d+$/.test(v), says: (l) => [`${l}: पूर्णांक टाका`, `${l} must be a whole number`] },
  min_digits: { ok: (v, n) => digitsIn(v) >= n, says: (l, mr, en) => [`${l}: किमान ${mr} अंक असावेत`, `${l} must have at least ${en} digits`] },
  max_digits: {
    ok: (v, n) => digitsIn(v) <= n,
    says: (l, mr, en) => [`${l}: जास्तीत जास्त ${mr} अंक असावेत`, `${l} must have at most ${en} digits`],
  },
  min_value: { ok: (v, n) => Number(v) >= n, says: (l, mr, en) => [`${l}: किमान ${mr} असावे`, `${l} must be at least ${en}`] },
  max_value: { ok: (v, n) => Number(v) <= n, says: (l, mr, en) => [`${l}: जास्तीत जास्त ${mr} असावे`, `${l} must be at most ${en}`] },
  /* A day, a month or a year, against as much of today. */
  not_future: {
    ok: (v, _n, today) => v <= today.slice(0, v.length),
    says: (l) => [`${l} भविष्यातील असू शकत नाही`, `${l} cannot be in the future`],
  },
  not_past: {
    ok: (v, _n, today) => v >= today.slice(0, v.length),
    says: (l) => [`${l} भूतकाळातील असू शकत नाही`, `${l} cannot be in the past`],
  },
  min_date: {
    ok: (v, _n, _today, at) => v >= at,
    says: (l, mr, en) => [`${l} ${mr} किंवा त्यानंतरची असावी`, `${l} must be on or after ${en}`],
  },
  max_date: {
    ok: (v, _n, _today, at) => v <= at,
    says: (l, mr, en) => [`${l} ${mr} किंवा त्यापूर्वीची असावी`, `${l} must be on or before ${en}`],
  },
  min_age: {
    ok: (v, n, today) => ageOn(v, today) >= n,
    says: (l, mr, en) => [`${l}: वय किमान ${mr} वर्षे असावे`, `${l}: age must be at least ${en} years`],
  },
  max_age: {
    ok: (v, n, today) => ageOn(v, today) <= n,
    says: (l, mr, en) => [`${l}: वय जास्तीत जास्त ${mr} वर्षे असावे`, `${l}: age must be at most ${en} years`],
  },
  min_time: {
    ok: (v, _n, _today, at) => v >= at,
    says: (l, mr, en) => [`${l}: वेळ ${mr} किंवा त्यानंतरची असावी`, `${l} must be ${en} or later`],
  },
  max_time: {
    ok: (v, _n, _today, at) => v <= at,
    says: (l, mr, en) => [`${l}: वेळ ${mr} किंवा त्यापूर्वीची असावी`, `${l} must be ${en} or earlier`],
  },
  min_choices: {
    ok: (v, n) => (chosen(v)?.length ?? 0) >= n,
    says: (l, mr, en) => [`${l}: किमान ${mr} पर्याय निवडा`, `${l}: choose at least ${en}`],
  },
  max_choices: {
    ok: (v, n) => (chosen(v)?.length ?? 0) <= n,
    says: (l, mr, en) => [`${l}: जास्तीत जास्त ${mr} पर्याय निवडा`, `${l}: choose at most ${en}`],
  },
};
/* A rule that can be checked: one this portal knows, with its limit when it needs one. */
const usable = (r: ValidationRule) => {
  if (!RULES[r.type]) return false;
  const limit = limitOf(r.type);
  if (limit === 'number') return typeof r.value === 'number';
  if (limit === null) return true;
  return typeof r.value === 'string' && (limit === 'date' ? realDate(r.value) : TIME_RE.test(r.value));
};
function ruleMessage(r: ValidationRule, label: string, T: Pick): string {
  /* A day as dd/mm/yyyy; a time as it is; a number without thousands (it may be a year), in Marathi in its digits. */
  const en = typeof r.value === 'number' ? String(r.value) : (r.value ?? '').split('-').reverse().join('/');
  const mr = typeof r.value === 'number' ? r.value.toLocaleString('mr-IN', { useGrouping: false, maximumFractionDigits: 10 }) : en;
  return T(...RULES[r.type].says(label, mr, en));
}
const customMessage = (c: CustomCheck, T: Pick) => T(c.message_mr?.trim() ? c.message_mr : c.message_en, c.message_en);
/* What the server says when it could not make a check (a JavaScript function that fails or takes too long). */
const notChecked = (label: string, T: Pick) =>
  T(`${label} तपासता आले नाही. कृपया कार्यक्रम कार्यालयाशी संपर्क साधा.`, `${label} could not be checked. Please contact the programme office.`);

/* Whether the whole answer matches the expression; null = the expression cannot be used here (the server decides). */
export function wholeMatch(source: string, flags: string | undefined, v: string): boolean | null {
  try {
    return new RegExp(`^(?:${source})$`, flags).test(v);
  } catch {
    return null;
  }
}
/* Why an expression does not compile, by itself and as the whole answer; '' = it does. */
export function regexIssue(source: string, flags: string): string {
  try {
    new RegExp(source, flags);
    new RegExp(`^(?:${source})$`, flags);
    return '';
  } catch (e) {
    return (e instanceof Error ? e.message.split(': ').pop() : '') || 'it does not compile';
  }
}

/* What the first check says that the answer does not keep: the rules in their order, then the expressions in theirs. A
 * JavaScript function is never run here: the server runs it when the step is saved. */
const brokenCheck: Check = (v, f, { T, today = localToday() }) => {
  for (const type of rulesOf(f.type)) {
    const r = f.validation?.rules?.find((x) => x.type === type);
    if (r && usable(r) && !RULES[type].ok(v, Number(r.value ?? 0), today, String(r.value ?? ''))) return ruleMessage(r, f.label, T);
  }
  const broken = f.validation?.custom?.find((c) => c.kind === 'REGEX' && wholeMatch(c.source, c.flags, v) === false);
  return broken ? customMessage(broken, T) : null;
};

/* A message the server sent in English about a check of the field, in the screen's language; any other one as it is. */
export function checkSaid(message: string, v: FieldValidation | null | undefined, labels: { en: string; shown: string }, T: Pick): string {
  if (!v) return message;
  const custom = v.custom?.find((c) => c.message_en === message);
  if (custom) return customMessage(custom, T);
  if (message === notChecked(labels.en, EN)) return notChecked(labels.shown, T);
  const r = v.rules?.find((x) => usable(x) && ruleMessage(x, labels.en, EN) === message);
  return r ? ruleMessage(r, labels.shown, T) : message;
}

/* Fields asked only in some cases (and cleared otherwise): the disability details, and the CGPA scale. */
export function isAsked(key: string, form: Form): boolean {
  if (key === 'disability_type' || key === 'disability_certificate_number') return isDisabled(form);
  return key !== 'cgpa_scale' || isCgpa(form);
}

export function checkFields(form: Form, fields: readonly FieldRule[], ctx: { T?: Pick; today?: string } = {}): Record<string, string> {
  const errors: Record<string, string> = {};
  const c: RuleContext = { form, T: ctx.T ?? EN, today: ctx.today };
  for (const f of fields) {
    if (!isAsked(f.key, form)) continue;
    const v = (form[f.key] ?? '').trim();
    let issue: string | null;
    if (!v || (f.type === 'CHECKBOXES' && chosen(v)?.length === 0)) {
      if (!f.required) continue;
      issue =
        f.key === 'disability_status'
          ? FORMAT.disability_status!(v, f, c)
          : f.type === 'CONSENT'
            ? notTicked(f.label, c.T)
            : c.T(`${f.label} आवश्यक आहे`, `${f.label} is required`);
    } else if (f.choices?.length && !NOT_ONE_CHOICE.has(f.type) && !f.choices.includes(v)) {
      issue = c.T(`${f.label}: यादीतील पर्याय निवडा`, `Select a valid ${f.label}`);
    } else {
      const format = (f.plain ? undefined : FORMAT[f.key]) ?? OWN[f.type];
      /* Of the Aadhaar number its digits are checked, as on the server. */
      issue = format?.(v, f, c) ?? brokenCheck(f.key === 'aadhaar_number' ? v.replace(/[\s-]/g, '') : v, f, c);
    }
    if (issue) errors[f.key] = issue;
  }
  return errors;
}

export const MAX_FILE_MB = 5;
export const MAX_VIDEO_MB = 50;
export const ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
const DEFAULT_FORMATS = ['PDF', 'JPG', 'JPEG', 'PNG'];
const FORMAT_MIME: Record<string, string> = {
  PDF: 'application/pdf',
  JPG: 'image/jpeg',
  JPEG: 'image/jpeg',
  PNG: 'image/png',
  MP4: 'video/mp4',
};
const orList = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}` : items[0] ?? '');

/*
 * A document type's upload rule, as the server sends it (formats, max_mb), else by its kind: a video MP4 up to 50 MB, any
 * other PDF / JPG / JPEG / PNG up to 5 MB. `short` is the line shown in the drop area (JPEG is the same format as JPG).
 */
export function fileRule(t?: { formats?: string[]; max_mb?: number; kind?: DocumentKind }) {
  const video = t?.kind === 'VIDEO';
  const formats = t?.formats?.length ? t.formats.map((f) => f.toUpperCase()) : video ? ['MP4'] : DEFAULT_FORMATS;
  const maxMb = t?.max_mb ?? (video ? MAX_VIDEO_MB : MAX_FILE_MB);
  const mimes = [...new Set(formats.map((f) => FORMAT_MIME[f]).filter(Boolean))];
  return {
    formats,
    maxMb,
    accept: [...formats.map((f) => `.${f.toLowerCase()}`), ...mimes].join(','),
    short: formats.filter((f) => f !== 'JPEG').join(', '),
  };
}

export function fileIssue(f: File, t?: { formats?: string[]; max_mb?: number; kind?: DocumentKind }): string | null {
  const rule = fileRule(t);
  const ext = f.name.toLowerCase().split('.').pop() ?? '';
  if (!f.name.includes('.') || !rule.formats.some((x) => x.toLowerCase() === ext)) return `Only ${orList(rule.formats)} files are accepted`;
  if (f.size > rule.maxMb * 1024 * 1024) return `File is larger than ${rule.maxMb} MB`;
  return null;
}

/* Center Master form (tracking panel), the same rules as the API's centre.validator.ts. */
export interface CentreForm {
  name: string;
  code: string;
  stateId: string;
  districtId: string;
  talukaId: string;
  address: string;
  pinCode: string;
  contactPerson: string;
  contactNumber: string;
  email: string;
}
const CENTRE_NAME_RE = /^[\p{L}\p{M}\d][\p{L}\p{M}\d .,'’()/&-]*$/u;
export function centreIssues(f: CentreForm): Record<string, string> {
  const e: Record<string, string> = {};
  const name = f.name.trim().replace(/\s+/g, ' ');
  if (!name) e.name = 'Name is required';
  else if (name.length < 2 || name.length > 150) e.name = 'Name must be 2–150 characters';
  else if (!CENTRE_NAME_RE.test(name)) e.name = 'Use letters, digits, spaces and . , ( ) - / & only';
  const code = f.code.trim().toUpperCase();
  if (!code) e.code = 'Code is required';
  else if (!/^[A-Z][A-Z0-9-]{1,19}$/.test(code)) e.code = 'Code: 2–20 characters, A–Z, 0–9 and hyphen, starting with a letter';
  if (!f.stateId) e.stateId = 'State is required';
  if (!f.districtId) e.districtId = 'District is required';
  if (f.address.trim().length > 300) e.address = 'Address must be at most 300 characters';
  if (f.pinCode.trim() && !/^\d{6}$/.test(f.pinCode.trim())) e.pinCode = 'Enter a 6-digit PIN code';
  const person = f.contactPerson.trim();
  if (person.length > 120) e.contactPerson = 'Contact person must be at most 120 characters';
  else if (person && !NAME_RE.test(person)) e.contactPerson = "Contact person may contain only letters, spaces and . ' -";
  const phone = f.contactNumber.replace(/\s+/g, '');
  if (phone && !/^(?:[6-9]\d{9}|0\d{2,4}-?\d{6,8})$/.test(phone))
    e.contactNumber = 'Enter a 10-digit mobile number or a landline with STD code';
  const email = f.email.trim();
  if (email && (email.length > 254 || !EMAIL_RE.test(email))) e.email = 'Enter a valid email address';
  return e;
}

/* Add user (tracking panel): the same rules as POST /manage/users. */
export interface ManageUserForm {
  name: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'VIEWER';
}
export function manageUserIssues(f: ManageUserForm): Record<string, string> {
  const e: Record<string, string> = {};
  const name = f.name.trim();
  if (!name) e.name = 'Name is required';
  else if (name.length < 2 || name.length > 150) e.name = 'Name must be 2–150 characters';
  const email = emailIssue(f.email);
  if (email) e.email = email;
  const password = passwordIssue(f.password);
  if (password) e.password = password;
  if (f.role !== 'ADMIN' && f.role !== 'VIEWER') e.role = 'Choose a role';
  return e;
}

/* Support contact (tracking panel Settings): the same rules as PUT /manage/settings/support. */
export interface SupportForm {
  message: string;
  email: string;
  mobile: string;
}
export const SUPPORT_MOBILE_RE = /^\+?\d[\d ()-]{5,18}\d$/;
export function supportIssues(f: SupportForm): Record<string, string> {
  const e: Record<string, string> = {};
  const message = f.message.trim();
  const email = f.email.trim();
  const mobile = f.mobile.trim();
  if (!message) e.message = 'Message is required';
  else if (message.length < 10 || message.length > 500) e.message = 'Message must be 10–500 characters';
  if (email && (email.length > 254 || !EMAIL_RE.test(email))) e.email = 'Enter a valid email address';
  else if (!email && message.includes('{email}')) e.email = 'Email is required because the message uses {email}';
  if (mobile && !SUPPORT_MOBILE_RE.test(mobile)) e.mobile = 'Enter a valid mobile number';
  else if (!mobile && message.includes('{mobile}')) e.mobile = 'Mobile is required because the message uses {mobile}';
  return e;
}

/* Welcome message (tracking panel Settings): the same rules as PUT /manage/settings/welcome. */
export interface WelcomeForm {
  enabled: boolean;
  title: string;
  message: string;
  button_label: string;
}
export function welcomeIssues(f: WelcomeForm): Record<string, string> {
  const e: Record<string, string> = {};
  const title = f.title.trim();
  const message = f.message.trim();
  if (!title) e.title = 'Title is required';
  else if (title.length < 3 || title.length > 120) e.title = 'Title must be 3–120 characters';
  if (!message) e.message = 'Message is required';
  else if (message.length < 10 || message.length > 1000) e.message = 'Message must be 10–1000 characters';
  if (f.button_label.trim().length > 60) e.button_label = 'Button label must be at most 60 characters';
  return e;
}

/* Help button (tracking panel Settings): the same rules as PUT /manage/settings/help. */
export interface HelpFormField {
  label: string;
  value: string;
}
export interface HelpForm {
  enabled: boolean;
  title: string;
  intro: string;
  fields: HelpFormField[];
}
/* Errors are keyed as the API names them (fields.0.label), so a server 422 highlights the same boxes. */
export function helpIssues(f: HelpForm): Record<string, string> {
  const e: Record<string, string> = {};
  const title = f.title.trim();
  if (!title) e.title = 'Title is required';
  else if (title.length < 2 || title.length > 120) e.title = 'Title must be 2–120 characters';
  if (f.intro.trim().length > 300) e.intro = 'Intro must be at most 300 characters';
  f.fields.forEach((row, i) => {
    const label = row.label.trim();
    const value = row.value.trim();
    if (label.length > 60) e[`fields.${i}.label`] = 'Field name must be at most 60 characters';
    else if (value && !label) e[`fields.${i}.label`] = 'Field name is required when a value is given';
    if (value.length > 200) e[`fields.${i}.value`] = 'Value must be at most 200 characters';
    else if (label && !value) e[`fields.${i}.value`] = 'Value is required when a field name is given';
  });
  if (f.enabled && !f.fields.some((row) => row.label.trim() && row.value.trim()))
    e.fields = 'Add at least one contact detail to show in the Help panel';
  return e;
}
