import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { ManageRole, MasterDistrict, MasterState, MasterTaluka } from '../src/types';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const VIEW_ONLY = 'View only: your account can see the masters but not change them.';

const STATES: MasterState[] = [
  { id: 's2', name: 'Goa', code: 'GA', districts: 0, is_active: false, in_use: false },
  { id: 's1', name: 'Maharashtra', code: 'MH', districts: 36, is_active: true, in_use: true },
];
const DISTRICTS: MasterDistrict[] = [
  { id: 'nashik', name: 'Nashik', code: 'MH-NSK', state_id: 's1', state: 'Maharashtra', talukas: 15, is_active: false, in_use: false },
  { id: 'pune', name: 'Pune', code: 'MH-PUN', state_id: 's1', state: 'Maharashtra', talukas: 14, is_active: true, in_use: true },
  { id: 'satara', name: 'Satara', code: 'MH-SAT', state_id: 's1', state: 'Maharashtra', talukas: 0, is_active: true, in_use: false },
];
const TALUKAS: MasterTaluka[] = [
  { id: 't1', name: 'Baramati', code: 'BRM', district_id: 'pune', district: 'Pune', is_active: true, in_use: true },
  { id: 't2', name: 'Haveli', code: null, district_id: 'pune', district: 'Pune', is_active: false, in_use: false },
  { id: 't3', name: 'Igatpuri', code: 'IGT', district_id: 'nashik', district: 'Nashik', is_active: true, in_use: false },
];

interface Opts {
  role?: ManageRole;
  states?: () => Response;
  districts?: () => Response;
  talukas?: (query: URLSearchParams) => Response;
  /* Answers a write; undefined = done. */
  write?: (method: string, path: string, body: unknown) => Response | undefined;
}
function mockApi(opts: Opts = {}) {
  const calls: { method: string; path: string; query: URLSearchParams; body: unknown; auth: string | null }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://x');
    const path = url.pathname.replace(/^.*\/edp/, '');
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, query: url.searchParams, body, auth: (init?.headers as Record<string, string> | undefined)?.Authorization ?? null });
    if (path === '/manage/me') return json(200, { data: { id: 'm1', name: 'Program Auditor', email: 'a@example.com', role: opts.role ?? 'ADMIN' } });
    if (method !== 'GET') return opts.write?.(method, path, body) ?? json(method === 'POST' ? 201 : 200, { data: {} });
    if (path === '/manage/states') return opts.states?.() ?? json(200, { data: STATES });
    if (path === '/manage/districts') return opts.districts?.() ?? json(200, { data: DISTRICTS });
    if (path === '/manage/talukas')
      return opts.talukas?.(url.searchParams) ?? json(200, { data: TALUKAS, meta: { page: 1, limit: 25, total: TALUKAS.length, totalPages: 1 } });
    return json(404, { message: 'not mocked' });
  });
  return calls;
}
type Calls = ReturnType<typeof mockApi>;
const writes = (calls: Calls) => calls.filter((c) => c.method !== 'GET').map((c) => [c.method, c.path, c.body]);
const reads = (calls: Calls, path: string) => calls.filter((c) => c.method === 'GET' && c.path === path);
const asked = (calls: Calls) => Object.fromEntries(reads(calls, '/manage/talukas').slice(-1)[0]!.query);

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
const row = (name: RegExp) => screen.getByRole('row', { name });
const cells = (r: HTMLElement) => within(r).getAllByRole('cell').map((c) => c.textContent?.replace(/\s+/g, ' ').trim());
const headings = () => screen.getAllByRole('columnheader').map((h) => h.textContent);
const optionsOf = (select: HTMLElement) => [...(select as HTMLSelectElement).options].map((o) => o.text);

beforeEach(() => {
  localStorage.setItem('edp.manage.token', 'manage-token');
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Masters: states', () => {
  it('lists the states with their districts, and searches them in the browser', async () => {
    const calls = mockApi();
    renderAt('/manage/masters/states');
    expect(await screen.findByText('Maharashtra')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'States' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'States' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Masters' })).toHaveClass('active');
    expect(headings()).toEqual(['#', 'Name', 'Code', 'Districts', 'Status', 'Used', 'Actions']);
    expect(cells(row(/Goa/)).slice(0, 6)).toEqual(['1', 'Goa', 'GA', '0', 'Inactive', '—']);
    expect(cells(row(/Maharashtra/)).slice(0, 6)).toEqual(['2', 'Maharashtra', 'MH', '36', 'Active', 'In use']);
    expect(screen.getByText('2 states')).toBeInTheDocument();
    expect(reads(calls, '/manage/states')[0]!.auth).toBe('Bearer manage-token');

    const search = screen.getByRole('searchbox', { name: 'Search states' });
    await userEvent.type(search, 'mh');
    expect(screen.queryByText('Goa')).not.toBeInTheDocument();
    expect(screen.getByText('1 state')).toBeInTheDocument();
    await userEvent.clear(search);
    await userEvent.type(search, 'goa');
    expect(screen.queryByText('Maharashtra')).not.toBeInTheDocument();
    await userEvent.type(search, 'x');
    expect(screen.getByText('No states match.')).toBeInTheDocument();
    expect(reads(calls, '/manage/states')).toHaveLength(1);
  });

  it('adds a state: checked first, the code in capitals, a duplicate shown at once', async () => {
    let answer: Response | undefined = json(409, { message: 'A state with this name already exists' });
    const calls = mockApi({ write: () => answer });
    renderAt('/manage/masters/states');
    await userEvent.click(await screen.findByRole('button', { name: '+ Add state' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a state' });
    const name = within(dialog).getByLabelText(/^Name/);
    const code = within(dialog).getByLabelText(/^Code/);
    expect(name).toHaveFocus();
    expect(name).toHaveAttribute('maxlength', '100');
    expect(code).toHaveAttribute('maxlength', '10');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(within(dialog).getByText('Name is required')).toBeInTheDocument();
    expect(within(dialog).getByText('Code is required')).toBeInTheDocument();
    await userEvent.type(name, ' Gujarat ');
    for (const wrong of ['g', '1g', 'g-j']) {
      await userEvent.clear(code);
      await userEvent.type(code, wrong);
      await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
      expect(within(dialog).getByText('Code: 2–10 characters, A–Z and 0–9, starting with a letter')).toBeInTheDocument();
    }
    expect(writes(calls)).toEqual([]);
    await userEvent.clear(code);
    await userEvent.type(code, 'gj');
    expect(code).toHaveValue('GJ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await within(dialog).findByText('A state with this name already exists')).toBeInTheDocument();
    answer = undefined;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('State Gujarat added.')).toBeInTheDocument();
    expect(writes(calls)[1]).toEqual(['POST', '/manage/states', { name: 'Gujarat', code: 'GJ' }]);
    expect(reads(calls, '/manage/states')).toHaveLength(2);
  });

  it('edits a state (only what changed is sent) and switches it on and off', async () => {
    const calls = mockApi();
    renderAt('/manage/masters/states');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Goa' }));
    let dialog = screen.getByRole('dialog', { name: 'Edit Goa' });
    const code = within(dialog).getByLabelText(/^Code/);
    expect(code).toHaveValue('GA');
    await userEvent.clear(code);
    await userEvent.type(code, 'goa');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('State Goa saved.')).toBeInTheDocument();
    /* Nothing changed: nothing is sent. */
    await userEvent.click(screen.getByRole('button', { name: 'Edit Maharashtra' }));
    dialog = screen.getByRole('dialog', { name: 'Edit Maharashtra' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('State Maharashtra saved.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('switch', { name: 'Goa: active' }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Goa: active' })).toHaveAttribute('aria-checked', 'true'));
    expect(writes(calls)).toEqual([
      ['PATCH', '/manage/states/s2', { code: 'GOA' }],
      ['PATCH', '/manage/states/s2', { is_active: true }],
    ]);
  });

  it('deletes a state after asking, and says why when the API refuses', async () => {
    const refusal = 'This state cannot be deleted while 36 districts reference it. Deactivate it instead, or move or delete the districts first.';
    const calls = mockApi({ write: (_m, path) => (path.endsWith('/s1') ? json(409, { message: refusal }) : undefined) });
    renderAt('/manage/masters/states');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Maharashtra' }));
    let ask = screen.getByRole('alertdialog', { name: 'Delete Maharashtra?' });
    expect(ask).toHaveTextContent('It is no longer offered. A state that has districts cannot be deleted; switch it off instead.');
    await userEvent.click(within(ask).getByRole('button', { name: 'Yes, delete' }));
    expect(await within(ask).findByText(refusal)).toBeInTheDocument();
    await userEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete Goa' }));
    ask = screen.getByRole('alertdialog', { name: 'Delete Goa?' });
    await userEvent.click(within(ask).getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByText('State Goa deleted.')).toBeInTheDocument();
    expect(writes(calls)).toEqual([
      ['DELETE', '/manage/states/s1', undefined],
      ['DELETE', '/manage/states/s2', undefined],
    ]);
  });

  it('shows why a switch was refused, and why the list could not be loaded', async () => {
    let list: Response | undefined;
    mockApi({ states: () => list ?? json(200, { data: STATES }), write: () => json(403, { message: 'Your account can only view.' }) });
    const { unmount } = renderAt('/manage/masters/states');
    await userEvent.click(await screen.findByRole('switch', { name: 'Maharashtra: active' }));
    expect(await screen.findByText('Your account can only view.')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Maharashtra: active' })).toHaveAttribute('aria-checked', 'true');
    unmount();
    list = json(500, { message: 'Something went wrong' });
    renderAt('/manage/masters/states');
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('says so when there is no state yet', async () => {
    mockApi({ states: () => json(200, { data: [] }) });
    renderAt('/manage/masters/states');
    expect(await screen.findByText('No states yet.')).toBeInTheDocument();
  });
});

describe('Masters: talukas', () => {
  /* 30 talukas of Pune on two pages. */
  const many = (query: URLSearchParams) => {
    const page = Number(query.get('page'));
    const all = Array.from({ length: 30 }, (_x, i) => ({ ...TALUKAS[1]!, id: `p${i + 1}`, name: `Taluka ${i + 1}` }));
    return json(200, { data: all.slice((page - 1) * 25, page * 25), meta: { page, limit: 25, total: 30, totalPages: 2 } });
  };

  it('lists the talukas with their district; search, district and status are asked from the server', async () => {
    const calls = mockApi();
    renderAt('/manage/masters/talukas');
    expect(await screen.findByText('Baramati')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Talukas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Talukas' })).toHaveClass('active');
    expect(headings()).toEqual(['#', 'Name', 'Code', 'District', 'Status', 'Used', 'Actions']);
    expect(cells(row(/Baramati/)).slice(0, 6)).toEqual(['1', 'Baramati', 'BRM', 'Pune', 'Active', 'In use']);
    expect(cells(row(/Haveli/)).slice(0, 6)).toEqual(['2', 'Haveli', '—', 'Pune', 'Inactive', '—']);
    expect(screen.getByText('3 talukas')).toBeInTheDocument();
    expect(asked(calls)).toEqual({ page: '1', limit: '25' });

    /* Every district, also a switched-off one. */
    const district = screen.getByRole('combobox', { name: 'Filter by district' });
    await waitFor(() => expect(optionsOf(district)).toEqual(['All districts', 'Nashik (inactive)', 'Pune', 'Satara']));
    await userEvent.selectOptions(district, 'pune');
    await waitFor(() => expect(asked(calls)).toEqual({ page: '1', limit: '25', district_id: 'pune' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'INACTIVE');
    await waitFor(() => expect(asked(calls)).toEqual({ page: '1', limit: '25', status: 'INACTIVE', district_id: 'pune' }));

    /* Once typing stops: one request, not one per letter. */
    const before = reads(calls, '/manage/talukas').length;
    for (const value of ['h', 'ha', ' hav ']) fireEvent.change(screen.getByRole('searchbox', { name: 'Search talukas' }), { target: { value } });
    await waitFor(() => expect(asked(calls)).toEqual({ page: '1', limit: '25', search: 'hav', status: 'INACTIVE', district_id: 'pune' }));
    expect(reads(calls, '/manage/talukas')).toHaveLength(before + 1);
  });

  it('shows 25 a page; a filter goes back to the first page', async () => {
    const calls = mockApi({ talukas: many });
    renderAt('/manage/masters/talukas');
    expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(26);
    expect(screen.getByRole('button', { name: '← Previous' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next →' }));
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
    expect(cells(row(/Taluka 26/)).slice(0, 2)).toEqual(['26', 'Taluka 26']);
    expect(screen.getByRole('button', { name: 'Next →' })).toBeDisabled();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'ACTIVE');
    expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument();
    expect(asked(calls)).toEqual({ page: '1', limit: '25', status: 'ACTIVE' });
  });

  it('goes to the last page when the open one became empty', async () => {
    let pages = 2;
    const calls = mockApi({
      talukas: (query) => {
        const page = Number(query.get('page'));
        return json(200, {
          data: page > pages ? [] : [{ ...TALUKAS[1]!, id: `p${page}`, name: `On page ${page}` }],
          meta: { page, limit: 25, total: pages, totalPages: pages },
        });
      },
      write: () => {
        pages = 1;
        return undefined;
      },
    });
    renderAt('/manage/masters/talukas');
    await userEvent.click(await screen.findByRole('button', { name: 'Next →' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Delete On page 2' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByText('On page 1')).toBeInTheDocument();
    expect(asked(calls).page).toBe('1');
  });

  it('adds a taluka to an active district; the code may be left blank', async () => {
    const calls = mockApi();
    renderAt('/manage/masters/talukas');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Filter by district' })).toHaveTextContent('Pune'));
    await userEvent.click(screen.getByRole('button', { name: '+ Add taluka' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a taluka' });
    const district = within(dialog).getByLabelText(/^District/);
    const name = within(dialog).getByLabelText(/^Name/);
    const code = within(dialog).getByLabelText(/^Code/);
    expect(optionsOf(district)).toEqual(['Select district', 'Pune', 'Satara']);
    expect(name).toHaveAttribute('maxlength', '100');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(within(dialog).getByText('District is required')).toBeInTheDocument();
    expect(within(dialog).getByText('Name is required')).toBeInTheDocument();
    await userEvent.type(name, 'P');
    await userEvent.type(code, '1p');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(within(dialog).getByText('Name must be 2–100 characters')).toBeInTheDocument();
    expect(within(dialog).getByText('Code: 2–20 characters, A–Z, 0–9 and hyphen, starting with a letter')).toBeInTheDocument();
    expect(writes(calls)).toEqual([]);

    await userEvent.selectOptions(district, 'satara');
    await userEvent.type(name, 'atan ');
    await userEvent.clear(code);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Taluka Patan added.')).toBeInTheDocument();

    /* A new one starts in the district the list is filtered by. */
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by district' }), 'pune');
    await userEvent.click(screen.getByRole('button', { name: '+ Add taluka' }));
    const second = screen.getByRole('dialog', { name: 'Add a taluka' });
    expect(within(second).getByLabelText(/^District/)).toHaveValue('pune');
    await userEvent.type(within(second).getByLabelText(/^Name/), 'Mulshi');
    await userEvent.type(within(second).getByLabelText(/^Code/), 'mul-1');
    await userEvent.click(within(second).getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Taluka Mulshi added.')).toBeInTheDocument();
    expect(writes(calls)).toEqual([
      ['POST', '/manage/talukas', { district_id: 'satara', name: 'Patan' }],
      ['POST', '/manage/talukas', { district_id: 'pune', name: 'Mulshi', code: 'MUL-1' }],
    ]);
  });

  it('shows what the API refuses at its field, or on top', async () => {
    let answer = json(400, { message: 'The selected district is inactive', error: { code: 'BAD_REQUEST', details: [{ field: 'district_id', message: 'The selected district is inactive' }] } });
    mockApi({ write: () => answer });
    renderAt('/manage/masters/talukas');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Filter by district' })).toHaveTextContent('Pune'));
    await userEvent.click(screen.getByRole('button', { name: '+ Add taluka' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a taluka' });
    await userEvent.selectOptions(within(dialog).getByLabelText(/^District/), 'satara');
    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'Patan');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await within(dialog).findByText('The selected district is inactive', { selector: '.err' })).toBeInTheDocument();

    answer = json(409, { message: 'A taluka with this name already exists in the selected district' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await within(dialog).findByText('A taluka with this name already exists in the selected district')).toBeInTheDocument();
  });

  it('edits a taluka: only what changed; the district is fixed while a center uses it', async () => {
    const calls = mockApi();
    renderAt('/manage/masters/talukas');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Filter by district' })).toHaveTextContent('Pune'));
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Baramati' }));
    let dialog = screen.getByRole('dialog', { name: 'Edit Baramati' });
    expect(within(dialog).getByLabelText(/^District/)).toBeDisabled();
    expect(within(dialog).getByText('A taluka that is in use cannot be moved to another district.')).toBeInTheDocument();
    await userEvent.clear(within(dialog).getByLabelText(/^Code/));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Taluka Baramati saved.')).toBeInTheDocument();

    /* Its own district is inactive: still shown as chosen. */
    await userEvent.click(screen.getByRole('button', { name: 'Edit Igatpuri' }));
    dialog = screen.getByRole('dialog', { name: 'Edit Igatpuri' });
    const district = within(dialog).getByLabelText(/^District/);
    expect(district).toHaveValue('nashik');
    expect(optionsOf(district)).toEqual(['Pune', 'Satara', 'Nashik (inactive)']);
    await userEvent.selectOptions(district, 'pune');
    await userEvent.type(within(dialog).getByLabelText(/^Name/), ' Road');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Taluka Igatpuri Road saved.')).toBeInTheDocument();
    /* Nothing changed: nothing is sent. */
    await userEvent.click(screen.getByRole('button', { name: 'Edit Haveli' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Edit Haveli' })).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Taluka Haveli saved.')).toBeInTheDocument();
    expect(writes(calls)).toEqual([
      ['PATCH', '/manage/talukas/t1', { code: null }],
      ['PATCH', '/manage/talukas/t3', { district_id: 'pune', name: 'Igatpuri Road' }],
    ]);
  });

  it('switches a taluka on and off, and deletes one after asking; a refusal is shown', async () => {
    const refusal = 'This taluka cannot be deleted while 2 centers reference it. Deactivate it instead, or remove those records first.';
    const calls = mockApi({ write: (method, path) => (method === 'DELETE' && path.endsWith('/t1') ? json(409, { message: refusal }) : undefined) });
    renderAt('/manage/masters/talukas');
    await userEvent.click(await screen.findByRole('switch', { name: 'Haveli: active' }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Haveli: active' })).toHaveAttribute('aria-checked', 'true'));

    await userEvent.click(screen.getByRole('button', { name: 'Delete Baramati' }));
    let ask = screen.getByRole('alertdialog', { name: 'Delete Baramati?' });
    expect(ask).toHaveTextContent('It is no longer offered. A taluka that a center uses cannot be deleted; switch it off instead.');
    await userEvent.click(within(ask).getByRole('button', { name: 'Yes, delete' }));
    expect(await within(ask).findByText(refusal)).toBeInTheDocument();
    await userEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));

    await userEvent.click(screen.getByRole('button', { name: 'Delete Igatpuri' }));
    ask = screen.getByRole('alertdialog', { name: 'Delete Igatpuri?' });
    await userEvent.click(within(ask).getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByText('Taluka Igatpuri deleted.')).toBeInTheDocument();
    expect(writes(calls)).toEqual([
      ['PATCH', '/manage/talukas/t2', { is_active: true }],
      ['DELETE', '/manage/talukas/t1', undefined],
      ['DELETE', '/manage/talukas/t3', undefined],
    ]);
  });

  it('says so when there are none, when nothing matches, and when something could not be loaded', async () => {
    const none = json(200, { data: [], meta: { page: 1, limit: 25, total: 0, totalPages: 1 } });
    let answer = () => none.clone();
    mockApi({ talukas: () => answer(), districts: () => json(500, { message: 'Server error' }) });
    renderAt('/manage/masters/talukas');
    expect(await screen.findByText('No talukas yet.')).toBeInTheDocument();
    expect(screen.getByText('0 talukas')).toBeInTheDocument();
    expect(screen.getByText('Could not load the districts.')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'ACTIVE');
    expect(await screen.findByText('No talukas match.')).toBeInTheDocument();
    answer = () => json(500, { message: 'Something went wrong' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), '');
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
  });
});

describe('States and talukas: a view-only account', () => {
  it.each([
    ['/manage/masters/states', 'Maharashtra'],
    ['/manage/masters/talukas', 'Baramati'],
  ])('sees %s read-only', async (path, text) => {
    const calls = mockApi({ role: 'VIEWER' });
    renderAt(path);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByText(VIEW_ONLY)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add|Edit|Delete|Save/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
    expect(within(row(new RegExp(text))).getByText('Active')).toHaveClass('badge');
    expect(writes(calls)).toEqual([]);
  });

  it('is not shown to someone who is not signed in', async () => {
    localStorage.clear();
    mockApi();
    renderAt('/manage/masters/states');
    expect(await screen.findByRole('button', { name: /Sign in|Login|Log in/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'States' })).not.toBeInTheDocument();
  });
});
