import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { Centre, ManageRole } from '../src/types';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const NOTE = 'It is no longer offered. A center that students or batches use cannot be deleted; deactivate it instead.';
const REFUSAL = 'This center is used by student applications or registrations. Deactivate it instead.';

const centre = (over: Partial<Centre> = {}): Centre => ({
  id: 'c1',
  name: 'Baramati Centre',
  code: 'PUN-01',
  stateId: 's1',
  stateName: 'Maharashtra',
  stateCode: 'MH',
  stateIsActive: true,
  districtId: 'd1',
  districtName: 'Pune',
  districtCode: 'PUN',
  districtIsActive: true,
  talukaId: 't1',
  talukaName: 'Baramati',
  talukaCode: 'BRM',
  talukaIsActive: true,
  address: null,
  pinCode: null,
  contactPerson: null,
  contactNumber: null,
  email: null,
  technologies: [],
  isActive: true,
  createdAt: '2026-10-24T11:30:00Z',
  updatedAt: '2026-10-24T11:30:00Z',
  ...over,
});

function mockApi(opts: { role?: ManageRole; remove?: (id: string) => Response | undefined; districts?: () => Response } = {}) {
  let rows = [centre(), centre({ id: 'c2', name: 'Satara Centre', code: 'SAT-01', districtId: 'd2', districtName: 'Satara', talukaId: null, talukaName: null })];
  const calls: { method: string; path: string; query: URLSearchParams }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://x');
    const path = url.pathname.replace(/^.*\/edp/, '');
    const method = init?.method ?? 'GET';
    calls.push({ method, path, query: url.searchParams });
    if (path === '/manage/me') return json(200, { data: { id: 'm1', name: 'Program Admin', email: 'admin@example.com', role: opts.role ?? 'ADMIN' } });
    if (path === '/manage/districts')
      return (
        opts.districts?.() ??
        json(200, {
          data: [
            { id: 'd1', name: 'Pune', code: 'PUN', state: 'Maharashtra', is_active: true, in_use: true },
            { id: 'd2', name: 'Satara', code: 'SAT', state: 'Maharashtra', is_active: false, in_use: true },
          ],
        })
      );
    if (path === '/manage/centres' && method === 'GET') {
      const shown = rows.filter((c) => !url.searchParams.get('districtId') || c.districtId === url.searchParams.get('districtId'));
      return json(200, { data: shown, meta: { page: 1, limit: 25, total: shown.length, totalPages: 1 } });
    }
    const id = /^\/manage\/centres\/([^/]+)$/.exec(path)?.[1];
    if (id && method === 'DELETE') {
      const refused = opts.remove?.(id);
      if (refused) return refused;
      rows = rows.filter((c) => c.id !== id);
      return json(200, { data: null });
    }
    if (id) return json(200, { data: rows.find((c) => c.id === id) });
    return json(404, { message: 'not mocked' });
  });
  return calls;
}
const deletes = (calls: ReturnType<typeof mockApi>) => calls.filter((c) => c.method === 'DELETE').map((c) => c.path);

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
const row = (name: RegExp) => screen.getByRole('row', { name });
const cells = (r: HTMLElement) => within(r).getAllByRole('cell').map((c) => c.textContent);

beforeEach(() => {
  localStorage.setItem('edp.manage.token', 'manage-token');
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Center Master: list', () => {
  it('shows the taluka, and says which centers students are offered', async () => {
    mockApi();
    renderAt('/manage/centres');
    await screen.findByRole('row', { name: /Baramati Centre/ });
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['#', 'Name', 'Code', 'District', 'Taluka', 'Status', 'Actions']);
    expect(cells(row(/Baramati Centre/)).slice(0, 6)).toEqual(['1', 'Baramati Centre', 'PUN-01', 'Pune', 'Baramati', 'Active']);
    expect(cells(row(/Satara Centre/)).slice(0, 6)).toEqual(['2', 'Satara Centre', 'SAT-01', 'Satara', '—', 'Active']);
    expect(screen.getByText(/Only active centers are offered to students in the registration form\./)).toBeInTheDocument();
    /* The portal has a database of its own. */
    expect(screen.queryByText(/admin panel/i)).not.toBeInTheDocument();
  });

  it('filters by district, from the first page', async () => {
    const calls = mockApi();
    renderAt('/manage/centres');
    const district = await screen.findByRole('combobox', { name: 'Filter by district' });
    await waitFor(() => expect([...(district as HTMLSelectElement).options].map((o) => o.text)).toEqual(['All districts', 'Pune', 'Satara (inactive)']));
    await userEvent.selectOptions(district, 'd2');
    await waitFor(() => expect(screen.queryByRole('row', { name: /Baramati Centre/ })).not.toBeInTheDocument());
    expect(screen.getByText('1 center')).toBeInTheDocument();
    const last = () => calls.filter((c) => c.path === '/manage/centres').slice(-1)[0]!.query;
    expect(Object.fromEntries(last())).toEqual({ page: '1', limit: '25', districtId: 'd2' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'true');
    await waitFor(() => expect(Object.fromEntries(last())).toEqual({ page: '1', limit: '25', districtId: 'd2', isActive: 'true' }));
    await userEvent.selectOptions(district, '');
    await waitFor(() => expect(last().has('districtId')).toBe(false));
  });

  it('lists the centers when the districts could not be loaded', async () => {
    mockApi({ districts: () => json(500, { message: 'Server error' }) });
    renderAt('/manage/centres');
    expect(await screen.findByRole('row', { name: /Baramati Centre/ })).toBeInTheDocument();
    expect(screen.getByText('Could not load the districts.')).toBeInTheDocument();
  });

  it('deletes a center after asking; one that is in use is refused', async () => {
    const calls = mockApi({ remove: (id) => (id === 'c1' ? json(409, { message: REFUSAL }) : undefined) });
    renderAt('/manage/centres');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Baramati Centre' }));
    let ask = screen.getByRole('alertdialog', { name: 'Delete Baramati Centre?' });
    expect(ask).toHaveTextContent(NOTE);
    expect(deletes(calls)).toEqual([]);
    await userEvent.click(within(ask).getByRole('button', { name: 'Yes, delete' }));
    expect(await within(ask).findByText(REFUSAL)).toBeInTheDocument();
    await userEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(row(/Baramati Centre/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete Satara Centre' }));
    ask = screen.getByRole('alertdialog', { name: 'Delete Satara Centre?' });
    await userEvent.click(within(ask).getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByText('Center Satara Centre deleted.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('row', { name: /Satara Centre/ })).not.toBeInTheDocument());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deletes(calls)).toEqual(['/manage/centres/c1', '/manage/centres/c2']);
  });

  it('a view-only account sees the notice and no buttons that change anything', async () => {
    mockApi({ role: 'VIEWER' });
    renderAt('/manage/centres');
    await screen.findByRole('row', { name: /Baramati Centre/ });
    expect(screen.getByText('View only: your account can see the masters but not change them.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Baramati Centre' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete|Deactivate|Activate/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Edit|Add/ })).not.toBeInTheDocument();
  });

  it('an admin sees no view-only notice', async () => {
    mockApi();
    renderAt('/manage/centres');
    await screen.findByRole('row', { name: /Baramati Centre/ });
    expect(screen.queryByText(/View only/)).not.toBeInTheDocument();
  });
});

describe('Center Master: one center', () => {
  it('deletes the center after asking and goes back to the list', async () => {
    const calls = mockApi();
    renderAt('/manage/centres/c2');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    const ask = screen.getByRole('alertdialog', { name: 'Delete Satara Centre?' });
    expect(ask).toHaveTextContent(NOTE);
    await userEvent.click(within(ask).getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByRole('heading', { name: 'Center Master' })).toBeInTheDocument();
    expect(screen.getByText('Center Satara Centre deleted.')).toBeInTheDocument();
    expect(await screen.findByRole('row', { name: /Baramati Centre/ })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Satara Centre/ })).not.toBeInTheDocument();
    expect(deletes(calls)).toEqual(['/manage/centres/c2']);
  });

  it('stays on the page and says why when the center is in use', async () => {
    mockApi({ remove: () => json(409, { message: REFUSAL }) });
    renderAt('/manage/centres/c1');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    const ask = screen.getByRole('alertdialog', { name: 'Delete Baramati Centre?' });
    await userEvent.click(within(ask).getByRole('button', { name: 'Yes, delete' }));
    expect(await within(ask).findByText(REFUSAL)).toBeInTheDocument();
    await userEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { name: 'Baramati Centre' })).toBeInTheDocument();
  });

  it('a view-only account cannot delete it', async () => {
    mockApi({ role: 'VIEWER' });
    renderAt('/manage/centres/c1');
    expect(await screen.findByRole('heading', { name: 'Baramati Centre' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete|Deactivate/ })).not.toBeInTheDocument();
  });
});
