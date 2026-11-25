import { checksText, draftIssues, fitting, newCheck, payloadOf, serverIssues, toDraft } from '../src/pages/manage/masters/fieldChecks';
import { RULE_TYPES, type CustomCheck, type FieldType, type FieldValidation, type Form, type RuleType, type ValidationRule } from '../src/types';
import { checkFields, checkSaid, chosen, chosenText, regexIssue, rulesOf, wholeMatch, type FieldRule } from '../src/validation';

/* The checks of an own field: how the student's form and the Edit form make them, and how the master's dialog holds them. */
const TODAY = '2026-11-25';
const MR = (mr: string) => mr;
const own = (type: FieldType, validation: FieldValidation | null = null, over: Partial<FieldRule> = {}): FieldRule => ({
  key: 'x_own',
  label: 'Own',
  required: false,
  type,
  choices: null,
  validation,
  ...over,
});
const issue = (value: string, f: FieldRule, T?: (mr: string, en: string) => string) => checkFields({ x_own: value } as unknown as Form, [f], { T, today: TODAY }).x_own;
const rules = (...list: ValidationRule[]): FieldValidation => ({ rules: list, custom: [] });
const custom = (...list: CustomCheck[]): FieldValidation => ({ rules: [], custom: list });
const regex = (source: string, flags?: string, over: Partial<CustomCheck> = {}): CustomCheck =>
  ({ kind: 'REGEX', source, flags, message_en: 'Wrong', message_mr: 'चूक', ...over }) as CustomCheck;

describe('Ready-made checks and limits of an own field', () => {
  const CASES: [type: FieldType, rule: ValidationRule, right: string[], wrong: string[], en: string, mr: string][] = [
    ['TEXT', { type: 'letters' }, ['Asha', "D'Souza", 'आशा कुलकर्णी', 'A. B-C ’'], ['Asha1', 'a@b'], 'Own may contain only letters and spaces', 'Own: फक्त अक्षरे आणि स्पेस वापरता येतात'],
    ['TEXT', { type: 'digits' }, ['0123'], ['12a', '1 2', '-1'], 'Own may contain only digits', 'Own: फक्त अंक वापरता येतात'],
    ['TEXT', { type: 'letters_digits' }, ['Flat 12', 'घर १२'], ['12/A', 'a-b'], 'Own may contain only letters, digits and spaces', 'Own: फक्त अक्षरे, अंक आणि स्पेस वापरता येतात'],
    ['TEXT', { type: 'no_spaces' }, ['a-b'], ['a b', 'a\tb'], 'Own cannot contain spaces', 'Own: स्पेस वापरता येत नाही'],
    ['TEXT', { type: 'uppercase' }, ['ABC 1', 'आशा'], ['Abc'], 'Own must be in capital letters', 'Own: मोठ्या (कॅपिटल) अक्षरांत लिहा'],
    ['TEXT', { type: 'pin_code' }, ['411038'], ['011038', '41103', '4110388'], 'Own must be exactly 6 digits', 'Own: नेमके ६ अंक टाका'],
    ['TEXT', { type: 'pan' }, ['ABCDE1234F', 'abcde1234f'], ['ABCD1234F', 'ABCDE12345'], 'Own must be a valid PAN, e.g. ABCDE1234F', 'Own: योग्य PAN टाका, उदा. ABCDE1234F'],
    ['TEXT', { type: 'ifsc' }, ['SBIN0001234', 'sbin0abc123'], ['SBIN1001234', 'SBI00001234'], 'Own must be a valid IFSC code, e.g. SBIN0001234', 'Own: योग्य IFSC कोड टाका, उदा. SBIN0001234'],
    ['TEXT', { type: 'min_length', value: 3 }, ['abc', 'abcd'], ['ab'], 'Own must be at least 3 characters', 'Own: किमान ३ वर्ण'],
    ['TEXTAREA', { type: 'max_length', value: 1000 }, ['x'.repeat(1000)], ['x'.repeat(1001)], 'Own must be at most 1000 characters', 'Own: जास्तीत जास्त १००० वर्ण'],
    ['NUMBER', { type: 'whole_number' }, ['12', '-3'], ['1.5'], 'Own must be a whole number', 'Own: पूर्णांक टाका'],
    ['NUMBER', { type: 'min_digits', value: 3 }, ['123', '-12.5'], ['-12', '1.5'], 'Own must have at least 3 digits', 'Own: किमान ३ अंक असावेत'],
    ['NUMBER', { type: 'max_digits', value: 3 }, ['123', '-12.5'], ['1234', '-12.34'], 'Own must have at most 3 digits', 'Own: जास्तीत जास्त ३ अंक असावेत'],
    ['NUMBER', { type: 'min_value', value: 0.5 }, ['0.5', '10'], ['0.4', '-1'], 'Own must be at least 0.5', 'Own: किमान ०.५ असावे'],
    ['NUMBER', { type: 'max_value', value: 100 }, ['100', '9'], ['100.5'], 'Own must be at most 100', 'Own: जास्तीत जास्त १०० असावे'],
    ['DATE', { type: 'not_future' }, [TODAY, '2020-01-01'], ['2026-11-26'], 'Own cannot be in the future', 'Own भविष्यातील असू शकत नाही'],
    ['DATE', { type: 'not_past' }, [TODAY, '2027-01-01'], ['2026-11-24'], 'Own cannot be in the past', 'Own भूतकाळातील असू शकत नाही'],
    ['MONTH', { type: 'not_future' }, ['2026-11', '2025-12'], ['2026-12'], 'Own cannot be in the future', 'Own भविष्यातील असू शकत नाही'],
    ['MONTH', { type: 'not_past' }, ['2026-11', '2027-01'], ['2026-10'], 'Own cannot be in the past', 'Own भूतकाळातील असू शकत नाही'],
    ['YEAR', { type: 'not_future' }, ['2026'], ['2027'], 'Own cannot be in the future', 'Own भविष्यातील असू शकत नाही'],
    ['YEAR', { type: 'not_past' }, ['2026'], ['2025'], 'Own cannot be in the past', 'Own भूतकाळातील असू शकत नाही'],
    ['DATE', { type: 'min_date', value: '2020-04-01' }, ['2020-04-01'], ['2020-03-31'], 'Own must be on or after 01/04/2020', 'Own 01/04/2020 किंवा त्यानंतरची असावी'],
    ['DATE', { type: 'max_date', value: '2020-04-01' }, ['2020-04-01'], ['2020-04-02'], 'Own must be on or before 01/04/2020', 'Own 01/04/2020 किंवा त्यापूर्वीची असावी'],
    /* 18 today, and 18 tomorrow. */
    ['DATE', { type: 'min_age', value: 18 }, ['2008-11-25'], ['2008-11-26'], 'Own: age must be at least 18 years', 'Own: वय किमान १८ वर्षे असावे'],
    /* Still 35 until tomorrow. */
    ['DATE', { type: 'max_age', value: 35 }, ['1990-11-26'], ['1990-11-25'], 'Own: age must be at most 35 years', 'Own: वय जास्तीत जास्त ३५ वर्षे असावे'],
    ['TIME', { type: 'min_time', value: '09:30' }, ['09:30', '17:00'], ['09:29'], 'Own must be 09:30 or later', 'Own: वेळ 09:30 किंवा त्यानंतरची असावी'],
    ['TIME', { type: 'max_time', value: '17:00' }, ['17:00'], ['17:01'], 'Own must be 17:00 or earlier', 'Own: वेळ 17:00 किंवा त्यापूर्वीची असावी'],
    ['YEAR', { type: 'min_value', value: 2020 }, ['2020'], ['2019'], 'Own must be at least 2020', 'Own: किमान २०२० असावे'],
    ['YEAR', { type: 'max_value', value: 2030 }, ['2030'], ['2031'], 'Own must be at most 2030', 'Own: जास्तीत जास्त २०३० असावे'],
    ['CHECKBOXES', { type: 'min_choices', value: 2 }, ['["a","b"]'], ['["a"]'], 'Own: choose at least 2', 'Own: किमान २ पर्याय निवडा'],
    ['CHECKBOXES', { type: 'max_choices', value: 1 }, ['["a"]'], ['["a","b"]'], 'Own: choose at most 1', 'Own: जास्तीत जास्त १ पर्याय निवडा'],
  ];

  it.each(CASES)('%s %o', (type, rule, right, wrong, en, mr) => {
    for (const v of right) expect([v, issue(v, own(type, rules(rule)))]).toEqual([v, undefined]);
    for (const v of wrong) {
      expect([v, issue(v, own(type, rules(rule)))]).toEqual([v, en]);
      expect([v, issue(v, own(type, rules(rule)), MR)]).toEqual([v, mr]);
    }
    /* An optional answer is checked only when it is given. */
    expect(issue('', own(type, rules(rule)))).toBeUndefined();
  });

  it('every rule is tried above, in the order they are made', () => {
    expect(new Set(CASES.map(([, r]) => r.type))).toEqual(new Set(RULE_TYPES));
    for (const type of ['TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'TIME', 'MONTH', 'YEAR', 'CHECKBOXES'] as FieldType[])
      expect([...rulesOf(type)].filter((t) => t !== 'not_future' && t !== 'not_past')).toEqual(RULE_TYPES.filter((t) => rulesOf(type).includes(t) && !t.startsWith('not_')));
    for (const type of ['EMAIL', 'MOBILE', 'URL', 'DROPDOWN', 'RADIO', 'YES_NO', 'CONSENT'] as FieldType[]) expect(rulesOf(type)).toEqual([]);
  });

  it('only the first broken one is said: the type, then the rules in their own order, then the custom checks', () => {
    const v: FieldValidation = {
      rules: [{ type: 'max_length', value: 3 }, { type: 'letters' }],
      custom: [regex('x+', '', { message_en: 'Only x' })],
    };
    expect(issue('abc1', own('TEXT', v))).toBe('Own may contain only letters and spaces');
    expect(issue('abcd', own('TEXT', v))).toBe('Own must be at most 3 characters');
    expect(issue('abc', own('TEXT', v))).toBe('Only x');
    expect(issue('xxx', own('TEXT', v))).toBeUndefined();
    expect(issue('x', own('NUMBER', rules({ type: 'whole_number' })))).toBe('Own must be a number');
    expect(issue('', own('TEXT', v, { required: true }))).toBe('Own is required');
  });

  it('a rule that does not fit the type, without its limit, or not known here is left to the server', () => {
    expect(issue('abc', own('TEXT', rules({ type: 'min_value', value: 5 })))).toBeUndefined();
    expect(issue('abc', own('TEXT', rules({ type: 'min_length' }, { type: 'max_length', value: 'x' })))).toBeUndefined();
    expect(issue('2026-01-01', own('DATE', rules({ type: 'min_date', value: 5 }, { type: 'max_date', value: '2026-02-31' })))).toBeUndefined();
    expect(issue('09:00', own('TIME', rules({ type: 'min_time', value: '25:00' })))).toBeUndefined();
    expect(issue('abc', own('TEXT', rules({ type: 'future_rule' as RuleType, value: 1 })))).toBeUndefined();
    expect(issue('abc', own('TEXT', null))).toBeUndefined();
    expect(issue('abc', own('TEXT', undefined as unknown as null))).toBeUndefined();
    expect(issue('abc', own('TEXT', {} as FieldValidation))).toBeUndefined();
  });
});

describe('Custom checks of an own field', () => {
  it('a regular expression must match the whole answer', () => {
    const v = custom(regex('[A-Z]{3}|\\d+'));
    expect(issue('ABC', own('TEXT', v))).toBeUndefined();
    expect(issue('123', own('TEXT', v))).toBeUndefined();
    expect(issue('ABC1', own('TEXT', v))).toBe('Wrong');
    expect(issue('xABC', own('TEXT', v))).toBe('Wrong');
    expect(issue('xABC', own('TEXT', v), MR)).toBe('चूक');
    expect(issue('x', own('TEXT', custom(regex('y', '', { message_mr: null }))), MR)).toBe('Wrong');
    expect(issue('x', own('TEXT', custom(regex('y', '', { message_mr: ' ' }))), MR)).toBe('Wrong');
  });

  it('uses its flags', () => {
    expect(issue('abc', own('TEXT', custom(regex('ABC'))))).toBe('Wrong');
    expect(issue('abc', own('TEXT', custom(regex('ABC', 'i'))))).toBeUndefined();
    /* \p needs the Unicode flag. */
    expect(issue('आशा', own('TEXT', custom(regex('[\\p{L}\\p{M}]+', 'u'))))).toBeUndefined();
    expect(issue('आशा', own('TEXT', custom(regex('[\\p{L}\\p{M}]+'))))).toBe('Wrong');
    expect(wholeMatch('a.b', 's', 'a\nb')).toBe(true);
    expect(wholeMatch('a.b', '', 'a\nb')).toBe(false);
  });

  it('one that does not compile here is left to the server', () => {
    expect(wholeMatch('(', '', 'x')).toBeNull();
    expect(wholeMatch('x', 'zz', 'x')).toBeNull();
    expect(issue('x', own('TEXT', custom(regex('('), regex('y'))))).toBe('Wrong');
    expect(issue('x', own('TEXT', custom(regex('('))))).toBeUndefined();
  });

  it('is for every type, also a choice; the checks are made in their order', () => {
    const v = custom(regex('M', '', { message_en: 'First' }), regex('E', '', { message_en: 'Second' }));
    expect(issue('E', own('DROPDOWN', v, { choices: ['M', 'E'] }))).toBe('First');
    expect(issue('M', own('RADIO', v, { choices: ['M', 'E'] }))).toBe('Second');
    expect(issue('Z', own('DROPDOWN', v, { choices: ['M', 'E'] }))).toBe('Select a valid Own');
    expect(issue('["M"]', own('CHECKBOXES', custom(regex('\\["M"\\]')), { choices: ['M', 'E'] }))).toBeUndefined();
    expect(issue('Yes', own('CONSENT', custom(regex('No'))))).toBe('Wrong');
  });

  it('a JavaScript function is never run in the browser, also when its source is there', () => {
    const run = vi.fn();
    (globalThis as Record<string, unknown>).ranHere = run;
    const v = custom({ kind: 'JS', source: 'function () { globalThis.ranHere(); return false; }', message_en: 'Wrong', message_mr: null });
    expect(issue('x', own('TEXT', v))).toBeUndefined();
    expect(run).not.toHaveBeenCalled();
    delete (globalThis as Record<string, unknown>).ranHere;
  });

  it('no file of the portal evaluates a text as code', () => {
    const raw = import.meta.glob('../src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    expect(Object.keys(raw).length).toBeGreaterThan(40);
    for (const [file, source] of Object.entries(raw)) expect([file, /\beval\s*\(|new\s+Function\b|\bFunction\s*\(/.test(source)]).toEqual([file, false]);
  });
});

describe("A server's message about a check, in the screen's language", () => {
  const v: FieldValidation = {
    rules: [{ type: 'min_length', value: 3 }],
    custom: [
      { kind: 'JS', message_en: 'Not our student', message_mr: 'आमचा विद्यार्थी नाही' },
      { kind: 'JS', message_en: 'No Marathi', message_mr: null },
    ],
  };
  const said = (message: string, T: (mr: string, en: string) => string, validation: FieldValidation | null = v) =>
    checkSaid(message, validation, { en: 'Roll number', shown: 'रोल नंबर' }, T);
  const EN = (_mr: string, en: string) => en;

  it('is the Marathi one of the check with that English message', () => {
    expect(said('Not our student', MR)).toBe('आमचा विद्यार्थी नाही');
    expect(said('Not our student', EN)).toBe('Not our student');
    expect(said('No Marathi', MR)).toBe('No Marathi');
    expect(said('Roll number must be at least 3 characters', MR)).toBe('रोल नंबर: किमान ३ वर्ण');
    expect(said('Roll number could not be checked. Please contact the programme office.', MR)).toBe(
      'रोल नंबर तपासता आले नाही. कृपया कार्यक्रम कार्यालयाशी संपर्क साधा.',
    );
    /* A text the function gave itself, or any other message: as it is. */
    expect(said('Your number is taken', MR)).toBe('Your number is taken');
    expect(said('Not our student', MR, null)).toBe('Not our student');
  });
});

describe('The types of an own field', () => {
  const CASES: [type: FieldType, right: string[], wrong: string[], en: string, mr: string][] = [
    ['EMAIL', ['a@b.in'], ['a@b', 'a b@c.in'], 'Own must be a valid email address', 'Own: योग्य ईमेल पत्ता टाका'],
    ['MOBILE', ['9812345670', '+91 98123 45670'], ['5812345670', '98123'], 'Own must be a 10-digit Indian number starting 6–9', 'Own ६–९ ने सुरू होणारा १० अंकी भारतीय क्रमांक असावा'],
    ['URL', ['https://example.com', 'http://a.in/x?y=1'], ['example.com', 'https://x', 'ftp://a.b'], 'Own must be a web address starting with http:// or https://', 'Own: http:// किंवा https:// ने सुरू होणारा वेब पत्ता टाका'],
    ['TIME', ['00:00', '23:59'], ['24:00', '9:00', '09:60'], 'Own must be a time in HH:MM format', 'Own: वेळ HH:MM स्वरूपात टाका'],
    ['MONTH', ['2024-06'], ['2024-13', '06/2024'], 'Own must be a month in YYYY-MM format', 'Own: महिना YYYY-MM स्वरूपात टाका'],
    ['YEAR', ['1900', '2100'], ['1899', '2101', '26', '2026.5'], 'Own must be a year, e.g. 2026', 'Own: योग्य वर्ष टाका, उदा. २०२६'],
    ['RADIO', ['M'], ['Z'], 'Select a valid Own', 'Own: यादीतील पर्याय निवडा'],
    ['CHECKBOXES', ['["M"]', '["M","E"]', '[]'], ['["Z"]', 'M', '["M","M"]', '[1]'], 'Select valid choices for Own', 'Own: यादीतील योग्य पर्याय निवडा'],
    ['YES_NO', ['Yes', 'No'], ['yes', 'x'], 'Own: select Yes or No', 'Own: होय किंवा नाही निवडा'],
    ['CONSENT', ['Yes'], ['No'], 'Own must be ticked', 'Own: खूण करणे आवश्यक आहे'],
  ];
  it.each(CASES)('%s', (type, right, wrong, en, mr) => {
    const f = own(type, null, { choices: type === 'RADIO' || type === 'CHECKBOXES' ? ['M', 'E'] : type === 'YES_NO' ? ['Yes', 'No'] : null });
    for (const v of right) expect([v, issue(v, f)]).toEqual([v, undefined]);
    for (const v of wrong) {
      expect([v, issue(v, f)]).toEqual([v, en]);
      expect([v, issue(v, f, MR)]).toEqual([v, mr]);
    }
    expect(issue('', f)).toBeUndefined();
    const required = issue('', { ...f, required: true });
    expect(required).toBe(type === 'CONSENT' ? 'Own must be ticked' : 'Own is required');
    expect(issue('', { ...f, required: true }, MR)).toBe(type === 'CONSENT' ? 'Own: खूण करणे आवश्यक आहे' : 'Own आवश्यक आहे');
  });

  it('no choice ticked is no answer', () => {
    expect(issue('[]', own('CHECKBOXES', null, { required: true, choices: ['M'] }))).toBe('Own is required');
    expect(chosen('')).toEqual([]);
    expect(chosen('["a","b"]')).toEqual(['a', 'b']);
    expect(chosen('text')).toBeNull();
    expect(chosen('{"a":1}')).toBeNull();
    expect(chosenText([])).toBe('');
    expect(chosenText(['a', 'b'])).toBe('["a","b"]');
  });

  it('a type of a newer API is not checked here, whatever it holds', () => {
    expect(issue('anything', own('SIGNATURE' as FieldType, rules({ type: 'letters' })))).toBeUndefined();
    expect(issue('', own('SIGNATURE' as FieldType, null, { required: true }))).toBe('Own is required');
  });
});

describe("The master's dialog: what it holds, sends and reads", () => {
  const FULL: FieldValidation = {
    rules: [{ type: 'letters' }, { type: 'min_length', value: 3 }, { type: 'max_length', value: 50 }],
    custom: [
      { kind: 'REGEX', source: '[a-z]+', flags: 'iu', message_en: 'Letters', message_mr: 'अक्षरे' },
      { kind: 'JS', source: 'function () { return true; }', message_en: 'No', message_mr: null },
    ],
  };

  it('is the same when nothing is changed, whatever order the rules came in', () => {
    expect(payloadOf(toDraft(FULL, 'TEXT'), 'TEXT')).toEqual(FULL);
    expect(payloadOf(toDraft({ ...FULL, rules: [...FULL.rules].reverse() }, 'TEXT'), 'TEXT')).toEqual(FULL);
    expect(payloadOf(toDraft(null, 'TEXT'), 'TEXT')).toBeNull();
    expect(payloadOf(toDraft(undefined, 'TEXT'), 'TEXT')).toBeNull();
    expect(payloadOf(toDraft({ rules: [{ type: 'min_date', value: '2020-01-01' }], custom: [] }, 'DATE'), 'DATE')).toEqual({
      rules: [{ type: 'min_date', value: '2020-01-01' }],
      custom: [],
    });
  });

  it('drops what does not fit another type, and keeps the custom checks', () => {
    expect(payloadOf(fitting(toDraft(FULL, 'TEXT'), 'NUMBER'), 'NUMBER')).toEqual({ rules: [], custom: FULL.custom });
    expect(payloadOf(fitting(toDraft(FULL, 'TEXT'), 'TEXTAREA'), 'TEXTAREA')!.rules.map((r) => r.type)).toEqual(['letters', 'min_length', 'max_length']);
  });

  const limits = (type: FieldType, values: Partial<Record<RuleType, string>>) => draftIssues({ limits: values, ticked: [], custom: [] }, type);
  it('checks the limits: whole numbers where they are, real dates and times, no maximum below its minimum', () => {
    expect(limits('TEXT', { min_length: '1', max_length: '250' })).toEqual({});
    expect(limits('TEXT', { min_length: '0', max_length: '251' })).toEqual({
      'rule.min_length': 'Enter a whole number from 1 to 250',
      'rule.max_length': 'Enter a whole number from 1 to 250',
    });
    expect(limits('TEXTAREA', { max_length: '2000' })).toEqual({});
    expect(limits('TEXTAREA', { max_length: '2.5' })).toEqual({ 'rule.max_length': 'Enter a whole number from 1 to 2000' });
    expect(limits('NUMBER', { min_digits: '17', min_value: 'x', max_value: '-2.5' })).toEqual({
      'rule.min_digits': 'Enter a whole number from 1 to 16',
      'rule.min_value': 'Enter a number',
    });
    expect(limits('DATE', { min_age: '121', min_date: '0026-01-01', max_date: '2026-02-30' })).toEqual({
      'rule.min_age': 'Enter a whole number from 0 to 120',
      'rule.min_date': 'Enter a real date',
      'rule.max_date': 'Enter a real date',
    });
    expect(limits('TIME', { min_time: '25:00' })).toEqual({ 'rule.min_time': 'Enter a time' });
    expect(limits('YEAR', { min_value: '1899' })).toEqual({ 'rule.min_value': 'Enter a whole number from 1900 to 2100' });
    expect(limits('CHECKBOXES', { min_choices: '0' })).toEqual({ 'rule.min_choices': 'Enter a whole number from 1 to 100' });

    const smaller = 'The maximum is smaller than the minimum';
    /* As numbers, not as texts: 9 is less than 10. */
    expect(limits('TEXT', { min_length: '9', max_length: '10' })).toEqual({});
    expect(limits('TEXT', { min_length: '10', max_length: '9' })).toEqual({ 'rule.max_length': smaller });
    expect(limits('NUMBER', { min_value: '-1', max_value: '-2', min_digits: '2', max_digits: '1' })).toEqual({ 'rule.max_digits': smaller, 'rule.max_value': smaller });
    expect(limits('DATE', { min_date: '2026-02-01', max_date: '2026-01-31', min_age: '35', max_age: '18' })).toEqual({ 'rule.max_date': smaller, 'rule.max_age': smaller });
    expect(limits('TIME', { min_time: '10:00', max_time: '09:00' })).toEqual({ 'rule.max_time': smaller });
    expect(limits('YEAR', { min_value: '2020', max_value: '2020' })).toEqual({});
    expect(limits('CHECKBOXES', { min_choices: '3', max_choices: '2' })).toEqual({ 'rule.max_choices': smaller });
    /* A date box that is only half filled in. */
    expect(draftIssues({ limits: {}, ticked: [], custom: [] }, 'DATE', ['min_date'])).toEqual({ 'rule.min_date': 'Enter a real date' });
  });

  it('checks the custom checks: a source, an expression that compiles, a message', () => {
    const [empty, broken, js] = [newCheck('REGEX'), { ...newCheck('REGEX'), source: '(a', message_en: 'x' }, { ...newCheck('JS'), source: ' ' }];
    const e = draftIssues({ limits: {}, ticked: [], custom: [empty!, broken!, js!] }, 'TEXT');
    expect(e[`check.${empty!.id}.source`]).toBe('Enter the regular expression');
    expect(e[`check.${empty!.id}.message_en`]).toBe('The error message is required');
    expect(e[`check.${broken!.id}.source`]).toMatch(/^This is not a valid regular expression: ./);
    expect(e[`check.${broken!.id}.message_en`]).toBeUndefined();
    expect(e[`check.${js!.id}.source`]).toBe('Enter the function');
    /* Also one that compiles only inside the brackets of the whole answer, or only without its flags. */
    expect(regexIssue('a)(?:b', '')).not.toBe('');
    expect(regexIssue('\\-', 'u')).not.toBe('');
    expect(regexIssue('\\-', '')).toBe('');
    /* A new one: Unicode is on; the function's template is there. */
    expect(empty!.flags).toBe('u');
    expect(newCheck('JS').source).toMatch(/^function \(value, form\) \{[\s\S]*return true;\n\}$/);
  });

  it("finds the box of the server's errors by what was sent", () => {
    const d = toDraft(FULL, 'TEXT');
    const [a, b] = d.custom.map((c) => c.id);
    expect(
      serverIssues(
        {
          label_en: 'Label is required',
          'validation.rules.2.value': 'Too long',
          'validation.rules.0.type': 'Does not fit',
          'validation.custom.0.flags': 'Flags',
          'validation.custom.1.source': 'Does not run',
          'validation.custom.1.message_mr': 'Marathi',
          'validation.custom': 'At most 5',
          'validation.rules': 'Twice',
        },
        d,
        'TEXT',
      ),
    ).toEqual({
      'rule.max_length': 'Too long',
      'rule.letters': 'Does not fit',
      [`check.${a}.flags`]: 'Flags',
      [`check.${b}.source`]: 'Does not run',
      [`check.${b}.message_mr`]: 'Marathi',
      custom: 'At most 5',
      rules: 'Twice',
    });
  });

  it('is read in one line', () => {
    const line = (...list: ValidationRule[]) => checksText(rules(...list));
    expect(checksText(FULL)).toBe('3–50 characters, Letters only, 1 expression, 1 function');
    expect(checksText(null)).toBe('');
    expect(checksText({ rules: [], custom: [] })).toBe('');
    expect(line({ type: 'min_length', value: 3 })).toBe('at least 3 characters');
    expect(line({ type: 'max_length', value: 1 })).toBe('at most 1 character');
    expect(line({ type: 'min_digits', value: 10 }, { type: 'max_digits', value: 10 }, { type: 'whole_number' })).toBe('10 digits, Whole number');
    expect(line({ type: 'min_value', value: 1 }, { type: 'max_value', value: 100 })).toBe('from 1 to 100');
    expect(line({ type: 'min_value', value: 0 })).toBe('at least 0');
    expect(line({ type: 'min_age', value: 18 }, { type: 'max_age', value: 35 })).toBe('age 18–35');
    expect(line({ type: 'min_age', value: 18 }, { type: 'not_future' })).toBe('age at least 18, Not in the future');
    expect(line({ type: 'min_date', value: '2020-01-01' }, { type: 'max_date', value: '2020-12-31' })).toBe('from 01/01/2020 to 31/12/2020');
    expect(line({ type: 'max_date', value: '2020-12-31' })).toBe('on or before 31/12/2020');
    expect(line({ type: 'min_time', value: '09:00' }, { type: 'max_time', value: '17:00' })).toBe('from 09:00 to 17:00');
    expect(line({ type: 'min_time', value: '09:00' })).toBe('09:00 or later');
    expect(line({ type: 'min_choices', value: 2 }, { type: 'max_choices', value: 4 })).toBe('2–4 choices');
    expect(line({ type: 'pin_code' }, { type: 'pan' })).toBe('PIN code, PAN number');
    expect(checksText(custom(regex('a'), regex('b')))).toBe('2 expressions');
  });
});
