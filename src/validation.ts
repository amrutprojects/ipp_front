/*
 * Client-side checks matching the API's rules (amrut-kalash-api registration.validation.ts and edp.validation.ts), so
 * most mistakes are shown before anything is sent. The server checks everything again.
 */
import type { Form, FormField } from './types';

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
  region_id: 'Course Centre',
  technology: 'Technology / 3rd module selection',
  education_id: 'Education Qualification',
};

const RULES: Record<FormField, (v: string) => string | null> = {
  first_name: (v) => nameIssue('First name', v, 100),
  last_name: (v) => nameIssue('Last name', v, 100),
  father_name: (v) => nameIssue('Father name', v, 150),
  mother_name: (v) => nameIssue('Mother name', v, 150),
  email: emailIssue,
  date_of_birth: (v) => dobIssue(v),
  current_address: text('Current address', 500),
  aadhaar_number: aadhaarIssue,
  mobile_number: mobileIssue,
  religion: required('Religion'),
  caste_id: required('Caste'),
  region_id: required('Course centre'),
  technology: required('Technology'),
  education_id: required('Education qualification'),
};

export function checkFields(form: Form, fields: readonly FormField[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const issue = RULES[f](form[f] ?? '');
    if (issue) errors[f] = issue;
  }
  return errors;
}

export const BARCODE_RE = /^\d{18}$/;
export const MAX_FILE_MB = 5;
export const ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
export function fileIssue(f: File): string | null {
  if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) return 'Only PDF, JPG, JPEG or PNG files are accepted';
  if (f.size > MAX_FILE_MB * 1024 * 1024) return `File is larger than ${MAX_FILE_MB} MB`;
  return null;
}
