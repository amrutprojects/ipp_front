import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ApplicantDetail, FieldConfig, Form, ManageRole, Options, ViewField } from '../src/types';

const ID = '11111111-1111-4111-8111-111111111111';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const config = (key: string, step: number, label_en: string, over: Partial<FieldConfig> = {}): FieldConfig => ({
  key,
  step,
  label_en,
  label_mr: `${label_en} (mr)`,
  required: true,
  type: 'TEXT',
  core: false,
  custom: false,
  order: 0,
  options_kind: null,
  help_en: null,
  help_mr: null,
  ...over,
});
const FIELDS: FieldConfig[] = [
  config('first_name', 1, 'First Name', { core: true }),
  config('father_name', 1, 'Father Name', { core: true, order: 1 }),
  config('email', 1, 'Email', { core: true, order: 2 }),
  config('aadhaar_number', 1, 'Aadhaar Number', { core: true, order: 3 }),
  config('district_id', 1, 'District', { core: true, type: 'DROPDOWN', order: 4 }),
  config('religion', 1, 'Religion', { core: true, type: 'DROPDOWN', options_kind: 'RELIGION', order: 5 }),
  config('landmark', 1, 'Landmark', { required: false, order: 6 }),
  config('disability_status', 1, 'Person with Disability', { order: 7 }),
  config('disability_type', 1, 'Type of Disability', { order: 8 }),
  config('x_hobby', 1, 'Hobby', { custom: true, required: false, order: 9 }),
  config('technology', 2, 'Technology', { core: true, type: 'DROPDOWN', options_kind: 'TECHNOLOGY' }),
  config('qualification_board', 2, 'College Name', { order: 1 }),
];
const item = (value: string, name_en: string) => ({ value, name_en, name_mr: null });
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
  ],
  centres: [],
  grading_types: [],
  cgpa_scales: [],
  qualification_classes: [],
  document_types: [],
  fields: FIELDS,
  lists: { RELIGION: [item('H', 'Hindu'), item('B', 'Buddhist')], TECHNOLOGY: [item('T01', 'Data Analytics'), item('T03', 'Web Design')] },
  district_technologies: { satara: ['T03'] },
};
const VALUES: Record<string, string> = {
  first_name: 'Kavya',
  father_name: 'Suresh Jadav',
  email: 'kavya@example.com',
  aadhaar_number: '',
  district_id: 'pune',
  /* Chosen earlier, no longer in the list. */
  religion: 'OLD',
  landmark: '',
  disability_status: 'No',
  disability_type: '',
  technology: 'T01',
  qualification_board: 'Sample College',
};
const view = (key: string, value: string, text = value): ViewField => {
  const f = FIELDS.find((x) => x.key === key)!;
  return { key, step: f.step, label_en: f.label_en, label_mr: f.label_mr, type: f.type, value, text, custom: f.custom };
};
const file = (doc_type: string, original_name: string) => ({ doc_type, name: doc_type, original_name, mime_type: 'application/pdf', size_bytes: 2048, uploaded_at: '2026-10-24T12:20:00Z' });
const detail = (over: Partial<ApplicantDetail> = {}): ApplicantDetail => ({
  account: {
    id: ID,
    name: 'Kavya Jadhav',
    email: 'kavya@example.com',
    mobile_number: '9000000000',
    created_at: '2026-10-24T11:30:00Z',
    email_verified_at: '2026-10-24T11:55:00Z',
    last_login_at: null,
  },
  status: 'SUBMITTED',
  steps: { basic_completed_at: '2026-10-24T11:57:00Z', main_completed_at: '2026-10-24T12:10:00Z', submitted_at: '2026-10-24T12:30:00Z' },
  registration: { registration_id: 'IPP-000001', registration_number: null },
  aadhaar_masked: 'XXXX-XXXX-2463',
  /* The own field's value comes with the view fields only. */
  form: VALUES as unknown as Form,
  display: {},
  view_fields: [
    view('first_name', 'Kavya'),
    view('father_name', 'Suresh Jadav'),
    view('religion', 'OLD', 'Earlier religion'),
    view('district_id', 'pune', 'Pune'),
    view('x_hobby', 'Reading'),
    view('technology', 'T01', 'Data Analytics'),
  ],
  documents: [
    { code: 'PHOTO', name: 'Passport Photo', required: true, kind: 'DOCUMENT', file: file('PHOTO', 'photo.pdf'), verified: { verified: true, at: null, by: null } },
    { code: 'VIDEO_1', name: 'Introduction video', required: false, kind: 'VIDEO', file: null, verified: null },
  ],
  edits: [],
  can_edit: true,
  locked_fields: [],
  approval: null,
  history: [],
  ...over,
});

interface Opts {
  role?: ManageRole;
  detail?: ApplicantDetail;
  put?: (body: unknown) => Response;
}
function mockApi(opts: Opts = {}) {
  let current = opts.detail ?? detail();
  const calls: { method: string; url: string; body: unknown; raw?: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body, raw: init?.body });
    if (url.endsWith('/manage/me')) return json(200, { data: { id: 'm1', name: 'Program Auditor', email: 'a@example.com', role: opts.role ?? 'ADMIN' } });
    if (url.endsWith('/edp/options')) return json(200, { data: OPTIONS });
    if (url.endsWith(`/manage/applicants/${ID}/form`) && method === 'PUT') return opts.put ? opts.put(body) : json(200, { data: current });
    if (url.endsWith(`/manage/applicants/${ID}/documents`) && method === 'POST') {
      const [code, f] = [...(init!.body as FormData).entries()][0] as [string, File];
      current = {
        ...current,
        documents: current.documents.map((d) => (d.code === code ? { ...d, file: file(code, f.name), verified: { verified: false, at: null, by: null } } : d)),
      };
      return json(200, { data: {} });
    }
    if (url.endsWith(`/manage/applicants/${ID}`)) return json(200, { data: current });
    if (url.endsWith('/follow-ups')) return json(200, { data: [] });
    if (url.endsWith('/manage/summary'))
      return json(200, { data: { total: 0, counts: {}, stages: [], follow_ups: { NONE: 0, PENDING: 0, CALLED: 0, SECOND_CALL: 0, FORM_FILLED: 0 } } });
    if (url.includes('/manage/applicants?')) return json(200, { data: [], meta: { page: 1, limit: 25, total: 0, totalPages: 1 } });
    return json(404, { message: 'not mocked' });
  });
  return calls;
}
const puts = (calls: ReturnType<typeof mockApi>) => calls.filter((c) => c.method === 'PUT').map((c) => c.body);

/* A new page load, so the options are fetched again. */
async function renderAt(path: string) {
  vi.resetModules();
  const { default: App } = await import('../src/App');
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
const openForm = async () => {
  await renderAt(`/manage/applicants/${ID}/edit`);
  return screen.findByRole('heading', { name: 'Edit form – Kavya Jadhav' });
};

beforeEach(() => {
  localStorage.setItem('edp.manage.token', 'manage-token');
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Edit form (tracking panel)', () => {
  it("opens from the student's page, prefilled with the student's own fields under their current names", async () => {
    mockApi();
    await renderAt(`/manage/applicants/${ID}`);
    await userEvent.click(await screen.findByRole('link', { name: 'Edit form' }));
    await screen.findByRole('heading', { name: 'Edit form – Kavya Jadhav' });
    expect(screen.getByLabelText(/^Father Name/)).toHaveValue('Suresh Jadav');
    expect(screen.getByLabelText(/^College Name/)).toHaveValue('Sample College');
    expect(screen.getByLabelText(/^Hobby/)).toHaveValue('Reading');
    expect(screen.getByText('Additional details')).toBeInTheDocument();
    /* A value no longer offered stays chosen. */
    const religion = screen.getByLabelText(/^Religion/) as HTMLSelectElement;
    expect(religion).toHaveValue('OLD');
    expect([...religion.options].map((o) => o.text)).toEqual(['Select Religion', 'Hindu', 'Buddhist', 'Earlier religion (no longer offered)']);
    /* The sign-in cannot be changed; the Aadhaar number only by a new one. */
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('readonly');
    expect(screen.getByLabelText(/^Email/)).toHaveAccessibleDescription('The student signs in with this email ID; it cannot be changed.');
    const aadhaar = screen.getByLabelText(/^Aadhaar Number/);
    expect(aadhaar).toHaveValue('');
    expect(aadhaar).toHaveAttribute('placeholder', 'XXXX-XXXX-2463');
    expect(aadhaar).toHaveAccessibleDescription(/Leave it empty to keep the number on record/);
    /* The panel is in English, whatever language the sign-in page was left in. */
    expect(screen.queryByText(/\(mr\)/)).not.toBeInTheDocument();
  });

  it('sends only the changed fields, and shows the student with a confirmation', async () => {
    const calls = mockApi();
    await openForm();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByText('Nothing to save: nothing was changed.')).toBeInTheDocument();

    const father = screen.getByLabelText(/^Father Name/);
    await userEvent.clear(father);
    await userEvent.type(father, 'Suresh Jadhav');
    await userEvent.type(screen.getByLabelText(/^Hobby/), ' and cricket');
    await userEvent.type(screen.getByLabelText(/^Landmark/), 'Temple');
    await userEvent.clear(screen.getByLabelText(/^Landmark/));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes (2)' }));
    expect(await screen.findByText('Changes saved.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Kavya', level: 2 })).toBeInTheDocument();
    expect(puts(calls)).toEqual([{ data: { father_name: 'Suresh Jadhav', x_hobby: 'Reading and cricket' } }]);
  });

  it("applies the form's own rules: checks, the technology of the new district, the disability details", async () => {
    const calls = mockApi();
    await openForm();
    await userEvent.clear(screen.getByLabelText(/^First Name/));
    await userEvent.type(screen.getByLabelText(/^Aadhaar Number/), '123412341234');
    await userEvent.selectOptions(screen.getByLabelText(/^District/), 'satara');
    expect(screen.getByLabelText(/^Technology/)).toHaveValue('');
    expect(screen.getByText(/not offered in this district/)).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('group', { name: /Person with Disability/ })).getByRole('radio', { name: 'Yes' }));
    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    expect(screen.getByText('First Name is required')).toBeInTheDocument();
    expect(screen.getByText('Aadhaar number must be 12 digits with a valid checksum')).toBeInTheDocument();
    expect(screen.getByText('Technology is required')).toBeInTheDocument();
    expect(screen.getByText('Type of Disability is required')).toBeInTheDocument();
    /* The religion was not changed: its old value is not checked again. */
    expect(screen.queryByText(/valid Religion/)).not.toBeInTheDocument();
    expect(puts(calls)).toEqual([]);

    await userEvent.type(screen.getByLabelText(/^First Name/), 'Kavita');
    await userEvent.clear(screen.getByLabelText(/^Aadhaar Number/));
    await userEvent.selectOptions(screen.getByLabelText(/^Technology/), 'T03');
    await userEvent.type(screen.getByLabelText(/^Type of Disability/), 'Visual');
    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await screen.findByText('Changes saved.');
    expect(puts(calls)).toEqual([
      { data: { first_name: 'Kavita', district_id: 'satara', disability_status: 'Yes', disability_type: 'Visual', technology: 'T03' } },
    ]);
  });

  it('a locked field is disabled and says why', async () => {
    mockApi({ detail: detail({ locked_fields: ['district_id', 'father_name'] }) });
    await openForm();
    expect(screen.getByLabelText(/^District/)).toBeDisabled();
    expect(screen.getByLabelText(/^District/)).toHaveAccessibleDescription('The student is in a batch: the district cannot be changed.');
    expect(screen.getByLabelText(/^Father Name/)).toBeDisabled();
    expect(screen.getByLabelText(/^Father Name/)).toHaveAccessibleDescription('This field cannot be changed.');
  });

  it("shows the API's errors at their fields, and a refusal on top", async () => {
    let answer = json(422, {
      message: 'Validation failed',
      error: { code: 'VALIDATION_ERROR', details: [{ field: 'body.father_name', message: 'Father Name may contain only letters' }] },
    });
    mockApi({ put: () => answer });
    await openForm();
    await userEvent.type(screen.getByLabelText(/^Father Name/), 'a');
    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    expect(await screen.findByText('Father Name may contain only letters')).toBeInTheDocument();
    expect(screen.getByText('Please correct the highlighted fields: Father Name.')).toBeInTheDocument();

    answer = json(409, { message: 'The form is finally approved' });
    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    expect(await screen.findByText('The form is finally approved')).toBeInTheDocument();
  });

  it('replaces and adds documents, which have to be verified again', async () => {
    const calls = mockApi();
    await openForm();
    const docs = screen.getByRole('region', { name: 'Documents' });
    expect(document.getElementById('doc-PHOTO')).toHaveTextContent('photo.pdf');
    expect(within(docs).queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
    await userEvent.upload(screen.getByLabelText('Upload Passport Photo'), new File(['%PDF'], 'new-photo.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText('Passport Photo saved. It has to be verified again.')).toBeInTheDocument();
    await waitFor(() => expect(document.getElementById('doc-PHOTO')).toHaveTextContent('new-photo.pdf'));
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.url).toMatch(new RegExp(`/manage/applicants/${ID}/documents$`));
    expect([...(post.raw as FormData).keys()]).toEqual(['PHOTO']);

    /* Checked by kind before anything is sent. */
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(screen.getByLabelText('Upload Introduction video'), new File(['%PDF'], 'video.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText('Only MP4 files are accepted')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('is not offered when the form cannot be changed, nor to a view-only account', async () => {
    mockApi({ detail: detail({ can_edit: false }) });
    const a = await renderAt(`/manage/applicants/${ID}/edit`);
    expect(await screen.findByText(/This form cannot be changed/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save changes/ })).not.toBeInTheDocument();
    a.unmount();
    vi.restoreAllMocks();

    mockApi({ role: 'VIEWER' });
    await renderAt(`/manage/applicants/${ID}/edit`);
    expect(await screen.findByRole('heading', { name: 'Student tracking' })).toBeInTheDocument();
  });
});
