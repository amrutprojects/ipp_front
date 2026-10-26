import { aadhaarIssue, checkFields, dobIssue, mobileIssue, nameIssue, passwordIssue, verhoeffValid } from '../src/validation';
import type { Form } from '../src/types';

/* Same Verhoeff digit as amrut-kalash-api withVerhoeffDigit. */
function withCheck(base: string): string {
  for (let d = 0; d <= 9; d++) if (verhoeffValid(base + d)) return base + d;
  throw new Error('no digit');
}

describe('client-side rules match the API', () => {
  it('Aadhaar: 12 digits, not starting 0/1, valid checksum; spaces allowed', () => {
    const ok = withCheck('34567891234');
    expect(aadhaarIssue(ok)).toBeNull();
    expect(aadhaarIssue(`${ok.slice(0, 4)} ${ok.slice(4, 8)} ${ok.slice(8)}`)).toBeNull();
    expect(aadhaarIssue('123412341234')).toMatch(/checksum/);
    expect(aadhaarIssue('')).toBe('Aadhaar number is required');
  });

  it('mobile: Indian 10 digits starting 6–9, +91 or 0 prefix allowed', () => {
    expect(mobileIssue('9765412345')).toBeNull();
    expect(mobileIssue('+91 97654 12345')).toBeNull();
    expect(mobileIssue('09765412345')).toBeNull();
    expect(mobileIssue('5765412345')).toMatch(/starting 6–9/);
  });

  it('password: 8+ characters with a letter and a digit', () => {
    expect(passwordIssue('abcdefg1')).toBeNull();
    expect(passwordIssue('abcdefgh')).toBe('Password must contain a digit');
    expect(passwordIssue('1234567')).toBe('Password must be at least 8 characters');
  });

  it('names and date of birth', () => {
    expect(nameIssue('First name', 'Kavya', 100)).toBeNull();
    expect(nameIssue('First name', 'K4vya', 100)).toMatch(/only letters/);
    expect(nameIssue('Middle name', '', 100, false)).toBeNull();
    const today = new Date(Date.UTC(2026, 9, 24));
    expect(dobIssue('2002-06-01', today)).toBeNull();
    expect(dobIssue('2020-01-01', today)).toMatch(/between 14 and 100/);
    expect(dobIssue('2027-01-01', today)).toMatch(/future/);
    expect(dobIssue('2002-02-30', today)).toMatch(/real date/);
  });

  it('checkFields reports every missing field of a step', () => {
    const empty = Object.fromEntries(
      ['first_name', 'region_id', 'technology', 'education_id'].map((k) => [k, '']),
    ) as unknown as Form;
    expect(Object.keys(checkFields(empty, ['region_id', 'technology', 'education_id']))).toEqual(['region_id', 'technology', 'education_id']);
  });
});
