import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import { addPicks, choseOther, toPick } from '../src/pages/manage/batchPicks';
import { batchDates, NO_PLAN, planBody, planChanges, planIssues, plusMonths } from '../src/pages/manage/batchPlan';
import type { Applicant, Batch, BatchDetail, BatchMember, ManageRole, MasterOption } from '../src/types';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const PUNE = 'd1111111-1111-4111-8111-111111111111';

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
  approval: null,
  ...over,
});
const STUDENTS = [student('s1', 'Asha Kulkarni'), student('s2', 'Nikhil Deshpande', { centre: ' baramati centre ' }), student('s3', 'Sneha Gaikwad')];

const technology = (code: string, name_en: string, over: Partial<MasterOption> = {}): MasterOption => ({
  id: code,
  value: code,
  code,
  name_en,
  name_mr: null,
  order: 10,
  is_active: true,
  is_system: false,
  in_use: false,
  ...over,
});
const TECHNOLOGIES = [technology('T01', 'Data Analytics'), technology('T03', 'Web Design'), technology('T09', 'Old Track', { is_active: false })];
interface CentreRow {
  id: string;
  name: string;
  code: string;
  districtName: string;
  isActive: boolean;
}
const CENTRES: CentreRow[] = [
  { id: 'c1', name: 'Pune Centre', code: 'PUN', districtName: 'Pune', isActive: true },
  { id: 'c2', name: 'Baramati Centre', code: 'BAR', districtName: 'Pune', isActive: true },
];

/* As an older API answers: without code, dates, delivery mode, technology. */
const OLD: Batch = {
  id: 'b1',
  name: 'Pune Batch 1',
  centre: { id: 'c1', name: 'Pune Centre', code: 'PUN' },
  district: { id: PUNE, name: 'Pune' },
  students: 30,
  size: 30,
  stages: { AUDITOR: 0, DIVISION: 30, COEP: 0, HEAD_OFFICE: 0, ADMIN: 0, APPROVED: 0 },
  rejected: 0,
  created_at: '2026-11-25T10:00:00Z',
  created_by: 'Program Auditor',
  updated_at: '2026-11-25T10:00:00Z',
  updated_by: 'Program Auditor',
};
const BATCH: Batch = {
  ...OLD,
  code: 'IPP-B-0007',
  start_date: '2026-12-01',
  end_date: '2027-03-01',
  delivery_mode: 'BLENDED',
  technology: { id: 'T03', code: 'T03', name: 'Web Design' },
  other_centre: 2,
};
const OLD_MEMBER: BatchMember = {
  id: 's1',
  name: 'Asha Kulkarni',
  email: 's1@example.com',
  mobile_number: '9000000000',
  registration_id: 'IPP-000001',
  register_id: null,
  district: 'Pune',
  category: 'Maratha',
  centre: 'Pune Centre',
  documents_verified: true,
  final_verified: false,
  approval: null,
};
const DETAIL: BatchDetail = {
  ...BATCH,
  members: [
    { ...OLD_MEMBER, centre_id: 'c1', technology: 'Data Analytics' },
    { ...OLD_MEMBER, id: 's2', name: 'Nikhil Deshpande', centre_id: 'c1', technology: null },
  ],
};

interface Opts {
  role?: ManageRole;
  students?: Applicant[];
  centres?: CentreRow[];
  technologies?: (page: number) => Response;
  create?: (body: unknown) => Response;
  patch?: (body: unknown) => Response;
  batches?: Batch[];
  detail?: BatchDetail;
}
function mockApi(opts: Opts = {}) {
  const calls: { method: string; path: string; query: URLSearchParams; body?: unknown }[] = [];
  const students = opts.students ?? STUDENTS;
  const centres = opts.centres ?? CENTRES;
  const detail = opts.detail ?? DETAIL;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://x');
    const path = url.pathname.replace(/^.*\/edp/, '');
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const page = Number(url.searchParams.get('page') ?? 1);
    calls.push({ method, path, query: url.searchParams, body });
    if (path === '/manage/me') return json(200, { data: { id: 'm1', name: 'Program Auditor', email: 'a@example.com', role: opts.role ?? 'ADMIN' } });
    if (path === '/manage/summary')
      return json(200, { data: { total: 3, counts: {}, stages: [], follow_ups: { NONE: 3, PENDING: 0, CALLED: 0, SECOND_CALL: 0, FORM_FILLED: 0 }, approvals: { BATCH: 3 } } });
    if (path === '/manage/filters') return json(200, { data: { districts: [], categories: [], centres: [], stages: [] } });
    if (path === '/manage/settings/batch') return json(200, { data: { size: students.length, updated_at: null, updated_by: null } });
    if (path === '/manage/centres')
      return json(200, {
        data: centres.slice((page - 1) * 100, page * 100),
        meta: { page, limit: 100, total: centres.length, totalPages: Math.max(1, Math.ceil(centres.length / 100)) },
      });
    if (path === '/manage/masters/TECHNOLOGY')
      return opts.technologies?.(page) ?? json(200, { data: TECHNOLOGIES, meta: { page, limit: 100, total: TECHNOLOGIES.length, totalPages: 1 } });
    if (path === '/manage/applicants') return json(200, { data: students, meta: { page: 1, limit: 25, total: students.length, totalPages: 1 } });
    if (path === '/manage/batches' && method === 'POST')
      return opts.create ? opts.create(body) : json(201, { data: { ...detail, name: (body as { name: string }).name, students: students.length } });
    if (path === '/manage/batches') {
      const items = opts.batches ?? [BATCH];
      return json(200, { data: items, meta: { page: 1, limit: 25, total: items.length, totalPages: 1, size: 30 } });
    }
    if (path === '/manage/batches/b1' && method === 'PATCH') return opts.patch ? opts.patch(body) : json(200, { data: detail });
    if (path === '/manage/batches/b1') return json(200, { data: detail });
    return json(404, { message: 'not mocked' });
  });
  return calls;
}
type Calls = ReturnType<typeof mockApi>;
const sent = (calls: Calls, method: string) => calls.filter((c) => c.method === method).map((c) => c.body);

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
const optionsOf = (select: HTMLElement) => [...(select as HTMLSelectElement).options].map((o) => o.text);
const row = (name: RegExp) => screen.getByRole('row', { name });

/* Ticks every student of the list and opens the dialog. */
async function openDialog() {
  renderAt('/manage');
  await screen.findByText(STUDENTS[0]!.name);
  const all = screen.getByRole('checkbox', { name: 'Select the students on this page for a batch (one district)' });
  await waitFor(() => expect(all).toBeEnabled());
  await userEvent.click(all);
  await userEvent.click(screen.getByRole('button', { name: /^Create batch/ }));
  return screen.getByRole('dialog');
}
const setDate = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } });
/* Name and centre, as every batch needs them. */
async function nameAndCentre(dialog: HTMLElement, centre = 'c1') {
  await userEvent.type(within(dialog).getByLabelText(/Batch name/), 'Pune Batch 1');
  await waitFor(() => expect(within(dialog).getByRole('option', { name: /Pune Centre \(PUN\)/ })).toBeInTheDocument());
  await userEvent.selectOptions(within(dialog).getByLabelText(/Centre/), centre);
}

beforeEach(() => {
  localStorage.setItem('edp.manage.token', 'manage-token');
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Batch dates, delivery mode and technology (rules)', () => {
  it('three months later is the same day, or the last day of the month', () => {
    expect(plusMonths('2026-12-01', 3)).toBe('2027-03-01');
    expect(plusMonths('2026-11-30', 3)).toBe('2027-02-28');
    expect(plusMonths('2027-11-30', 3)).toBe('2028-02-29');
    expect(plusMonths('2026-01-31', 3)).toBe('2026-04-30');
    expect(plusMonths('2026-10-31', 3)).toBe('2027-01-31');
  });

  it('checks the dates only when they are given', () => {
    const plan = (start_date: string, end_date: string) => planIssues({ ...NO_PLAN, start_date, end_date });
    expect(plan('', '')).toEqual({});
    expect(plan('2026-12-01', '')).toEqual({});
    expect(plan('', '2027-03-01')).toEqual({});
    expect(plan('2026-12-01', '2026-12-02')).toEqual({});
    expect(plan('0026-12-01', '')).toEqual({ start_date: 'Enter a valid start date' });
    expect(plan('2026-02-30', '2026-03-01')).toEqual({ start_date: 'Enter a valid start date' });
    expect(plan('2026-12-01', '2026-12-01')).toEqual({ end_date: 'End date must be after the start date' });
    expect(plan('2026-12-01', '0027-03-01')).toEqual({ end_date: 'End date must be after the start date' });
    expect(plan('', '0027-03-01')).toEqual({ end_date: 'Enter a valid end date' });
    expect(plan('2026-12-01', '20270-03-01')).toEqual({ end_date: 'Enter a valid end date' });
    /* A date box only half filled in reads as empty. */
    expect(planIssues(NO_PLAN, { start_date: true, end_date: true })).toEqual({
      start_date: 'Enter a valid start date',
      end_date: 'Enter a valid end date',
    });
  });

  it('sends what is given for a new batch, and what changed of a saved one', () => {
    expect(JSON.parse(JSON.stringify(planBody(NO_PLAN)))).toEqual({});
    const plan = { start_date: '2026-12-01', end_date: '2027-03-01', delivery_mode: 'ONLINE', technology: 'T01' } as const;
    expect(planBody(plan)).toEqual(plan);
    expect(planChanges(plan, plan)).toEqual({});
    expect(planChanges(NO_PLAN, plan)).toEqual({ start_date: null, end_date: null, technology: null, delivery_mode: 'OFFLINE' });
  });

  it('reads the dates of a batch', () => {
    expect(batchDates(BATCH)).toBe('01/12/2026 – 01/03/2027');
    expect(batchDates({ ...BATCH, end_date: null })).toBe('From 01/12/2026');
    expect(batchDates({ ...BATCH, start_date: null })).toBe('Until 01/03/2027');
    expect(batchDates(OLD)).toBe('—');
  });

  it('counts the students who chose another center: by its id, else by its name', () => {
    const centre = { id: 'c1', name: 'Pune Centre' };
    const picks = addPicks(STUDENTS, [], { size: 3, sizes: {}, districtRequired: true });
    expect(choseOther(picks, centre)).toBe(1);
    expect(choseOther(picks, { id: 'c2', name: 'Baramati Centre' })).toBe(2);
    /* The same name in another district is another center; a student without a center chose none. */
    expect(choseOther([toPick(student('s1', 'A', { centre_id: 'c9' })), toPick(student('s2', 'B', { centre_id: 'c1', centre: 'Renamed' }))], centre)).toBe(1);
    expect(choseOther([toPick(student('s1', 'A', { centre: null }))], centre)).toBe(0);
  });
});

describe('Create batch: dates, delivery mode and technology', () => {
  it('offers the active technologies and the delivery modes; only what is given is sent', async () => {
    const calls = mockApi();
    const dialog = await openDialog();
    expect(within(dialog).getByLabelText('Start date')).toHaveValue('');
    expect(within(dialog).getByLabelText('End date')).toHaveValue('');
    const mode = within(dialog).getByLabelText(/^Delivery mode/);
    expect(mode).toHaveValue('OFFLINE');
    expect(optionsOf(mode)).toEqual(['Offline (classroom)', 'Online', 'Blended']);
    const tech = within(dialog).getByLabelText(/^Technology/);
    await waitFor(() => expect(optionsOf(tech)).toEqual(['Select technology', 'Data Analytics (T01)', 'Web Design (T03)']));
    expect(Object.fromEntries(calls.find((c) => c.path === '/manage/masters/TECHNOLOGY')!.query)).toEqual({ page: '1', limit: '100', status: 'ACTIVE' });

    await nameAndCentre(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create batch' }));
    expect(within(dialog).getByText('Please select a technology.')).toBeInTheDocument();
    expect(sent(calls, 'POST')).toEqual([]);
    await userEvent.selectOptions(tech, 'T01');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create batch' }));
    expect(await screen.findByText(/Batch "Pune Batch 1" created with 3 students/)).toBeInTheDocument();
    expect(sent(calls, 'POST')).toEqual([{ name: 'Pune Batch 1', centre_id: 'c1', ids: ['s1', 's2', 's3'], technology: 'T01' }]);
  });

  it('fills the end date with three months later, as long as it is not given by hand', async () => {
    const calls = mockApi();
    const dialog = await openDialog();
    const start = within(dialog).getByLabelText('Start date');
    const end = within(dialog).getByLabelText('End date');
    /* A year not typed to its end is no date yet. */
    setDate(start, '0002-12-01');
    expect(end).toHaveValue('');
    setDate(start, '2026-12-01');
    expect(end).toHaveValue('2027-03-01');
    setDate(start, '2026-12-15');
    expect(end).toHaveValue('2027-03-15');
    setDate(end, '2027-02-28');
    setDate(start, '2026-12-10');
    expect(end).toHaveValue('2027-02-28');
    /* Emptied: filled again. */
    setDate(end, '');
    setDate(start, '2026-11-30');
    expect(end).toHaveValue('2027-02-28');

    await nameAndCentre(dialog);
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Delivery mode/), 'BLENDED');
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Web Design (T03)' })).toBeInTheDocument());
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Technology/), 'T03');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create batch' }));
    await screen.findByText(/Batch "Pune Batch 1" created/);
    expect(sent(calls, 'POST')).toEqual([
      {
        name: 'Pune Batch 1',
        centre_id: 'c1',
        ids: ['s1', 's2', 's3'],
        start_date: '2026-11-30',
        end_date: '2027-02-28',
        delivery_mode: 'BLENDED',
        technology: 'T03',
      },
    ]);
  });

  it('checks the dates before anything is sent', async () => {
    const calls = mockApi();
    const dialog = await openDialog();
    await nameAndCentre(dialog);
    const start = within(dialog).getByLabelText('Start date');
    const end = within(dialog).getByLabelText('End date');
    const create = within(dialog).getByRole('button', { name: 'Create batch' });
    setDate(start, '0026-12-01');
    await userEvent.click(create);
    expect(within(dialog).getByText('Enter a valid start date')).toBeInTheDocument();
    expect(start).toHaveAccessibleDescription('Enter a valid start date');
    setDate(start, '2026-12-01');
    setDate(end, '2026-12-01');
    await userEvent.click(create);
    expect(within(dialog).queryByText('Enter a valid start date')).not.toBeInTheDocument();
    expect(within(dialog).getByText('End date must be after the start date')).toBeInTheDocument();
    expect(end).toHaveAttribute('aria-invalid', 'true');
    expect(sent(calls, 'POST')).toEqual([]);
    /* Dates may be left empty, but technology is required. */
    setDate(start, '');
    setDate(end, '');
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Technology/), 'T01');
    await userEvent.click(create);
    await screen.findByText(/Batch "Pune Batch 1" created/);
    expect(sent(calls, 'POST')).toHaveLength(1);
  });

  it('shows what the API refuses at each field', async () => {
    const details = [
      { field: 'body.name', message: 'A batch with this name already exists' },
      { field: 'body.start_date', message: 'Start date is not a real date' },
      { field: 'body.end_date', message: 'The batch is too short' },
      { field: 'body.delivery_mode', message: 'Choose a delivery mode' },
      { field: 'body.technology', message: 'Choose a technology of the Technology master' },
    ];
    let answer = json(422, { message: 'Validation failed', error: { code: 'VALIDATION_ERROR', details } });
    mockApi({ create: () => answer });
    const dialog = await openDialog();
    await nameAndCentre(dialog);
    setDate(within(dialog).getByLabelText('Start date'), '2026-12-01');
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'Data Analytics (T01)' })).toBeInTheDocument());
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Technology/), 'T01');
    const create = within(dialog).getByRole('button', { name: 'Create batch' });
    await userEvent.click(create);
    expect(await within(dialog).findByText('Please correct the highlighted fields.')).toBeInTheDocument();
    for (const [label, d] of [/Batch name/, 'Start date', 'End date', /^Delivery mode/, /^Technology/].map((l, i) => [l, details[i]!] as const))
      expect(within(dialog).getByLabelText(label)).toHaveAccessibleDescription(d.message);

    /* The name is taken: said at the field and on top. */
    answer = json(409, {
      message: 'A batch with this name already exists. Choose another name.',
      error: { code: 'CONFLICT', details: [{ field: 'body.name', message: 'Choose another name' }] },
    });
    await userEvent.click(create);
    expect(await within(dialog).findByText('A batch with this name already exists. Choose another name.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Batch name/)).toHaveAccessibleDescription('Choose another name');
    expect(within(dialog).getByLabelText('Start date')).not.toHaveAccessibleDescription();
  });

  it('says how many students chose another center', async () => {
    mockApi();
    const dialog = await openDialog();
    await waitFor(() => expect(within(dialog).getByRole('option', { name: /Pune Centre/ })).toBeInTheDocument());
    const centre = within(dialog).getByLabelText(/Centre/);
    expect(within(dialog).queryByText(/chose another center/)).not.toBeInTheDocument();
    await userEvent.selectOptions(centre, 'c2');
    expect(within(dialog).getByText('2 of 3 students chose another center')).toBeInTheDocument();
    await userEvent.selectOptions(centre, 'c1');
    expect(within(dialog).getByText('1 of 3 students chose another center')).toBeInTheDocument();
    await userEvent.selectOptions(centre, '');
    expect(within(dialog).queryByText(/chose another center/)).not.toBeInTheDocument();
  });

  it('compares the centers by their ids when the API gives them', async () => {
    mockApi({ students: STUDENTS.map((s) => ({ ...s, centre: 'Pune Centre', centre_id: s.id === 's3' ? 'c9' : 'c1' })) });
    const dialog = await openDialog();
    await nameAndCentre(dialog);
    expect(within(dialog).getByText('1 of 3 students chose another center')).toBeInTheDocument();
  });

  it('says nothing when every student chose this center', async () => {
    mockApi({ students: STUDENTS.map((s) => ({ ...s, centre: 'Pune Centre' })) });
    const dialog = await openDialog();
    await nameAndCentre(dialog);
    expect(within(dialog).queryByText(/chose another center/)).not.toBeInTheDocument();
  });

  it('offers every active center, however many there are', async () => {
    const centres = Array.from({ length: 205 }, (_x, i) => ({ ...CENTRES[0]!, id: `c${i + 1}`, name: `Centre ${i + 1}`, code: `C${i + 1}`, isActive: i !== 203 }));
    const calls = mockApi({ centres });
    const dialog = await openDialog();
    await waitFor(() => expect(within(dialog).getByRole('option', { name: /Centre 205/ })).toBeInTheDocument());
    /* 204 active ones and "Choose a centre". */
    expect(optionsOf(within(dialog).getByLabelText(/Centre/))).toHaveLength(205);
    expect(calls.filter((c) => c.path === '/manage/centres').map((c) => Object.fromEntries(c.query))).toEqual(
      ['1', '2', '3'].map((page) => ({ page, limit: '100', isActive: 'true', sortBy: 'name', sortOrder: 'ASC' })),
    );
  });

  it('does not create a batch when the technologies cannot be loaded', async () => {
    const calls = mockApi({ technologies: () => json(500, { message: 'Server error' }) });
    const dialog = await openDialog();
    expect(await within(dialog).findByText('Could not load the technologies.')).toBeInTheDocument();
    expect(optionsOf(within(dialog).getByLabelText(/^Technology/))).toEqual(['Select technology']);
    await nameAndCentre(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create batch' }));
    expect(within(dialog).getByText('Please select a technology.')).toBeInTheDocument();
    expect(sent(calls, 'POST')).toHaveLength(0);
  });
});

describe('Batches: code, dates, delivery mode and technology', () => {
  it('shows the code under the name, the dates and the delivery mode in the list', async () => {
    const online: Batch = { ...BATCH, id: 'b2', name: 'Pune Batch 2', code: 'IPP-B-0008', end_date: null, delivery_mode: 'ONLINE' };
    mockApi({ batches: [BATCH, online, { ...OLD, id: 'b3', name: 'Old Batch' }] });
    renderAt('/manage/batches');
    const cells = (r: HTMLElement) => within(r).getAllByRole('cell').map((c) => c.textContent);
    expect(cells(await screen.findByRole('row', { name: /Pune Batch 1/ })).slice(1, 9)).toEqual([
      'Pune Batch 1IPP-B-0007',
      'Pune',
      'Pune CentrePUN',
      '30',
      'Divisional Officer 30',
      '—',
      '01/12/2026 – 01/03/2027',
      'Blended',
    ]);
    expect(cells(row(/Pune Batch 2/)).slice(7, 9)).toEqual(['From 01/12/2026', 'Online']);
    /* An older API leaves them out. */
    const old = cells(row(/Old Batch/));
    expect(old[1]).toBe('Old Batch');
    expect(old.slice(7, 9)).toEqual(['—', '—']);
  });

  it('shows them on the batch page, with the technology each student chose', async () => {
    mockApi();
    renderAt('/manage/batches/b1');
    expect(await screen.findByRole('heading', { name: 'Pune Batch 1' })).toBeInTheDocument();
    const line = screen.getByText('IPP-B-0007').closest('p')!;
    expect(line).toHaveTextContent(
      'Code: IPP-B-0007 · Dates: 01/12/2026 – 01/03/2027 · Delivery mode: Blended · Technology: Web Design (T03) · 2 of 30 students chose another center',
    );
    const technologyOf = (name: RegExp) => within(row(name)).getByText('Technology').nextElementSibling!.textContent;
    expect(technologyOf(/Asha Kulkarni/)).toBe('Data Analytics');
    expect(technologyOf(/Nikhil Deshpande/)).toBe('—');
  });

  it('an admin changes them; only what changed is sent, null clears', async () => {
    const calls = mockApi({
      patch: (body) => {
        const { technology: code, ...rest } = body as { technology?: string | null };
        return json(200, { data: { ...DETAIL, ...rest, ...(code === null ? { technology: null } : {}), updated_at: '2026-11-25T11:00:00Z' } });
      },
    });
    renderAt('/manage/batches/b1');
    const start = await screen.findByLabelText('Start date');
    const end = screen.getByLabelText('End date');
    expect(start).toHaveValue('2026-12-01');
    expect(end).toHaveValue('2027-03-01');
    expect(screen.getByLabelText(/^Delivery mode/)).toHaveValue('BLENDED');
    expect(screen.getByLabelText(/^Technology/)).toHaveValue('T03');
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(screen.getByText('Nothing to save: the name and centre are unchanged.')).toBeInTheDocument();

    setDate(end, '2026-11-01');
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(screen.getByText('End date must be after the start date')).toBeInTheDocument();
    setDate(start, '0026-12-01');
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(screen.getByText('Enter a valid start date')).toBeInTheDocument();
    expect(sent(calls, 'PATCH')).toEqual([]);

    /* A saved end date does not follow the start date. */
    setDate(end, '2027-03-01');
    setDate(start, '2026-12-08');
    expect(end).toHaveValue('2027-03-01');
    await userEvent.selectOptions(screen.getByLabelText(/^Delivery mode/), 'OFFLINE');
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(await screen.findByText('Batch details saved.')).toBeInTheDocument();
    expect(screen.getByText('08/12/2026 – 01/03/2027')).toBeInTheDocument();
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-12-08');

    setDate(screen.getByLabelText('End date'), '');
    setDate(screen.getByLabelText('Start date'), '');
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));
    await waitFor(() => expect(sent(calls, 'PATCH')).toHaveLength(2));
    expect(sent(calls, 'PATCH')).toEqual([
      { start_date: '2026-12-08', delivery_mode: 'OFFLINE' },
      { start_date: null, end_date: null },
    ]);
  });

  it('shows what the API refuses at the fields of the batch page', async () => {
    mockApi({
      patch: () =>
        json(422, {
          message: 'Validation failed',
          error: { code: 'VALIDATION_ERROR', details: [{ field: 'body.technology', message: 'Technology not found or inactive' }] },
        }),
    });
    renderAt('/manage/batches/b1');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Data Analytics (T01)' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/^Technology/), 'T01');
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(await screen.findByText('Please correct the highlighted fields.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Technology/)).toHaveAccessibleDescription('Technology not found or inactive');
  });

  it('requires an active replacement for an inactive batch technology', async () => {
    mockApi({ detail: { ...DETAIL, technology: { id: 'T09', code: 'T09', name: 'Old Track' } } });
    renderAt('/manage/batches/b1');
    const tech = await screen.findByLabelText(/^Technology/);
    await waitFor(() =>
      expect(optionsOf(tech)).toEqual(['Select technology', 'Data Analytics (T01)', 'Web Design (T03)']),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(screen.getByText('Please select a technology.')).toBeInTheDocument();
  });

  it('does not break when an older API leaves everything out', async () => {
    const calls = mockApi({ detail: { ...OLD, members: [OLD_MEMBER] }, patch: () => json(200, { data: { ...OLD, name: 'Pune Batch One', members: [OLD_MEMBER] } }) });
    renderAt('/manage/batches/b1');
    expect(await screen.findByRole('heading', { name: 'Pune Batch 1' })).toBeInTheDocument();
    expect(screen.getByText(/^Code:/)).toHaveTextContent('Code: — · Dates: — · Delivery mode: — · Technology: —');
    expect(screen.queryByText(/chose another center/)).not.toBeInTheDocument();
    expect(within(row(/Asha Kulkarni/)).getByText('Technology').nextElementSibling).toHaveTextContent('—');
    expect(screen.getByLabelText('Start date')).toHaveValue('');
    expect(screen.getByLabelText(/^Delivery mode/)).toHaveValue('OFFLINE');
    expect(screen.getByLabelText(/^Technology/)).toHaveValue('');
    const name = screen.getByLabelText(/Batch name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Pune Batch One');
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(screen.getByText('Please select a technology.')).toBeInTheDocument();
    expect(sent(calls, 'PATCH')).toEqual([]);
  });

  it('offers every active center on the batch page too', async () => {
    const centres = Array.from({ length: 101 }, (_x, i) => ({ ...CENTRES[0]!, id: `c${i + 1}`, name: `Centre ${i + 1}`, code: `C${i + 1}` }));
    mockApi({ centres });
    renderAt('/manage/batches/b1');
    await waitFor(() => expect(screen.getByRole('option', { name: /Centre 101/ })).toBeInTheDocument());
    expect(optionsOf(screen.getByLabelText(/^Centre/))).toHaveLength(101);
  });

  it('a view-only account sees them without the form, and no technologies are asked', async () => {
    const calls = mockApi({ role: 'VIEWER' });
    renderAt('/manage/batches/b1');
    expect(await screen.findByText('IPP-B-0007')).toBeInTheDocument();
    expect(screen.queryByLabelText('Start date')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save details' })).not.toBeInTheDocument();
    expect(calls.some((c) => c.path === '/manage/masters/TECHNOLOGY')).toBe(false);
  });
});
