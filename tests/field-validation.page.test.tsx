import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { FieldType, FieldValidation, ManageRole, MasterField } from '../src/types';

/* Masters → Form fields: the types of a field, and its validation (limits, checks, custom checks, Try it). */
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const invalid = (...details: [field: string, message: string][]) =>
  json(422, { message: 'Validation failed', error: { code: 'VALIDATION_ERROR', details: details.map(([field, message]) => ({ field, message })) } });

const field = (over: Partial<MasterField>): MasterField => ({
  id: 'f1',
  key: 'first_name',
  step: 1,
  label_en: 'First Name',
  label_mr: null,
  required: true,
  type: 'TEXT',
  custom: false,
  order: 1,
  options_kind: null,
  help_en: null,
  help_mr: null,
  is_active: true,
  ...over,
});
const own = (id: string, label_en: string, type: FieldType, over: Partial<MasterField> = {}) =>
  field({ id, key: `x_${id}`, label_en, type, custom: true, required: false, order: Number(id.slice(1)), ...over });
const ROLL: FieldValidation = {
  rules: [{ type: 'letters_digits' }, { type: 'min_length', value: 3 }, { type: 'max_length', value: 50 }],
  custom: [
    { kind: 'REGEX', source: '[A-Z]{2}\\d+', flags: 'iu', message_en: 'Two letters, then digits', message_mr: 'दोन अक्षरे, मग अंक' },
    { kind: 'JS', source: "function (value, form) {\n  return value !== form.first_name;\n}", message_en: 'Not your name', message_mr: null },
  ],
};
const FIELDS: MasterField[] = [
  field({}),
  field({ id: 'f2', key: 'gender', label_en: 'Gender', type: 'DROPDOWN', options_kind: 'GENDER', order: 2 }),
  own('f3', 'Roll number', 'TEXT', { validation: ROLL }),
  own('f4', 'Family income', 'NUMBER', { validation: { rules: [{ type: 'min_value', value: 1 }, { type: 'max_value', value: 100 }], custom: [] } }),
  /* As an older API sends it. */
  own('f5', 'Hobby', 'TEXT'),
  own('f6', 'Shift', 'RADIO', { options_kind: 'FIELD:x_f6', validation: null }),
  own('f7', 'Days', 'CHECKBOXES', { options_kind: 'FIELD:x_f7' }),
  own('f8', 'Scribble', 'SIGNATURE' as FieldType),
];

interface Opts {
  role?: ManageRole;
  fields?: MasterField[];
  /* Answers a write; undefined = done. */
  write?: (method: string, path: string, body: unknown) => Response | undefined;
}
function mockApi(opts: Opts = {}) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = new URL(String(input), 'http://x').pathname.replace(/^.*\/edp/, '');
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body });
    if (path === '/manage/me') return json(200, { data: { id: 'm1', name: 'Program Auditor', email: 'a@example.com', role: opts.role ?? 'ADMIN' } });
    if (method !== 'GET') return opts.write?.(method, path, body) ?? json(method === 'POST' ? 201 : 200, { data: {} });
    if (path === '/manage/fields') return json(200, { data: opts.fields ?? FIELDS });
    if (path.startsWith('/manage/masters/FIELD')) return json(200, { data: [], meta: { page: 1, limit: 25, total: 0, totalPages: 1 } });
    return json(404, { message: 'not mocked' });
  });
  return calls;
}
const writes = (calls: ReturnType<typeof mockApi>) => calls.filter((c) => c.method !== 'GET').map((c) => [c.method, c.path, c.body]);

const open = async () => {
  render(
    <MemoryRouter initialEntries={['/manage/masters/fields']}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole('region', { name: 'Step 1 – Basic Details' });
};
const openAdd = async () => {
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Add a field to Step 1 – Basic Details' }));
  return screen.getByRole('dialog', { name: 'Add a field' });
};
const openEdit = async (name: string) => {
  await open();
  await userEvent.click(screen.getByRole('button', { name: `Edit ${name}` }));
  return screen.getByRole('dialog', { name: `Edit ${name}` });
};
const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) });
const typeBox = (dialog: HTMLElement) => within(dialog).getByLabelText(/^Type/);
const limitLabels = (dialog: HTMLElement) =>
  within(dialog).queryByRole('group', { name: 'Limits' })
    ? [...within(dialog).getByRole('group', { name: 'Limits' }).querySelectorAll('label')].map((l) => l.textContent?.trim())
    : [];
const checkLabels = (dialog: HTMLElement) =>
  within(dialog).queryByRole('group', { name: 'Checks' }) ? [...within(dialog).getByRole('group', { name: 'Checks' }).querySelectorAll('label')].map((l) => l.textContent?.trim()) : [];
const set = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const check = (dialog: HTMLElement, n: number) => within(dialog).getByRole('group', { name: new RegExp(`^Check ${n}:`) });

beforeEach(() => {
  localStorage.setItem('edp.manage.token', 'manage-token');
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Form fields: the types', () => {
  it('are offered in three groups, with where a file goes', async () => {
    mockApi();
    const dialog = await openAdd();
    const groups = [...typeBox(dialog).querySelectorAll('optgroup')].map((g) => [g.label, ...[...g.querySelectorAll('option')].map((o) => `${o.value} ${o.text}`)]);
    expect(groups).toEqual([
      ['Writing', 'TEXT Text', 'TEXTAREA Long text', 'EMAIL Email', 'MOBILE Mobile number', 'URL Web address (URL)'],
      ['Numbers and dates', 'NUMBER Number', 'DATE Date', 'TIME Time', 'MONTH Month and year', 'YEAR Year'],
      [
        'Choosing',
        'DROPDOWN Dropdown (choose one)',
        'RADIO Radio buttons (choose one)',
        'CHECKBOXES Checkboxes (choose several)',
        'YES_NO Yes / No',
        'CONSENT Tick box (declaration)',
      ],
    ]);
    expect(typeBox(dialog)).toHaveValue('TEXT');
    expect(typeBox(dialog)).toHaveAccessibleDescription('For a file, add a document in Masters → Documents.');
  });

  it('are named shortly in the table; radio buttons and checkboxes have choices too', async () => {
    mockApi();
    await open();
    const typeOf = (name: string) => within(row(name)).getAllByRole('cell')[3]!.textContent;
    expect(['Gender', 'Family income', 'Shift', 'Days', 'Scribble'].map(typeOf)).toEqual(['Dropdown', 'Number', 'Radio buttons', 'Checkboxes', 'SIGNATURE']);
    for (const name of ['Shift', 'Days']) expect(screen.getByRole('button', { name: `Choices of ${name}` })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choices of Hobby' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Choices of Days' }));
    expect(await screen.findByRole('region', { name: 'Choices of Days' })).toBeInTheDocument();
  });

  it.each([
    ['EMAIL', false],
    ['MOBILE', false],
    ['URL', false],
    ['TIME', false],
    ['MONTH', false],
    ['YEAR', false],
    ['RADIO', true],
    ['CHECKBOXES', true],
    ['YES_NO', false],
    ['CONSENT', false],
  ] as [FieldType, boolean][])('adds a field of type %s', async (type, withChoices) => {
    const calls = mockApi();
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText(/Label \(English\)/), 'New one');
    await userEvent.selectOptions(typeBox(dialog), type);
    if (withChoices) {
      await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
      expect(within(dialog).getByText('Add at least one choice')).toBeInTheDocument();
      expect(writes(calls)).toEqual([]);
      await userEvent.type(within(dialog).getByLabelText('Choice 1 (English)'), 'Morning');
      await userEvent.type(within(dialog).getByLabelText('Choice 1 (Marathi)'), 'सकाळ');
    } else expect(within(dialog).queryByLabelText('Choice 1 (English)')).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Field New one added.')).toBeInTheDocument();
    expect(writes(calls)).toEqual([
      [
        'POST',
        '/manage/fields',
        { step: 1, label_en: 'New one', type, required: false, ...(withChoices ? { options: [{ name_en: 'Morning', name_mr: 'सकाळ' }] } : {}) },
      ],
    ]);
  });

  it('dropdown, radio buttons and checkboxes keep their choices between themselves; from another type they are asked', async () => {
    const calls = mockApi();
    let dialog = await openEdit('Shift');
    await userEvent.selectOptions(typeBox(dialog), 'CHECKBOXES');
    expect(within(dialog).queryByLabelText('Choice 1 (English)')).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByText('Field Shift saved.');

    await userEvent.click(screen.getByRole('button', { name: 'Edit Hobby' }));
    dialog = screen.getByRole('dialog', { name: 'Edit Hobby' });
    expect(typeBox(dialog)).toHaveAccessibleDescription('Answers already given are kept as they are. For a file, add a document in Masters → Documents.');
    await userEvent.selectOptions(typeBox(dialog), 'RADIO');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('Add at least one choice')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Choice 2 (English)'), 'Chess');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByText('Field Hobby saved.');

    await userEvent.click(screen.getByRole('button', { name: 'Edit Days' }));
    dialog = screen.getByRole('dialog', { name: 'Edit Days' });
    await userEvent.selectOptions(typeBox(dialog), 'YES_NO');
    expect(within(dialog).queryByLabelText('Choice 1 (English)')).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByText('Field Days saved.');
    expect(writes(calls)).toEqual([
      ['PATCH', '/manage/fields/f6', { type: 'CHECKBOXES' }],
      ['PATCH', '/manage/fields/f5', { type: 'RADIO', options: [{ name_en: 'Chess' }] }],
      ['PATCH', '/manage/fields/f7', { type: 'YES_NO' }],
    ]);
  });

  it('a type of a newer API stays as it is', async () => {
    const calls = mockApi();
    const dialog = await openEdit('Scribble');
    expect(typeBox(dialog)).toHaveValue('SIGNATURE');
    expect(within(dialog).queryByRole('group', { name: 'Limits' })).not.toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/Label \(English\)/), ' here');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByText('Field Scribble here saved.');
    expect(writes(calls)).toEqual([['PATCH', '/manage/fields/f8', { label_en: 'Scribble here' }]]);
  });
});

describe('Form fields: validation', () => {
  it('shows the limits and checks that fit the type', async () => {
    mockApi();
    const dialog = await openAdd();
    const shown = async (type: FieldType) => {
      await userEvent.selectOptions(typeBox(dialog), type);
      return [limitLabels(dialog), checkLabels(dialog)];
    };
    expect(await shown('TEXT')).toEqual([
      ['Minimum characters', 'Maximum characters', 'Must be different from'],
      [
        'Letters only',
        'Digits only',
        'Letters and digits only',
        'No spaces',
        'Capital letters only',
        'PIN code (6 digits)',
        'PAN number',
        'IFSC code',
        'Email address',
        'Indian mobile number (10 digits, starting 6–9)',
        'Aadhaar number (12 digits, with its check digit)',
      ],
    ]);
    expect(await shown('TEXTAREA')).toEqual([
      ['Minimum characters', 'Maximum characters', 'Must be different from'],
      ['Letters only', 'Letters and digits only', 'Capital letters only'],
    ]);
    expect(await shown('NUMBER')).toEqual([
      ['Minimum value', 'Maximum value', 'Minimum digits', 'Maximum digits', 'Maximum decimal places', 'Must be different from'],
      ['Whole number', 'Within its grading (a percentage 0–100, a CGPA up to its scale)'],
    ]);
    expect(await shown('DATE')).toEqual([
      ['Earliest date', 'Latest date', 'Minimum age (years)', 'Maximum age (years)'],
      ['Not in the future', 'Not in the past'],
    ]);
    expect(within(dialog).getByLabelText('Earliest date')).toHaveAttribute('type', 'date');
    expect(await shown('TIME')).toEqual([['Earliest time', 'Latest time'], []]);
    expect(within(dialog).getByLabelText('Latest time')).toHaveAttribute('type', 'time');
    expect(await shown('MONTH')).toEqual([[], ['Not in the future', 'Not in the past']]);
    expect(await shown('YEAR')).toEqual([
      ['Earliest year', 'Latest year'],
      ['Not in the future', 'Not in the past'],
    ]);
    expect(await shown('CHECKBOXES')).toEqual([['Minimum choices', 'Maximum choices'], []]);
    for (const type of ['EMAIL', 'MOBILE', 'URL'] as FieldType[]) expect(await shown(type)).toEqual([['Must be different from'], []]);
    for (const type of ['DROPDOWN', 'RADIO', 'YES_NO', 'CONSENT'] as FieldType[]) expect(await shown(type)).toEqual([[], []]);
    await userEvent.selectOptions(typeBox(dialog), 'DROPDOWN');
    expect(within(dialog).getByText('The choices are the validation: only one of them is accepted. Custom checks can be added.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '+ Add regular expression' })).toBeEnabled();
  });

  it('adds a field with limits, checks and custom checks', async () => {
    const calls = mockApi();
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText(/Label \(English\)/), 'Enrolment number');
    await userEvent.type(within(dialog).getByLabelText('Minimum characters'), '8');
    await userEvent.type(within(dialog).getByLabelText('Maximum characters'), '12');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Capital letters only' }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Letters and digits only' }));

    await userEvent.click(within(dialog).getByRole('button', { name: '+ Add regular expression' }));
    const regex = check(dialog, 1);
    expect(regex).toHaveAccessibleName('Check 1: Regular expression');
    const source = within(regex).getByLabelText(/^Expression/);
    expect(source).toHaveFocus();
    expect(source).toHaveAccessibleDescription('The whole answer must match.');
    expect(within(regex).getByRole('checkbox', { name: 'Unicode' })).toBeChecked();
    expect(within(regex).getByRole('checkbox', { name: 'Ignore capital / small letters' })).not.toBeChecked();
    /* One line. */
    set(source, '[A-Z]{3}\n[0-9]+');
    expect(source).toHaveValue('[A-Z]{3}[0-9]+');
    await userEvent.click(within(regex).getByRole('checkbox', { name: 'Ignore capital / small letters' }));
    await userEvent.type(within(regex).getByLabelText(/^Error message \(English\)/), ' Three letters, then digits ');
    await userEvent.type(within(regex).getByLabelText(/^Error message \(Marathi\)/), 'तीन अक्षरे, मग अंक');

    await userEvent.click(within(dialog).getByRole('button', { name: '+ Add JavaScript function' }));
    const js = check(dialog, 2);
    const fn = within(js).getByLabelText(/^Function/);
    expect(fn).toHaveAttribute('rows', '8');
    expect(fn).toHaveAccessibleDescription('It runs on the server in a safe box: no internet, no files, 0.05 seconds.');
    expect((fn as HTMLTextAreaElement).value).toMatch(/^function \(value, form\) \{[\s\S]*return true;\n\}$/);
    set(fn, 'function (value) { return value.length > 8; }');
    await userEvent.type(within(js).getByLabelText(/^Error message \(English\)/), 'Too short');
    expect(within(js).queryByRole('checkbox')).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Field Enrolment number added.')).toBeInTheDocument();
    expect(writes(calls)).toEqual([
      [
        'POST',
        '/manage/fields',
        {
          step: 1,
          label_en: 'Enrolment number',
          type: 'TEXT',
          required: false,
          validation: {
            rules: [{ type: 'letters_digits' }, { type: 'uppercase' }, { type: 'min_length', value: 8 }, { type: 'max_length', value: 12 }],
            custom: [
              { kind: 'REGEX', source: '[A-Z]{3}[0-9]+', flags: 'iu', message_en: 'Three letters, then digits', message_mr: 'तीन अक्षरे, मग अंक' },
              { kind: 'JS', source: 'function (value) { return value.length > 8; }', message_en: 'Too short', message_mr: null },
            ],
          },
        },
      ],
    ]);
  });

  it('sends dates and times as text, and numbers as numbers', async () => {
    const calls = mockApi();
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText(/Label \(English\)/), 'Joined on');
    await userEvent.selectOptions(typeBox(dialog), 'DATE');
    set(within(dialog).getByLabelText('Earliest date'), '2020-01-01');
    set(within(dialog).getByLabelText('Latest date'), '2026-12-31');
    await userEvent.type(within(dialog).getByLabelText('Minimum age (years)'), '1');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Not in the future' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    await screen.findByText('Field Joined on added.');
    expect((writes(calls)[0]![2] as { validation: FieldValidation }).validation).toEqual({
      rules: [{ type: 'not_future' }, { type: 'min_date', value: '2020-01-01' }, { type: 'max_date', value: '2026-12-31' }, { type: 'min_age', value: 1 }],
      custom: [],
    });
  });

  it('checks it all first, and says what is wrong at each box', async () => {
    const calls = mockApi();
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText(/Label \(English\)/), 'Roll');
    await userEvent.type(within(dialog).getByLabelText('Minimum characters'), '10');
    await userEvent.type(within(dialog).getByLabelText('Maximum characters'), '9');
    await userEvent.click(within(dialog).getByRole('button', { name: '+ Add regular expression' }));
    await userEvent.click(within(dialog).getByRole('button', { name: '+ Add regular expression' }));
    set(within(check(dialog, 2)).getByLabelText(/^Expression/), '(a');
    await userEvent.type(within(check(dialog, 2)).getByLabelText(/^Error message \(English\)/), 'x');
    await userEvent.click(within(dialog).getByRole('button', { name: '+ Add JavaScript function' }));
    set(within(check(dialog, 3)).getByLabelText(/^Function/), ' ');
    const add = within(dialog).getByRole('button', { name: 'Add' });
    await userEvent.click(add);
    expect(writes(calls)).toEqual([]);
    const max = within(dialog).getByLabelText('Maximum characters');
    expect(max).toHaveAccessibleDescription('The maximum is smaller than the minimum');
    expect(max).toHaveAttribute('aria-invalid', 'true');
    expect(within(check(dialog, 1)).getByLabelText(/^Expression/)).toHaveAccessibleDescription('Enter the regular expression');
    expect(within(check(dialog, 1)).getByLabelText(/^Error message \(English\)/)).toHaveAccessibleDescription('The error message is required');
    expect(within(check(dialog, 2)).getByLabelText(/^Expression/)).toHaveAccessibleDescription(/^This is not a valid regular expression: ./);
    expect(within(check(dialog, 3)).getByLabelText(/^Function/)).toHaveAccessibleDescription('Enter the function');

    /* An error goes with its box, and stays with the right check when another one is removed. */
    await userEvent.type(max, '9');
    expect(max).not.toHaveAccessibleDescription();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove check 1' }));
    expect(within(check(dialog, 1)).getByLabelText(/^Expression/)).toHaveAccessibleDescription(/^This is not a valid regular expression/);
    expect(within(check(dialog, 2)).getByLabelText(/^Function/)).toHaveAccessibleDescription('Enter the function');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: '+ Add regular expression' })).toHaveFocus());

    await userEvent.clear(within(dialog).getByLabelText('Minimum characters'));
    await userEvent.type(within(dialog).getByLabelText('Minimum characters'), '2.5');
    await userEvent.click(add);
    expect(within(dialog).getByLabelText('Minimum characters')).toHaveAccessibleDescription('Enter a whole number from 1 to 250');
    expect(writes(calls)).toEqual([]);
  });

  it('a date that is only half filled in is not left out', async () => {
    const calls = mockApi();
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText(/Label \(English\)/), 'Joined on');
    await userEvent.selectOptions(typeBox(dialog), 'DATE');
    Object.defineProperty(within(dialog).getByLabelText('Earliest date'), 'validity', { value: { badInput: true } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(within(dialog).getByLabelText('Earliest date')).toHaveAccessibleDescription('Enter a real date');
    expect(writes(calls)).toEqual([]);
  });

  it('takes up to five custom checks', async () => {
    mockApi();
    const dialog = await openAdd();
    for (let i = 0; i < 5; i++) await userEvent.click(within(dialog).getByRole('button', { name: i % 2 ? '+ Add JavaScript function' : '+ Add regular expression' }));
    expect(within(dialog).getByRole('button', { name: '+ Add regular expression' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: '+ Add JavaScript function' })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove check 5' }));
    expect(within(dialog).getByRole('button', { name: '+ Add JavaScript function' })).toBeEnabled();
  });

  it('another type drops what does not fit it', async () => {
    const calls = mockApi();
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText(/Label \(English\)/), 'Roll');
    await userEvent.type(within(dialog).getByLabelText('Minimum characters'), '3');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Digits only' }));
    /* No answer is digits only and letters only: that one cannot be ticked with it. */
    expect(within(dialog).getByRole('checkbox', { name: 'Letters only' })).toBeDisabled();
    /* So are a PAN, an IFSC code and an e-mail address. */
    for (const name of ['PAN number', 'IFSC code', 'Email address']) expect(within(dialog).getByRole('checkbox', { name })).toBeDisabled();
    expect(within(dialog).getAllByText('Cannot go with Digits only')).toHaveLength(4);
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Capital letters only' }));
    await userEvent.selectOptions(typeBox(dialog), 'TEXTAREA');
    expect(within(dialog).getByRole('checkbox', { name: 'Capital letters only' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Letters only' })).toBeEnabled();
    await userEvent.selectOptions(typeBox(dialog), 'NUMBER');
    await userEvent.type(within(dialog).getByLabelText('Maximum value'), '7');
    await userEvent.selectOptions(typeBox(dialog), 'TEXT');
    /* Dropped, not only hidden. */
    for (const name of ['Digits only', 'Capital letters only']) expect(within(dialog).getByRole('checkbox', { name })).not.toBeChecked();
    expect(within(dialog).getByLabelText('Minimum characters')).toHaveValue('');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    await screen.findByText('Field Roll added.');
    expect(writes(calls)[0]![2]).not.toHaveProperty('validation');
  });

  it('opens as it is saved; unchanged it is not sent, changed it is sent whole, emptied it is null', async () => {
    const calls = mockApi();
    let dialog = await openEdit('Roll number');
    expect(within(dialog).getByLabelText('Minimum characters')).toHaveValue('3');
    expect(within(dialog).getByLabelText('Maximum characters')).toHaveValue('50');
    expect(within(dialog).getByRole('checkbox', { name: 'Letters and digits only' })).toBeChecked();
    expect(within(check(dialog, 1)).getByLabelText(/^Expression/)).toHaveValue('[A-Z]{2}\\d+');
    expect(within(check(dialog, 1)).getByRole('checkbox', { name: 'Ignore capital / small letters' })).toBeChecked();
    expect(within(check(dialog, 2)).getByLabelText(/^Function/)).toHaveValue('function (value, form) {\n  return value !== form.first_name;\n}');
    expect(within(dialog).getByLabelText(/Label \(English\)/)).toHaveFocus();
    await userEvent.type(within(dialog).getByLabelText(/Label \(English\)/), ' (college)');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByText('Field Roll number (college) saved.');

    await userEvent.click(screen.getByRole('button', { name: 'Edit Roll number' }));
    dialog = screen.getByRole('dialog', { name: 'Edit Roll number' });
    await userEvent.clear(within(dialog).getByLabelText('Maximum characters'));
    await userEvent.click(within(check(dialog, 1)).getByRole('checkbox', { name: 'Unicode' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove check 2' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByText('Field Roll number saved.');

    await userEvent.click(screen.getByRole('button', { name: 'Edit Family income' }));
    dialog = screen.getByRole('dialog', { name: 'Edit Family income' });
    await userEvent.clear(within(dialog).getByLabelText('Minimum value'));
    await userEvent.clear(within(dialog).getByLabelText('Maximum value'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByText('Field Family income saved.');

    /* Nothing changed at all: nothing is sent (also where an older API sends no validation). */
    await userEvent.click(screen.getByRole('button', { name: 'Edit Hobby' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Edit Hobby' })).getByRole('button', { name: 'Save' }));
    await screen.findByText('Field Hobby saved.');
    expect(writes(calls)).toEqual([
      ['PATCH', '/manage/fields/f3', { label_en: 'Roll number (college)' }],
      [
        'PATCH',
        '/manage/fields/f3',
        { validation: { rules: [{ type: 'letters_digits' }, { type: 'min_length', value: 3 }], custom: [{ ...ROLL.custom[0], flags: 'i' }] } },
      ],
      ['PATCH', '/manage/fields/f4', { validation: null }],
    ]);
  });

  it('a new type that drops limits also sends what is left', async () => {
    const calls = mockApi();
    const dialog = await openEdit('Roll number');
    await userEvent.selectOptions(typeBox(dialog), 'EMAIL');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByText('Field Roll number saved.');
    expect(writes(calls)).toEqual([['PATCH', '/manage/fields/f3', { type: 'EMAIL', validation: { rules: [], custom: ROLL.custom } }]]);
  });

  it("shows the server's errors at their boxes", async () => {
    mockApi({
      write: () =>
        invalid(
          ['body.validation.rules.2.value', 'At most 250'],
          ['body.validation.custom.0.flags', 'Flags may be i, m, s, u'],
          ['body.validation.custom.1.source', 'The function does not run'],
          ['body.validation.custom.1.message_mr', 'Too long'],
          ['body.validation.custom', 'Too much in all'],
          ['body.validation.rules', 'Not these together'],
        ),
    });
    const dialog = await openEdit('Roll number');
    await userEvent.type(within(dialog).getByLabelText('Maximum characters'), '{backspace}');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText(/^Please correct: At most 250/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Maximum characters')).toHaveAccessibleDescription('At most 250');
    expect(within(dialog).getByRole('group', { name: 'Options of check 1' })).toHaveAccessibleDescription('Flags may be i, m, s, u');
    expect(within(check(dialog, 2)).getByLabelText(/^Function/)).toHaveAccessibleDescription('The function does not run');
    expect(within(check(dialog, 2)).getByLabelText(/^Error message \(Marathi\)/)).toHaveAccessibleDescription('Too long');
    expect(within(dialog).getByText('Too much in all')).toHaveClass('err');
    expect(within(dialog).getByText('Not these together')).toHaveClass('err');
    /* Corrected boxes lose their error. */
    set(within(check(dialog, 2)).getByLabelText(/^Function/), 'function () { return true; }');
    expect(within(check(dialog, 2)).getByLabelText(/^Function/)).not.toHaveAccessibleDescription('The function does not run');
  });
});

describe('Form fields: Try it', () => {
  it('tries an answer on the server with the validation as it is in the dialog; nothing is saved', async () => {
    const answers = [json(200, { data: { valid: true, messages: [] } }), json(200, { data: { valid: false, messages: ['Roll must be at least 3 characters', 'Wrong'] } })];
    const calls = mockApi({ write: (_m, path) => (path.endsWith('/test-validation') ? answers.shift() : undefined) });
    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByLabelText(/Label \(English\)/), 'Roll');
    await userEvent.type(within(dialog).getByLabelText('Minimum characters'), '3');
    const area = within(dialog).getByRole('group', { name: 'Try it' });
    await userEvent.type(within(area).getByLabelText('Answer'), 'abc');
    await userEvent.click(within(area).getByRole('button', { name: 'Test' }));
    expect(await within(area).findByText('Accepted')).toBeInTheDocument();
    /* Changed: the answer says nothing any more. Enter tries it, too. */
    await userEvent.type(within(area).getByLabelText('Answer'), '{backspace}');
    expect(within(area).queryByText('Accepted')).not.toBeInTheDocument();
    await userEvent.type(within(area).getByLabelText('Answer'), '{enter}');
    expect(await within(area).findByText('Roll must be at least 3 characters')).toBeInTheDocument();
    expect(within(area).getByText('Wrong')).toBeInTheDocument();
    const validation = { rules: [{ type: 'min_length', value: 3 }], custom: [] };
    expect(writes(calls)).toEqual([
      ['POST', '/manage/fields/test-validation', { label_en: 'Roll', type: 'TEXT', validation, value: 'abc' }],
      ['POST', '/manage/fields/test-validation', { label_en: 'Roll', type: 'TEXT', validation, value: 'ab' }],
    ]);
    expect(screen.getByRole('dialog', { name: 'Add a field' })).toBeInTheDocument();
  });

  it('checks first, shows a 422 at the boxes, and why it could not be tried', async () => {
    let answer = invalid(['body.validation.custom.0.source', 'The function does not run']);
    const calls = mockApi({ write: () => answer });
    const dialog = await openAdd();
    const area = within(dialog).getByRole('group', { name: 'Try it' });
    const test = within(area).getByRole('button', { name: 'Test' });
    await userEvent.click(within(dialog).getByRole('button', { name: '+ Add JavaScript function' }));
    await userEvent.click(test);
    expect(within(area).getByText('Please correct the validation first.')).toBeInTheDocument();
    expect(within(check(dialog, 1)).getByLabelText(/^Error message \(English\)/)).toHaveAccessibleDescription('The error message is required');
    expect(writes(calls)).toEqual([]);

    await userEvent.type(within(check(dialog, 1)).getByLabelText(/^Error message \(English\)/), 'Wrong');
    await userEvent.click(test);
    await waitFor(() => expect(within(check(dialog, 1)).getByLabelText(/^Function/)).toHaveAccessibleDescription('The function does not run'));
    expect(within(area).getByText('Please correct the validation first.')).toBeInTheDocument();
    expect((writes(calls)[0]![2] as { label_en: string }).label_en).toBe('The answer');

    answer = invalid(['body.value', 'The answer is too long']);
    await userEvent.click(test);
    expect(await within(area).findByText('The answer is too long')).toBeInTheDocument();
    answer = json(503, { message: 'Please try again later' });
    await userEvent.click(test);
    expect(await within(area).findByText('Please try again later')).toBeInTheDocument();
  });

  it('has a box that fits the type, and can be tried without any validation', async () => {
    const calls = mockApi({ write: () => json(200, { data: { valid: true, messages: [] } }) });
    const dialog = await openAdd();
    const area = within(dialog).getByRole('group', { name: 'Try it' });
    const box = async (type: FieldType) => {
      await userEvent.selectOptions(typeBox(dialog), type);
      return within(area).getByLabelText('Answer');
    };
    expect(await box('DATE')).toHaveAttribute('type', 'date');
    expect(await box('TIME')).toHaveAttribute('type', 'time');
    expect((await box('TEXTAREA')).tagName).toBe('TEXTAREA');
    expect(await box('CHECKBOXES')).toHaveAccessibleDescription('The values of the choices, e.g. ["Morning","Evening"].');
    const email = await box('EMAIL');
    await userEvent.type(email, 'a@b.in');
    await userEvent.click(within(area).getByRole('button', { name: 'Test' }));
    expect(await within(area).findByText('Accepted')).toBeInTheDocument();
    expect(writes(calls)).toEqual([
      ['POST', '/manage/fields/test-validation', { label_en: 'The answer', type: 'EMAIL', validation: { rules: [], custom: [] }, value: 'a@b.in' }],
    ]);
  });
});

describe('Form fields: what is checked, in the table', () => {
  it('is one line under the label of a field', async () => {
    mockApi();
    await open();
    expect(within(row('Roll number')).getByText('Checks: 3–50 characters, Letters and digits only, 1 expression, 1 function')).toHaveClass('hint');
    expect(within(row('Family income')).getByText('Checks: from 1 to 100')).toBeInTheDocument();
    for (const name of ['First Name', 'Gender', 'Hobby', 'Shift']) expect(within(row(name)).queryByText(/^Checks/)).not.toBeInTheDocument();
  });

  it('a field of the program has a validation too', async () => {
    const calls = mockApi();
    const dialog = await openEdit('Gender');
    expect(within(dialog).getByText('The choices are the validation: only one of them is accepted. Custom checks can be added.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '+ Add JavaScript function' }));
    await userEvent.type(within(check(dialog, 1)).getByLabelText(/^Error message \(English\)/), 'Not this batch');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByText('Field Gender saved.');
    expect(writes(calls)).toEqual([
      ['PATCH', '/manage/fields/f2', { validation: { rules: [], custom: [expect.objectContaining({ kind: 'JS', message_en: 'Not this batch' })] } }],
    ]);
  });

  it('a view-only account sees the line, and nothing to change it', async () => {
    const calls = mockApi({ role: 'VIEWER' });
    await open();
    expect(within(row('Roll number')).getByText(/^Checks: 3–50 characters/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add|Edit|Delete|Test/ })).not.toBeInTheDocument();
    expect(writes(calls)).toEqual([]);
  });
});
