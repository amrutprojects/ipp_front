import { centreIssues, checkFields, completedOnIssue, pinCodeIssue, scoreIssue } from '../src/validation';
import type { Form } from '../src/types';

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
    const f = ['alternate_mobile_number', 'alternate_email'] as const;
    expect(checkFields(base, f)).toEqual({});
    expect(checkFields({ ...base, alternate_mobile_number: '9765412345' }, f).alternate_mobile_number).toMatch(/different/);
    expect(checkFields({ ...base, alternate_mobile_number: '+91 98220 12345' }, f)).toEqual({});
    expect(checkFields({ ...base, alternate_mobile_number: '12345' }, f).alternate_mobile_number).toMatch(/10-digit/);
    expect(checkFields({ ...base, alternate_email: 'KAVYA@example.com' }, f).alternate_email).toMatch(/different/);
    expect(checkFields({ ...base, alternate_email: 'not-an-email' }, f).alternate_email).toMatch(/valid/);
  });

  it('disability type and certificate are checked only for Yes', () => {
    const f = ['disability_status', 'disability_type', 'disability_certificate_number'] as const;
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
    expect(checkFields({ ...base, grading_type: 'CGPA', cgpa_scale: '' }, ['cgpa_scale']).cgpa_scale).toBe('CGPA scale is required');
    expect(checkFields(base, ['cgpa_scale'])).toEqual({});
  });

  it('completion date: a real date, not in the future', () => {
    expect(completedOnIssue('2023-05-31', '2026-10-28')).toBeNull();
    expect(completedOnIssue('2026-10-28', '2026-10-28')).toBeNull();
    expect(completedOnIssue('2026-10-29', '2026-10-28')).toMatch(/future/);
    expect(completedOnIssue('2023-02-30', '2026-10-28')).toMatch(/real date/);
    expect(completedOnIssue('', '2026-10-28')).toMatch(/required/);
  });

  it('gender and class must be one of the options', () => {
    const options = { genders: ['Male', 'Female', 'Transgender'], qualification_classes: ['First Class'] };
    expect(
      checkFields({ ...base, gender: 'Other', qualification_class: 'First Class' } as Form, ['gender', 'qualification_class'], { options }),
    ).toEqual({ gender: 'Select a valid gender' });
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
