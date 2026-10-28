import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CentreDetailPage from '../src/pages/manage/CentreDetailPage';
import CentreFormPage from '../src/pages/manage/CentreFormPage';
import CentresPage from '../src/pages/manage/CentresPage';
import { SessionProvider } from '../src/session';
import type { Centre } from '../src/types';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

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
  talukaId: null,
  talukaName: null,
  talukaCode: null,
  talukaIsActive: null,
  address: null,
  pinCode: null,
  contactPerson: null,
  contactNumber: null,
  email: null,
  technologies: [
    { code: 'T03', name: 'Web Design & Development', usable: true },
    { code: 'T11', name: 'Retired Track', usable: false },
  ],
  isActive: true,
  createdAt: '2026-10-24T11:30:00Z',
  updatedAt: '2026-10-24T11:30:00Z',
  ...over,
});

function mockApi(opts: { create?: (body: unknown) => Response } = {}) {
  let row = centre();
  const calls: { method: string; url: string; body: unknown; auth: string | null }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body, auth: (init?.headers as Record<string, string> | undefined)?.Authorization ?? null });
    if (url.endsWith('/manage/me')) return json(200, { data: { id: 'm1', name: 'EDP Admin', email: 'edp.admin@example.com', role: 'ADMIN' } });
    if (url.includes('/manage/centres?') || (url.endsWith('/manage/centres') && method === 'GET'))
      return json(200, { data: [row], meta: { page: 1, limit: 25, total: 1, totalPages: 1 } });
    if (url.endsWith('/manage/centres') && method === 'POST') return opts.create ? opts.create(body) : json(201, { data: centre({ id: 'c2' }) });
    if (url.endsWith('/manage/centres/c1/status')) {
      row = { ...row, isActive: (body as { isActive: boolean }).isActive };
      return json(200, { data: row });
    }
    if (url.endsWith('/manage/centres/c1')) return json(200, { data: row });
    if (url.endsWith('/manage/technology-options'))
      return json(200, { data: [{ code: 'T03', name: 'Web Design & Development' }, { code: 'T05', name: 'Cyber Security' }] });
    if (url.endsWith('/geography/states')) return json(200, { data: [{ id: 's1', code: 'MH', name: 'Maharashtra' }] });
    if (url.endsWith('/geography/states/s1/districts')) return json(200, { data: [{ id: 'd1', code: 'PUN', name: 'Pune' }] });
    if (url.endsWith('/geography/districts/d1/talukas')) return json(200, { data: [{ id: 't1', code: 'HVL', name: 'Haveli' }] });
    return json(404, { message: 'not mocked' });
  });
  return calls;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <Routes>
          <Route path="/manage/centres" element={<CentresPage />} />
          <Route path="/manage/centres/new" element={<CentreFormPage />} />
          <Route path="/manage/centres/:id" element={<CentreDetailPage />} />
          <Route path="/manage/centres/:id/edit" element={<CentreFormPage />} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.setItem('edp.manage.token', 'manage-token');
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Center Master (tracking panel)', () => {
  it('lists centres with the manage token and deactivates one after confirming', async () => {
    const calls = mockApi();
    renderAt('/manage/centres');
    const row = await screen.findByRole('row', { name: /Baramati Centre/ });
    expect(row).toHaveTextContent('PUN-01');
    expect(row).toHaveTextContent('Web Design & Development, Retired Track (inactive)');
    expect(screen.getByRole('link', { name: 'Center Master' })).toHaveAttribute('href', '/manage/centres');
    expect(calls.find((c) => c.url.includes('/manage/centres?'))!.auth).toBe('Bearer manage-token');

    await userEvent.click(await within(row).findByRole('button', { name: 'Deactivate Baramati Centre' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Deactivate Baramati Centre?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, deactivate' }));
    await waitFor(() => expect(screen.getByRole('row', { name: /Baramati Centre/ })).toHaveTextContent('Inactive'));
    expect(calls.find((c) => c.url.endsWith('/status'))!.body).toEqual({ isActive: false });
  });

  it('filters by status', async () => {
    const calls = mockApi();
    renderAt('/manage/centres');
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Filter by status' }), 'false');
    await waitFor(() => expect(calls.some((c) => c.url.includes('isActive=false'))).toBe(true));
  });

  it('creates a centre through the state → district cascade, and shows field errors from the server', async () => {
    const calls = mockApi({
      create: () => json(422, { message: 'Validation failed', error: { code: 'VALIDATION_ERROR', details: [{ field: 'body.name', message: 'A center with this name already exists in the district' }] } }),
    });
    renderAt('/manage/centres/new');
    await userEvent.type(await screen.findByLabelText(/^Center Name/), 'Baramati Centre');
    await userEvent.type(screen.getByLabelText(/^Code/), 'pun-02');
    expect(screen.getByLabelText(/^Code/)).toHaveValue('PUN-02');
    const district = screen.getByLabelText(/^District/);
    expect(district).toBeDisabled();
    await waitFor(() => expect(screen.getByLabelText(/^State/)).toBeEnabled());
    await userEvent.selectOptions(screen.getByLabelText(/^State/), 's1');
    await waitFor(() => expect(district).toBeEnabled());
    await userEvent.selectOptions(district, 'd1');
    await userEvent.click(await screen.findByRole('checkbox', { name: /Cyber Security/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Create center' }));

    expect(await screen.findByText('A center with this name already exists in the district')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      name: 'Baramati Centre',
      code: 'PUN-02',
      stateId: 's1',
      districtId: 'd1',
      technologyCodes: ['T05'],
      isActive: true,
    });
  });

  it('edits a centre: keeps the allocation unless it changes, marks inactive technologies', async () => {
    const calls = mockApi();
    renderAt('/manage/centres/c1/edit');
    expect(await screen.findByRole('checkbox', { name: /Retired Track.*\(inactive\)/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Web Design & Development/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Cyber Security/ })).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('heading', { name: 'Baramati Centre' });
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.url).toMatch(/\/manage\/centres\/c1$/);
    expect(patch.body).not.toHaveProperty('technologyCodes');
    expect(patch.body).not.toHaveProperty('isActive');
  });
});
