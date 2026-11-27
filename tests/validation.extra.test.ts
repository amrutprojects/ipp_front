import { centreIssues, checkFields, FIELD_LABELS, type FieldRule } from '../src/validation';
import type { Form, FormField } from '../src/types';
import { DEFAULT_CHECKS } from './defaultChecks';

/* A field of the program under its usual name, with the checks it starts with (Masters → Form fields). */
const rule = (key: FormField, over: Partial<FieldRule> = {}): FieldRule => ({
  key,
  label: FIELD_LABELS[key],
  required: true,
  type: 'TEXT',
  choices: null,
  validation: DEFAULT_CHECKS[key] ?? null,
  ...over,
});

const base = {
  mobile_number: '9765412345',
  email: 'kavya@example.com',
  disability_status: 'No',
  disability_type: '',
  disability_certificate_number: '',
  grading_type: 'PERCENTAGE',
  cgpa_scale: '',
  score: '72.5',
  alternate_mobile_number: '',
  alternate_email: '',
} as unknown as Form;

describe('new registration fields', () => {
  it('PIN code: exactly 6 digits, not starting with 0 (its check pin_code)', () => {
    const pin = (v: string) => checkFields({ ...base, pin_code: v } as Form, [rule('pin_code')]).pin_code;
    expect(pin('411038')).toBeUndefined();
    expect(pin('')).toBe('PIN Code is required');
    expect(pin('011038')).toBe('PIN Code must be exactly 6 digits');
    expect(pin('41103')).toBe('PIN Code must be exactly 6 digits');
    /* Its check taken away: any text. */
    expect(checkFields({ ...base, pin_code: '0' } as Form, [rule('pin_code', { validation: null })])).toEqual({});
  });

  it('alternate mobile and email are optional, but valid when given; the e-mail different, the mobile may be the same', () => {
    const f = [
      rule('alternate_mobile_number', { required: false, other: { key: 'mobile_number', label: 'Mobile Number' } }),
      rule('alternate_email', { required: false, other: { key: 'email', label: 'Email' } }),
    ];
    expect(checkFields(base, f)).toEqual({});
    /* The WhatsApp number may be the mobile number: it has no "different from" check any more (ipp_backend migration 0011). */
    expect(checkFields({ ...base, alternate_mobile_number: '9765412345' }, f)).toEqual({});
    /* Given that check by an ADMIN, it is kept. */
    const differing = [
      rule('alternate_mobile_number', {
        required: false,
        other: { key: 'mobile_number', label: 'Mobile Number' },
        validation: { rules: [{ type: 'indian_mobile' }, { type: 'different_from', value: 'mobile_number' }], custom: [] },
      }),
    ];
    expect(checkFields({ ...base, alternate_mobile_number: '9765412345' }, differing).alternate_mobile_number).toMatch(/different/);
    expect(checkFields({ ...base, alternate_mobile_number: '+91 98220 12345' }, f)).toEqual({});
    expect(checkFields({ ...base, alternate_mobile_number: '12345' }, f).alternate_mobile_number).toMatch(/10-digit/);
    expect(checkFields({ ...base, alternate_email: 'KAVYA@example.com' }, f).alternate_email).toMatch(/different/);
    expect(checkFields({ ...base, alternate_email: 'not-an-email' }, f).alternate_email).toMatch(/valid/);
  });

  it('disability type and certificate are checked only for Yes', () => {
    const f = [rule('disability_status'), rule('disability_type'), rule('disability_certificate_number')];
    expect(checkFields(base, f)).toEqual({});
    expect(Object.keys(checkFields({ ...base, disability_status: 'Yes' }, f))).toEqual(['disability_type', 'disability_certificate_number']);
    expect(
      checkFields({ ...base, disability_status: 'Yes', disability_type: 'Visual', disability_certificate_number: 'MH/PUN-2024/77' }, f),
    ).toEqual({});
    expect(
      checkFields({ ...base, disability_status: 'Yes', disability_type: 'Visual', disability_certificate_number: 'ab!' }, f)
        .disability_certificate_number,
    ).toMatch(/4–50/);
    expect(checkFields({ ...base, disability_status: '' }, f).disability_status).toMatch(/Yes or No/);
  });

  it('score: percentage 0–100, CGPA up to its scale, 2 decimals at most (its checks)', () => {
    const score = (v: string, grading_type: string, cgpa_scale = '') =>
      checkFields({ ...base, score: v, grading_type, cgpa_scale } as Form, [rule('score', { type: 'NUMBER' })]).score;
    expect(score('100', 'PERCENTAGE')).toBeUndefined();
    expect(score('100.01', 'PERCENTAGE')).toBe('Percentage must be between 0 and 100');
    expect(score('72.555', 'PERCENTAGE')).toBe('Score must have at most 2 decimal places');
    expect(score('9.5', 'CGPA', '10')).toBeUndefined();
    expect(score('4.5', 'CGPA', '4')).toBe('CGPA must be between 0 and 4');
    expect(score('-1', 'PERCENTAGE')).toBe('Score must be at least 0');
    /* Without "within its grading": any number. */
    expect(checkFields({ ...base, score: '250' } as Form, [rule('score', { type: 'NUMBER', validation: null })])).toEqual({});
    expect(checkFields({ ...base, grading_type: 'CGPA', cgpa_scale: '' }, [rule('cgpa_scale')]).cgpa_scale).toBe('CGPA Scale is required');
    expect(checkFields(base, [rule('cgpa_scale')])).toEqual({});
  });

  it('completion date: a real date, not in the future (its checks)', () => {
    const done = (v: string) =>
      checkFields({ ...base, qualification_completed_on: v } as Form, [rule('qualification_completed_on', { type: 'DATE' })], {
        today: '2026-10-28',
      }).qualification_completed_on;
    expect(done('2023-05-31')).toBeUndefined();
    expect(done('2026-10-28')).toBeUndefined();
    expect(done('2026-10-29')).toMatch(/future/);
    expect(done('2023-02-30')).toMatch(/real date/);
    expect(done('')).toMatch(/required/);
    expect(done('1939-12-31')).toBe('Qualification Completed On must be on or after 31/12/1939'.replace('31/12/1939', '01/01/1940'));
  });

  it('a dropdown value must be one of its choices, under the current name of the field', () => {
    const f = [
      rule('gender', { choices: ['Male', 'Female', 'Transgender'] }),
      rule('qualification_class', { label: 'Class', choices: ['First Class'] }),
      rule('religion', { choices: [] }),
    ];
    expect(checkFields({ ...base, gender: 'Other', qualification_class: 'Second Class', religion: 'x' } as Form, f)).toEqual({
      gender: 'Select a valid Gender',
      qualification_class: 'Select a valid Class',
    });
    expect(checkFields({ ...base, gender: 'Male', qualification_class: 'First Class', religion: 'x' } as Form, f)).toEqual({});
  });

  it('own fields are checked by their type; an optional one only when filled', () => {
    const own = (type: FieldRule['type'], required = false): FieldRule => ({ key: 'x_own', label: 'Own', required, type, choices: null });
    const check = (value: string, f: FieldRule) => checkFields({ ...base, x_own: value } as Form, [f]).x_own;
    expect(check('', own('TEXT'))).toBeUndefined();
    expect(check(' ', own('TEXT', true))).toBe('Own is required');
    expect(check('x'.repeat(251), own('TEXT'))).toBe('Own must be at most 250 characters');
    expect(check('x'.repeat(2001), own('TEXTAREA'))).toBe('Own must be at most 2000 characters');
    expect(check('12a', own('NUMBER'))).toBe('Own must be a number');
    expect(check('-12.5', own('NUMBER'))).toBeUndefined();
    expect(check('2026-02-30', own('DATE'))).toBe('Own is not a real date');
    expect(check('2026-02-28', own('DATE'))).toBeUndefined();
  });

  it('messages are in the chosen language', () => {
    const T = (mr: string) => mr;
    expect(checkFields({ ...base, pin_code: '' } as Form, [rule('pin_code', { label: 'पिन कोड' })], { T }).pin_code).toBe('पिन कोड आवश्यक आहे');
  });
});

describe('Center Master form rules', () => {
  const ok = {
    name: 'Baramati Centre',
    code: 'PUN-01',
    stateId: 's1',
    districtId: 'd1',
    talukaId: '',
    address: '',
    pinCode: '',
    contactPerson: '',
    contactNumber: '',
    email: '',
  };
  it('accepts a minimal centre and reports bad values', () => {
    expect(centreIssues(ok)).toEqual({});
    expect(Object.keys(centreIssues({ ...ok, code: '1AB', districtId: '', pinCode: '123', contactNumber: '12345', email: 'x' }))).toEqual([
      'code',
      'districtId',
      'pinCode',
      'contactNumber',
      'email',
    ]);
    expect(centreIssues({ ...ok, contactNumber: '020-24567890' })).toEqual({});
  });
});
