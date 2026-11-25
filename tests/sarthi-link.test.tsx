import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import ApprovalHistory from '../src/pages/manage/ApprovalHistory';
import ApprovalStageCell from '../src/pages/manage/ApprovalStageCell';
import { addPicks, isBatch, pickBlocked, sizeFor, toPick, type BatchRules } from '../src/pages/manage/batchPicks';
import { batchPlaces } from '../src/pages/manage/BatchesPage';
import type { Applicant, ApprovalEvent, Batch, BatchDetail, BatchSettings, LinkStatus, ManageRole } from '../src/types';

/* The officers decide in Sarthi: the batch size of a district, what is sent there, and what comes back. */
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const PUNE = '11111111-1111-4111-8111-111111111111';
const SATARA = '22222222-2222-4222-8222-222222222222';
const NASHIK = '33333333-3333-4333-8333-333333333333';
const SIZES: BatchSettings = {
  size: 30,
  districts: [{ district_id: SATARA, name: 'Satara', size: 5 }],
  district_required: true,
  updated_at: '2026-11-25T09:00:00Z',
  updated_by: 'Program Admin',
};
const LINK: LinkStatus = {
  enabled: true,
  configured: true,
  host: 'sarthi.example.org',
  pending: 1,
  failed: 1,
  last_sent_at: '2026-11-25T09:00:00Z',
  last_received_at: null,
  items: [
    {
      id: 'm1',
      kind: 'BATCH',
      batch: { id: 'b1', code: 'IPP-B-0001', name: 'Pune Batch 1' },
      student: null,
      status: 'FAILED',
      attempts: 1,
      next_attempt_at: '2026-11-25T09:01:00Z',
      error: 'DISTRICT_UNKNOWN: Pune is not in the District Master',
      created_at: '2026-11-25T09:00:00Z',
    },
    {
      id: 'm2',
      kind: 'UPDATE',
      batch: { id: 'b2', code: 'IPP-B-0002', name: 'Satara Batch' },
      student: { id: 's1', name: 'Asha Kulkarni', registration_id: 'IPP-000001' },
      status: 'PENDING',
      attempts: 2,
      next_attempt_at: '2026-11-25T09:05:00Z',
      error: 'Sarthi could not be reached',
      created_at: '2026-11-25T09:00:00Z',
    },
  ],
};
const BATCH: Batch = {
  id: 'b1',
  name: 'Pune Batch 1',
  code: 'IPP-B-0001',
  centre: { id: 'c1', name: 'Pune Centre', code: 'PUN' },
  district: { id: PUNE, name: 'Pune' },
  students: 2,
  size: 2,
  stages: { AUDITOR: 0, DIVISION: 1, COEP: 0, HEAD_OFFICE: 0, ADMIN: 1, APPROVED: 0 },
  rejected: 0,
  sync: { status: 'SENT', error: null, sent_at: '2026-11-25T09:00:00Z' },
  created_at: '2026-11-25T09:00:00Z',
  created_by: 'Program Admin',
  updated_at: '2026-11-25T09:00:00Z',
  updated_by: 'Program Admin',
};

interface Opts {
  role?: ManageRole;
  settings?: BatchSettings;
  put?: (body: unknown) => Response;
  link?: () => Response;
  batches?: Batch[];
  filters?: () => Response;
}
function mockApi(opts: Opts = {}) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = new URL(String(input), 'http://x').pathname.replace(/^.*\/edp/, '');
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body });
    if (path === '/manage/me') return json(200, { data: { id: 'm1', name: 'Program Auditor', email: 'a@example.com', role: opts.role ?? 'ADMIN' } });
    if (path === '/manage/settings/batch' && method === 'PUT') {
      if (opts.put) return opts.put(body);
      const sent = body as { size: number; districts?: { district_id: string; size: number }[] };
      const names: Record<string, string> = { [PUNE]: 'Pune', [SATARA]: 'Satara', [NASHIK]: 'Nashik' };
      return json(200, {
        data: { ...SIZES, size: sent.size, districts: sent.districts?.map((d) => ({ ...d, name: names[d.district_id] })) },
      });
    }
    if (path === '/manage/settings/batch') return json(200, { data: opts.settings ?? SIZES });
    if (path === '/manage/filters')
      return (
        opts.filters?.() ??
        json(200, {
          data: {
            districts: [
              { id: NASHIK, name: 'Nashik' },
              { id: PUNE, name: 'Pune' },
              { id: SATARA, name: 'Satara' },
            ],
            categories: [],
            centres: [],
            stages: [],
          },
        })
      );
    if (path === '/manage/link') return opts.link?.() ?? json(200, { data: LINK });
    if (path === '/manage/link/retry') return json(200, { message: '1 message(s) will be sent again', data: { retried: 1 } });
    if (path === '/manage/link/test') return json(200, { data: { ok: false, message: 'Sarthi could not be reached' } });
    if (path === '/manage/batches') return json(200, { data: opts.batches ?? [BATCH], meta: { page: 1, limit: 25, total: 1, totalPages: 1, size: 30 } });
    if (path === '/manage/batches/b1') return json(200, { data: { ...(opts.batches?.[0] ?? BATCH), members: [] } as BatchDetail });
    if (path === '/manage/centres') return json(200, { data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 1 } });
    return json(404, { message: 'not mocked' });
  });
  return calls;
}
const writes = (calls: ReturnType<typeof mockApi>) => calls.filter((c) => c.method !== 'GET').map((c) => [c.method, c.path, c.body]);
const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
async function section(name: string) {
  const region = await screen.findByRole('region', { name });
  await waitFor(() => expect(within(region).queryByText('Loading…')).not.toBeInTheDocument());
  return region;
}

beforeEach(() => {
  localStorage.setItem('edp.manage.token', 'manage-token');
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Settings: the batch size of a district', () => {
  it('adds, changes and removes a district’s size, and saves them with the default', async () => {
    const calls = mockApi();
    renderAt('/manage/settings');
    const card = await section('Batch size');
    const satara = within(card).getByLabelText('Batch size of Satara');
    expect(satara).toHaveValue(5);
    const add = within(card).getByLabelText('District to add');
    await waitFor(() => expect(add).toBeEnabled());
    /* Satara has one already. */
    expect([...(add as HTMLSelectElement).options].map((o) => o.text)).toEqual(['Choose a district', 'Nashik', 'Pune']);
    await userEvent.selectOptions(add, 'Pune');
    await userEvent.click(within(card).getByRole('button', { name: '+ Add district' }));
    /* Starts with the default; in the order of the names. */
    expect(within(card).getByLabelText('Batch size of Pune')).toHaveValue(30);
    expect(within(card).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0]!.textContent)).toEqual(['Pune', 'Satara']);
    await userEvent.clear(within(card).getByLabelText('Batch size of Pune'));
    await userEvent.click(within(card).getByRole('button', { name: 'Save' }));
    expect(within(card).getByText('Enter a whole number from 1 to 100')).toBeInTheDocument();
    expect(writes(calls)).toEqual([]);
    await userEvent.type(within(card).getByLabelText('Batch size of Pune'), '10');
    await userEvent.click(within(card).getByRole('button', { name: 'Save' }));
    expect(await within(card).findByText('Batch size saved.')).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Remove the batch size of Satara' }));
    await userEvent.click(within(card).getByRole('button', { name: 'Remove the batch size of Pune' }));
    expect(within(card).getByText('None: every district uses the number above.')).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(calls)).toHaveLength(2));
    expect(writes(calls)).toEqual([
      [
        'PUT',
        '/manage/settings/batch',
        {
          size: 30,
          districts: [
            { district_id: PUNE, size: 10 },
            { district_id: SATARA, size: 5 },
          ],
        },
      ],
      ['PUT', '/manage/settings/batch', { size: 30, districts: [] }],
    ]);
  });

  it('shows what the API refuses at its district', async () => {
    mockApi({
      put: () =>
        json(422, {
          message: 'Validation failed',
          error: { code: 'VALIDATION_ERROR', details: [{ field: 'body.districts.0.district_id', message: 'District not found' }] },
        }),
    });
    renderAt('/manage/settings');
    const card = await section('Batch size');
    await userEvent.click(within(card).getByRole('button', { name: 'Save' }));
    expect(await within(card).findByText('District not found')).toBeInTheDocument();
    expect(within(card).getByLabelText('Batch size of Satara')).toHaveAccessibleDescription('District not found');
  });

  it('a viewer sees them and changes nothing', async () => {
    mockApi({ role: 'VIEWER' });
    renderAt('/manage/settings');
    const card = await section('Batch size');
    expect(within(card).getByLabelText('Batch size of Satara')).toBeDisabled();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
    expect(within(card).queryByLabelText('District to add')).not.toBeInTheDocument();
  });

  it('says when the districts cannot be loaded; the rest works', async () => {
    const calls = mockApi({ filters: () => json(500, { message: 'no' }) });
    renderAt('/manage/settings');
    const card = await section('Batch size');
    expect(await within(card).findByText('Could not load the districts')).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Save' }));
    expect(await within(card).findByText('Batch size saved.')).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(1);
  });

  it('an older API: one size only', async () => {
    const calls = mockApi({ settings: { size: 30, updated_at: null, updated_by: null } });
    renderAt('/manage/settings');
    const card = await section('Batch size');
    expect(within(card).queryByText('Districts with another batch size')).not.toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Save' }));
    await within(card).findByText('Batch size saved.');
    expect(writes(calls)).toEqual([['PUT', '/manage/settings/batch', { size: 30 }]]);
  });
});

describe('the students of a batch', () => {
  const student = (id: string, district_id: string | null) =>
    ({ id, name: id, registration_id: null, district_id, district: district_id === SATARA ? 'Satara' : district_id ? 'Pune' : null, centre: null, can_batch: true }) as Applicant;
  const rules: BatchRules = { size: 3, sizes: { [SATARA]: 2 }, districtRequired: true };
  const satara = [1, 2, 3].map((i) => student(`s${i}`, SATARA));
  const pune = [1, 2, 3, 4].map((i) => student(`p${i}`, PUNE));
  const none = [1, 2, 3, 4].map((i) => student(`n${i}`, null));

  it('are as many as the district’s own size, else the default', () => {
    expect(sizeFor([], rules)).toBe(3);
    expect(sizeFor([satara[0]!], rules)).toBe(2);
    expect(sizeFor([pune[0]!], rules)).toBe(3);
    expect(sizeFor([], { size: null, sizes: {} })).toBeNull();
    const two = addPicks(satara, [], rules);
    expect(two.map((p) => p.id)).toEqual(['s1', 's2']);
    expect(isBatch(two, rules)).toBe(true);
    expect(pickBlocked(satara[2]!, two, rules)).toEqual({ reason: '2 of 2 are selected', show: false });
    const three = addPicks(pune, [], rules);
    expect([three.length, isBatch(three, rules), isBatch(three.slice(0, 2), rules)]).toEqual([3, true, false]);
  });

  it('without a district: any size there is, as the centre’s district decides; with one, that district’s', () => {
    const open = { ...rules, districtRequired: false };
    const all = addPicks(none, [], open);
    expect(all).toHaveLength(3);
    expect([1, 2, 3].map((n) => isBatch(all.slice(0, n), open))).toEqual([false, true, true]);
    /* Two of Satara are full, whoever they are. */
    expect(pickBlocked(satara[0]!, all.slice(0, 2), open)).toEqual({ reason: '2 of 2 are selected', show: false });
    expect(pickBlocked(satara[0]!, all.slice(0, 1), open)).toBeNull();
    expect(isBatch([all[0]!, toPick(satara[0]!)], open)).toBe(true);
  });
});

describe('whether Sarthi has a batch', () => {
  it('in the list and on its page: sent, with when', async () => {
    mockApi();
    renderAt('/manage/batches');
    expect(await screen.findByText(/^Sent to Sarthi · /)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /to Sarthi again/ })).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Pune Batch 1/ })).toHaveTextContent('Divisional Officer 1 · Super Admin 1');
  });

  it('not sent: why, and try again', async () => {
    let batches: Batch[] = [{ ...BATCH, sync: { status: 'FAILED', error: 'DISTRICT_UNKNOWN: Pune is not in the District Master', sent_at: null } }];
    const opts: Opts = {
      get batches() {
        return batches;
      },
    };
    const calls = mockApi(opts);
    renderAt('/manage/batches/b1');
    expect(await screen.findByText('Not sent to Sarthi')).toHaveClass('do-REJECTED');
    expect(screen.getByText('DISTRICT_UNKNOWN: Pune is not in the District Master')).toBeInTheDocument();
    batches = [{ ...BATCH, sync: { status: 'WAITING', error: null, sent_at: null } }];
    await userEvent.click(screen.getByRole('button', { name: 'Send Pune Batch 1 to Sarthi again' }));
    expect(await screen.findByText('Waiting to be sent to Sarthi')).toHaveClass('do-PENDING');
    expect(writes(calls)).toEqual([['POST', '/manage/link/retry', { batch_id: 'b1' }]]);
  });

  it('a viewer does not try again; an older API says nothing', async () => {
    mockApi({ role: 'VIEWER', batches: [{ ...BATCH, sync: { status: 'WAITING', error: null, sent_at: null } }, { ...BATCH, id: 'b2', name: 'Old', sync: undefined }] });
    renderAt('/manage/batches');
    expect(await screen.findAllByText(/to be sent to Sarthi|to Sarthi/)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /to Sarthi again/ })).not.toBeInTheDocument();
  });
});

describe('Settings: Sarthi connection', () => {
  it('shows whether it is on, and what is not sent and why', async () => {
    mockApi();
    renderAt('/manage/settings');
    const card = await section('Sarthi connection');
    expect(await within(card).findByText('On')).toBeInTheDocument();
    expect(card).toHaveTextContent('sarthi.example.org');
    const [batch, student] = within(card).getAllByRole('row').slice(1);
    expect(batch).toHaveTextContent('New batch');
    expect(batch).toHaveTextContent('Not sentDISTRICT_UNKNOWN: Pune is not in the District Master');
    expect(student).toHaveTextContent('Form or documents corrected');
    expect(student).toHaveTextContent(/WaitingSarthi could not be reachedTried 2 times; next at /);
    expect(within(student!).getByRole('link', { name: 'Asha Kulkarni' })).toHaveAttribute('href', '/manage/applicants/s1');
    expect(within(batch!).getByRole('link', { name: 'Pune Batch 1' })).toHaveAttribute('href', '/manage/batches/b1');
  });

  it('tries one again, or all, and tests the connection', async () => {
    const calls = mockApi();
    renderAt('/manage/settings');
    const card = await section('Sarthi connection');
    await userEvent.click(await within(card).findByRole('button', { name: 'Retry: New batch, Pune Batch 1' }));
    expect(await within(card).findByText('1 message(s) will be sent again')).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Retry all' }));
    await waitFor(() => expect(writes(calls)).toHaveLength(2));
    await waitFor(() => expect(within(card).getByRole('button', { name: 'Test connection' })).toBeEnabled());
    await userEvent.click(within(card).getByRole('button', { name: 'Test connection' }));
    expect(await within(card).findByText('Sarthi could not be reached', { selector: '.notice *, .notice' })).toBeInTheDocument();
    expect(writes(calls)).toEqual([
      ['POST', '/manage/link/retry', { ids: ['m1'] }],
      ['POST', '/manage/link/retry', {}],
      ['POST', '/manage/link/test', {}],
    ]);
  });

  it.each([
    [{ enabled: false }, 'Off'],
    [{ configured: false, host: null }, 'Not set up'],
  ])('%j: %s', async (over, text) => {
    mockApi({ link: () => json(200, { data: { ...LINK, ...over, pending: 0, failed: 0, items: [] } }) });
    renderAt('/manage/settings');
    const card = await section('Sarthi connection');
    expect(await within(card).findByText(text)).toBeInTheDocument();
    expect(within(card).queryByRole('table')).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Retry all' })).not.toBeInTheDocument();
  });

  it('a viewer sees it and changes nothing', async () => {
    mockApi({ role: 'VIEWER' });
    renderAt('/manage/settings');
    const card = await section('Sarthi connection');
    await within(card).findByText('On');
    expect(within(card).getAllByRole('button').map((b) => b.textContent)).toEqual(['Refresh']);
  });

  it('an error is said; an older API has no such card', async () => {
    mockApi({ link: () => json(500, { message: 'Something went wrong. Please try again.' }) });
    const { unmount } = renderAt('/manage/settings');
    expect(await within(await section('Sarthi connection')).findByText('Something went wrong. Please try again.')).toBeInTheDocument();
    unmount();
    vi.restoreAllMocks();
    mockApi({ link: () => json(404, { message: 'Route not found' }) });
    renderAt('/manage/settings');
    await section('Batch size');
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Sarthi connection' })).not.toBeInTheDocument());
  });
});

describe('what comes back', () => {
  const at = '2026-11-25T09:00:00Z';
  const event = (over: Partial<ApprovalEvent>): ApprovalEvent => ({
    action: 'APPROVE',
    from: { stage: 'DIVISION', name: 'Divisional Officer' },
    to: { stage: 'COEP', name: 'COEP' },
    reason: null,
    by: 'Officer One',
    role: 'Divisional Officer',
    at,
    ...over,
  });

  it('the history: officers with their roles, and a change of hands', () => {
    render(
      <ApprovalHistory
        events={[
          event({ action: 'MOVE', from: { stage: 'HEAD_OFFICE', name: 'Head Office' }, to: { stage: 'ADMIN', name: 'Super Admin' }, by: 'Super One', role: 'Super Admin' }),
          event({ action: 'REJECT', from: { stage: 'COEP', name: 'COEP' }, to: { stage: 'DIVISION', name: 'Divisional Officer' }, reason: 'Marks', by: 'Coep One', role: 'COEP' }),
          event({}),
          event({ from: { stage: 'BATCH', name: 'Batch' }, to: { stage: 'DIVISION', name: 'Divisional Officer' }, by: 'Program Auditor', role: null }),
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items[0]).toMatch(/^Moved from Head Officeto Super Admin.* · Super One \(Super Admin\)$/);
    expect(items[1]).toMatch(/^Rejected by COEPsent back to Divisional Officer.* · Coep One \(COEP\)Reason: Marks$/);
    expect(items[2]).toMatch(/^Approved by Divisional Officersent to COEP.* · Officer One \(Divisional Officer\)$/);
    expect(items[3]).toMatch(/^Put into a batchsent to Divisional Officer.* · Program Auditor$/);
  });

  it('the stage cell and the places of a batch name the Super Admin', () => {
    render(
      <MemoryRouter>
        <ApprovalStageCell
          approval={{
            stage: 'ADMIN',
            stage_label: 'With Super Admin (final approval)',
            stage_updated_at: at,
            approved_at: at,
            approved_by: 'Program Auditor',
            last_event: event({ action: 'MOVE', from: { stage: 'HEAD_OFFICE', name: 'Head Office' }, to: { stage: 'ADMIN', name: 'Super Admin' }, by: 'Super One' }),
            register_id: null,
            batch: { id: 'b1', name: 'Pune Batch 1' },
          }}
          waiting
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('With Super Admin (final approval)')).toBeInTheDocument();
    expect(screen.getByText(/^Moved from Head Office \(Super One\) · /)).toBeInTheDocument();
    expect(batchPlaces(BATCH)).toBe('Divisional Officer 1 · Super Admin 1');
  });
});
