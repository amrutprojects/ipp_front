import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ManagePage from '../src/pages/manage/ManagePage';
import { SessionProvider } from '../src/session';
import type { ListFilterOptions, Summary } from '../src/types';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const DISTRICT = 'd1111111-1111-4111-8111-111111111111';
const CASTE = 'c1111111-1111-4111-8111-111111111111';
const CENTRE = 'e1111111-1111-4111-8111-111111111111';
const TECHNOLOGY = 'f1111111-1111-4111-8111-111111111111';

/* GET /manage/filters. */
const OPTIONS: ListFilterOptions = {
  districts: [
    { id: DISTRICT, name: 'Pune' },
    { id: 'd2222222-2222-4222-8222-222222222222', name: 'Satara' },
  ],
  categories: [{ id: CASTE, name: 'Maratha' }],
  technologies: [
    { id: TECHNOLOGY, name: 'Full Stack Python' },
    { id: 'f2222222-2222-4222-8222-222222222222', name: 'Cyber Security' },
  ],
  centres: [{ id: CENTRE, name: 'Pune Centre' }],
  stages: [
    { code: 'OTP_PENDING', label: 'OTP pending' },
    { code: 'VERIFIED', label: 'Account verified' },
    { code: 'BASIC_DONE', label: 'Step 1 filled' },
    { code: 'MAIN_DONE', label: 'Step 2 filled' },
    { code: 'AUDITOR', label: 'Submitted: with the Auditor' },
    { code: 'RETURNED', label: 'Sent back to the Auditor' },
    { code: 'BATCH', label: 'Approved: waiting for a batch' },
    { code: 'DIVISION', label: 'With Divisional Officer' },
    { code: 'COEP', label: 'With COEP' },
    { code: 'HEAD_OFFICE', label: 'With Head Office' },
    { code: 'ADMIN', label: 'With Admin (final approval)' },
    { code: 'APPROVED', label: 'Final approved' },
  ],
};

const SUMMARY: Summary = {
  total: 60,
  counts: { OTP_PENDING: 5, VERIFIED: 6, BASIC_DONE: 7, MAIN_DONE: 8, SUBMITTED: 34 },
  stages: [
    { code: 'OTP_PENDING', label: 'OTP pending', count: 5 },
    { code: 'VERIFIED', label: 'Account verified', count: 6 },
    { code: 'BASIC_DONE', label: 'Step 1 filled', count: 7 },
    { code: 'MAIN_DONE', label: 'Step 2 filled', count: 8 },
    { code: 'SUBMITTED', label: 'Form submitted', count: 34 },
  ],
  follow_ups: { NONE: 60, PENDING: 0, CALLED: 0, SECOND_CALL: 0, FORM_FILLED: 0 },
  approvals: { AWAITING: 12, RETURNED: 3, BATCH: 9, DIVISION: 4, COEP: 5, HEAD_OFFICE: 0, ADMIN: 6, APPROVED: 7 },
};

/* `filters` answers GET /manage/filters; every list request's query is recorded. */
function mockApi(filters: () => Response = () => json(200, { data: OPTIONS })) {
  const lists: URLSearchParams[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/manage/me')) return json(200, { data: { id: 'm1', name: 'Program Auditor', email: 'a@example.com', role: 'ADMIN' } });
    if (url.endsWith('/manage/summary')) return json(200, { data: SUMMARY });
    if (url.endsWith('/manage/filters')) return filters();
    if (url.endsWith('/manage/settings/batch')) return json(200, { data: { size: 2, updated_at: null, updated_by: null } });
    if (url.includes('/manage/applicants?')) {
      const query = new URL(url, 'http://x').searchParams;
      lists.push(query);
      return json(200, { data: [], meta: { page: Number(query.get('page')), limit: 25, total: 60, totalPages: 3 } });
    }
    return json(404, { message: 'not mocked' });
  });
  return lists;
}

beforeEach(() => localStorage.setItem('edp.manage.token', 'manage-token'));
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <SessionProvider>
        <ManagePage />
      </SessionProvider>
    </MemoryRouter>,
  );
/* The filter bar, once its choices are loaded. */
async function filterBar() {
  const bar = await screen.findByRole('group', { name: 'Filters' });
  await within(bar).findByRole('option', { name: 'Pune' });
  return within(bar);
}
/* The last list request: its filters (without page and limit). */
const sent = (lists: URLSearchParams[]) => Object.fromEntries([...lists[lists.length - 1]!].filter(([k]) => k !== 'page' && k !== 'limit'));
const texts = (select: HTMLElement) => [...(select as HTMLSelectElement).options].map((o) => o.text);

describe('Tracking panel filters', () => {
  it('offers the filters in order, with the choices and the counts the API gives', async () => {
    mockApi();
    renderPage();
    const bar = await filterBar();
    const controls = screen.getByRole('group', { name: 'Filters' }).querySelectorAll('label, button');
    expect([...controls].map((c) => c.firstChild!.textContent)).toEqual([
      'Name',
      'District',
      'Category',
      'Technology',
      'Centre',
      'Stage of application',
      'Documents',
      'Mobile no.',
      'Final verification',
      'Clear filters',
    ]);
    expect(texts(bar.getByLabelText('Technology'))).toEqual(['All technologies', 'Full Stack Python', 'Cyber Security']);
    expect(texts(bar.getByLabelText('Centre'))).toEqual(['All centres', 'Pune Centre']);
    expect(texts(bar.getByLabelText('District'))).toEqual(['All districts', 'Pune', 'Satara']);
    expect(texts(bar.getByLabelText('Category'))).toEqual(['All categories', 'Maratha']);
    expect(texts(bar.getByLabelText('Documents'))).toEqual(['All', 'Verified', 'Not verified']);
    expect(texts(bar.getByLabelText('Final verification'))).toEqual(['All', 'Verified', 'Not verified']);
    await waitFor(() =>
      expect(texts(bar.getByLabelText('Stage of application'))).toEqual([
        'All stages',
        'OTP pending (5)',
        'Account verified (6)',
        'Step 1 filled (7)',
        'Step 2 filled (8)',
        'Submitted: with the Auditor (12)',
        'Sent back to the Auditor (3)',
        'Approved: waiting for a batch (9)',
        'With Divisional Officer (4)',
        'With COEP (5)',
        'With Head Office (0)',
        'With Admin (final approval) (6)',
        'Final approved (7)',
      ]),
    );
    /* One stage filter only: the former approval dropdown is gone. */
    expect(screen.queryByRole('combobox', { name: 'Filter by approval' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('combobox', { name: /stage/i })).toHaveLength(1);
  });

  it('sends each filter as its own parameter', async () => {
    const lists = mockApi();
    renderPage();
    const bar = await filterBar();
    expect(sent(lists)).toEqual({});
    await userEvent.selectOptions(bar.getByLabelText('District'), 'Pune');
    await userEvent.selectOptions(bar.getByLabelText('Category'), 'Maratha');
    await userEvent.selectOptions(bar.getByLabelText('Technology'), 'Full Stack Python');
    await userEvent.selectOptions(bar.getByLabelText('Centre'), 'Pune Centre');
    await userEvent.selectOptions(bar.getByLabelText('Stage of application'), 'ADMIN');
    await userEvent.selectOptions(bar.getByLabelText('Documents'), 'Verified');
    await userEvent.selectOptions(bar.getByLabelText('Final verification'), 'Not verified');
    await userEvent.type(bar.getByLabelText('Name'), ' Asha ');
    await userEvent.type(bar.getByLabelText('Mobile no.'), '90000');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by follow-up' }), 'NONE');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search' }), 'IPP-000001');
    await waitFor(
      () =>
        expect(sent(lists)).toEqual({
          name: 'Asha',
          district_id: DISTRICT,
          caste_id: CASTE,
          technology_id: TECHNOLOGY,
          centre_id: CENTRE,
          application_stage: 'ADMIN',
          documents: 'VERIFIED',
          mobile: '90000',
          final: 'NOT_VERIFIED',
          follow_up: 'NONE',
          search: 'IPP-000001',
        }),
      { timeout: 2000 },
    );
  });

  it('applies the text filters once typing stops, and keeps only the digits of a mobile number', async () => {
    const lists = mockApi();
    renderPage();
    const bar = await filterBar();
    const before = lists.length;
    await userEvent.type(bar.getByLabelText('Name'), 'Asha');
    expect(lists).toHaveLength(before);
    await waitFor(() => expect(sent(lists)).toEqual({ name: 'Asha' }));
    expect(lists).toHaveLength(before + 1);

    const mobile = bar.getByLabelText('Mobile no.');
    await userEvent.type(mobile, '90 00a');
    expect(mobile).toHaveValue('9000');
    await userEvent.clear(mobile);
    await userEvent.click(mobile);
    await userEvent.paste('+91 90000 00000');
    expect(mobile).toHaveValue('9000000000');
    await waitFor(() => expect(sent(lists)).toEqual({ name: 'Asha', mobile: '9000000000' }));
  });

  it('goes back to page 1 when a filter changes', async () => {
    const lists = mockApi();
    renderPage();
    const bar = await filterBar();
    await userEvent.click(await screen.findByRole('button', { name: 'Next →' }));
    await waitFor(() => expect(lists[lists.length - 1]!.get('page')).toBe('2'));
    await userEvent.selectOptions(bar.getByLabelText('Documents'), 'Not verified');
    await waitFor(() => expect(sent(lists)).toEqual({ documents: 'NOT_VERIFIED' }));
    expect(lists[lists.length - 1]!.get('page')).toBe('1');

    await userEvent.click(screen.getByRole('button', { name: 'Next →' }));
    await waitFor(() => expect(lists[lists.length - 1]!.get('page')).toBe('2'));
    await userEvent.type(bar.getByLabelText('Name'), 'Asha');
    await waitFor(() => expect(sent(lists)).toEqual({ documents: 'NOT_VERIFIED', name: 'Asha' }));
    expect(lists[lists.length - 1]!.get('page')).toBe('1');
  });

  it('the tiles set the same stage filter; Submitted covers every approval stage', async () => {
    const lists = mockApi();
    renderPage();
    const bar = await filterBar();
    const stage = bar.getByLabelText('Stage of application');
    const tile = (name: RegExp) => screen.getByRole('button', { name });

    await userEvent.click(await screen.findByRole('button', { name: /Step 1 filled/ }));
    await waitFor(() => expect(sent(lists)).toEqual({ application_stage: 'BASIC_DONE' }));
    expect(stage).toHaveValue('BASIC_DONE');
    expect(tile(/Step 1 filled/)).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(tile(/Form submitted/));
    await waitFor(() => expect(sent(lists)).toEqual({ stage: 'SUBMITTED' }));
    expect(stage).toHaveValue('SUBMITTED');
    expect((stage as HTMLSelectElement).selectedOptions[0]).toHaveTextContent('Form submitted (34)');

    /* The dropdown takes over from the tile. */
    await userEvent.selectOptions(stage, 'COEP');
    await waitFor(() => expect(sent(lists)).toEqual({ application_stage: 'COEP' }));
    expect(tile(/Form submitted/)).toHaveAttribute('aria-pressed', 'false');
    expect(within(stage).queryByRole('option', { name: /Form submitted/ })).not.toBeInTheDocument();

    await userEvent.click(tile(/All students/));
    await waitFor(() => expect(sent(lists)).toEqual({}));
    expect(stage).toHaveValue('');
  });

  it('"Waiting for a batch" filters the list on that stage, and back to all', async () => {
    const lists = mockApi();
    renderPage();
    const bar = await filterBar();
    const quick = await screen.findByRole('button', { name: 'Waiting for a batch (9)' });
    expect(quick).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(quick);
    await waitFor(() => expect(sent(lists)).toEqual({ application_stage: 'BATCH' }));
    expect(bar.getByLabelText('Stage of application')).toHaveValue('BATCH');
    expect(quick).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(quick);
    await waitFor(() => expect(sent(lists)).toEqual({}));
  });

  it('?application_stage opens the list on that stage; an unknown one is ignored', async () => {
    const lists = mockApi();
    const open = (path: string) =>
      render(
        <MemoryRouter initialEntries={[path]}>
          <SessionProvider>
            <ManagePage />
          </SessionProvider>
        </MemoryRouter>,
      );
    const a = open('/manage?application_stage=RETURNED');
    expect((await filterBar()).getByLabelText('Stage of application')).toHaveValue('RETURNED');
    expect(sent(lists)).toEqual({ application_stage: 'RETURNED' });
    a.unmount();
    open('/manage?application_stage=UNKNOWN');
    expect((await filterBar()).getByLabelText('Stage of application')).toHaveValue('');
    expect(sent(lists)).toEqual({});
  });

  it('Clear filters empties every filter, the search and the follow-up filter, and goes to page 1', async () => {
    const lists = mockApi();
    renderPage();
    const bar = await filterBar();
    await userEvent.selectOptions(bar.getByLabelText('District'), 'Satara');
    await userEvent.selectOptions(bar.getByLabelText('Technology'), 'Cyber Security');
    await userEvent.selectOptions(bar.getByLabelText('Centre'), 'Pune Centre');
    await userEvent.selectOptions(bar.getByLabelText('Final verification'), 'Verified');
    await userEvent.click(screen.getByRole('button', { name: /Step 2 filled/ }));
    await userEvent.type(bar.getByLabelText('Name'), 'Asha');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search' }), 'asha');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by follow-up' }), 'CALLED');
    await waitFor(() => expect(sent(lists)).toMatchObject({ name: 'Asha', search: 'asha', follow_up: 'CALLED', application_stage: 'MAIN_DONE' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next →' }));
    await waitFor(() => expect(lists[lists.length - 1]!.get('page')).toBe('2'));

    await userEvent.click(bar.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(sent(lists)).toEqual({}));
    expect(lists[lists.length - 1]!.get('page')).toBe('1');
    for (const label of ['Name', 'District', 'Category', 'Technology', 'Centre', 'Stage of application', 'Documents', 'Mobile no.', 'Final verification'])
      expect(bar.getByLabelText(label)).toHaveValue('');
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Filter by follow-up' })).toHaveValue('');
  });

  it('says so when the choices cannot be loaded, keeps the list, and Refresh loads them', async () => {
    let answer = json(500, { message: 'Server error' });
    mockApi(() => answer);
    renderPage();
    expect(await screen.findByText(/Could not load the filter choices/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    answer = json(200, { data: OPTIONS });
    await userEvent.click(await screen.findByRole('button', { name: 'Refresh' }));
    await filterBar();
    expect(screen.queryByText(/Could not load the filter choices/)).not.toBeInTheDocument();
  });
});
