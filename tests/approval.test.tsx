import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ManagePage from '../src/pages/manage/ManagePage';
import { SessionProvider } from '../src/session';
import type { Applicant, Approval } from '../src/types';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const base = (id: string, name: string, over: Partial<Applicant>): Applicant => ({
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
  registration_id: null,
  registration_number: null,
  last_activity_at: '2026-10-24T12:10:00Z',
  follow_up: null,
  can_approve: false,
  can_batch: false,
  approval: null,
  ...over,
});
const approval = (over: Partial<Approval>): Approval => ({
  stage: null,
  stage_label: null,
  stage_updated_at: null,
  approved_at: null,
  approved_by: null,
  last_event: null,
  register_id: null,
  batch: null,
  ...over,
});
const point = (stage: 'AUDITOR' | 'DIVISION' | 'COEP' | 'HEAD_OFFICE' | 'APPROVED', name: string) => ({ stage, name });

const ID = {
  draft: '11111111-1111-4111-8111-111111111111',
  submitted: '22222222-2222-4222-8222-222222222222',
  coep: '33333333-3333-4333-8333-333333333333',
  returned: '44444444-4444-4444-8444-444444444444',
  final: '55555555-5555-4555-8555-555555555555',
};

function mockApi(role: 'ADMIN' | 'VIEWER' = 'ADMIN') {
  let approved = false;
  const calls: { method: string; url: string; body?: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
    if (url.endsWith('/manage/me')) return json(200, { data: { id: 'm1', name: 'Program Auditor', email: 'a@example.com', role } });
    if (url.endsWith('/manage/summary'))
      return json(200, {
        data: {
          total: 5,
          counts: {},
          stages: [],
          follow_ups: { NONE: 5, PENDING: 0, CALLED: 0, SECOND_CALL: 0, FORM_FILLED: 0 },
          approvals: { AWAITING: 2, RETURNED: 1, DIVISION: 0, COEP: 1, HEAD_OFFICE: 0, APPROVED: 1, UNBATCHED: 1 },
        },
      });
    if (url.includes('/manage/settings/batch')) return json(200, { data: { max_size: 30, updated_at: null, updated_by: null } });
    if (url.includes('/manage/centres?'))
      return json(200, {
        data: [{ id: 'c1', name: 'Pune Centre', code: 'PUN', districtName: 'Pune', isActive: true }],
        meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
      });
    if (url.includes('/manage/applicants?')) {
      const rows = [
        base(ID.draft, 'Draft Student', { stage: 'MAIN_DONE', stage_label: 'Step 2 filled (Main Form)', submitted_at: null }),
        base(
          ID.submitted,
          'Asha Kulkarni',
          approved
            ? {
                approval: approval({
                  stage: 'DIVISION',
                  stage_label: 'With Division Officer',
                  last_event: {
                    action: 'APPROVE',
                    from: point('AUDITOR', 'Auditor'),
                    to: point('DIVISION', 'Division Officer'),
                    reason: null,
                    by: 'Program Auditor',
                    at: '2026-11-24T10:00:00Z',
                  },
                }),
              }
            : { can_approve: true, approval: approval({}) },
        ),
        base(ID.coep, 'Nikhil Deshpande', {
          approval: approval({
            stage: 'COEP',
            stage_label: 'With COEP',
            last_event: {
              action: 'APPROVE',
              from: point('DIVISION', 'Division Officer'),
              to: point('COEP', 'COEP'),
              reason: null,
              by: 'Division Officer Pune',
              at: '2026-11-24T11:00:00Z',
            },
          }),
        }),
        base(ID.returned, 'Meera Joshi', {
          can_approve: true,
          approval: approval({
            last_event: {
              action: 'REJECT',
              from: point('DIVISION', 'Division Officer'),
              to: point('AUDITOR', 'Auditor'),
              reason: 'Aadhaar copy is not readable',
              by: 'Division Officer Pune',
              at: '2026-11-24T12:00:00Z',
            },
          }),
        }),
        base(ID.final, 'Omkar Shinde', {
          can_batch: true,
          approval: approval({ stage: 'APPROVED', stage_label: 'Final approved', register_id: 'REG-000009' }),
        }),
      ];
      return json(200, { data: rows, meta: { page: 1, limit: 25, total: rows.length, totalPages: 1 } });
    }
    if (method === 'POST' && url.endsWith(`/manage/applicants/${ID.submitted}/approve`)) {
      approved = true;
      return json(200, { data: { approved: 1 }, message: 'Form approved' });
    }
    if (method === 'POST' && url.endsWith('/manage/applicants/approve-selected')) {
      approved = true;
      return json(200, { data: { approved: 1, skipped: 0 }, message: '1 form(s) approved' });
    }
    if (method === 'POST' && url.endsWith('/manage/batches'))
      return json(201, { data: { id: 'b1', name: 'Pune Batch 1', students: 1, members: [], max_size: 30 }, message: 'Batch created' });
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
const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) });

describe('Tracking panel approval stages and batches', () => {
  it("shows each student's approval stage, a returned student's reason, and checkboxes only where an action applies", async () => {
    mockApi();
    renderPage();
    expect(await screen.findByRole('columnheader', { name: 'Approval stage' })).toBeInTheDocument();
    await screen.findByText('Asha Kulkarni');
    expect(within(row('Asha Kulkarni')).getByText('Not approved yet')).toBeInTheDocument();
    expect(within(row('Nikhil Deshpande')).getByText('With COEP')).toBeInTheDocument();
    expect(within(row('Meera Joshi')).getByText('Sent back to Auditor')).toBeInTheDocument();
    expect(within(row('Meera Joshi')).getByText(/Aadhaar copy is not readable/)).toBeInTheDocument();
    expect(within(row('Omkar Shinde')).getByText('Final approved')).toBeInTheDocument();
    expect(within(row('Omkar Shinde')).getByText('REG-000009')).toBeInTheDocument();
    expect(within(row('Omkar Shinde')).getByText('Not in a batch yet')).toBeInTheDocument();

    expect(within(row('Asha Kulkarni')).getByRole('checkbox', { name: "Select Asha Kulkarni's form for approval" })).toBeInTheDocument();
    expect(within(row('Meera Joshi')).getByRole('checkbox', { name: "Select Meera Joshi's form for approval" })).toBeInTheDocument();
    expect(within(row('Omkar Shinde')).getByRole('checkbox', { name: 'Select Omkar Shinde for a batch' })).toBeInTheDocument();
    for (const name of ['Draft Student', 'Nikhil Deshpande']) expect(within(row(name)).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(row('Nikhil Deshpande')).queryByRole('button', { name: /^Approve/ })).not.toBeInTheDocument();
  });

  it('approves one form after confirmation; it goes to the Division Officer', async () => {
    const calls = mockApi();
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: "Approve Asha Kulkarni's form" }));
    const dialog = screen.getByRole('alertdialog', { name: "Approve Asha Kulkarni's form?" });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, approve' }));
    expect(await screen.findByText(/form approved and sent to the Division Officer/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith(`/manage/applicants/${ID.submitted}/approve`))).toBe(true);
    await waitFor(() => expect(within(row('Asha Kulkarni')).getByText('With Division Officer')).toBeInTheDocument());
  });

  it('approves the ticked forms with "Approve selected", and only those', async () => {
    const calls = mockApi();
    renderPage();
    await screen.findByText('Asha Kulkarni');
    expect(screen.getByRole('button', { name: 'Approve selected (0)' })).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: "Select Asha Kulkarni's form for approval" }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Omkar Shinde for a batch' }));
    /* The final-approved tick counts for a batch, not for approval. */
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected (1)' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Approve 1 selected form?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, approve selected' }));
    expect(await screen.findByText('1 form approved and sent to the Division Officer.')).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/manage/applicants/approve-selected'))?.body).toEqual({ ids: [ID.submitted] });
  });

  it('creates a batch of the ticked finally approved students, with a name and a centre', async () => {
    const calls = mockApi();
    renderPage();
    await screen.findByText('Omkar Shinde');
    expect(screen.getByRole('button', { name: 'Create batch (0)' })).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Omkar Shinde for a batch' }));
    await userEvent.click(screen.getByRole('checkbox', { name: "Select Asha Kulkarni's form for approval" }));
    await userEvent.click(screen.getByRole('button', { name: 'Create batch (1)' }));
    const dialog = screen.getByRole('dialog', { name: 'Create a batch of 1 student' });
    expect(within(dialog).getByText('Omkar Shinde')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create batch' }));
    expect(within(dialog).getByText('Enter a batch name (at least 2 characters)')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/Batch name/), 'Pune Batch 1');
    await waitFor(() => expect(within(dialog).getByRole('option', { name: /Pune Centre/ })).toBeInTheDocument());
    await userEvent.selectOptions(within(dialog).getByLabelText(/Centre/), 'c1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create batch' }));
    expect(await screen.findByText('Batch "Pune Batch 1" created with 1 student.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/manage/batches'))?.body).toEqual({
      name: 'Pune Batch 1',
      centre_id: 'c1',
      ids: [ID.final],
    });
  });

  it('shows no approve, batch buttons or checkboxes to a view-only account', async () => {
    mockApi('VIEWER');
    renderPage();
    await screen.findByText('Asha Kulkarni');
    await waitFor(() => expect(screen.queryByRole('button', { name: /^(Approve|Create batch)/ })).not.toBeInTheDocument());
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });
});
