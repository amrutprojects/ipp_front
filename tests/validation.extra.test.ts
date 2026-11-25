import {
  centreIssues,
  checkFields,
  completedOnIssue,
  FIELD_LABELS,
  pinCodeIssue,
  scoreIssue,
  type FieldRule,
} from '../src/validation';
import type { Form, FormField } from '../src/types';

const rule = (key: FormField, over: Partial<FieldRule> = {}): FieldRule => ({
  key,
  label: FIELD_LABELS[key],
  required: true,
  type: 'TEXT',
  choices: null,
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
  it('PIN code: exactly 6 digits, not starting with 0', () => {
    expect(pinCodeIssue('411038')).toBeNull();
    expect(pinCodeIssue('')).toBe('PIN code is required');
    expect(pinCodeIssue('011038')).toMatch(/cannot start with 0/);
    expect(pinCodeIssue('41103')).toMatch(/6 digits/);
  });

  it('alternate mobile and email are optional, but valid and different when given', () => {
    const f = [rule('alternate_mobile_number', { required: false }), rule('alternate_email', { required: false })];
    expect(checkFields(base, f)).toEqual({});
    expect(checkFields({ ...base, alternate_mobile_number: '9765412345' }, f).alternate_mobile_number).toMatch(/different/);
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

  it('score: percentage 0–100, CGPA up to its scale, 2 decimals at most', () => {
    expect(scoreIssue('100', 'PERCENTAGE', '')).toBeNull();
    expect(scoreIssue('100.01', 'PERCENTAGE', '')).toMatch(/between 0 and 100/);
    expect(scoreIssue('72.555', 'PERCENTAGE', '')).toMatch(/2 decimal/);
    expect(scoreIssue('9.5', 'CGPA', '10')).toBeNull();
    expect(scoreIssue('4.5', 'CGPA', '4')).toMatch(/between 0 and 4/);
    expect(checkFields({ ...base, grading_type: 'CGPA', cgpa_scale: '' }, [rule('cgpa_scale')]).cgpa_scale).toBe('CGPA Scale is required');
    expect(checkFields(base, [rule('cgpa_scale')])).toEqual({});
  });

  it('completion date: a real date, not in the future', () => {
    expect(completedOnIssue('2023-05-31', '2026-10-28')).toBeNull();
    expect(completedOnIssue('2026-10-28', '2026-10-28')).toBeNull();
    expect(completedOnIssue('2026-10-29', '2026-10-28')).toMatch(/future/);
    expect(completedOnIssue('2023-02-30', '2026-10-28')).toMatch(/real date/);
    expect(completedOnIssue('', '2026-10-28')).toMatch(/required/);
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
