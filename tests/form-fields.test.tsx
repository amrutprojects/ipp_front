import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { buildModel, viewRows } from '../src/form';
import type { Application, FieldConfig, Form, Options, ViewField } from '../src/types';

/*
 * The form as the masters define it (GET /edp/options → fields, lists, document_types, district_technologies): labels,
 * required marks, on / off, order, own fields and choices, in the student's language.
 */
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const KEYS: [key: string, step: number, label_en: string, label_mr: string | null, over?: Partial<FieldConfig>][] = [
  ['last_name', 1, 'Surname', 'आडनाव'],
  ['first_name', 1, 'First Name', 'पहिले नाव'],
  ['father_name', 1, 'Father Name', 'वडिलांचे नाव'],
  ['mother_name', 1, 'Mother Name', null],
  ['email', 1, 'Email', 'ईमेल'],
  ['date_of_birth', 1, 'Date of Birth', 'जन्मतारीख', { type: 'DATE' }],
  ['current_address', 1, 'Current Address', 'सध्याचा पत्ता', { type: 'TEXTAREA' }],
  ['district_id', 1, 'District', 'जिल्हा', { type: 'DROPDOWN' }],
  ['aadhaar_number', 1, 'Aadhaar Number', 'आधार क्रमांक'],
  ['mobile_number', 1, 'Mobile Number', 'मोबाईल क्रमांक'],
  ['religion', 1, 'Religion', 'धर्म', { type: 'DROPDOWN', options_kind: 'RELIGION' }],
  ['caste_id', 1, 'Caste', 'जात', { type: 'DROPDOWN', options_kind: 'CASTE' }],
  /* Made optional, with a help text. */
  ['landmark', 1, 'Landmark', 'खूण', { required: true, help_en: 'A place everybody knows.', help_mr: 'सर्वांना माहीत असलेले ठिकाण.' }],
  /* The disability details without the question they depend on: not asked. */
  ['disability_type', 1, 'Type of Disability', null],
  /* Own fields. */
  ['x_hobby', 1, 'Hobby', 'छंद', { custom: true, required: true }],
  ['x_about', 1, 'About you', null, { custom: true, required: false, type: 'TEXTAREA' }],
  ['x_siblings', 1, 'Number of siblings', null, { custom: true, required: false, type: 'NUMBER' }],
  ['x_joined', 1, 'Joined on', null, { custom: true, required: false, type: 'DATE' }],
  ['x_shift', 1, 'Preferred shift', 'पसंतीची वेळ', { custom: true, required: false, type: 'DROPDOWN', options_kind: 'FIELD:x_shift' }],
  ['region_id', 2, 'Course District', 'अभ्यासक्रमाचा जिल्हा', { type: 'DROPDOWN', options_kind: 'REGION' }],
  ['centre_id', 2, 'Center Name', 'केंद्राचे नाव', { type: 'DROPDOWN' }],
  ['technology', 2, 'Technology', 'तंत्रज्ञान', { type: 'DROPDOWN', options_kind: 'TECHNOLOGY' }],
  ['education_id', 2, 'Education Qualification', 'शैक्षणिक पात्रता', { type: 'DROPDOWN', options_kind: 'EDUCATION' }],
  ['educational_status', 2, 'Educational Status', 'शैक्षणिक स्थिती', { type: 'DROPDOWN', options_kind: 'EDUCATIONAL_STATUS' }],
  ['qualification_board', 2, 'College Name', 'महाविद्यालयाचे नाव'],
  ['x_note', 2, 'Anything else', null, { custom: true, required: false }],
];
const FIELDS: FieldConfig[] = KEYS.map(([key, step, label_en, label_mr, over], i) => ({
  key,
  step,
  label_en,
  label_mr,
  required: true,
  type: 'TEXT',
  core: false,
  custom: false,
  order: i,
  options_kind: null,
  help_en: null,
  help_mr: null,
  ...over,
}));
const item = (value: string, name_en: string, name_mr: string | null = null) => ({ value, name_en, name_mr });
const OPTIONS: Options = {
  regions: [],
  castes: [],
  educations: [],
  religions: [],
  tracks: [],
  genders: [],
  marital_statuses: [],
  districts: [
    { id: 'pune', code: 'PUN', name: 'Pune' },
    { id: 'satara', code: 'SAT', name: 'Satara' },
    { id: 'nashik', code: 'NSK', name: 'Nashik' },
  ],
  centres: [{ id: 'cen1', code: 'PUN-01', name: 'Pune Centre', district_name: 'Pune' }],
  grading_types: [],
  cgpa_scales: [],
  qualification_classes: [],
  document_types: [
    { id: 'd1', code: 'PHOTO', name: 'Photo', name_mr: 'छायाचित्र', is_mandatory: true, kind: 'DOCUMENT' },
    { id: 'd2', code: 'VIDEO_1', name: 'Introduction video', name_mr: null, is_mandatory: false, kind: 'VIDEO' },
  ],
  fields: FIELDS,
  lists: {
    RELIGION: [item('हिंदू', 'Hindu', 'हिंदू'), item('OTHER', 'Other')],
    CASTE: [item('c1', 'Maratha', 'मराठा')],
    REGION: [item('r1', 'Pune', 'पुणे')],
    EDUCATION: [item('e1', 'B.Com', 'बी.कॉम.')],
    EDUCATIONAL_STATUS: [item('THIRD_YEAR', 'Third Year', 'तृतीय वर्ष'), item('FINAL_YEAR', 'Final Year', 'अंतिम वर्ष'), item('COMPLETED', 'Completed', 'पूर्ण')],
    TECHNOLOGY: [item('T01', 'Data Analytics'), item('T03', 'Web Design'), item('T05', 'Cyber Security', 'सायबर सुरक्षा')],
    'FIELD:x_shift': [item('M', 'Morning', 'सकाळ'), item('E', 'Evening', 'संध्याकाळ')],
  },
  technologies: [
    { code: 'T01', name: 'Data Analytics' },
    { code: 'T03', name: 'Web Design' },
    { code: 'T05', name: 'Cyber Security' },
  ],
  /* Satara offers two; Pune and Nashik everything. */
  district_technologies: { satara: ['T03', 'T05'] },
};
const FORM = {
  first_name: 'Kavya',
  last_name: 'Jadhav',
  father_name: 'Suresh Jadhav',
  mother_name: 'Meena Jadhav',
  email: 'kavya@example.com',
  date_of_birth: '2002-06-01',
  current_address: 'Kothrud, Pune',
  district_id: 'pune',
  aadhaar_number: '482135792463',
  mobile_number: '9000000000',
  religion: 'हिंदू',
  caste_id: 'c1',
  landmark: 'Near the bus stand',
  disability_status: 'Yes',
  x_hobby: 'Reading',
  region_id: 'r1',
  centre_id: 'cen1',
  technology: 'T01',
  education_id: 'e1',
  educational_status: 'FINAL_YEAR',
  qualification_board: 'Sample College',
} as unknown as Form;
const draft = (over: Partial<Application> = {}): Application => ({
  status: 'DRAFT',
  current_step: 1,
  steps: { basic_completed: false, main_completed: false },
  editable: true,
  submitted_at: null,
  form: FORM,
  draft_files: [],
  submitted_files: [],
  registration: null,
  ...over,
});

function mockApi(start: Application, options: Options = OPTIONS) {
  let app = start;
  const calls: { method: string; url: string; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ method, url, body });
    if (url.endsWith('/edp/me')) return json(200, { data: { id: 'a1', first_name: 'Kavya', last_name: 'Jadhav', email: 'kavya@example.com' } });
    if (url.endsWith('/edp/options')) return json(200, { data: options });
    if (url.endsWith('/edp/application') && method === 'GET') return json(200, { data: app });
    if (url.includes('/application/steps/') && method === 'PUT') {
      const { complete, data } = body as { complete: boolean; data: Record<string, string> };
      app = { ...app, form: { ...app.form, ...data } as Form, current_step: complete ? Number(url.split('/').pop()) + 1 : app.current_step };
      return json(200, { data: app });
    }
    return json(404, { message: 'not mocked' });
  });
  return calls;
}
/* A new page load, so the options are fetched again. */
async function renderFresh(path: 'application' | 'login' = 'application') {
  vi.resetModules();
  const { default: Page } = path === 'application' ? await import('../src/pages/ApplicationPage') : await import('../src/pages/LoginPage');
  const { SessionProvider } = await import('../src/session');
  const { LangProvider } = await import('../src/i18n');
  if (path === 'application') localStorage.setItem('edp.token', 'test-token');
  return render(
    <MemoryRouter>
      <LangProvider>
        <SessionProvider>
          <Page />
        </SessionProvider>
      </LangProvider>
    </MemoryRouter>,
  );
}
/* Every label in the open step, in order (a required one ends in *). */
const labels = () =>
  [...document.querySelectorAll('section.card .grid .field > label, section.card .grid .field > legend, section.card .grid h3')].map((l) =>
    l.textContent?.replace(/\s+/g, ' ').trim(),
  );
const choices = (label: RegExp) => [...(screen.getByLabelText(label) as HTMLSelectElement).options].map((o) => o.text);

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("The form from the masters (student's form)", () => {
  it('asks the active fields in their order under their current names; own fields come last, under Additional details', async () => {
    mockApi(draft());
    await renderFresh();
    await screen.findByRole('heading', { name: 'Step 1 of 3 – Basic Details' });
    expect(labels()).toEqual([
      'Surname *',
      'First Name *',
      'Father Name *',
      'Mother Name *',
      'Email *',
      'Date of Birth *',
      'Current Address *',
      'District *',
      'Aadhaar Number *',
      'Mobile Number *',
      'Religion *',
      'Caste *',
      'Landmark *',
      'Additional details',
      'Hobby *',
      'About you',
      'Number of siblings',
      'Joined on',
      'Preferred shift',
    ]);
    /* Switched off: not asked (nor what depends on it, whatever is stored). */
    for (const off of [/^Gender/, /^Permanent Address/, /^Person with Disability/, /^Type of Disability/])
      expect(screen.queryByLabelText(off)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /same as the current address/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Landmark/)).toHaveAccessibleDescription('A place everybody knows.');
    /* The choices, under their English names; the stored value is the code. */
    expect(choices(/^Religion/)).toEqual(['Select Religion', 'हिंदू', 'Other']);
    expect(screen.getByLabelText(/^Religion/)).toHaveValue('हिंदू');
    expect(choices(/^Caste/)).toEqual(['Select Caste', 'मराठा']);
    /* The own fields' controls. */
    expect(screen.getByLabelText(/^About you/).tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText(/^Joined on/)).toHaveAttribute('type', 'date');
    expect(choices(/^Preferred shift/)).toEqual(['Select Preferred shift', 'Morning', 'Evening']);
  });

  it('step 2: the course, then the qualification with College Name and Educational Status, then the own fields', async () => {
    mockApi(draft({ current_step: 2 }));
    await renderFresh();
    await screen.findByRole('heading', { name: 'Step 2 of 3 – Main Form' });
    expect(labels()).toEqual([
      'Course District *',
      'Center Name *',
      'Technology *',
      'Education Qualification *',
      'Qualification details',
      'Educational Status *',
      'College Name *',
      'Additional details',
      'Anything else',
    ]);
    expect(choices(/^Educational Status/)).toEqual(['Select Educational Status', 'Third Year', 'Final Year', 'Completed']);
    expect(screen.queryByText(/Board/)).not.toBeInTheDocument();
  });

  it('checks and saves the own fields with their step, and only the fields that are asked', async () => {
    const calls = mockApi(draft({ form: { ...FORM, x_hobby: '', landmark: '' } as Form }));
    await renderFresh();
    await userEvent.type(await screen.findByLabelText(/^Number of siblings/), '2x');
    await userEvent.click(screen.getByRole('button', { name: 'Save & Next →' }));
    expect(screen.getByText('Hobby is required')).toBeInTheDocument();
    expect(screen.getByText('Landmark is required')).toBeInTheDocument();
    expect(screen.getByText('Number of siblings must be a number')).toBeInTheDocument();
    expect(screen.getByText('Please correct the highlighted fields: Landmark, Hobby, Number of siblings.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/^Hobby/), 'Cricket');
    await userEvent.type(screen.getByLabelText(/^Landmark/), 'Temple');
    await userEvent.clear(screen.getByLabelText(/^Number of siblings/));
    await userEvent.selectOptions(screen.getByLabelText(/^Preferred shift/), 'E');
    await userEvent.click(screen.getByRole('button', { name: 'Save & Next →' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, save & next' }));
    await screen.findByRole('heading', { name: 'Step 2 of 3 – Main Form' });
    const saved = calls.find((c) => c.method === 'PUT' && (c.body as { complete: boolean }).complete)!;
    const data = (saved.body as { data: Record<string, string> }).data;
    expect(data).toMatchObject({ x_hobby: 'Cricket', x_shift: 'E', x_siblings: '', landmark: 'Temple' });
    expect(data).not.toHaveProperty('gender');
    expect(data).not.toHaveProperty('permanent_address');
  });

  it('a server error of an own field opens its step and shows at the field', async () => {
    const app = draft({ current_step: 3, steps: { basic_completed: true, main_completed: true }, draft_files: [] });
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/edp/me')) return json(200, { data: { id: 'a1', first_name: 'Kavya', last_name: 'Jadhav', email: 'kavya@example.com' } });
      if (url.endsWith('/edp/options')) return json(200, { data: { ...OPTIONS, document_types: [] } });
      if (url.endsWith('/edp/application')) return json(200, { data: app });
      if (url.endsWith('/application/submit') && init?.method === 'POST')
        return json(422, { message: 'Validation failed', error: { code: 'VALIDATION_ERROR', details: [{ field: 'body.x_note', message: 'Anything else is too long' }] } });
      return json(404, { message: 'not mocked' });
    });
    await renderFresh();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'I accept the declaration' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, submit' }));
    expect(await screen.findByRole('heading', { name: 'Step 2 of 3 – Main Form' })).toBeInTheDocument();
    expect(screen.getByText('Anything else is too long')).toBeInTheDocument();
  });

  it("is in the student's language: Marathi labels, choices, help and messages, English where there is no Marathi", async () => {
    mockApi(draft({ form: { ...FORM, x_hobby: '' } as Form }));
    await renderFresh();
    await userEvent.click(await screen.findByRole('button', { name: 'मराठी' }));
    expect(labels().slice(0, 4)).toEqual(['आडनाव *', 'पहिले नाव *', 'वडिलांचे नाव *', 'Mother Name *']);
    expect(labels()).toContain('अतिरिक्त तपशील');
    expect(choices(/^धर्म/)).toEqual(['धर्म निवडा', 'हिंदू', 'Other']);
    expect(choices(/^जात/)).toEqual(['जात निवडा', 'मराठा']);
    expect(choices(/^पसंतीची वेळ/)).toEqual(['पसंतीची वेळ निवडा', 'सकाळ', 'संध्याकाळ']);
    expect(screen.getByLabelText(/^खूण/)).toHaveAccessibleDescription('सर्वांना माहीत असलेले ठिकाण.');
    /* The documents to keep ready, too. */
    expect(screen.getByText('छायाचित्र')).toBeInTheDocument();
    expect(screen.getByText('Introduction video')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save & Next →' }));
    expect(screen.getByText('छंद आवश्यक आहे')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(labels()[0]).toBe('Surname *');
  });
});

describe('Technologies of the district', () => {
  it('a district with a selection offers only that, any other every technology', () => {
    const model = buildModel(OPTIONS, 'en');
    const names = (district: string) => model.choices('technology', { district_id: district } as Form)!.map((c) => c.label);
    expect(names('satara')).toEqual(['Web Design', 'Cyber Security']);
    expect(names('pune')).toEqual(['Data Analytics', 'Web Design', 'Cyber Security']);
    expect(names('')).toEqual(['Data Analytics', 'Web Design', 'Cyber Security']);
    expect(buildModel(OPTIONS, 'mr').choices('technology', { district_id: 'satara' } as Form)!.map((c) => c.label)).toEqual(['Web Design', 'सायबर सुरक्षा']);
  });

  it('changing the district clears a technology it does not offer, and keeps one it does', async () => {
    const calls = mockApi(draft({ current_step: 2 }));
    await renderFresh();
    await userEvent.click(await screen.findByRole('button', { name: /Basic Details/ }));
    await userEvent.selectOptions(screen.getByLabelText(/^District/), 'satara');
    await userEvent.click(screen.getByRole('button', { name: /Main Form/ }));
    expect(screen.getByLabelText(/^Technology/)).toHaveValue('');
    expect(screen.getByText(/not offered in this district/)).toBeInTheDocument();
    expect(choices(/^Technology/)).toEqual(['Select Technology', 'Web Design', 'Cyber Security']);
    await userEvent.selectOptions(screen.getByLabelText(/^Technology/), 'T05');
    expect(screen.queryByText(/not offered in this district/)).not.toBeInTheDocument();
    await waitFor(
      () => {
        const sent = calls.filter((c) => c.method === 'PUT').map((c) => (c.body as { data: Record<string, string> }).data);
        expect(sent).toContainEqual({ district_id: 'satara' });
        expect(sent.some((d) => d.technology === 'T05')).toBe(true);
      },
      { timeout: 3000 },
    );

    /* T05 is offered everywhere else too: it stays. */
    await userEvent.click(screen.getByRole('button', { name: /Basic Details/ }));
    await userEvent.selectOptions(screen.getByLabelText(/^District/), 'nashik');
    await userEvent.click(screen.getByRole('button', { name: /Main Form/ }));
    expect(screen.getByLabelText(/^Technology/)).toHaveValue('T05');
  });

  it('says so when the district offers none', async () => {
    mockApi(draft({ current_step: 2, form: { ...FORM, technology: '' } as Form }), { ...OPTIONS, district_technologies: { pune: ['T99'] } });
    await renderFresh();
    expect(await screen.findByText(/No technologies are currently offered in the chosen district/)).toBeInTheDocument();
  });
});

describe('Documents from the masters', () => {
  it('are named in the chosen language, with their kind and required mark', async () => {
    mockApi(draft({ current_step: 3, steps: { basic_completed: true, main_completed: true } }));
    await renderFresh();
    await screen.findByRole('heading', { name: 'Upload Documents' });
    const docLabels = () => [...document.querySelectorAll('.doc-field > .label')].map((l) => l.textContent?.replace(/\s+/g, ' ').trim());
    expect(docLabels()).toEqual(['Photo *', 'Introduction video (optional)']);
    /* By kind: a video takes an MP4 of up to 50 MB. */
    expect(screen.getByLabelText('Upload Introduction video')).toHaveAttribute('accept', '.mp4,video/mp4');
    expect(screen.getByText('MP4 · max 50MB')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'मराठी' }));
    expect(docLabels()).toEqual(['छायाचित्र *', 'Introduction video (ऐच्छिक)']);
  });

  it('the sign-in page lists them in the chosen language', async () => {
    mockApi(draft());
    await renderFresh('login');
    const list = await screen.findByRole('region', { name: 'Keep these documents ready' });
    expect(within(list).getByText('Photo')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'मराठी' }));
    expect(within(list).getByText('छायाचित्र')).toBeInTheDocument();
    /* The eligible castes, too. */
    expect(await screen.findByText('मराठा')).toBeInTheDocument();
  });
});

describe('Review and submitted form', () => {
  it('the preview shows every asked field under its current name, with the names of the choices', async () => {
    mockApi(
      draft({
        current_step: 3,
        steps: { basic_completed: true, main_completed: true },
        form: { ...FORM, x_shift: 'M', x_joined: '2026-01-31' } as Form,
        draft_files: [{ doc_type: 'PHOTO', name: 'Photo', original_name: 'photo.pdf', mime_type: 'application/pdf', size_bytes: 2048, uploaded_at: '' }],
      }),
    );
    await renderFresh();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'I accept the declaration' }));
    await userEvent.click(screen.getByRole('button', { name: 'Preview Application' }));
    const preview = within(screen.getByRole('dialog', { name: 'Preview of your application' }));
    const value = (label: string) => preview.getByText(label, { selector: 'dt' }).nextElementSibling;
    expect(value('Surname')).toHaveTextContent('Jadhav');
    expect(value('Religion')).toHaveTextContent('हिंदू');
    expect(value('Preferred shift')).toHaveTextContent('Morning');
    expect(value('Joined on')).toHaveTextContent('31/01/2026');
    expect(value('About you')).toHaveTextContent('—');
    expect(value('Technology')).toHaveTextContent('Data Analytics');
    expect(value('Educational Status')).toHaveTextContent('Final Year');
    expect(value('College Name')).toHaveTextContent('Sample College');
    expect(preview.queryByText('Gender')).not.toBeInTheDocument();
  });

  it('the submitted form shows the view fields and the documents by their current names', async () => {
    const view = (key: string, label_en: string, label_mr: string | null, text: string, over: Partial<ViewField> = {}): ViewField => ({
      key,
      step: 1,
      label_en,
      label_mr,
      type: 'TEXT',
      value: text,
      text,
      custom: false,
      ...over,
    });
    mockApi(
      draft({
        status: 'SUBMITTED',
        editable: false,
        submitted_at: '2026-11-25T10:00:00Z',
        submitted_files: [{ doc_type: 'PHOTO', name: 'Old photo name', original_name: 'photo.pdf', mime_type: 'application/pdf', size_bytes: 2048, uploaded_at: '' }],
        registration: { registration_id: 'IPP-000001', registration_number: null, status: 'SUBMITTED', aadhaar_masked: 'XXXX-XXXX-2463', display: {} },
        view_fields: [
          view('last_name', 'Surname', 'आडनाव', 'Jadhav'),
          view('date_of_birth', 'Date of Birth', null, '2002-06-01', { type: 'DATE' }),
          view('x_hobby', 'Hobby', 'छंद', 'Reading', { custom: true }),
        ],
      }),
    );
    await renderFresh();
    await screen.findByRole('heading', { name: 'Your registration' });
    expect(screen.getByText('Surname', { selector: 'dt' }).nextElementSibling).toHaveTextContent('Jadhav');
    expect(screen.getByText('Date of Birth', { selector: 'dt' }).nextElementSibling).toHaveTextContent('01/06/2002');
    expect(screen.getByText('Photo', { selector: 'td' })).toBeInTheDocument();
    expect(screen.queryByText('Old photo name')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'मराठी' }));
    expect(screen.getByText('छंद', { selector: 'dt' }).nextElementSibling).toHaveTextContent('Reading');
  });

  it('view rows: dates as people write them, the score with its scale, and nothing that was not asked', () => {
    const f = (key: string, value: string, over: Partial<ViewField> = {}): ViewField => ({
      key,
      step: 2,
      label_en: key,
      label_mr: null,
      type: 'TEXT',
      value,
      text: value,
      custom: false,
      ...over,
    });
    const rows = (...view: ViewField[]) => Object.fromEntries(viewRows(view, 'en').map((r) => [r.key, r.text]));
    expect(rows(f('disability_status', 'No'), f('disability_type', ''), f('grading_type', 'PERCENTAGE'), f('cgpa_scale', ''), f('score', '72.50'))).toEqual({
      disability_status: 'No',
      grading_type: 'PERCENTAGE',
      score: '72.50%',
    });
    expect(rows(f('grading_type', 'CGPA'), f('cgpa_scale', '10'), f('score', '8.2'), f('qualification_completed_on', '2023-05-31', { type: 'DATE' }))).toEqual({
      grading_type: 'CGPA',
      cgpa_scale: '10',
      score: '8.2 / 10',
      qualification_completed_on: '31/05/2023',
    });
  });
});

describe('An API that does not send the fields', () => {
  const plain: Options = {
    ...OPTIONS,
    fields: undefined,
    lists: undefined,
    technologies: undefined,
    district_technologies: undefined,
    religions: ['हिंदू'],
    castes: [{ id: 'c1', code: 'C1', name: 'Maratha' }],
    tracks: [{ code: 'T01', name: 'Data Analytics' }],
    genders: ['Male', 'Female'],
    cgpa_scales: [10],
  };

  it("keeps today's fields under today's names, with College Name; Educational Status when its choices are sent", () => {
    const model = buildModel(plain, 'en');
    expect(model.step(1).map((f) => f.label).slice(0, 3)).toEqual(['First Name', 'Last Name', 'Father Name']);
    expect(model.step(1).filter((f) => !f.required).map((f) => f.key)).toEqual(['landmark', 'taluka', 'alternate_mobile_number', 'alternate_email']);
    expect(model.label('qualification_board')).toBe('College Name');
    expect(model.get('educational_status')).toBeUndefined();
    expect(model.choices('gender', FORM)).toEqual([
      { value: 'Male', label: 'Male' },
      { value: 'Female', label: 'Female' },
    ]);
    expect(model.choices('cgpa_scale', FORM)).toEqual([{ value: '10', label: 'Out of 10' }]);
    expect(model.choices('technology', FORM)).toEqual([{ value: 'T01', label: 'Data Analytics' }]);

    const withStatus = buildModel({ ...plain, educational_statuses: [{ code: 'COMPLETED', name: 'Completed', name_mr: 'पूर्ण' }] }, 'mr');
    expect(withStatus.label('educational_status')).toBe('Educational Status');
    expect(withStatus.choices('educational_status', FORM)).toEqual([{ value: 'COMPLETED', label: 'पूर्ण' }]);
  });
});
