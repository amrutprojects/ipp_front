import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { buildModel, viewRows } from '../src/form';
import type { ApplicantDetail, Application, FieldConfig, FieldType, FieldValidation, Form, Options, ViewField } from '../src/types';

/* The types of the own fields and their validation in the student's form, its preview, the submitted form and the Edit form. */
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const invalid = (field: string, message: string, top = 'Validation failed') =>
  json(422, { message: top, error: { code: 'VALIDATION_ERROR', details: [{ field, message }] } });

let order = 0;
const own = (key: string, type: FieldType, label_en: string, label_mr: string | null, over: Partial<FieldConfig> = {}): FieldConfig => ({
  key: `x_${key}`,
  step: 1,
  label_en,
  label_mr,
  required: false,
  type,
  custom: true,
  order: ++order,
  options_kind: null,
  help_en: null,
  help_mr: null,
  ...over,
});
const FIELDS: FieldConfig[] = [
  own('email', 'EMAIL', 'College email', 'कॉलेज ईमेल'),
  own('mobile', 'MOBILE', 'Parent mobile', 'पालकांचा मोबाईल'),
  own('url', 'URL', 'Portfolio', 'पोर्टफोलिओ', { help_en: 'Your own page.', help_mr: 'आपले स्वतःचे पान.' }),
  own('time', 'TIME', 'Call after', 'या वेळेनंतर फोन'),
  own('month', 'MONTH', 'Last exam', 'शेवटची परीक्षा'),
  own('year', 'YEAR', 'Passing year', 'उत्तीर्ण वर्ष', { validation: { rules: [{ type: 'min_value', value: 2015 }, { type: 'not_future' }], custom: [] } }),
  own('shift', 'RADIO', 'Shift', 'पाळी', { options_kind: 'FIELD:x_shift', help_en: 'One only.' }),
  own('days', 'CHECKBOXES', 'Days', 'दिवस', { validation: { rules: [{ type: 'min_choices', value: 2 }], custom: [] } }),
  own('laptop', 'YES_NO', 'Own laptop', 'स्वतःचा लॅपटॉप'),
  own('agree', 'CONSENT', 'I will attend every day', 'मी रोज उपस्थित राहीन', { required: true, help_en: 'Without it you cannot apply.' }),
  own('roll', 'TEXT', 'Roll number', 'रोल नंबर', {
    validation: {
      rules: [{ type: 'letters_digits' }, { type: 'max_length', value: 6 }],
      custom: [
        { kind: 'REGEX', source: '[a-z]+\\d*', flags: 'i', message_en: 'Letters first', message_mr: 'आधी अक्षरे' },
        { kind: 'JS', message_en: 'This roll number is not ours', message_mr: 'हा रोल नंबर आमचा नाही' },
      ],
    },
  }),
  own('about', 'TEXTAREA', 'About you', 'आपल्याविषयी', { validation: { rules: [{ type: 'max_length', value: 300 }], custom: [] } }),
  own('sign', 'SIGNATURE' as FieldType, 'Signature', null, { options_kind: 'FIELD:x_sign' }),
];
const item = (value: string, name_mr: string | null = null) => ({ value, name_en: value, name_mr });
const OPTIONS: Options = {
  regions: [],
  castes: [],
  educations: [],
  religions: [],
  tracks: [],
  genders: [],
  marital_statuses: [],
  districts: [],
  centres: [],
  grading_types: [],
  cgpa_scales: [],
  qualification_classes: [],
  document_types: [],
  fields: FIELDS,
  lists: {
    'FIELD:x_shift': [item('Morning', 'सकाळ'), item('Evening', 'संध्याकाळ')],
    'FIELD:x_days': [item('Monday', 'सोमवार'), item('Tuesday', 'मंगळवार'), item('Sunday')],
    'FIELD:x_sign': [item('a')],
  },
};
const BLANK = Object.fromEntries(FIELDS.map((f) => [f.key, ''])) as Form;
const FILLED = {
  ...BLANK,
  x_email: 'asha@college.in',
  x_mobile: '9812345670',
  x_url: 'https://example.com/asha',
  x_time: '18:30',
  x_month: '2024-06',
  x_year: '2024',
  x_shift: 'Evening',
  x_days: '["Monday","Sunday"]',
  x_laptop: 'No',
  x_agree: 'Yes',
  x_roll: 'AB12',
  x_about: 'Hello',
  x_sign: 'any text',
} as Form;
const draft = (over: Partial<Application> = {}): Application => ({
  status: 'DRAFT',
  current_step: 1,
  steps: { basic_completed: false, main_completed: false },
  editable: true,
  submitted_at: null,
  form: BLANK,
  draft_files: [],
  submitted_files: [],
  registration: null,
  ...over,
});

interface Opts {
  options?: Options;
  /* Answers a completed step; undefined = saved. */
  step?: () => Response | undefined;
  detail?: Partial<ApplicantDetail>;
  put?: () => Response | undefined;
}
function mockApi(start: Application, opts: Opts = {}) {
  let app = start;
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = new URL(String(input), 'http://x').pathname.replace(/^.*\/edp/, '');
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ method, path, body });
    if (path === '/me') return json(200, { data: { id: 'a1', first_name: 'Asha', last_name: 'Kulkarni', email: 'asha@example.com' } });
    if (path === '/manage/me') return json(200, { data: { id: 'm1', name: 'Program Auditor', email: 'a@example.com', role: 'ADMIN' } });
    if (path === '/options') return json(200, { data: opts.options ?? OPTIONS });
    if (path === '/application' && method === 'GET') return json(200, { data: app });
    if (path.startsWith('/application/steps/') && method === 'PUT') {
      const { complete, data } = body as { complete: boolean; data: Record<string, string> };
      const refused = complete ? opts.step?.() : undefined;
      if (refused) return refused;
      app = { ...app, form: { ...app.form, ...data } as Form, current_step: complete ? Number(path.split('/').pop()) + 1 : app.current_step };
      return json(200, { data: app });
    }
    if (path === '/manage/applicants/s1/form' && method === 'PUT') return opts.put?.() ?? json(200, { data: opts.detail });
    if (path === '/manage/applicants/s1') return json(200, { data: opts.detail });
    if (path.endsWith('/follow-ups')) return json(200, { data: [] });
    return json(404, { message: 'not mocked' });
  });
  return calls;
}
/* A new page load, so the options are fetched again. */
async function renderFresh(path = '/application') {
  vi.resetModules();
  const { default: App } = await import('../src/App');
  localStorage.setItem(path.startsWith('/manage') ? 'edp.manage.token' : 'edp.token', 'test-token');
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
const form = async () => {
  await renderFresh();
  await screen.findByRole('heading', { name: 'Step 1 of 3 – Basic Details' });
};
const next = () => userEvent.click(screen.getByRole('button', { name: 'Save & Next →' }));
const complete = async () => {
  await next();
  await userEvent.click(screen.getByRole('button', { name: 'Yes, save & next' }));
};
const set = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const group = (name: RegExp) => screen.getByRole('group', { name });

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("The types of the own fields in the student's form", () => {
  it('each has its own control, described by its help', async () => {
    mockApi(draft());
    await form();
    expect(screen.getByLabelText('College email')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Parent mobile')).toHaveAttribute('type', 'tel');
    expect(screen.getByLabelText('Portfolio')).toHaveAttribute('type', 'url');
    expect(screen.getByLabelText('Portfolio')).toHaveAccessibleDescription('Your own page.');
    expect(screen.getByLabelText('Call after')).toHaveAttribute('type', 'time');
    expect(screen.getByLabelText('Last exam')).toHaveAttribute('type', 'month');
    const year = screen.getByLabelText('Passing year');
    expect([year.getAttribute('type'), year.getAttribute('min'), year.getAttribute('max')]).toEqual(['number', '2015', '2100']);
    const shift = group(/^Shift/);
    expect(within(shift).getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['Morning', 'Evening']);
    expect(shift).toHaveAccessibleDescription('One only.');
    expect(within(group(/^Days/)).getAllByRole('checkbox').map((c) => c.closest('label')!.textContent)).toEqual(['Monday', 'Tuesday', 'Sunday']);
    expect(within(group(/^Own laptop/)).getAllByRole('radio').map((c) => c.closest('label')!.textContent)).toEqual(['Yes', 'No']);
    const agree = screen.getByRole('checkbox', { name: /^I will attend every day/ });
    expect(agree).not.toBeChecked();
    expect(agree).toHaveAccessibleDescription('Without it you cannot apply.');
    /* Longest answers: the limit set, else what the API takes. */
    expect(screen.getByLabelText('Roll number')).toHaveAttribute('maxlength', '6');
    expect(screen.getByLabelText('About you')).toHaveAttribute('maxlength', '300');
  });

  it('is in Marathi: labels, choices, Yes / No and help', async () => {
    mockApi(draft());
    await form();
    await userEvent.click(screen.getByRole('button', { name: 'मराठी' }));
    expect(within(group(/^पाळी/)).getAllByRole('radio').map((c) => c.closest('label')!.textContent)).toEqual(['सकाळ', 'संध्याकाळ']);
    expect(within(group(/^दिवस/)).getAllByRole('checkbox').map((c) => c.closest('label')!.textContent)).toEqual(['सोमवार', 'मंगळवार', 'Sunday']);
    expect(within(group(/^स्वतःचा लॅपटॉप/)).getAllByRole('radio').map((c) => c.closest('label')!.textContent)).toEqual(['होय', 'नाही']);
    expect(screen.getByRole('checkbox', { name: /^मी रोज उपस्थित राहीन/ })).toBeInTheDocument();
    expect(screen.getByLabelText('पोर्टफोलिओ')).toHaveAccessibleDescription('आपले स्वतःचे पान.');
    await userEvent.type(screen.getByLabelText('पालकांचा मोबाईल'), '12345');
    await userEvent.click(within(group(/^दिवस/)).getByRole('checkbox', { name: 'सोमवार' }));
    await next();
    expect(screen.getByText('पालकांचा मोबाईल ६–९ ने सुरू होणारा १० अंकी भारतीय क्रमांक असावा')).toBeInTheDocument();
    expect(group(/^दिवस/)).toHaveAccessibleDescription('दिवस: किमान २ पर्याय निवडा');
    expect(screen.getByText('मी रोज उपस्थित राहीन: खूण करणे आवश्यक आहे')).toBeInTheDocument();
  });

  it('saves the answers as text, the choices in the order of the list', async () => {
    const calls = mockApi(draft());
    await form();
    await userEvent.type(screen.getByLabelText('College email'), 'asha@college.in');
    await userEvent.type(screen.getByLabelText('Parent mobile'), '9812345670');
    await userEvent.type(screen.getByLabelText('Portfolio'), 'https://example.com/asha');
    set(screen.getByLabelText('Call after'), '18:30');
    set(screen.getByLabelText('Last exam'), '2024-06');
    await userEvent.type(screen.getByLabelText('Passing year'), '2024');
    await userEvent.click(screen.getByRole('radio', { name: 'Morning' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Evening' }));
    /* Ticked last to first. */
    for (const day of ['Sunday', 'Tuesday', 'Monday', 'Tuesday']) await userEvent.click(screen.getByRole('checkbox', { name: day }));
    await userEvent.click(screen.getByRole('radio', { name: 'No' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /^I will attend/ }));
    await userEvent.type(screen.getByLabelText('Roll number'), 'AB12');
    await userEvent.type(screen.getByLabelText('About you'), 'Hello');
    await userEvent.type(screen.getByLabelText('Signature'), 'any text');
    await complete();
    await screen.findByRole('heading', { name: 'Step 2 of 3 – Main Form' });
    const saved = calls.filter((c) => c.method === 'PUT').map((c) => c.body as { complete: boolean; data: Record<string, string> });
    expect(saved.find((b) => b.complete)!.data).toEqual(FILLED);
    /* Autosaved the same way. */
    expect(saved.filter((b) => !b.complete).some((b) => b.data.x_days === '["Monday","Sunday"]' && b.data.x_agree === 'Yes')).toBe(true);
  });

  it('comes back as it was saved; unticked, nothing is left', async () => {
    const calls = mockApi(draft({ form: FILLED }));
    await form();
    expect(screen.getByLabelText('Last exam')).toHaveValue('2024-06');
    expect(screen.getByRole('radio', { name: 'Evening' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'No' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Monday' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Tuesday' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /^I will attend/ })).toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Monday' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sunday' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /^I will attend/ }));
    await waitFor(() => expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ complete: false, data: { x_days: '', x_agree: '' } }), { timeout: 3000 });
  });

  it('says what is wrong at each field, tied to its group, and the focus goes to the first one', async () => {
    mockApi(draft());
    await form();
    await userEvent.type(screen.getByLabelText('Parent mobile'), '12345');
    await userEvent.type(screen.getByLabelText('Portfolio'), 'example.com');
    set(screen.getByLabelText('Passing year'), '2014');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Tuesday' }));
    await userEvent.type(screen.getByLabelText('Roll number'), '12ab');
    await next();
    expect(screen.getByLabelText('Parent mobile')).toHaveAccessibleDescription('Parent mobile must be a 10-digit Indian number starting 6–9');
    expect(screen.getByLabelText('Portfolio')).toHaveAccessibleDescription('Portfolio must be a web address starting with http:// or https://');
    expect(screen.getByLabelText('Passing year')).toHaveAccessibleDescription('Passing year must be at least 2015');
    expect(group(/^Days/)).toHaveAccessibleDescription('Days: choose at least 2');
    expect(screen.getByRole('checkbox', { name: 'Tuesday' })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('checkbox', { name: /^I will attend/ })).toHaveAccessibleDescription('I will attend every day must be ticked');
    expect(screen.getByLabelText('Roll number')).toHaveAccessibleDescription('Letters first');
    expect(
      screen.getByText('Please correct the highlighted fields: Parent mobile, Portfolio, Passing year, Days, I will attend every day, Roll number.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Parent mobile')).toHaveFocus();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    /* The first box of a group. */
    await userEvent.clear(screen.getByLabelText('Parent mobile'));
    await userEvent.clear(screen.getByLabelText('Portfolio'));
    set(screen.getByLabelText('Passing year'), '2024');
    await next();
    expect(screen.getByRole('checkbox', { name: 'Monday' })).toHaveFocus();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Monday' }));
    await next();
    expect(screen.getByRole('checkbox', { name: /^I will attend/ })).toHaveFocus();
  });

  it('a required one must be answered', async () => {
    mockApi(draft(), { options: { ...OPTIONS, fields: FIELDS.map((f) => ({ ...f, required: true })) } });
    await form();
    await next();
    for (const f of FIELDS) expect(screen.getByText(f.type === 'CONSENT' ? `${f.label_en} must be ticked` : `${f.label_en} is required`)).toBeInTheDocument();
    expect(group(/^Shift/)).toHaveAccessibleDescription('Shift is required');
    expect(group(/^Own laptop/)).toHaveAccessibleDescription('Own laptop is required');
  });

  it('a choice that is no longer offered is shown until it is unticked', async () => {
    mockApi(draft({ form: { ...BLANK, x_days: '["Friday","Monday","Tuesday"]', x_shift: 'Night', x_agree: 'Yes' } as Form }));
    await form();
    expect(within(group(/^Days/)).getAllByRole('checkbox').map((c) => c.closest('label')!.textContent)).toEqual([
      'Monday',
      'Tuesday',
      'Sunday',
      'Friday (no longer offered)',
    ]);
    await next();
    expect(group(/^Days/)).toHaveAccessibleDescription('Select valid choices for Days');
    expect(group(/^Shift/)).toHaveAccessibleDescription('Select a valid Shift');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Friday (no longer offered)' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Morning' }));
    await next();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('a type of a newer API is a text box', async () => {
    mockApi(draft());
    await form();
    expect(screen.getByLabelText('Signature')).toHaveAttribute('type', 'text');
  });
});

describe('The checks that only the server makes', () => {
  it("shows a function's message at the field and on top, in the student's language, also when it is switched later", async () => {
    mockApi(draft({ form: FILLED }), { step: () => invalid('body.x_roll', 'This roll number is not ours', 'This roll number is not ours') });
    await form();
    await userEvent.click(screen.getByRole('button', { name: 'मराठी' }));
    await complete();
    expect(await screen.findByText('हा रोल नंबर आमचा नाही', { selector: '.err' })).toBeInTheDocument();
    expect(screen.getByText('हा रोल नंबर आमचा नाही', { selector: '.notice' })).toBeInTheDocument();
    expect(screen.queryByText('This roll number is not ours')).not.toBeInTheDocument();
    expect(screen.getByLabelText('रोल नंबर')).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByText('This roll number is not ours', { selector: '.err' })).toBeInTheDocument();
  });

  it('says in Marathi when a check could not be made; any other text as the server sent it', async () => {
    let message = 'Roll number could not be checked. Please contact the programme office.';
    mockApi(draft({ form: FILLED }), { step: () => invalid('body.x_roll', message) });
    await form();
    await userEvent.click(screen.getByRole('button', { name: 'मराठी' }));
    await complete();
    expect(await screen.findByText('रोल नंबर तपासता आले नाही. कृपया कार्यक्रम कार्यालयाशी संपर्क साधा.')).toBeInTheDocument();
    message = 'Roll number 12 is taken';
    await complete();
    expect(await screen.findByText('Roll number 12 is taken')).toBeInTheDocument();
  });

  it('an older API sends no validation at all', async () => {
    const plain = FIELDS.filter((f) => f.type === 'TEXT').map(({ validation: _v, ...f }) => f);
    mockApi(draft({ form: { x_roll: '12 ab' } as unknown as Form }), { options: { ...OPTIONS, fields: plain } });
    await form();
    expect(screen.getByLabelText('Roll number')).toHaveAttribute('maxlength', '250');
    await next();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});

describe('As read: preview, submitted form, Edit form', () => {
  const TEXTS = {
    'College email': 'asha@college.in',
    'Call after': '18:30',
    'Last exam': '06/2024',
    'Passing year': '2024',
    Shift: 'Evening',
    Days: 'Monday, Sunday',
    'Own laptop': 'No',
    'I will attend every day': 'Yes',
    Signature: 'any text',
  };
  const valueOf = (label: string, root: ReturnType<typeof within>) => root.getByText(label, { selector: 'dt' }).nextElementSibling;

  it('the preview shows the names of the choices, months and Yes / No', async () => {
    mockApi(draft({ current_step: 3, steps: { basic_completed: true, main_completed: true }, form: FILLED }));
    await renderFresh();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'I accept the declaration' }));
    await userEvent.click(screen.getByRole('button', { name: 'Preview Application' }));
    const preview = within(screen.getByRole('dialog', { name: 'Preview of your application' }));
    for (const [label, text] of Object.entries(TEXTS)) expect(valueOf(label, preview)).toHaveTextContent(text);
  });

  it('in Marathi, with the Marathi names', () => {
    const model = buildModel(OPTIONS, 'mr');
    const text = (key: string, f: Form = FILLED) => model.text(key, f);
    expect([text('x_shift'), text('x_days'), text('x_laptop'), text('x_agree'), text('x_month')]).toEqual(['संध्याकाळ', 'सोमवार, Sunday', 'नाही', 'होय', '06/2024']);
    expect([text('x_agree', BLANK), text('x_days', BLANK), text('x_laptop', BLANK)]).toEqual(['', '', '']);
    /* Not a list of choices (the type was changed): as it is. */
    expect(text('x_days', { ...BLANK, x_days: 'typed' } as Form)).toBe('typed');
  });

  const view = (key: string, text: string, value = text): ViewField => {
    const f = FIELDS.find((x) => x.key === `x_${key}`)!;
    return { key: f.key, step: 1, label_en: f.label_en, label_mr: f.label_mr, type: f.type, value, text, custom: true };
  };
  const VIEW = [
    view('time', '18:30'),
    view('month', '2024-06'),
    view('year', '2024'),
    view('shift', 'Evening'),
    /* The names, joined by the API. */
    view('days', 'Monday, Sunday', '["Monday","Sunday"]'),
    view('laptop', 'No'),
    view('agree', 'Yes'),
    view('sign', 'any text'),
  ];

  it('the submitted form shows them in the chosen language', async () => {
    mockApi(
      draft({
        status: 'SUBMITTED',
        editable: false,
        submitted_at: '2026-11-25T10:00:00Z',
        registration: { registration_id: 'IPP-000001', registration_number: null, status: 'SUBMITTED', aadhaar_masked: null, display: {} },
        view_fields: [...VIEW, { ...view('agree', ''), key: 'x_agree2', label_en: 'Not ticked' }],
      }),
    );
    await renderFresh();
    await screen.findByRole('heading', { name: 'Your registration' });
    const page = within(document.body);
    for (const label of ['Call after', 'Last exam', 'Passing year', 'Shift', 'Days', 'Own laptop', 'I will attend every day', 'Signature'] as const)
      expect(valueOf(label, page)).toHaveTextContent(TEXTS[label]);
    expect(valueOf('Not ticked', page)).toHaveTextContent('—');
    await userEvent.click(screen.getByRole('button', { name: 'मराठी' }));
    expect(valueOf('स्वतःचा लॅपटॉप', page)).toHaveTextContent('नाही');
    expect(valueOf('मी रोज उपस्थित राहीन', within(screen.getAllByText('मी रोज उपस्थित राहीन', { selector: 'dt' })[0]!.parentElement!))).toHaveTextContent('होय');
    expect(viewRows(VIEW, 'en').map((r) => r.text)).toEqual(['18:30', '06/2024', '2024', 'Evening', 'Monday, Sunday', 'No', 'Yes', 'any text']);
  });

  const detail = (over: Partial<ApplicantDetail> = {}): ApplicantDetail =>
    ({
      account: { id: 's1', name: 'Asha Kulkarni', email: 'asha@example.com', mobile_number: '9000000000', created_at: '', email_verified_at: null, last_login_at: null },
      status: 'SUBMITTED',
      steps: { basic_completed_at: null, main_completed_at: null, submitted_at: '2026-11-25T10:00:00Z' },
      registration: { registration_id: 'IPP-000001', registration_number: null },
      aadhaar_masked: 'XXXX-XXXX-2463',
      form: FILLED,
      display: {},
      view_fields: VIEW,
      documents: [],
      edits: [],
      can_edit: true,
      locked_fields: [],
      approval: null,
      history: [],
      ...over,
    }) as ApplicantDetail;

  it("the Auditor's page shows the same texts", async () => {
    mockApi(draft(), { detail: detail() });
    await renderFresh('/manage/applicants/s1');
    await screen.findByText('Days', { selector: 'dt' });
    const page = within(document.body);
    for (const label of ['Last exam', 'Shift', 'Days', 'Own laptop', 'I will attend every day'] as const) expect(valueOf(label, page)).toHaveTextContent(TEXTS[label]);
  });

  it("the Auditor's Edit form has the same controls and checks, and sends only what changed", async () => {
    let refused: Response | undefined = invalid('body.x_roll', 'This roll number is not ours');
    const calls = mockApi(draft(), { detail: detail(), put: () => refused });
    await renderFresh('/manage/applicants/s1/edit');
    await screen.findByRole('heading', { name: 'Edit form – Asha Kulkarni' });
    expect(screen.getByRole('radio', { name: 'Evening' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Sunday' })).toBeChecked();
    expect(screen.getByLabelText('Last exam')).toHaveAttribute('type', 'month');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sunday' }));
    set(screen.getByLabelText('Passing year'), '2014');
    await userEvent.click(screen.getByRole('radio', { name: 'Yes' }));
    await userEvent.clear(screen.getByLabelText('Roll number'));
    await userEvent.type(screen.getByLabelText('Roll number'), 'A-1');
    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    expect(screen.getByLabelText('Passing year')).toHaveAccessibleDescription('Passing year must be at least 2015');
    expect(screen.getByLabelText('Passing year')).toHaveFocus();
    expect(group(/^Days/)).toHaveAccessibleDescription('Days: choose at least 2');
    expect(screen.getByLabelText('Roll number')).toHaveAccessibleDescription('Roll number may contain only letters, digits and spaces');
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);

    set(screen.getByLabelText('Passing year'), '2024');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Tuesday' }));
    await userEvent.clear(screen.getByLabelText('Roll number'));
    await userEvent.type(screen.getByLabelText('Roll number'), 'A1');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes (3)' }));
    expect(await screen.findByText('This roll number is not ours')).toBeInTheDocument();
    refused = undefined;
    await userEvent.click(screen.getByRole('button', { name: 'Save changes (3)' }));
    expect(await screen.findByText('Changes saved.')).toBeInTheDocument();
    const data = { x_days: '["Monday","Tuesday"]', x_laptop: 'Yes', x_roll: 'A1' };
    expect(calls.filter((c) => c.method === 'PUT').map((c) => c.body)).toEqual([{ data }, { data }]);
  });

  it('a locked field of boxes cannot be changed and says why', async () => {
    mockApi(draft(), { detail: detail({ locked_fields: ['x_days', 'x_agree', 'x_shift'] }) });
    await renderFresh('/manage/applicants/s1/edit');
    await screen.findByRole('heading', { name: 'Edit form – Asha Kulkarni' });
    for (const box of [screen.getByRole('checkbox', { name: 'Monday' }), screen.getByRole('radio', { name: 'Morning' }), screen.getByRole('checkbox', { name: /^I will attend/ })])
      expect(box).toBeDisabled();
    expect(group(/^Days/)).toHaveAccessibleDescription('This field cannot be changed.');
    expect(screen.getByRole('checkbox', { name: /^I will attend/ })).toHaveAccessibleDescription('This field cannot be changed.');
  });
});

describe('Validation of an own field with a wrong shape', () => {
  it('does not break the form', async () => {
    const odd = [{}, { rules: null, custom: null }, { rules: [{ type: 'nothing' }], custom: [{ kind: 'OTHER' }] }] as unknown as FieldValidation[];
    mockApi(draft(), { options: { ...OPTIONS, fields: odd.map((validation, i) => own(`odd${i}`, 'TEXT', `Odd ${i}`, null, { validation })) } });
    await form();
    await userEvent.type(screen.getByLabelText('Odd 0'), 'a');
    await userEvent.type(screen.getByLabelText('Odd 1'), 'b');
    await userEvent.type(screen.getByLabelText('Odd 2'), 'c');
    await next();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
