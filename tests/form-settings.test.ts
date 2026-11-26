import { buildModel } from '../src/form';
import type { FieldConfig, FieldValidation, Form, Options } from '../src/types';
import { checkFields, dateLimits } from '../src/validation';
import { DEFAULT_CHECKS } from './defaultChecks';

/*
 * What is set up in Masters → Form fields reaches the student's form: the names in every message (in both languages), the
 * field's checks (the only ones: the portal has none of its own), and the limits of the boxes.
 */
const TODAY = '2026-11-26';
const field = (over: Partial<FieldConfig> & Pick<FieldConfig, 'key'>): FieldConfig => ({
  step: 1,
  label_en: over.key,
  label_mr: null,
  required: true,
  type: 'TEXT',
  custom: false,
  order: 10,
  options_kind: null,
  help_en: null,
  help_mr: null,
  validation: DEFAULT_CHECKS[over.key] ?? null,
  ...over,
});
const options = (fields: FieldConfig[]) => ({ fields, lists: {}, document_types: [] }) as unknown as Options;
/* The messages of one step of a form, as the student would see them. */
function messages(fields: FieldConfig[], form: Form, lang: 'en' | 'mr' = 'en') {
  const model = buildModel(options(fields), lang);
  return checkFields(form, model.rules(model.step(1), form), { T: model.T, today: TODAY });
}
const ages = (min?: number, max?: number): FieldValidation => ({
  rules: [...(min === undefined ? [] : [{ type: 'min_age' as const, value: min }]), ...(max === undefined ? [] : [{ type: 'max_age' as const, value: max }])],
  custom: [],
});
const dob = (validation: FieldValidation | null = DEFAULT_CHECKS.date_of_birth ?? null) =>
  field({ key: 'date_of_birth', type: 'DATE', label_en: 'Date of Birth', label_mr: 'जन्मतारीख', validation });

describe('the messages name a field by its label in Masters → Form fields', () => {
  const renamed = [
    field({ key: 'email', label_en: 'E-mail ID', label_mr: 'ई-मेल' }),
    field({ key: 'mobile_number', label_en: 'Contact Number', label_mr: 'संपर्क क्रमांक' }),
    field({ key: 'alternate_mobile_number', label_en: 'WhatsApp Number', label_mr: 'व्हॉट्सॲप क्रमांक' }),
    field({ key: 'alternate_email', label_en: 'Other E-mail', label_mr: 'दुसरा ई-मेल' }),
    field({ key: 'pin_code', label_en: 'Postal Code', label_mr: 'टपाल कोड' }),
    dob(),
  ];
  const wrong = {
    email: 'nobody',
    mobile_number: '12345',
    alternate_mobile_number: '12345',
    alternate_email: 'x@',
    pin_code: '0123',
    date_of_birth: '2999-01-01',
  } as unknown as Form;

  it('in English', () => {
    expect(messages(renamed, wrong)).toEqual({
      email: 'E-mail ID must be a valid email address',
      mobile_number: 'Contact Number must be a 10-digit Indian number starting 6–9',
      alternate_mobile_number: 'WhatsApp Number must be a 10-digit Indian number starting 6–9',
      alternate_email: 'Other E-mail must be a valid email address',
      pin_code: 'Postal Code must be exactly 6 digits',
      date_of_birth: 'Date of Birth cannot be in the future',
    });
  });

  it('in Marathi', () => {
    expect(messages(renamed, wrong, 'mr')).toEqual({
      email: 'ई-मेल: योग्य ईमेल पत्ता टाका',
      mobile_number: 'संपर्क क्रमांक ६–९ ने सुरू होणारा १० अंकी भारतीय क्रमांक असावा',
      alternate_mobile_number: 'व्हॉट्सॲप क्रमांक ६–९ ने सुरू होणारा १० अंकी भारतीय क्रमांक असावा',
      alternate_email: 'दुसरा ई-मेल: योग्य ईमेल पत्ता टाका',
      pin_code: 'टपाल कोड: नेमके ६ अंक टाका',
      date_of_birth: 'जन्मतारीख भविष्यातील असू शकत नाही',
    });
  });

  it('the score and the date of completion too', () => {
    const fields = [
      field({ key: 'score', label_en: 'Marks', label_mr: 'गुण', type: 'NUMBER' }),
      field({ key: 'qualification_completed_on', label_en: 'Passing Date', type: 'DATE' }),
    ];
    expect(messages(fields, { score: '12.345', qualification_completed_on: '2999-01-01' } as unknown as Form)).toEqual({
      score: 'Marks must have at most 2 decimal places',
      qualification_completed_on: 'Passing Date cannot be in the future',
    });
  });
});

describe('the date of birth: 14 to 100 to start with, whatever is set up after', () => {
  const born = (date: string, validation: FieldValidation | null, lang: 'en' | 'mr' = 'en') =>
    messages([dob(validation)], { date_of_birth: date } as unknown as Form, lang).date_of_birth;

  it('with the checks it starts with: 14 to 100', () => {
    expect(born('2012-11-27', DEFAULT_CHECKS.date_of_birth!)).toBe('Date of Birth: age must be at least 14 years');
    expect(born('2012-11-26', DEFAULT_CHECKS.date_of_birth!)).toBeUndefined();
    expect(born('1925-11-26', DEFAULT_CHECKS.date_of_birth!)).toBe('Date of Birth: age must be at most 100 years');
  });

  it('18 to 35 set up: never the default words', () => {
    const v = ages(18, 35);
    expect(born('2015-01-01', v)).toBe('Date of Birth: age must be at least 18 years');
    expect(born('2008-11-27', v)).toBe('Date of Birth: age must be at least 18 years');
    expect(born('2008-11-26', v)).toBeUndefined();
    expect(born('1990-11-26', v)).toBe('Date of Birth: age must be at most 35 years');
    expect(born('1990-11-27', v)).toBeUndefined();
    expect(born('2015-01-01', v, 'mr')).toBe('जन्मतारीख: वय किमान १८ वर्षे असावे');
  });

  it('only what is set up: one age alone, or none at all', () => {
    expect(born('2015-01-01', ages(undefined, 35))).toBeUndefined();
    expect(born('1920-01-01', ages(21))).toBeUndefined();
    expect(born('2006-01-01', ages(21))).toBe('Date of Birth: age must be at least 21 years');
    expect(born('2999-01-01', null)).toBeUndefined();
    expect(born('2001-02-30', null)).toBe('Date of Birth is not a real date');
  });

  it('its calendar offers the days of those ages only', () => {
    const limits = (v: FieldValidation | null) => dateLimits(v?.rules ?? [], TODAY);
    expect(limits(ages(18, 35))).toEqual({ min: '1990-11-27', max: '2008-11-26' });
    expect(limits(DEFAULT_CHECKS.date_of_birth!)).toEqual({ min: '1925-11-27', max: '2012-11-26' });
    expect(limits(null)).toEqual({});
    /* 29 February: an 18-year-old was born on or before 28 February. */
    expect(dateLimits([{ type: 'min_age', value: 18 }], '2028-02-29')).toEqual({ max: '2010-02-28' });
    expect(dateLimits([{ type: 'not_future' }, { type: 'min_date', value: '2020-01-01' }], TODAY)).toEqual({ min: '2020-01-01', max: TODAY });
  });
});

describe("a mobile number's own lengths count the number itself", () => {
  const ten: FieldValidation = {
    rules: [{ type: 'indian_mobile' }, { type: 'min_length', value: 10 }, { type: 'max_length', value: 10 }],
    custom: [],
  };
  const fields = [field({ key: 'mobile_number', label_en: 'Mobile Number', validation: ten })];
  it('+91, a 0 and spaces are not counted', () => {
    for (const v of ['+91 98765 01234', '09876501234', '9876501234'])
      expect(messages(fields, { mobile_number: v } as unknown as Form)).toEqual({});
  });
});
