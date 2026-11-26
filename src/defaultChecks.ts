import type { FieldValidation } from './types';

/*
 * The checks the program's fields start with, as the API sends them (ipp_backend src/program/rules.ts DEFAULT_CHECKS). Used
 * only for an API that does not send the Form fields master (form.ts defaultFields); otherwise the master's checks count.
 */
const rules = (...list: FieldValidation['rules']): FieldValidation => ({ rules: list, custom: [] });
const length = (n: number) => ({ type: 'max_length' as const, value: n });
const person = (max: number) => rules({ type: 'letters' }, length(max));

export const DEFAULT_CHECKS: Record<string, FieldValidation> = {
  first_name: person(100),
  last_name: person(100),
  father_name: person(150),
  mother_name: person(150),
  email: rules({ type: 'email' }),
  date_of_birth: rules({ type: 'not_future' }, { type: 'min_age', value: 14 }, { type: 'max_age', value: 100 }),
  current_address: rules(length(500)),
  permanent_address: rules(length(500)),
  landmark: rules(length(150)),
  pin_code: rules({ type: 'pin_code' }),
  taluka: rules(length(100)),
  aadhaar_number: rules({ type: 'aadhaar' }),
  mobile_number: rules({ type: 'indian_mobile' }),
  alternate_mobile_number: rules({ type: 'indian_mobile' }, { type: 'different_from', value: 'mobile_number' }),
  alternate_email: rules({ type: 'email' }, { type: 'different_from', value: 'email' }),
  disability_type: rules(length(100)),
  disability_certificate_number: {
    rules: [],
    custom: [
      {
        kind: 'REGEX',
        source: '[A-Za-z0-9/-]{4,50}',
        flags: '',
        message_en: 'Use 4–50 characters: letters, digits, / and - only',
        message_mr: '४–५० वर्ण वापरा: फक्त इंग्रजी अक्षरे, अंक, / आणि -',
      },
    ],
  },
  qualification_name: rules(length(150)),
  qualification_stream: rules(length(150)),
  qualification_board: rules(length(200)),
  qualification_completed_on: rules({ type: 'not_future' }, { type: 'min_date', value: '1940-01-01' }),
  score: rules({ type: 'max_decimals', value: 2 }, { type: 'min_value', value: 0 }, { type: 'grading_scale' }),
};
