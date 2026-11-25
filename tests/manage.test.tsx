import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ManagePage from '../src/pages/manage/ManagePage';
import { SessionProvider } from '../src/session';
import type { Applicant, FollowUp } from '../src/types';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const student = (over: Partial<Applicant> = {}): Applicant => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Rohan Pawar',
  email: 'rohan@example.com',
  mobile_number: '9000000000',
  stage: 'MAIN_DONE',
  stage_label: 'Step 2 filled (Main Form)',
  account_created_at: '2026-10-24T11:30:00Z',
  otp_verified_at: '2026-10-24T11:55:00Z',
  last_login_at: null,
  basic_completed_at: '2026-10-24T11:57:00Z',
  main_completed_at: '2026-10-24T11:57:00Z',
  submitted_at: null,
  registration_id: null,
  registration_number: null,
  district_id: null,
  district: null,
  category: null,
  centre: null,
  documents: { uploaded: 0, verified: 0 },
  documents_verified: false,
  final_verified: false,
  last_activity_at: '2026-10-24T12:00:00Z',
  follow_up: null,
  can_approve: false,
  can_batch: false,
  approval: null,
  ...over,
});

function mockApi() {
  let history: FollowUp[] = [];
  const calls: { method: string; url: string; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    if (url.endsWith('/manage/me')) return json(200, { data: { id: 'm1', name: 'Program Admin', email: 'admin@example.com', role: 'ADMIN' } });
    if (url.endsWith('/manage/summary'))
      return json(200, {
        data: {
          total: 1,
          counts: {},
          stages: [],
          follow_ups: { NONE: history.length ? 0 : 1, PENDING: 0, CALLED: history.length ? 1 : 0, SECOND_CALL: 0, FORM_FILLED: 0 },
        },
      });
    if (url.endsWith('/manage/filters')) return json(200, { data: { districts: [], categories: [], centres: [], stages: [] } });
    if (url.endsWith('/manage/settings/batch')) return json(200, { data: { size: 2, updated_at: null, updated_by: null } });
    if (url.includes('/manage/applicants?') || url.endsWith('/manage/applicants'))
      return json(200, { data: [student({ follow_up: history[0] ?? null })], meta: { page: 1, limit: 25, total: 1, totalPages: 1 } });
    if (url.endsWith('/follow-ups') && method === 'GET') return json(200, { data: history });
    if (url.endsWith('/follow-ups') && method === 'POST') {
      const b = body as { status: FollowUp['status']; note?: string };
      history = [
        { status: b.status, status_label: 'Follow-up call', note: b.note ?? null, at: '2026-10-24T12:30:00Z', by: 'Program Admin' },
        ...history,
      ];
      return json(201, { data: history });
    }
    return json(404, { message: 'not mocked' });
  });
  return calls;
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

describe('Tracking panel follow-ups', () => {
  it('records a follow-up with a status and a note from the follow-up icon', async () => {
    const calls = mockApi();
    renderPage();
    expect(await screen.findByRole('columnheader', { name: 'Follow-up' })).toBeInTheDocument();
    expect(await screen.findByText('Not followed up')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Follow-up: Rohan Pawar' }));
    const dialog = screen.getByRole('dialog', { name: 'Follow-up – Rohan Pawar' });
    const select = within(dialog).getByLabelText(/Follow-up status/);
    expect([...(select as HTMLSelectElement).options].map((o) => o.text)).toEqual([
      'Pending follow-up',
      'Follow-up call',
      'Second follow-up',
      'Form filled',
    ]);
    expect(await within(dialog).findByText('No follow-up recorded yet.')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: '9000000000' })).toHaveAttribute('href', 'tel:9000000000');

    await userEvent.selectOptions(select, 'CALLED');
    await userEvent.type(within(dialog).getByLabelText(/Note/), 'Will upload documents by Friday');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save follow-up' }));

    expect(await within(dialog).findByText('Follow-up saved.')).toBeInTheDocument();
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.url).toMatch(/\/manage\/applicants\/11111111-1111-4111-8111-111111111111\/follow-ups$/);
    expect(post.body).toEqual({ status: 'CALLED', note: 'Will upload documents by Friday' });
    expect(within(dialog).getByText('Will upload documents by Friday')).toBeInTheDocument();

    /* The list is reloaded: the row shows the latest follow-up. */
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.getByRole('row', { name: /Rohan Pawar/ })).toHaveTextContent('Follow-up call'));
  });

  it('filters the list by follow-up status', async () => {
    const calls = mockApi();
    renderPage();
    const filter = await screen.findByRole('combobox', { name: 'Filter by follow-up' });
    await userEvent.selectOptions(filter, 'NONE');
    await waitFor(() => expect(calls.some((c) => c.url.includes('follow_up=NONE'))).toBe(true));
  });
});

describe('Tracking panel follow-ups: review fixes', () => {
  /* A configurable API: `list(page)` answers the applicants request; `history` the follow-ups GET (undefined = fail). */
  function api(opts: { list: (page: number) => { data: Applicant[]; meta: object }; history?: FollowUp[] }) {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/manage/me')) return json(200, { data: { id: 'm1', name: 'Program Admin', email: 'a@example.com', role: 'ADMIN' } });
      if (url.endsWith('/manage/summary'))
        return json(200, { data: { total: 1, counts: {}, stages: [], follow_ups: { NONE: 0, PENDING: 0, CALLED: 1, SECOND_CALL: 0, FORM_FILLED: 0 } } });
      if (url.endsWith('/manage/filters')) return json(200, { data: { districts: [], categories: [], centres: [], stages: [] } });
      if (url.endsWith('/manage/settings/batch')) return json(200, { data: { size: 2, updated_at: null, updated_by: null } });
      if (url.includes('/manage/applicants?')) return json(200, opts.list(Number(new URL(url, 'http://x').searchParams.get('page'))));
      if (url.endsWith('/follow-ups')) return opts.history ? json(200, { data: opts.history }) : json(500, { message: 'Server error' });
      return json(404, { message: 'not mocked' });
    });
    return calls;
  }
  const called: FollowUp = { status: 'CALLED', status_label: 'Follow-up call', note: null, at: '2026-10-24T12:00:00Z', by: 'A' };
  const filled: FollowUp = { status: 'FORM_FILLED', status_label: 'Form filled', note: 'Done', at: '2026-10-24T13:00:00Z', by: 'B' };
  const one = { data: [student({ follow_up: called })], meta: { page: 1, limit: 25, total: 1, totalPages: 1 } };

  it('starts the dialog from the latest saved status, not from an out-of-date row', async () => {
    api({ list: () => one, history: [filled, called] });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Follow-up: Rohan Pawar' }));
    const select = screen.getByLabelText(/Follow-up status/) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe('FORM_FILLED'));
  });

  it('says so when the history cannot be loaded', async () => {
    api({ list: () => one });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Follow-up: Rohan Pawar' }));
    expect(await screen.findByText(/Could not load the history/)).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('moves back to the last page when the current one has emptied', async () => {
    const calls = api({
      list: (page) =>
        page === 1
          ? { data: [student()], meta: { page: 1, limit: 25, total: 30, totalPages: 2 } }
          : /* the students on page 2 left the filter meanwhile */ { data: [], meta: { page: 2, limit: 25, total: 25, totalPages: 1 } },
      history: [],
    });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Next →' }));
    await waitFor(() => expect(calls.filter((u) => u.includes('page=1')).length).toBeGreaterThanOrEqual(2));
    expect(await screen.findByRole('row', { name: /Rohan Pawar/ })).toBeInTheDocument();
    expect(screen.queryByText('No students match.')).not.toBeInTheDocument();
  });
});
