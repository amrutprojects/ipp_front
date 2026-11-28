import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import DashboardPage from '../src/pages/manage/DashboardPage';
import { filtersFromAddress, NO_FILTERS } from '../src/pages/manage/StudentFilters';
import { SessionProvider } from '../src/session';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const NASHIK = '11111111-1111-4111-8111-111111111111';
const PUNE = '22222222-2222-4222-8222-222222222222';
const MARATHA = '33333333-3333-4333-8333-333333333333';
const T01 = '44444444-4444-4444-8444-444444444444';
const CENTRE = '55555555-5555-4555-8555-555555555555';

const FIGURES = {
  districts: [
    { id: NASHIK, name: 'Nashik', count: 5 },
    { id: PUNE, name: 'Pune', count: 2 },
    { id: null, name: null, count: 2 },
  ],
  categories: [
    { id: MARATHA, name: 'मराठा', count: 7 },
    { id: null, name: null, count: 2 },
  ],
  technologies: [{ id: T01, name: 'Data Analytics & Business Intelligence', count: 7 }],
  centres: [{ id: CENTRE, name: 'Nashik Center', count: 7 }],
  documents: { VERIFIED: 4, NOT_VERIFIED: 5 },
  final: { VERIFIED: 3, NOT_VERIFIED: 6 },
};
const SUMMARY = {
  total: 9,
  counts: { OTP_PENDING: 1, VERIFIED: 0, BASIC_DONE: 0, MAIN_DONE: 1, SUBMITTED: 7 },
  stages: [
    { code: 'OTP_PENDING', label: 'Account created – OTP not verified', count: 1 },
    { code: 'VERIFIED', label: 'OTP verified – form not started', count: 0 },
    { code: 'BASIC_DONE', label: 'Step 1 filled (Basic Details)', count: 0 },
    { code: 'MAIN_DONE', label: 'Step 2 filled (Main Form)', count: 1 },
    { code: 'SUBMITTED', label: 'Form submitted', count: 7 },
  ],
  follow_ups: {},
  approvals: { AWAITING: 0, RETURNED: 0, WITH_CANDIDATE: 1, BATCH: 1, DIVISION: 1, COEP: 0, HEAD_OFFICE: 1, ADMIN: 0, APPROVED: 3 },
};
const OPTIONS = {
  districts: [],
  categories: [],
  centres: [],
  technologies: [],
  stages: [
    { code: 'OTP_PENDING', label: 'OTP pending' },
    { code: 'AUDITOR', label: 'Submitted: with the Auditor' },
    { code: 'WITH_CANDIDATE', label: 'Sent back to the candidate' },
    { code: 'BATCH', label: 'Approved: waiting for a batch' },
    { code: 'APPROVED', label: 'Final approved' },
  ],
};

function mockApi(dashboard: () => Response = () => json(200, { data: FIGURES })) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/manage/me'))
      return json(200, { data: { id: 'm1', name: 'Program Auditor', email: 'auditor@example.com', role: 'ADMIN' } });
    if (url.endsWith('/manage/dashboard')) return dashboard();
    if (url.endsWith('/manage/summary')) return json(200, { data: SUMMARY });
    if (url.endsWith('/manage/filters')) return json(200, { data: OPTIONS });
    return json(404, { message: 'not mocked' });
  });
}

function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname + l.search}</output>;
}
const renderPage = () =>
  render(
    <SessionProvider>
      <MemoryRouter initialEntries={['/manage/dashboard']}>
        <Routes>
          <Route path="/manage/dashboard" element={<DashboardPage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  );

/* The rows of a card: "label count" each. */
const rowsOf = (card: string) =>
  within(screen.getByRole('region', { name: card }))
    .getAllByRole('listitem')
    .map((li) => li.textContent);

beforeEach(() => localStorage.setItem('edp.manage.token', 'manage-token'));
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Auditor dashboard (/manage/dashboard)', () => {
  it('shows the stage tiles of Student tracking', async () => {
    mockApi();
    renderPage();
    const stages = await screen.findByRole('navigation', { name: 'Students by stage' });
    expect(
      within(stages)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual([
      '9All students',
      '1Account created – OTP not verified',
      '0OTP verified – form not started',
      '0Step 1 filled (Basic Details)',
      '1Step 2 filled (Main Form)',
      '7Form submitted',
      '3Final Approved Students',
    ]);
  });

  it('shows the students by District, Category, Technology, Centre, Stage of application, Documents and Final verification', async () => {
    mockApi();
    renderPage();
    await screen.findByRole('region', { name: 'District' });
    expect(rowsOf('District')).toEqual(['Nashik5', 'Pune2', 'Not filled in yet2']);
    expect(rowsOf('Category')).toEqual(['मराठा7', 'Not filled in yet2']);
    expect(rowsOf('Technology')).toEqual(['Data Analytics & Business Intelligence7']);
    expect(rowsOf('Centre')).toEqual(['Nashik Center7']);
    expect(rowsOf('Stage of application')).toEqual([
      'OTP pending1',
      'Submitted: with the Auditor0',
      'Sent back to the candidate1',
      'Approved: waiting for a batch1',
      'Final approved3',
    ]);
    expect(rowsOf('Documents')).toEqual(['Approved (verified)4', 'Not approved5']);
    expect(rowsOf('Final verification')).toEqual(['Verified3', 'Not verified6']);
    /* "Not filled in yet" is no value of the filter: not a link. */
    expect(within(screen.getByRole('region', { name: 'District' })).getAllByRole('link')).toHaveLength(2);
  });

  it.each([
    ['District', 'Pune', `/manage?district_id=${PUNE}`],
    ['Category', 'मराठा', `/manage?caste_id=${MARATHA}`],
    ['Technology', 'Data Analytics & Business Intelligence', `/manage?technology_id=${T01}`],
    ['Centre', 'Nashik Center', `/manage?centre_id=${CENTRE}`],
    ['Stage of application', 'Approved: waiting for a batch', '/manage?application_stage=BATCH'],
    ['Documents', 'Not approved', '/manage?documents=NOT_VERIFIED'],
    ['Final verification', 'Verified', '/manage?final=VERIFIED'],
  ])('%s: %s opens Student tracking at %s', async (card, row, path) => {
    mockApi();
    renderPage();
    const region = await screen.findByRole('region', { name: card });
    await userEvent.click(within(region).getByRole('link', { name: new RegExp(`^${row}`) }));
    expect(screen.getByTestId('where')).toHaveTextContent(path);
  });

  it('a stage tile opens Student tracking on that stage', async () => {
    mockApi();
    renderPage();
    await userEvent.click(await screen.findByRole('link', { name: /Form submitted$/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/manage?application_stage=SUBMITTED');
  });

  it('says when the dashboard cannot be loaded, and loads it again', async () => {
    let fail = true;
    mockApi(() => (fail ? json(500, { message: 'Something went wrong' }) : json(200, { data: FIGURES })));
    renderPage();
    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('region', { name: 'District' })).toBeInTheDocument();
  });

  it('is the first section of the panel', async () => {
    mockApi();
    renderPage();
    const nav = await screen.findByRole('navigation', { name: 'Tracking panel sections' });
    expect(within(nav).getAllByRole('link')[0]).toHaveTextContent('Dashboard');
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/manage/dashboard');
  });
});

describe('Student tracking opened from a link', () => {
  it('takes the filters from the address, and leaves out what the list does not offer', () => {
    const from = (q: string) => filtersFromAddress(new URLSearchParams(q));
    expect(from('')).toEqual(NO_FILTERS);
    expect(
      from(`district_id=${PUNE}&caste_id=${MARATHA}&technology_id=${T01}&centre_id=${CENTRE}&documents=VERIFIED&final=NOT_VERIFIED`),
    ).toEqual({
      ...NO_FILTERS,
      district_id: PUNE,
      caste_id: MARATHA,
      technology_id: T01,
      centre_id: CENTRE,
      documents: 'VERIFIED',
      final: 'NOT_VERIFIED',
    });
    expect(from('application_stage=BATCH').stage).toBe('BATCH');
    expect(from('application_stage=SUBMITTED').stage).toBe('SUBMITTED');
    expect(from('application_stage=NOPE&district_id=not-an-id&documents=MAYBE')).toEqual(NO_FILTERS);
  });
});
