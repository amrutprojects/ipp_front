import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { Applicant, ApplicantDetail, Approval, ApprovalEvent, Batch, BatchDetail, BatchMember, ManageRole } from '../src/types';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const PUNE = 'd1111111-1111-4111-8111-111111111111';
const SATARA = 'd2222222-2222-4222-8222-222222222222';

const approval = (over: Partial<Approval> = {}): Approval => ({
  stage: 'BATCH',
  stage_label: 'Approved: waiting for a batch',
  stage_updated_at: null,
  approved_at: null,
  approved_by: null,
  last_event: null,
  register_id: null,
  batch: null,
  ...over,
});
/* A student who waits for a batch. */
const student = (id: string, name: string, over: Partial<Applicant> = {}): Applicant => ({
  id,
  name,
  email: `${id}@example.com`,
  mobile_number: '9000000000',
  stage: 'SUBMITTED',
  stage_label: 'Form submitted',
  account_created_at: '2026-10-24T11:30:00Z',
  otp_verified_at: '2026-10-24T11:55:00Z',
  last_login_at: null,
  basic_completed_at: '2026-10-24T11:57:00Z',
  main_completed_at: '2026-10-24T12:00:00Z',
  submitted_at: '2026-10-24T12:10:00Z',
  registration_id: `IPP-00000${id.slice(1)}`,
  registration_number: null,
  district_id: PUNE,
  district: 'Pune',
  category: 'Maratha',
  centre: 'Pune Centre',
  documents: { uploaded: 10, verified: 10 },
  documents_verified: true,
  final_verified: false,
  last_activity_at: '2026-10-24T12:10:00Z',
  follow_up: null,
  can_approve: false,
  can_batch: true,
  approval: approval(),
  ...over,
});
const satara = { district_id: SATARA, district: 'Satara' };
/* Two pages: Pune and Satara students on each. */
const PAGES: Applicant[][] = [
  [student('s1', 'Asha Kulkarni'), student('s2', 'Nikhil Deshpande'), student('s3', 'Meera Joshi', satara), student('s4', 'Omkar Shinde', { district_id: null, district: null })],
  [student('s5', 'Sneha Gaikwad'), student('s6', 'Pooja Kale'), student('s7', 'Rohan Pawar', satara)],
];

const BATCH: Batch = {
  id: 'b1',
  name: 'Pune Batch 1',
  technology: { id: 'tech1', code: 'T01', name: 'Data Analytics' },
  centre: { id: 'c1', name: 'Pune Centre', code: 'PUN' },
  district: { id: PUNE, name: 'Pune' },
  students: 30,
  size: 30,
  stages: { AUDITOR: 1, DIVISION: 2, COEP: 27, HEAD_OFFICE: 0, ADMIN: 0, APPROVED: 0 },
  rejected: 2,
  created_at: '2026-11-25T10:00:00Z',
  created_by: 'Program Auditor',
  updated_at: '2026-11-25T10:00:00Z',
  updated_by: 'Program Auditor',
};
const move = (over: Partial<ApprovalEvent>): ApprovalEvent => ({
  action: 'APPROVE',
  from: { stage: 'DIVISION', name: 'Divisional Officer' },
  to: { stage: 'COEP', name: 'COEP' },
  reason: null,
  by: 'Divisional Officer Pune',
  at: '2026-11-24T12:00:00Z',
  ...over,
});
const REJECTED = move({
  action: 'REJECT',
  from: { stage: 'COEP', name: 'COEP' },
  to: { stage: 'DIVISION', name: 'Divisional Officer' },
  reason: 'Photo is not clear',
  by: 'COEP Reviewer',
});
const member = (id: string, name: string, over: Partial<Approval>): BatchMember => ({
  id,
  name,
  email: `${id}@example.com`,
  mobile_number: '9000000000',
  registration_id: `IPP-00000${id.slice(1)}`,
  register_id: null,
  district: 'Pune',
  category: 'Maratha',
  centre: 'Pune Centre',
  documents_verified: true,
  final_verified: false,
  approval: approval({ batch: { id: 'b1', name: 'Pune Batch 1' }, ...over }),
});
const DETAIL: BatchDetail = {
  ...BATCH,
  members: [
    member('s1', 'Asha Kulkarni', { stage: 'COEP', stage_label: 'With COEP', last_event: move({}) }),
    member('s2', 'Nikhil Deshpande', { stage: 'DIVISION', stage_label: 'With Divisional Officer', last_event: REJECTED }),
    member('s3', 'Meera Joshi', {
      stage: null,
      stage_label: null,
      last_event: move({ action: 'REJECT', to: { stage: 'AUDITOR', name: 'Auditor' }, reason: 'Aadhaar copy is not readable' }),
    }),
  ],
};

interface Opts {
  role?: ManageRole;
  size?: () => Response;
  create?: (body: unknown) => Response;
  patch?: (body: unknown) => Response;
  batches?: Batch[];
  pages?: Applicant[][];
}
function mockApi(opts: Opts = {}) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const pages = opts.pages ?? PAGES;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    if (url.endsWith('/manage/me')) return json(200, { data: { id: 'm1', name: 'Program Auditor', email: 'a@example.com', role: opts.role ?? 'ADMIN' } });
    if (url.endsWith('/manage/summary'))
      return json(200, {
        data: {
          total: 7,
          counts: {},
          stages: [],
          follow_ups: { NONE: 7, PENDING: 0, CALLED: 0, SECOND_CALL: 0, FORM_FILLED: 0 },
          approvals: { AWAITING: 0, RETURNED: 0, BATCH: 7 },
        },
      });
    if (url.endsWith('/manage/filters'))
      return json(200, {
        data: { districts: [], categories: [], centres: [], stages: [{ code: 'BATCH', label: 'Approved: waiting for a batch' }] },
      });
    if (url.endsWith('/manage/settings/batch')) return opts.size ? opts.size() : json(200, { data: { size: 3, updated_at: null, updated_by: null } });
    if (url.includes('/manage/centres?'))
      return json(200, {
        data: [
          { id: 'c1', name: 'Pune Centre', code: 'PUN', districtId: PUNE, districtName: 'Pune', isActive: true },
          { id: 'c2', name: 'Baramati Centre', code: 'BAR', districtId: PUNE, districtName: 'Pune', isActive: true },
        ],
        meta: { page: 1, limit: 100, total: 2, totalPages: 1 },
      });
    if (url.includes('/manage/masters/TECHNOLOGY?')) return json(200, { data: [{ id: 'tech1', code: 'T01', name_en: 'Data Analytics', is_active: true }], meta: { page: 1, totalPages: 1 } });
    if (url.includes('/manage/applicants?')) {
      const page = Number(new URL(url, 'http://x').searchParams.get('page'));
      return json(200, { data: pages[page - 1], meta: { page, limit: 25, total: 50, totalPages: pages.length } });
    }
    if (/\/manage\/applicants\/[^/?]+$/.test(url)) {
      const data: Partial<ApplicantDetail> = { history: [REJECTED, move({ at: '2026-11-23T12:00:00Z' })] };
      return json(200, { data });
    }
    if (url.endsWith('/manage/batches') && method === 'POST')
      return opts.create
        ? opts.create(body)
        : json(201, { data: { ...DETAIL, name: (body as { name: string }).name, students: (body as { ids: string[] }).ids.length } });
    if (url.includes('/manage/batches?')) {
      const items = opts.batches ?? [BATCH];
      return json(200, { data: items, meta: { page: 1, limit: 25, total: items.length, totalPages: 1, size: 30 } });
    }
    if (url.endsWith('/manage/batches/b1') && method === 'PATCH')
      return opts.patch ? opts.patch(body) : json(200, { data: { ...DETAIL, ...(body as object) } });
    if (url.endsWith('/manage/batches/b1')) return json(200, { data: DETAIL });
    return json(404, { message: 'Batch not found' });
  });
  return calls;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) });
const box = (name: string) => screen.getByRole('checkbox', { name: `Select ${name} for a batch` });
const createButton = (n: number, size = 3) => screen.getByRole('button', { name: `Create batch (${n} of ${size})` });

beforeEach(() => {
  localStorage.setItem('edp.manage.token', 'manage-token');
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Create batch (tracking panel)', () => {
  it('needs exactly the batch size of students, all of one district', async () => {
    mockApi();
    renderAt('/manage');
    expect(await screen.findByRole('button', { name: 'Create batch (0 of 3)' })).toBeDisabled();
    expect(screen.queryByRole('group', { name: 'Selected for a batch' })).not.toBeInTheDocument();
    expect(within(row('Asha Kulkarni')).getByText('Approved: waiting for a batch')).toHaveClass('do-BATCH');
    /* A form without a district cannot go into a batch. */
    expect(box('Omkar Shinde')).toBeDisabled();

    await userEvent.click(box('Asha Kulkarni'));
    expect(createButton(1)).toBeDisabled();
    const bar = screen.getByRole('group', { name: 'Selected for a batch' });
    expect(bar).toHaveTextContent('1 of 3 selected – select 2 more.');
    expect(bar).toHaveTextContent('A batch has one district: Pune');
    /* Another district's students are disabled, and say why. */
    expect(box('Meera Joshi')).toBeDisabled();
    expect(box('Meera Joshi')).toHaveAttribute('title', 'A batch has one district: Pune');
    expect(within(row('Meera Joshi')).getByText('A batch has one district: Pune')).toBeInTheDocument();
    expect(box('Nikhil Deshpande')).toBeEnabled();

    /* Without a selection every district can be chosen again. */
    await userEvent.click(box('Asha Kulkarni'));
    expect(box('Meera Joshi')).toBeEnabled();
    await userEvent.click(box('Meera Joshi'));
    expect(box('Asha Kulkarni')).toBeDisabled();
    expect(within(row('Asha Kulkarni')).getByText('A batch has one district: Satara')).toBeInTheDocument();
  });

  it('takes students without a district while the form does not require one; alone they are of the centre\'s district', async () => {
    const calls = mockApi({
      size: () => json(200, { data: { size: 1, updated_at: null, updated_by: null, district_required: false } }),
      create: (body) => json(201, { data: { ...DETAIL, name: (body as { name: string }).name, students: 1, district: { id: PUNE, name: 'Pune' } } }),
    });
    renderAt('/manage');
    await screen.findByText('Omkar Shinde');
    await waitFor(() => expect(box('Omkar Shinde')).toBeEnabled());
    await userEvent.click(box('Omkar Shinde'));
    expect(screen.getByRole('group', { name: 'Selected for a batch' })).toHaveTextContent('A batch has one district: the one of its centre');
    await userEvent.click(createButton(1, 1));
    const dialog = screen.getByRole('dialog', { name: 'Create a batch of 1 student' });
    expect(dialog).toHaveTextContent('the batch is sent to the Divisional Officer of the district of its centre. Its students cannot be changed after that.');
    await userEvent.type(within(dialog).getByLabelText(/Batch name/), 'Open batch');
    await waitFor(() => expect(within(dialog).getByRole('option', { name: /Baramati Centre/ })).toBeInTheDocument());
    await userEvent.selectOptions(within(dialog).getByLabelText(/Centre/), 'c2');
    expect(dialog).toHaveTextContent('the Divisional Officer of Pune.');
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Data Analytics (T01)' })).toBeInTheDocument());
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Technology/), 'tech1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create batch' }));
    expect(await screen.findByText('Batch "Open batch" created with 1 student and sent to the Divisional Officer of Pune.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({ body: { name: 'Open batch', centre_id: 'c2', ids: ['s4'] } });
  });

  it('students without a district go with those of one, never with two districts', async () => {
    mockApi({ size: () => json(200, { data: { size: 3, updated_at: null, updated_by: null, district_required: false } }) });
    renderAt('/manage');
    await screen.findByText('Omkar Shinde');
    await waitFor(() => expect(box('Omkar Shinde')).toBeEnabled());
    await userEvent.click(box('Omkar Shinde'));
    expect(box('Meera Joshi')).toBeEnabled();
    await userEvent.click(box('Asha Kulkarni'));
    expect(screen.getByRole('group', { name: 'Selected for a batch' })).toHaveTextContent('A batch has one district: Pune');
    expect(box('Meera Joshi')).toHaveAttribute('title', 'A batch has one district: Pune');
    expect(box('Nikhil Deshpande')).toBeEnabled();
  });

  it('a district with a size of its own: as many students as that', async () => {
    const own = (districts: object[], over: object = {}) => ({
      size: () => json(200, { data: { size: 3, districts, updated_at: null, updated_by: null, ...over } }),
    });
    mockApi(own([{ district_id: SATARA, name: 'Satara', size: 1 }]));
    renderAt('/manage');
    expect(await screen.findByRole('button', { name: 'Create batch (0 of 3)' })).toBeDisabled();
    await waitFor(() => expect(box('Meera Joshi')).toBeEnabled());
    await userEvent.click(box('Meera Joshi'));
    expect(createButton(1, 1)).toBeEnabled();
    const bar = screen.getByRole('group', { name: 'Selected for a batch' });
    expect(bar).toHaveTextContent('1 of 1 selected – ready: choose Create batch.');
    expect(bar).toHaveTextContent('A batch has one district: Satara (its own batch size: 1)');
    await userEvent.click(box('Meera Joshi'));
    await userEvent.click(box('Asha Kulkarni'));
    expect(createButton(1, 3)).toBeDisabled();
    expect(screen.getByRole('group', { name: 'Selected for a batch' })).not.toHaveTextContent('its own batch size');
  });

  it('students without a district: the size of the district of the chosen centre', async () => {
    mockApi({
      size: () =>
        json(200, {
          data: { size: 1, districts: [{ district_id: PUNE, name: 'Pune', size: 2 }], district_required: false, updated_at: null, updated_by: null },
        }),
    });
    renderAt('/manage');
    await screen.findByText('Omkar Shinde');
    await waitFor(() => expect(box('Omkar Shinde')).toBeEnabled());
    await userEvent.click(box('Omkar Shinde'));
    await userEvent.click(createButton(1, 1));
    const dialog = screen.getByRole('dialog', { name: 'Create a batch of 1 student' });
    expect(within(dialog).getByRole('button', { name: 'Create batch' })).toBeEnabled();
    await waitFor(() => expect(within(dialog).getByRole('option', { name: /Baramati Centre/ })).toBeInTheDocument());
    await userEvent.selectOptions(within(dialog).getByLabelText(/Centre/), 'c2');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('A batch of Pune has exactly 2 students (Settings → Batch size); 1 selected.');
    expect(within(dialog).getByRole('button', { name: 'Create batch' })).toBeDisabled();
  });

  it('keeps the selection while paging and filtering, stops at the batch size, and can be cleared', async () => {
    const calls = mockApi();
    renderAt('/manage');
    await screen.findByText('Asha Kulkarni');
    await waitFor(() => expect(box('Asha Kulkarni')).toBeEnabled());
    await userEvent.click(box('Asha Kulkarni'));
    await userEvent.click(box('Nikhil Deshpande'));
    await userEvent.click(screen.getByRole('button', { name: 'Next →' }));
    await screen.findByText('Sneha Gaikwad');
    expect(createButton(2)).toBeDisabled();
    expect(box('Rohan Pawar')).toBeDisabled();
    await userEvent.click(box('Sneha Gaikwad'));
    expect(createButton(3)).toBeEnabled();
    expect(screen.getByRole('group', { name: 'Selected for a batch' })).toHaveTextContent('3 of 3 selected – ready: choose Create batch.');
    /* Full: another one of the district cannot be added, a ticked one can be taken out. */
    expect(box('Pooja Kale')).toBeDisabled();
    expect(box('Pooja Kale')).toHaveAttribute('title', '3 of 3 are selected');
    expect(box('Sneha Gaikwad')).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Waiting for a batch (7)' }));
    await waitFor(() => expect(calls.some((c) => c.url.includes('application_stage=BATCH'))).toBe(true));
    await waitFor(() => expect(box('Asha Kulkarni')).toBeChecked());
    expect(box('Nikhil Deshpande')).toBeChecked();
    expect(createButton(3)).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(createButton(0)).toBeDisabled();
    expect(box('Asha Kulkarni')).not.toBeChecked();
    expect(screen.queryByRole('group', { name: 'Selected for a batch' })).not.toBeInTheDocument();
  });

  it('the heading checkbox selects the page for a batch: one district, up to the batch size', async () => {
    mockApi();
    renderAt('/manage');
    await screen.findByText('Asha Kulkarni');
    const all = screen.getByRole('checkbox', { name: 'Select the students on this page for a batch (one district)' });
    await waitFor(() => expect(all).toBeEnabled());
    await userEvent.click(all);
    expect(createButton(2)).toBeInTheDocument();
    expect(box('Asha Kulkarni')).toBeChecked();
    expect(box('Meera Joshi')).not.toBeChecked();
    expect(all).toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: 'Next →' }));
    await screen.findByText('Sneha Gaikwad');
    await userEvent.click(all);
    expect(createButton(3)).toBeEnabled();
    expect(box('Sneha Gaikwad')).toBeChecked();
    expect(box('Pooja Kale')).not.toBeChecked();
    /* Again: takes out this page's students only. */
    await userEvent.click(all);
    expect(createButton(2)).toBeDisabled();
  });

  it('creates the batch with a name and a centre; it is sent to the Divisional Officer of the district', async () => {
    const calls = mockApi();
    renderAt('/manage');
    await screen.findByText('Asha Kulkarni');
    await waitFor(() => expect(box('Asha Kulkarni')).toBeEnabled());
    await userEvent.click(box('Asha Kulkarni'));
    await userEvent.click(box('Nikhil Deshpande'));
    await userEvent.click(screen.getByRole('button', { name: 'Next →' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Pooja Kale for a batch' }));
    await userEvent.click(createButton(3));
    const dialog = screen.getByRole('dialog', { name: 'Create a batch of 3 students' });
    expect(dialog).toHaveTextContent('the batch is sent to the Divisional Officer of Pune. Its students cannot be changed after that.');
    /* Also the students of the other page. */
    expect(within(dialog).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Asha Kulkarni · IPP-000001',
      'Nikhil Deshpande · IPP-000002',
      'Pooja Kale · IPP-000006',
    ]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create batch' }));
    expect(within(dialog).getByText('Enter a batch name (at least 2 characters)')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose a centre', { selector: '.err' })).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    await userEvent.type(within(dialog).getByLabelText(/Batch name/), ' Pune Batch 1 ');
    await waitFor(() => expect(within(dialog).getByRole('option', { name: /Baramati Centre/ })).toBeInTheDocument());
    await userEvent.selectOptions(within(dialog).getByLabelText(/Centre/), 'c2');
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Data Analytics (T01)' })).toBeInTheDocument());
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Technology/), 'tech1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create batch' }));
    expect(await screen.findByText('Batch "Pune Batch 1" created with 3 students and sent to the Divisional Officer of Pune.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({
      url: expect.stringMatching(/\/manage\/batches$/),
      body: { name: 'Pune Batch 1', centre_id: 'c2', ids: ['s1', 's2', 's6'], technology: 'tech1' },
    });
    expect(createButton(0)).toBeDisabled();
  });

  it('shows why the API refused the batch, and keeps the selection', async () => {
    let answer = json(422, {
      message: 'Validation failed',
      error: { code: 'VALIDATION_ERROR', details: [{ field: 'body.ids', message: 'A batch must have exactly 4 students; this one would have 3.' }] },
    });
    mockApi({ create: () => answer });
    renderAt('/manage');
    await screen.findByText('Asha Kulkarni');
    await waitFor(() => expect(box('Asha Kulkarni')).toBeEnabled());
    await userEvent.click(box('Asha Kulkarni'));
    await userEvent.click(box('Nikhil Deshpande'));
    await userEvent.click(screen.getByRole('button', { name: 'Next →' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Pooja Kale for a batch' }));
    await userEvent.click(createButton(3));
    const dialog = screen.getByRole('dialog', { name: 'Create a batch of 3 students' });
    await userEvent.type(within(dialog).getByLabelText(/Batch name/), 'Pune Batch 1');
    await waitFor(() => expect(within(dialog).getByRole('option', { name: /Pune Centre/ })).toBeInTheDocument());
    await userEvent.selectOptions(within(dialog).getByLabelText(/Centre/), 'c1');
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Data Analytics (T01)' })).toBeInTheDocument());
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Technology/), 'tech1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create batch' }));
    expect(await within(dialog).findByText('A batch must have exactly 4 students; this one would have 3.')).toBeInTheDocument();

    answer = json(409, { message: '1 of the selected students is not waiting for a batch.' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create batch' }));
    expect(await within(dialog).findByText('1 of the selected students is not waiting for a batch.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(createButton(3)).toBeEnabled();
  });

  it('drops a selected student seen to be no longer waiting for a batch', async () => {
    const pages: Applicant[][] = [[student('s1', 'Asha Kulkarni'), student('s2', 'Nikhil Deshpande')]];
    mockApi({ pages });
    renderAt('/manage');
    await screen.findByText('Asha Kulkarni');
    await waitFor(() => expect(box('Asha Kulkarni')).toBeEnabled());
    await userEvent.click(box('Asha Kulkarni'));
    await userEvent.click(box('Nikhil Deshpande'));
    expect(createButton(2)).toBeInTheDocument();
    pages[0] = [
      student('s1', 'Asha Kulkarni', {
        can_batch: false,
        approval: approval({ stage: 'DIVISION', stage_label: 'With Divisional Officer', batch: { id: 'b1', name: 'Pune Batch 1' } }),
      }),
      student('s2', 'Nikhil Deshpande'),
    ];
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(createButton(1)).toBeInTheDocument());
    expect(within(row('Asha Kulkarni')).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(box('Nikhil Deshpande')).toBeChecked();
  });

  it('creates nothing while the batch size is not known; Refresh loads it', async () => {
    let answer = json(500, { message: 'Server error' });
    mockApi({ size: () => answer });
    renderAt('/manage');
    expect(await screen.findByText(/Could not load the batch size/)).toBeInTheDocument();
    await screen.findByText('Asha Kulkarni');
    expect(box('Asha Kulkarni')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create batch (0)' })).toBeDisabled();
    answer = json(200, { data: { size: 3, updated_at: null, updated_by: null } });
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(box('Asha Kulkarni')).toBeEnabled());
    expect(screen.queryByText(/Could not load the batch size/)).not.toBeInTheDocument();
  });

  it('a view-only account gets no batch button, checkboxes or batch size request', async () => {
    const calls = mockApi({ role: 'VIEWER' });
    renderAt('/manage');
    await screen.findByText('Asha Kulkarni');
    expect(screen.queryByRole('button', { name: /batch/i })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(calls.some((c) => c.url.includes('/settings/batch'))).toBe(false);
  });
});

describe('Batches (tracking panel)', () => {
  it('lists the batches with district, centre, where each is now and how many were rejected', async () => {
    const done: Batch = {
      ...BATCH,
      id: 'b2',
      name: 'Satara Batch 1',
      district: null,
      centre: { id: 'c9', name: null, code: null },
      stages: { AUDITOR: 0, DIVISION: 0, COEP: 0, HEAD_OFFICE: 0, ADMIN: 4, APPROVED: 26 },
      rejected: 0,
    };
    const calls = mockApi({ batches: [BATCH, done] });
    renderAt('/manage/batches');
    const pune = await screen.findByRole('row', { name: /Pune Batch 1/ });
    expect(screen.getByRole('link', { name: 'Batches' })).toHaveAttribute('href', '/manage/batches');
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      '#',
      'Batch',
      'District',
      'Centre',
      'Students',
      'Where it is now',
      'Batch status',
      'Rejected',
      'Dates',
      'Delivery',
      'Created',
      'Actions',
    ]);
    expect(within(pune).getAllByRole('cell').slice(1, 8).map((c) => c.textContent)).toEqual([
      'Pune Batch 1',
      'Pune',
      'Pune CentrePUN',
      '30',
      'Divisional Officer 2 · COEP 27 · Sent back 1',
      /* Batch status: absent from this (older) answer. */
      '—',
      '2',
    ]);
    expect(within(pune).getByRole('link', { name: 'View Pune Batch 1' })).toHaveAttribute('href', '/manage/batches/b1');
    const other = screen.getByRole('row', { name: /Satara Batch 1/ });
    expect(other).toHaveTextContent('Admin 4 · Final approved 26');
    expect(screen.getByText(/A batch has exactly 30 students of one district/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Applicants (waiting for a batch)' })).toHaveAttribute('href', '/manage?application_stage=BATCH');

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search batches' }), 'pune');
    await waitFor(() => expect(calls.some((c) => c.url.includes('search=pune'))).toBe(true));
  });

  it('opens the list on the students waiting for a batch', async () => {
    const calls = mockApi();
    renderAt('/manage/batches');
    await userEvent.click(await screen.findByRole('link', { name: 'Applicants (waiting for a batch)' }));
    expect(await screen.findByRole('heading', { name: 'Student tracking' })).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.url.includes('/manage/applicants?') && c.url.includes('application_stage=BATCH'))).toBe(true));
  });

  it('shows each student of a batch with the stage, a rejection and the whole history; nobody can be added or removed', async () => {
    const calls = mockApi();
    renderAt('/manage/batches/b1');
    expect(await screen.findByRole('heading', { name: 'Pune Batch 1' })).toBeInTheDocument();
    expect(screen.getByText('Divisional Officer 2 · COEP 27 · Sent back 1')).toBeInTheDocument();
    expect(screen.getByText('2 rejected')).toBeInTheDocument();
    expect(within(row('Asha Kulkarni')).getByText('With COEP')).toBeInTheDocument();
    expect(row('Nikhil Deshpande')).toHaveTextContent('With Divisional Officer');
    expect(row('Nikhil Deshpande')).toHaveTextContent('Rejected by COEP: Photo is not clear');
    expect(row('Meera Joshi')).toHaveTextContent('Sent back to Auditor');
    expect(row('Meera Joshi')).toHaveTextContent('Rejected by Divisional Officer: Aadhaar copy is not readable');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Add|Remove/ })).not.toBeInTheDocument();
    expect(within(row('Nikhil Deshpande')).getByRole('link', { name: 'View Nikhil Deshpande' })).toHaveAttribute('href', '/manage/applicants/s2');

    const history = within(row('Nikhil Deshpande')).getByRole('button', { name: 'History of Nikhil Deshpande' });
    expect(history).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(history);
    const moves = await screen.findAllByRole('listitem');
    expect(moves).toHaveLength(2);
    expect(moves[0]).toHaveTextContent(/Rejected by COEP.*sent back to Divisional Officer.*COEP Reviewer.*Rejection reason: Photo is not clear/);
    expect(moves[1]).toHaveTextContent(/Approved by Divisional Officer.*sent to COEP/);
    expect(calls.some((c) => c.url.endsWith('/manage/applicants/s2'))).toBe(true);
    await userEvent.click(history);
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('an admin changes the name and the centre; only what changed is sent', async () => {
    const calls = mockApi();
    renderAt('/manage/batches/b1');
    const name = await screen.findByLabelText(/Batch name/);
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(screen.getByText('Nothing to save: the name and centre are unchanged.')).toBeInTheDocument();
    await userEvent.clear(name);
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(screen.getByText('Enter a batch name (at least 2 characters)')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
    await userEvent.type(name, 'Pune Batch One');
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(await screen.findByText('Batch details saved.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ name: 'Pune Batch One' });
    expect(screen.getByRole('heading', { name: 'Pune Batch One' })).toBeInTheDocument();
  });

  it('shows why a change was refused', async () => {
    mockApi({ patch: () => json(409, { message: 'A batch with this name already exists. Choose another name.' }) });
    renderAt('/manage/batches/b1');
    const name = await screen.findByLabelText(/Batch name/);
    await userEvent.type(name, ' B');
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(await screen.findByText('A batch with this name already exists. Choose another name.')).toBeInTheDocument();
  });

  it('a view-only account sees the batch and the histories without the form to change it', async () => {
    mockApi({ role: 'VIEWER' });
    renderAt('/manage/batches/b1');
    expect(await screen.findByRole('heading', { name: 'Pune Batch 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save details' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'History of Asha Kulkarni' })).toBeInTheDocument();
  });

  it('says so when the batch does not exist', async () => {
    mockApi();
    renderAt('/manage/batches/unknown');
    expect(await screen.findByText('Batch not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Batches' })).toHaveAttribute('href', '/manage/batches');
  });
});
