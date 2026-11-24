import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { Applicant, Centre, FollowUp, ManageRole, ManageUser } from '../src/types';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const VIEW_ONLY = 'Your account can only view. Ask an administrator to make this change.';

const user = (over: Partial<ManageUser> = {}): ManageUser => ({
  id: 'm1',
  name: 'EDP Admin',
  email: 'edp.admin@example.com',
  role: 'ADMIN',
  is_active: true,
  last_login_at: '2026-10-27T09:00:00Z',
  created_at: '2026-10-01T09:00:00Z',
  ...over,
});

const centre: Centre = {
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
  technologies: [{ code: 'T03', name: 'Web Design & Development', usable: true }],
  isActive: true,
  createdAt: '2026-10-24T11:30:00Z',
  updatedAt: '2026-10-24T11:30:00Z',
};

const applicant: Applicant = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Keshav Mahale',
  email: 'keshav@example.com',
  mobile_number: '7767841795',
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
  last_activity_at: '2026-10-24T12:00:00Z',
  follow_up: null,
  can_approve: false,
  approval: null,
};

const history: FollowUp[] = [
  { status: 'CALLED', status_label: 'Follow-up call', note: 'Will upload by Friday', at: '2026-10-24T12:30:00Z', by: 'EDP Admin' },
];

interface Opts {
  role?: ManageRole;
  createUser?: (body: unknown) => Response;
  centreStatus?: () => Response;
}

function mockApi(opts: Opts = {}) {
  const role = opts.role ?? 'ADMIN';
  let users: ManageUser[] = [user(), user({ id: 'm2', name: 'Asha Patil', email: 'asha@example.com', role: 'VIEWER', last_login_at: null })];
  const calls: { method: string; url: string; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    const viewer = role === 'VIEWER';
    if (url.endsWith('/manage/me')) return json(200, { data: { id: 'm1', name: 'EDP Admin', email: 'edp.admin@example.com', role } });
    if (url.endsWith('/manage/users') && method === 'GET') return viewer ? json(403, { message: VIEW_ONLY }) : json(200, { data: users });
    if (url.endsWith('/manage/users') && method === 'POST') {
      if (opts.createUser) return opts.createUser(body);
      const b = body as { name: string; email: string; role: ManageRole };
      const created = user({ id: 'm3', name: b.name, email: b.email, role: b.role, last_login_at: null, created_at: '2026-10-28T10:00:00Z' });
      users = [created, ...users];
      return json(201, { data: created });
    }
    const status = /\/manage\/users\/([^/]+)\/status$/.exec(url);
    if (status && method === 'PATCH') {
      users = users.map((u) => (u.id === status[1] ? { ...u, is_active: (body as { is_active: boolean }).is_active } : u));
      return json(200, { data: users.find((u) => u.id === status[1]) });
    }
    if (url.includes('/manage/centres?')) return json(200, { data: [centre], meta: { page: 1, limit: 25, total: 1, totalPages: 1 } });
    if (url.endsWith('/manage/centres/c1/status')) return opts.centreStatus ? opts.centreStatus() : json(200, { data: { ...centre, isActive: false } });
    if (url.endsWith('/manage/centres/c1')) return json(200, { data: centre });
    if (url.endsWith('/manage/summary'))
      return json(200, { data: { total: 1, counts: {}, stages: [], follow_ups: { NONE: 0, PENDING: 0, CALLED: 1, SECOND_CALL: 0, FORM_FILLED: 0 } } });
    if (url.includes('/manage/applicants?'))
      return json(200, { data: [{ ...applicant, follow_up: history[0] }], meta: { page: 1, limit: 25, total: 1, totalPages: 1 } });
    if (url.endsWith('/follow-ups') && method === 'GET') return json(200, { data: history });
    if (url.endsWith('/follow-ups') && method === 'POST') return viewer ? json(403, { message: VIEW_ONLY }) : json(201, { data: history });
    return json(404, { message: 'not mocked' });
  });
  return calls;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
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

describe('Users (tracking panel, admins only)', () => {
  it('lists the users with role and status, and no deactivate on the signed-in admin', async () => {
    mockApi();
    renderAt('/manage/users');
    expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/manage/users');
    const asha = await screen.findByRole('row', { name: /Asha Patil/ });
    expect(asha).toHaveTextContent('asha@example.com');
    expect(asha).toHaveTextContent('Viewer');
    expect(asha).toHaveTextContent('Active');
    expect(within(asha).getByRole('button', { name: 'Deactivate Asha Patil' })).toBeInTheDocument();
    const me = screen.getByRole('row', { name: /EDP Admin/ });
    expect(me).toHaveTextContent('Admin');
    expect(within(me).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('View only')).not.toBeInTheDocument();
  });

  it('deactivates a user after confirming', async () => {
    const calls = mockApi();
    renderAt('/manage/users');
    const asha = await screen.findByRole('row', { name: /Asha Patil/ });
    await userEvent.click(within(asha).getByRole('button', { name: 'Deactivate Asha Patil' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Deactivate Asha Patil?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, deactivate' }));
    await waitFor(() => expect(screen.getByRole('row', { name: /Asha Patil/ })).toHaveTextContent('Inactive'));
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.url).toMatch(/\/manage\/users\/m2\/status$/);
    expect(patch.body).toEqual({ is_active: false });
    expect(screen.getByText('Asha Patil deactivated.')).toBeInTheDocument();
  });

  it('Add user posts name, email, password and role, then returns to the list with a notice', async () => {
    const calls = mockApi();
    renderAt('/manage/users');
    await userEvent.click(await screen.findByRole('link', { name: '+ Add user' }));
    expect(await screen.findByRole('heading', { name: 'Add user' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Viewer – can only view and download' })).toBeChecked();
    await userEvent.type(screen.getByLabelText(/^Name/), '  Ravi Shinde ');
    await userEvent.type(screen.getByLabelText(/^Email/), 'ravi@example.com');
    await userEvent.type(screen.getByLabelText(/^Password/), 'secret123');
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByRole('radio', { name: 'Admin – full access' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add user' }));

    expect(await screen.findByText('User Ravi Shinde added.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Users' })).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({
      name: 'Ravi Shinde',
      email: 'ravi@example.com',
      password: 'secret123',
      role: 'ADMIN',
    });
    expect(await screen.findByRole('row', { name: /Ravi Shinde/ })).toHaveTextContent('Admin');
  });

  it('checks the form before sending: name, email and a password with a letter and a digit', async () => {
    const calls = mockApi();
    renderAt('/manage/users/new');
    await userEvent.type(await screen.findByLabelText(/^Name/), 'R');
    await userEvent.type(screen.getByLabelText(/^Email/), 'ravi@');
    await userEvent.type(screen.getByLabelText(/^Password/), 'abcdefgh');
    await userEvent.click(screen.getByRole('button', { name: 'Add user' }));
    expect(screen.getByText('Name must be 2–150 characters')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Password must contain a digit')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('shows a duplicate email (409) as a notice and server field errors (422) at their fields', async () => {
    let answer = json(409, { message: 'A user with this email already exists' });
    mockApi({ createUser: () => answer });
    renderAt('/manage/users/new');
    await userEvent.type(await screen.findByLabelText(/^Name/), 'Ravi Shinde');
    await userEvent.type(screen.getByLabelText(/^Email/), 'ravi@example.com');
    await userEvent.type(screen.getByLabelText(/^Password/), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Add user' }));
    expect(await screen.findByText('A user with this email already exists')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Add user' })).toBeInTheDocument();

    answer = json(422, {
      message: 'Validation failed',
      error: { code: 'VALIDATION_ERROR', details: [{ field: 'body.email', message: 'Email domain is not allowed' }] },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Add user' }));
    expect(await screen.findByText('Email domain is not allowed')).toBeInTheDocument();
    expect(screen.getByText('Please correct the highlighted fields.')).toBeInTheDocument();
  });
});

describe('View-only accounts (VIEWER)', () => {
  it('Center Master: no Users link, no Add center, Edit or status buttons, but View; "View only" next to the name', async () => {
    mockApi({ role: 'VIEWER' });
    renderAt('/manage/centres');
    const row = await screen.findByRole('row', { name: /Baramati Centre/ });
    expect(within(row).getByRole('link', { name: 'View Baramati Centre' })).toBeInTheDocument();
    expect(screen.getByText('View only')).toBeInTheDocument();
    expect(within(row).queryByRole('link', { name: 'Edit Baramati Centre' })).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /Deactivate|Activate/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '+ Add center' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Applicants' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Center Master' })).toBeInTheDocument();
  });

  it('a center opens read-only, without Edit or Deactivate', async () => {
    mockApi({ role: 'VIEWER' });
    renderAt('/manage/centres/c1');
    expect(await screen.findByRole('heading', { name: 'Baramati Centre' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument();
  });

  it('is sent away from the add / edit center pages and from Users', async () => {
    mockApi({ role: 'VIEWER' });
    const a = renderAt('/manage/centres/new');
    expect(await screen.findByRole('heading', { name: 'Center Master' })).toBeInTheDocument();
    a.unmount();
    const b = renderAt('/manage/centres/c1/edit');
    expect(await screen.findByRole('heading', { name: 'Center Master' })).toBeInTheDocument();
    b.unmount();
    const c = renderAt('/manage/users');
    expect(await screen.findByRole('heading', { name: 'Student tracking' })).toBeInTheDocument();
    c.unmount();
    renderAt('/manage/users/new');
    expect(await screen.findByRole('heading', { name: 'Student tracking' })).toBeInTheDocument();
  });

  it('opens the follow-up history from the list without the form to add one', async () => {
    mockApi({ role: 'VIEWER' });
    renderAt('/manage');
    await screen.findByText('View only');
    await userEvent.click(await screen.findByRole('button', { name: `Follow-up: ${applicant.name}` }));
    const dialog = screen.getByRole('dialog', { name: `Follow-up – ${applicant.name}` });
    expect(await within(dialog).findByText('Will upload by Friday')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Save follow-up' })).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Follow-up status/)).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the server message when a change is refused with 403', async () => {
    mockApi({ centreStatus: () => json(403, { message: VIEW_ONLY }) });
    renderAt('/manage/centres');
    const row = await screen.findByRole('row', { name: /Baramati Centre/ });
    await userEvent.click(await within(row).findByRole('button', { name: 'Deactivate Baramati Centre' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Deactivate Baramati Centre?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, deactivate' }));
    expect(await within(dialog).findByText(VIEW_ONLY)).toBeInTheDocument();
  });
});
