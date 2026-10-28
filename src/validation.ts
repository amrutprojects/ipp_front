/*
 * Client-side checks matching the API's rules (amrut-kalash-api registration.validation.ts and edp.validation.ts), so
 * most mistakes are shown before anything is sent. The server checks everything again.
 */
import type { Form, FormField, Options } from './types';

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
export function aadhaarIssue(v: string): string | null {
  const d = v.replace(/[\s-]/g, '');
  if (!d) return 'Aadhaar number is required';
  return /^[2-9]\d{11}$/.test(d) && verhoeffValid(d) ? null : 'Aadhaar number must be 12 digits with a valid checksum';
}
export function dobIssue(v: string, today = new Date()): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return 'Date of birth is required';
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  if (d.getUTCMonth() !== +m[2]! - 1) return 'Date of birth is not a real date';
  if (d > today) return 'Date of birth cannot be in the future';
  const age =
    today.getUTCFullYear() - d.getUTCFullYear() - (today < new Date(Date.UTC(today.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) ? 1 : 0);
  return age < 14 || age > 100 ? 'Applicant must be between 14 and 100 years old' : null;
}
const required = (label: string) => (v: string) => (v.trim() ? null : `${label} is required`);
const text = (label: string, max: number) => (v: string) =>
  !v.trim() ? `${label} is required` : v.trim().length > max ? `${label} must be at most ${max} characters` : null;

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
  taluka_id: 'Taluka',
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
  qualification_name: 'Qualification Name',
  qualification_stream: 'Subject / Stream / Branch',
  qualification_board: 'Board / University',
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

export function pinCodeIssue(v: string): string | null {
  if (!v.trim()) return 'PIN code is required';
  return /^[1-9]\d{5}$/.test(v.trim()) ? null : 'PIN code must be 6 digits and cannot start with 0';
}
export function completedOnIssue(v: string, today = localToday()): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return 'Qualification completion date is required';
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  if (d.getUTCMonth() !== +m[2]! - 1 || d.getUTCDate() !== +m[3]!) return 'Qualification completion date is not a real date';
  return v > today ? 'Qualification completion date cannot be in the future' : null;
}
export function scoreIssue(v: string, gradingType: string, cgpaScale: string): string | null {
  const t = v.trim();
  if (!t) return 'Score is required';
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return 'Score must be a number with at most 2 decimal places';
  const n = Number(t);
  if (gradingType === 'CGPA') {
    const scale = Number(cgpaScale);
    if (!scale) return null; /* the scale itself is reported missing */
    return n > scale ? `CGPA must be between 0 and ${scale}` : null;
  }
  if (gradingType === 'PERCENTAGE') return n > 100 ? 'Percentage must be between 0 and 100' : null;
  return null;
}

/* What a rule may look at besides the value: the whole form (conditional rules) and the dropdown lists. */
export interface RuleContext {
  form: Form;
  options?: { [K in 'genders' | 'marital_statuses' | 'cgpa_scales' | 'qualification_classes']?: Options[K] };
  today?: string;
}
type Rule = (v: string, ctx: RuleContext) => string | null;
const oneOf =
  (label: string, list: (ctx: RuleContext) => readonly string[] | undefined): Rule =>
  (v, ctx) => {
    if (!v.trim()) return `${label} is required`;
    const items = list(ctx);
    return items && items.length && !items.includes(v) ? `Select a valid ${label.toLowerCase()}` : null;
  };
const yesNo = (label: string): Rule => (v) => (v === 'Yes' || v === 'No' ? null : `${label}: select Yes or No`);
const optionalMax = (label: string, max: number): Rule => (v) => (v.trim().length > max ? `${label} must be at most ${max} characters` : null);

const RULES: Record<FormField, Rule> = {
  first_name: (v) => nameIssue('First name', v, 100),
  last_name: (v) => nameIssue('Last name', v, 100),
  father_name: (v) => nameIssue('Father name', v, 150),
  mother_name: (v) => nameIssue('Mother name', v, 150),
  email: (v) => emailIssue(v),
  date_of_birth: (v) => dobIssue(v),
  current_address: text('Current address', 500),
  aadhaar_number: (v) => aadhaarIssue(v),
  mobile_number: (v) => mobileIssue(v),
  religion: required('Religion'),
  caste_id: required('Caste'),
  gender: oneOf('Gender', (c) => c.options?.genders),
  marital_status: oneOf('Marital status', (c) => c.options?.marital_statuses),
  permanent_address: text('Permanent address', 500),
  landmark: optionalMax('Landmark', 150),
  district_id: required('District'),
  taluka_id: required('Taluka'),
  pin_code: pinCodeIssue,
  alternate_mobile_number: (v, { form }) => {
    if (!v.trim()) return null;
    const alt = normaliseMobile(v);
    if (!/^[6-9]\d{9}$/.test(alt)) return 'Alternate mobile number must be a 10-digit Indian number starting 6–9';
    return alt === normaliseMobile(form.mobile_number ?? '') ? 'Alternate mobile number must be different from the mobile number' : null;
  },
  alternate_email: (v, { form }) => {
    const t = v.trim();
    if (!t) return null;
    if (t.length > 254 || !EMAIL_RE.test(t)) return 'Enter a valid alternate email address';
    return t.toLowerCase() === (form.email ?? '').trim().toLowerCase() ? 'Alternate email must be different from your account email' : null;
  },
  disability_status: yesNo('Person with disability'),
  disability_type: (v, { form }) => (isDisabled(form) ? text('Type of disability', 100)(v) : null),
  disability_certificate_number: (v, { form }) => {
    if (!isDisabled(form)) return null;
    if (!v.trim()) return 'Disability certificate number is required';
    return /^[A-Za-z0-9/-]{4,50}$/.test(v.trim())
      ? null
      : 'Disability certificate number must be 4–50 characters: letters, digits, / and - only';
  },
  region_id: required('Course district'),
  centre_id: required('Center name'),
  /* Only non-empty here: whether the chosen centre offers it is checked by the server (body.technology). */
  technology: required('Technology'),
  education_id: required('Education qualification'),
  qualification_name: text('Qualification name', 150),
  qualification_stream: text('Subject / stream / branch', 150),
  qualification_board: text('Board / university', 200),
  qualification_completed_on: (v, { today }) => completedOnIssue(v, today),
  grading_type: (v) => (v === 'PERCENTAGE' || v === 'CGPA' ? null : 'Grading type is required'),
  cgpa_scale: (v, ctx) => {
    if (!isCgpa(ctx.form)) return null;
    if (!v.trim()) return 'CGPA scale is required';
    const scales = (ctx.options?.cgpa_scales?.length ? ctx.options.cgpa_scales : [4, 5, 10]).map(String);
    return scales.includes(v) ? null : 'Select a valid CGPA scale';
  },
  score: (v, { form }) => scoreIssue(v, form.grading_type ?? '', form.cgpa_scale ?? ''),
  qualification_class: oneOf('Class / division', (c) => c.options?.qualification_classes),
};

export function checkFields(
  form: Form,
  fields: readonly FormField[],
  ctx: Omit<RuleContext, 'form'> = {},
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const issue = RULES[f](form[f] ?? '', { ...ctx, form });
    if (issue) errors[f] = issue;
  }
  return errors;
}

export const MAX_FILE_MB = 5;
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
 * A document type's upload rule, as the server sends it (formats, max_mb); PDF / JPG / JPEG / PNG up to 5 MB when not
 * given. `short` is the line shown in the drop area (JPEG is the same format as JPG).
 */
export function fileRule(t?: { formats?: string[]; max_mb?: number }) {
  const formats = t?.formats?.length ? t.formats.map((f) => f.toUpperCase()) : DEFAULT_FORMATS;
  const maxMb = t?.max_mb ?? MAX_FILE_MB;
  const mimes = [...new Set(formats.map((f) => FORMAT_MIME[f]).filter(Boolean))];
  return {
    formats,
    maxMb,
    accept: [...formats.map((f) => `.${f.toLowerCase()}`), ...mimes].join(','),
    short: formats.filter((f) => f !== 'JPEG').join(', '),
  };
}

export function fileIssue(f: File, t?: { formats?: string[]; max_mb?: number }): string | null {
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
export function centreIssues(f: CentreForm, technologyCount = 0): Record<string, string> {
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
  if (technologyCount > 50) e.technologyCodes = 'At most 50 technologies';
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
