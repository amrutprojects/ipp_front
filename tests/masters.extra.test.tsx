import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { GeoRef, ManageRole, MasterDistrict, MasterOption } from '../src/types';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const VIEW_ONLY = 'View only: your account can see the masters but not change them.';

const option = (over: Partial<MasterOption>): MasterOption => ({
  id: 't1',
  value: 'T01',
  code: 'T01',
  name_en: 'Data Analytics',
  name_mr: null,
  order: 10,
  is_active: true,
  is_system: false,
  in_use: false,
  ...over,
});
const TECHNOLOGIES = [option({}), option({ id: 't3', value: 'T03', code: 'T03', name_en: 'Web Design', order: 20, is_active: false })];
const DISTRICTS: MasterDistrict[] = [
  { id: 'panaji', name: 'Panaji', code: 'GA-PAN', state_id: 's2', state: 'Goa', talukas: 0, is_active: false, in_use: false },
  { id: 'pune', name: 'Pune', code: 'MH-PUN', state_id: 's1', state: 'Maharashtra', talukas: 14, is_active: true, in_use: true },
  { id: 'satara', name: 'Satara', code: 'MH-SAT', state_id: 's1', state: 'Maharashtra', talukas: 1, is_active: true, in_use: false },
];
const MH: GeoRef = { id: 's1', code: 'MH', name: 'Maharashtra' };
const GOA: GeoRef = { id: 's2', code: 'GA', name: 'Goa' };

interface Opts {
  role?: ManageRole;
  districts?: unknown[];
  states?: GeoRef[];
  /* Answers a write; undefined = done. */
  write?: (method: string, path: string, body: unknown) => Response | undefined;
}
function mockApi(opts: Opts = {}) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const path = new URL(String(input), 'http://x').pathname.replace(/^.*\/edp/, '');
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body });
    if (path === '/manage/me') return json(200, { data: { id: 'm1', name: 'Program Auditor', email: 'a@example.com', role: opts.role ?? 'ADMIN' } });
    if (method !== 'GET') return opts.write?.(method, path, body) ?? json(method === 'POST' ? 201 : 200, { data: {} });
    if (path === '/manage/masters')
      return json(200, { data: [{ kind: 'CASTE', name: 'Caste', count: 1, active: 1, can_add: true, can_delete: true, stored_as: 'master' }] });
    if (path === '/manage/masters/CASTE')
      return json(200, { data: [option({ id: 'o1', value: 'o1', code: 'SAR01', name_en: 'Maratha' })], meta: { page: 1, limit: 25, total: 1, totalPages: 1 } });
    if (path === '/manage/masters/TECHNOLOGY') return json(200, { data: TECHNOLOGIES, meta: { page: 1, limit: 25, total: 2, totalPages: 1 } });
    if (path === '/manage/technologies/districts') return json(200, { data: [{ district_id: 'pune', district: 'Pune', all: true, codes: [] }] });
    if (path === '/manage/documents') return json(200, { data: [] });
    if (path === '/manage/districts') return json(200, { data: opts.districts ?? DISTRICTS });
    if (path === '/geography/states') return json(200, { data: opts.states ?? [GOA, MH] });
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
const row = (name: RegExp) => screen.getByRole('row', { name });
const cells = (r: HTMLElement) => within(r).getAllByRole('cell').map((c) => c.textContent?.replace(/\s+/g, ' ').trim());
const optionsOf = (select: HTMLElement) => [...(select as HTMLSelectElement).options].map((o) => o.text);

beforeEach(() => {
  localStorage.setItem('edp.manage.token', 'manage-token');
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Masters: districts with states and talukas', () => {
  it('counts the talukas of each district and filters by status in the browser', async () => {
    const calls = mockApi();
    renderAt('/manage/masters/districts');
    await screen.findByText('Pune');
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['#', 'Name', 'Code', 'State', 'Status', 'Used', 'Talukas', 'Actions']);
    expect(cells(row(/MH-PUN/)).slice(0, 7)).toEqual(['2', 'Pune', 'MH-PUN', 'Maharashtra', 'Active', 'In use', '14']);
    expect(cells(row(/Panaji/)).slice(0, 7)).toEqual(['1', 'Panaji', 'GA-PAN', 'Goa', 'Inactive', '—', '0']);

    const status = screen.getByRole('combobox', { name: 'Filter by status' });
    expect(optionsOf(status)).toEqual(['All statuses', 'Active', 'Inactive']);
    await userEvent.selectOptions(status, 'ACTIVE');
    expect(screen.queryByText('Panaji')).not.toBeInTheDocument();
    expect(screen.getByText('2 districts')).toBeInTheDocument();
    await userEvent.selectOptions(status, 'INACTIVE');
    expect(screen.getByText('1 district')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search districts' }), 'pune');
    expect(screen.getByText('No districts match.')).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/manage/districts')).toHaveLength(1);
  });

  it('moves a district to another state; only what changed is sent, a refusal is shown at the field', async () => {
    let answer: Response | undefined = json(400, {
      message: 'The selected state is inactive',
      error: { code: 'BAD_REQUEST', details: [{ field: 'stateId', message: 'The selected state is inactive' }] },
    });
    const calls = mockApi({ write: () => answer });
    renderAt('/manage/masters/districts');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Satara' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Satara' });
    const state = await within(dialog).findByLabelText(/^State/);
    expect(optionsOf(state)).toEqual(['Goa', 'Maharashtra']);
    expect(state).toHaveValue('s1');
    await userEvent.selectOptions(state, 's2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('The selected state is inactive', { selector: '.err' })).toBeInTheDocument();
    answer = undefined;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('District Satara saved.')).toBeInTheDocument();

    /* Chosen and chosen back: unchanged. */
    await userEvent.click(screen.getByRole('button', { name: 'Edit Pune' }));
    const again = screen.getByRole('dialog', { name: 'Edit Pune' });
    await userEvent.selectOptions(await within(again).findByLabelText(/^State/), 's2');
    await userEvent.selectOptions(within(again).getByLabelText(/^State/), 's1');
    await userEvent.click(within(again).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('District Pune saved.')).toBeInTheDocument();
    expect(writes(calls)).toEqual([
      ['PATCH', '/manage/districts/satara', { state_id: 's2' }],
      ['PATCH', '/manage/districts/satara', { state_id: 's2' }],
    ]);
  });

  it('keeps the own state selectable when it is inactive, and asks no state when there is only one', async () => {
    const calls = mockApi({ states: [MH] });
    renderAt('/manage/masters/districts');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Panaji' }));
    let dialog = screen.getByRole('dialog', { name: 'Edit Panaji' });
    const state = await within(dialog).findByLabelText(/^State/);
    expect(optionsOf(state)).toEqual(['Maharashtra', 'Goa (inactive)']);
    expect(state).toHaveValue('s2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    for (const name of ['Edit Pune', '+ Add district']) {
      const before = calls.filter((c) => c.path === '/geography/states').length;
      await userEvent.click(screen.getByRole('button', { name }));
      dialog = screen.getByRole('dialog');
      await waitFor(() => expect(calls.filter((c) => c.path === '/geography/states').length).toBe(before + 1));
      expect(within(dialog).queryByLabelText(/^State/)).not.toBeInTheDocument();
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    }
  });

  it('shows districts of an older API, without talukas and state ids', async () => {
    const calls = mockApi({ districts: DISTRICTS.map(({ state_id: _id, talukas: _n, ...d }) => d) });
    renderAt('/manage/masters/districts');
    await screen.findByText('Pune');
    expect(cells(row(/MH-PUN/))[6]).toBe('—');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Pune' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Pune' });
    expect(await within(dialog).findByLabelText(/^State/)).toHaveValue('s1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('District Pune saved.')).toBeInTheDocument();
    expect(writes(calls)).toEqual([]);
  });
});

describe('Masters: technologies and limits', () => {
  it('shows the codes of the technologies, and of no other list', async () => {
    mockApi();
    const { unmount } = renderAt('/manage/masters/technologies');
    const section = await screen.findByRole('region', { name: 'Technologies' });
    await within(section).findByText('Data Analytics');
    expect(within(section).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Order',
      'Code',
      'Name (English)',
      'Name (Marathi)',
      'Status',
      'Used',
      'Actions',
    ]);
    expect(cells(row(/Data Analytics/)).slice(0, 3)).toEqual(['10', 'T01', 'Data Analytics']);
    expect(cells(row(/Web Design/)).slice(0, 3)).toEqual(['20', 'T03', 'Web Design']);
    unmount();

    renderAt('/manage/masters/lists/CASTE');
    await screen.findByText('Maratha');
    expect(screen.queryByRole('columnheader', { name: 'Code' })).not.toBeInTheDocument();
    expect(screen.queryByText('SAR01')).not.toBeInTheDocument();
  });

  it.each([
    ['/manage/masters/lists/CASTE', '+ Add', /^Name \(/, '150', 2],
    ['/manage/masters/technologies', '+ Add', /^Name \(/, '150', 2],
    ['/manage/masters/documents', '+ Add document', /^Name \(/, '150', 2],
    ['/manage/masters/districts', '+ Add district', /^Name/, '100', 1],
  ])('names on %s are limited to what the API accepts', async (path, add, label, limit, count) => {
    mockApi();
    renderAt(path);
    await userEvent.click(await screen.findByRole('button', { name: add }));
    const names = within(screen.getByRole('dialog')).getAllByLabelText(label);
    expect(names.map((n) => n.getAttribute('maxlength'))).toEqual(Array(count).fill(limit));
  });
});

describe('Masters: the view-only notice', () => {
  it.each([
    ['/manage/masters/technologies', 'Data Analytics'],
    ['/manage/masters/documents', 'No documents yet.'],
    ['/manage/masters/lists/CASTE', 'Maratha'],
    ['/manage/masters/districts', 'Pune'],
  ])('is on %s for a view-only account only', async (path, text) => {
    mockApi({ role: 'VIEWER' });
    const { unmount } = renderAt(path);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByText(VIEW_ONLY)).toBeInTheDocument();
    unmount();
    vi.restoreAllMocks();
    mockApi();
    renderAt(path);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByText(VIEW_ONLY)).not.toBeInTheDocument();
  });
});
