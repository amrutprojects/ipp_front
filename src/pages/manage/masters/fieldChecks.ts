import type { CustomCheck, FieldType, FieldValidation, RuleType, ValidationRule } from '../../../types';
import { limitOf, OWN_TEXTAREA_MAX, OWN_TEXT_MAX, realDate, regexIssue, rulesOf, TIME_RE, YEAR_MAX, YEAR_MIN } from '../../../validation';

/*
 * The validation of a field as its dialog holds it (ValidationSection.tsx): the limits typed, the checks ticked and the
 * custom checks; what is wrong with them, what is sent, and how they are read in the table.
 */

/* The limits of each type, two to a row: minimum, maximum. */
export const LIMITS: Partial<Record<FieldType, [RuleType, string][]>> = {
  TEXT: [
    ['min_length', 'Minimum characters'],
    ['max_length', 'Maximum characters'],
  ],
  TEXTAREA: [
    ['min_length', 'Minimum characters'],
    ['max_length', 'Maximum characters'],
  ],
  NUMBER: [
    ['min_value', 'Minimum value'],
    ['max_value', 'Maximum value'],
    ['min_digits', 'Minimum digits'],
    ['max_digits', 'Maximum digits'],
  ],
  DATE: [
    ['min_date', 'Earliest date'],
    ['max_date', 'Latest date'],
    ['min_age', 'Minimum age (years)'],
    ['max_age', 'Maximum age (years)'],
  ],
  TIME: [
    ['min_time', 'Earliest time'],
    ['max_time', 'Latest time'],
  ],
  YEAR: [
    ['min_value', 'Earliest year'],
    ['max_value', 'Latest year'],
  ],
  CHECKBOXES: [
    ['min_choices', 'Minimum choices'],
    ['max_choices', 'Maximum choices'],
  ],
};
/* The checks without a limit. */
export const CHECK_LABEL: Partial<Record<RuleType, string>> = {
  letters: 'Letters only',
  digits: 'Digits only',
  letters_digits: 'Letters and digits only',
  no_spaces: 'No spaces',
  uppercase: 'Capital letters only',
  pin_code: 'PIN code (6 digits)',
  pan: 'PAN number',
  ifsc: 'IFSC code',
  whole_number: 'Whole number',
  not_future: 'Not in the future',
  not_past: 'Not in the past',
};
export const checksOf = (type: FieldType) => rulesOf(type).filter((t) => !limitOf(t));

export const CUSTOM_MAX = 5;
export const KIND_LABEL: Record<CustomCheck['kind'], string> = { REGEX: 'Regular expression', JS: 'JavaScript function' };
export const JS_TEMPLATE = `function (value, form) {
  // value: the answer, as text
  // form: the other answers by key, e.g. form.first_name (without the Aadhaar number)
  // return true: the answer is right
  // return false: it is wrong, and the error message below is shown
  // return a text: it is wrong, and that text is shown
  return true;
}`;

export interface CheckDraft {
  /* Its own in this dialog: the errors follow it when another one is removed. */
  id: number;
  kind: CustomCheck['kind'];
  source: string;
  flags: string;
  message_en: string;
  message_mr: string;
}
export interface ValidationDraft {
  /* As typed; '' = no limit. */
  limits: Partial<Record<RuleType, string>>;
  ticked: RuleType[];
  custom: CheckDraft[];
}

let lastId = 0;
export const newCheck = (kind: CustomCheck['kind']): CheckDraft => ({
  id: ++lastId,
  kind,
  source: kind === 'JS' ? JS_TEMPLATE : '',
  flags: kind === 'JS' ? '' : 'u',
  message_en: '',
  message_mr: '',
});

/* Only what fits the type. */
export const fitting = (d: ValidationDraft, type: FieldType): ValidationDraft => ({
  ...d,
  limits: Object.fromEntries(Object.entries(d.limits).filter(([t]) => rulesOf(type).includes(t as RuleType))),
  ticked: d.ticked.filter((t) => rulesOf(type).includes(t)),
});

export function toDraft(v: FieldValidation | null | undefined, type: FieldType): ValidationDraft {
  const rules = v?.rules ?? [];
  return fitting(
    {
      limits: Object.fromEntries(rules.filter((r) => limitOf(r.type) && r.value !== undefined).map((r) => [r.type, String(r.value)])),
      ticked: rules.filter((r) => !limitOf(r.type)).map((r) => r.type),
      custom: (v?.custom ?? []).map((c) => ({
        id: ++lastId,
        kind: c.kind,
        source: c.source ?? '',
        flags: c.kind === 'REGEX' ? (c.flags ?? '') : '',
        message_en: c.message_en,
        message_mr: c.message_mr ?? '',
      })),
    },
    type,
  );
}

/* What is sent; null = no validation. */
export function payloadOf(d: ValidationDraft, type: FieldType): FieldValidation | null {
  const rules = rulesOf(type).flatMap((t): ValidationRule[] => {
    const limit = limitOf(t);
    if (!limit) return d.ticked.includes(t) ? [{ type: t }] : [];
    const text = (d.limits[t] ?? '').trim();
    return text ? [{ type: t, value: limit === 'number' ? Number(text) : text }] : [];
  });
  const custom = d.custom.map((c): CustomCheck => {
    const messages = { message_en: c.message_en.trim(), message_mr: c.message_mr.trim() || null };
    return c.kind === 'JS' ? { kind: 'JS', source: c.source, ...messages } : { kind: 'REGEX', source: c.source, flags: c.flags || undefined, ...messages };
  });
  return rules.length || custom.length ? { rules, custom } : null;
}

/* A limit that is a whole number: from, to. */
function wholeRange(rule: RuleType, type: FieldType): [number, number] | null {
  if (rule.endsWith('_length')) return [1, type === 'TEXTAREA' ? OWN_TEXTAREA_MAX : OWN_TEXT_MAX];
  if (rule.endsWith('_digits')) return [1, 16];
  if (rule.endsWith('_age')) return [0, 120];
  if (rule.endsWith('_choices')) return [1, 100];
  return rule.endsWith('_value') && type === 'YEAR' ? [YEAR_MIN, YEAR_MAX] : null;
}
function limitIssue(rule: RuleType, type: FieldType, text: string): string {
  switch (limitOf(rule)) {
    case 'date':
      /* A year typed with two digits reads as 0026. */
      return realDate(text) && text >= '1900-01-01' && text <= '2200-12-31' ? '' : 'Enter a real date';
    case 'time':
      return TIME_RE.test(text) ? '' : 'Enter a time';
    default: {
      const range = wholeRange(rule, type);
      if (!range) return /^-?\d{1,12}(\.\d{1,4})?$/.test(text) ? '' : 'Enter a number';
      return /^\d{1,6}$/.test(text) && Number(text) >= range[0] && Number(text) <= range[1] ? '' : `Enter a whole number from ${range[0]} to ${range[1]}`;
    }
  }
}

/*
 * What is wrong before anything is sent, by box: rule.<type> and check.<id>.<part>. `half` = date and time boxes that are
 * only half filled in (they read as empty).
 */
export function draftIssues(d: ValidationDraft, type: FieldType, half: RuleType[] = []): Record<string, string> {
  const e: Record<string, string> = {};
  const textOf = (t: RuleType) => (d.limits[t] ?? '').trim();
  for (const t of rulesOf(type)) {
    if (!limitOf(t)) continue;
    const issue = half.includes(t) ? limitIssue(t, type, '') : textOf(t) ? limitIssue(t, type, textOf(t)) : '';
    if (issue) e[`rule.${t}`] = issue;
  }
  for (const max of rulesOf(type).filter((t) => t.startsWith('max_'))) {
    const min = max.replace(/^max/, 'min') as RuleType;
    const [from, to] = [textOf(min), textOf(max)];
    if (!from || !to || e[`rule.${min}`] || e[`rule.${max}`]) continue;
    if (limitOf(max) === 'number' ? Number(from) > Number(to) : from > to) e[`rule.${max}`] = 'The maximum is smaller than the minimum';
  }
  for (const c of d.custom) {
    if (!c.source.trim()) e[`check.${c.id}.source`] = c.kind === 'JS' ? 'Enter the function' : 'Enter the regular expression';
    else if (c.kind === 'REGEX') {
      const issue = regexIssue(c.source, c.flags);
      if (issue) e[`check.${c.id}.source`] = `This is not a valid regular expression: ${issue}`;
    }
    if (!c.message_en.trim()) e[`check.${c.id}.message_en`] = 'The error message is required';
  }
  return e;
}

/* The server's errors (validation.rules.<i>.value, validation.custom.<i>.source, …) by the same boxes, for what was sent. */
export function serverIssues(fields: Record<string, string>, d: ValidationDraft, type: FieldType): Record<string, string> {
  const sent = payloadOf(d, type);
  const e: Record<string, string> = {};
  for (const [key, message] of Object.entries(fields)) {
    const m = /^validation(?:\.(rules|custom)(?:\.(\d+)(?:\.(\w+))?)?)?$/.exec(key);
    if (!m) continue;
    const [, list, index, part] = m;
    const rule = list === 'rules' && index ? sent?.rules[Number(index)] : undefined;
    const check = list === 'custom' && index ? d.custom[Number(index)] : undefined;
    const box = rule
      ? `rule.${rule.type}`
      : check
        ? `check.${check.id}.${part === 'flags' || part === 'message_en' || part === 'message_mr' ? part : 'source'}`
        : list === 'custom'
          ? 'custom'
          : 'rules';
    e[box] ??= message;
  }
  return e;
}

/* ---------- As read in the table ---------- */

const plural = (n: number | string, one: string) => `${n} ${one}${Number(n) === 1 ? '' : 's'}`;
/* "3–50 characters", "at least 3 characters", "10 digits". */
const counted = (from: string | undefined, to: string | undefined, one: string) =>
  from && to ? (from === to ? plural(from, one) : `${from}–${plural(to, one)}`) : from ? `at least ${plural(from, one)}` : `at most ${plural(to!, one)}`;
/* "from 1 to 100", "at least 1", "exactly 5". */
const between = (from: string | undefined, to: string | undefined, least: string, most: string) =>
  from && to ? (from === to ? `exactly ${from}` : `from ${from} to ${to}`) : from ? `${least} ${from}`.trim() : `${most} ${to}`;
const day = (v: string | undefined) => v?.split('-').reverse().join('/');

function limitsText(v: FieldValidation): string[] {
  const value = (t: RuleType) => {
    const r = v.rules?.find((x) => x.type === t);
    return r?.value === undefined ? undefined : String(r.value);
  };
  const pair = (name: string, text: (from: string | undefined, to: string | undefined) => string) => {
    const [from, to] = [value(`min_${name}` as RuleType), value(`max_${name}` as RuleType)];
    return from || to ? [text(from, to)] : [];
  };
  return [
    ...pair('length', (a, b) => counted(a, b, 'character')),
    ...pair('digits', (a, b) => counted(a, b, 'digit')),
    ...pair('value', (a, b) => between(a, b, 'at least', 'at most')),
    ...pair('date', (a, b) => between(day(a), day(b), 'on or after', 'on or before')),
    ...pair('age', (a, b) => (a && b ? `age ${a === b ? a : `${a}–${b}`}` : a ? `age at least ${a}` : `age at most ${b}`)),
    ...pair('time', (a, b) => (a && b ? `from ${a} to ${b}` : a ? `${a} or later` : `${b} or earlier`)),
    ...pair('choices', (a, b) => counted(a, b, 'choice')),
  ];
}

/* "3–50 characters, Letters only, 1 expression, 1 function"; '' = none. */
export function checksText(v: FieldValidation | null | undefined): string {
  if (!v) return '';
  const own = (kind: CustomCheck['kind'], one: string) => {
    const n = (v.custom ?? []).filter((c) => c.kind === kind).length;
    return n ? [plural(n, one)] : [];
  };
  return [
    ...limitsText(v),
    ...(v.rules ?? []).flatMap((r) => CHECK_LABEL[r.type]?.replace(/ \(.*\)$/, '') ?? []),
    ...own('REGEX', 'expression'),
    ...own('JS', 'function'),
  ].join(', ');
}
