import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ManagePage from '../src/pages/manage/ManagePage';
import { SessionProvider } from '../src/session';
import type { Applicant, Approval, StagePoint } from '../src/types';

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
  district_id: 'd1111111-1111-4111-8111-111111111111',
  district: 'Pune',
  category: 'Maratha',
  centre: 'Pune Centre',
  documents: { uploaded: 10, verified: 10 },
  documents_verified: true,
  final_verified: false,
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
const point = (stage: StagePoint, name: string) => ({ stage, name });
const BATCH = { id: 'b1', name: 'Pune Batch 1' };

const ID = {
  draft: '11111111-1111-4111-8111-111111111111',
  submitted: '22222222-2222-4222-8222-222222222222',
  coep: '33333333-3333-4333-8333-333333333333',
  returned: '44444444-4444-4444-8444-444444444444',
  final: '55555555-5555-4555-8555-555555555555',
  admin: '66666666-6666-4666-8666-666666666666',
  sentBack: '77777777-7777-4777-8777-777777777777',
  unverified: '88888888-8888-4888-8888-888888888888',
};

function mockApi(role: 'ADMIN' | 'VIEWER' = 'ADMIN') {
  const approved = new Set<string>();
  const calls: { method: string; url: string; body?: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    if (url.endsWith('/manage/me')) return json(200, { data: { id: 'm1', name: 'Program Auditor', email: 'a@example.com', role } });
    if (url.endsWith('/manage/summary'))
      return json(200, {
        data: {
          total: 7,
          counts: {},
          stages: [],
          follow_ups: { NONE: 7, PENDING: 0, CALLED: 0, SECOND_CALL: 0, FORM_FILLED: 0 },
          approvals: { AWAITING: 2, RETURNED: 1, BATCH: 0, DIVISION: 1, COEP: 1, HEAD_OFFICE: 0, ADMIN: 1, APPROVED: 1 },
        },
      });
    if (url.endsWith('/manage/filters')) return json(200, { data: { districts: [], categories: [], centres: [], stages: [] } });
    if (url.endsWith('/manage/settings/batch')) return json(200, { data: { size: 30, updated_at: null, updated_by: null } });
    if (url.includes('/manage/applicants?')) {
      const rows = [
        base(ID.draft, 'Draft Student', {
          stage: 'MAIN_DONE',
          stage_label: 'Step 2 filled (Main Form)',
          submitted_at: null,
          documents: { uploaded: 0, verified: 0 },
          documents_verified: false,
        }),
        /* Submitted and with the Auditor, but not every document is verified: it cannot be approved yet. */
        base(ID.unverified, 'Rohan Pawar', { documents: { uploaded: 10, verified: 7 }, documents_verified: false, approval: approval({}) }),
        /* Approved by the Auditor, it waits for a batch. */
        base(
          ID.submitted,
          'Asha Kulkarni',
          approved.has(ID.submitted)
            ? {
                can_batch: true,
                approval: approval({
                  stage: 'BATCH',
                  stage_label: 'Approved: waiting for a batch',
                  last_event: {
                    action: 'APPROVE',
                    from: point('AUDITOR', 'Auditor'),
                    to: point('BATCH', 'Batch'),
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
            batch: BATCH,
            last_event: {
              action: 'APPROVE',
              from: point('DIVISION', 'Divisional Officer'),
              to: point('COEP', 'COEP'),
              reason: null,
              by: 'Divisional Officer Pune',
              at: '2026-11-24T11:00:00Z',
            },
          }),
        }),
        /* Sent back to the Auditor, still in the batch: approved again, straight back to the Divisional Officer. */
        base(
          ID.returned,
          'Meera Joshi',
          approved.has(ID.returned)
            ? {
                approval: approval({
                  stage: 'DIVISION',
                  stage_label: 'With Divisional Officer',
                  batch: BATCH,
                  last_event: {
                    action: 'APPROVE',
                    from: point('AUDITOR', 'Auditor'),
                    to: point('DIVISION', 'Divisional Officer'),
                    reason: null,
                    by: 'Program Auditor',
                    at: '2026-11-25T10:00:00Z',
                  },
                }),
              }
            : {
                can_approve: true,
                approval: approval({
                  batch: BATCH,
                  reason_required: true,
                  last_event: {
                    action: 'REJECT',
                    from: point('DIVISION', 'Divisional Officer'),
                    to: point('AUDITOR', 'Auditor'),
                    reason: 'Aadhaar copy is not readable',
                    by: 'Divisional Officer Pune',
                    at: '2026-11-24T12:00:00Z',
                  },
                }),
              },
        ),
        /* Sent back by Head Office to COEP. */
        base(ID.sentBack, 'Pooja Kale', {
          approval: approval({
            stage: 'COEP',
            stage_label: 'With COEP',
            batch: BATCH,
            last_event: {
              action: 'REJECT',
              from: point('HEAD_OFFICE', 'Head Office'),
              to: point('COEP', 'COEP'),
              reason: 'Marksheet is missing',
              by: 'Head Office Reviewer',
              at: '2026-11-25T09:00:00Z',
            },
          }),
        }),
        base(ID.admin, 'Sneha Gaikwad', {
          approval: approval({
            stage: 'ADMIN',
            stage_label: 'With Admin (final approval)',
            batch: BATCH,
            last_event: {
              action: 'APPROVE',
              from: point('COEP', 'COEP'),
              to: point('ADMIN', 'Admin'),
              reason: null,
              by: 'COEP Reviewer',
              at: '2026-11-25T10:00:00Z',
            },
          }),
        }),
        base(ID.final, 'Omkar Shinde', {
          final_verified: true,
          approval: approval({ stage: 'APPROVED', stage_label: 'Final approved', register_id: 'REG-000009', batch: BATCH }),
        }),
      ];
      return json(200, { data: rows, meta: { page: 1, limit: 25, total: rows.length, totalPages: 1 } });
    }
    const one = /\/manage\/applicants\/([^/]+)\/approve$/.exec(url)?.[1];
    if (method === 'POST' && one) {
      approved.add(one);
      return json(200, { data: { approved: 1 }, message: 'Form approved' });
    }
    if (method === 'POST' && url.endsWith('/manage/applicants/approve-selected')) {
      const { ids } = body as { ids: string[] };
      ids.forEach((id) => approved.add(id));
      return json(200, { data: { approved: ids.length, skipped: 0 }, message: `${ids.length} form(s) approved` });
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
const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) });

describe('Tracking panel approval stages', () => {
  it("shows each student's approval stage, batch and rejection, and checkboxes only where an action applies", async () => {
    mockApi();
    renderPage();
    expect(await screen.findByRole('columnheader', { name: 'Approval stage' })).toBeInTheDocument();
    await screen.findByText('Asha Kulkarni');
    expect(within(row('Asha Kulkarni')).getByText('Not approved yet')).toBeInTheDocument();
    expect(within(row('Nikhil Deshpande')).getByText('With COEP')).toBeInTheDocument();
    expect(within(row('Nikhil Deshpande')).getByRole('link', { name: 'Pune Batch 1' })).toHaveAttribute('href', '/manage/batches/b1');
    /* Sent back: the reason, at the stage it was sent back to, and still the batch. */
    expect(within(row('Meera Joshi')).getByText('Sent back to Auditor')).toBeInTheDocument();
    expect(row('Meera Joshi')).toHaveTextContent('Rejected by Divisional Officer: Aadhaar copy is not readable');
    expect(within(row('Meera Joshi')).getByRole('link', { name: 'Pune Batch 1' })).toBeInTheDocument();
    expect(within(row('Pooja Kale')).getByText('With COEP')).toBeInTheDocument();
    expect(row('Pooja Kale')).toHaveTextContent('Rejected by Head Office: Marksheet is missing');
    expect(within(row('Omkar Shinde')).getByText('Final approved')).toBeInTheDocument();
    expect(within(row('Omkar Shinde')).getByText('REG-000009')).toBeInTheDocument();

    expect(within(row('Asha Kulkarni')).getByRole('checkbox', { name: "Select Asha Kulkarni's form for approval" })).toBeInTheDocument();
    expect(within(row('Meera Joshi')).getByRole('checkbox', { name: "Select Meera Joshi's form for approval" })).toBeInTheDocument();
    for (const name of ['Draft Student', 'Rohan Pawar', 'Nikhil Deshpande', 'Pooja Kale', 'Sneha Gaikwad', 'Omkar Shinde']) {
      expect(within(row(name)).queryByRole('checkbox')).not.toBeInTheDocument();
      if (name !== 'Rohan Pawar') expect(within(row(name)).queryByRole('button', { name: /^Approve/ })).not.toBeInTheDocument();
    }
  });

  it('shows a student waiting for the final approval as with Admin, read-only here', async () => {
    mockApi();
    renderPage();
    await screen.findByText('Sneha Gaikwad');
    expect(within(row('Sneha Gaikwad')).getByText('With Admin (final approval)')).toHaveClass('do-PENDING');
    expect(within(row('Sneha Gaikwad')).getByText(/^Approved by COEP \(COEP Reviewer\)/)).toBeInTheDocument();
  });

  it("shows each student's district, category, centre and documents mark", async () => {
    mockApi();
    renderPage();
    await screen.findByText('Asha Kulkarni');
    const asha = within(row('Asha Kulkarni'));
    for (const [label, value] of [
      ['District', 'Pune'],
      ['Category', 'Maratha'],
      ['Centre', 'Pune Centre'],
      ['Documents', '10/10 verified'],
    ])
      expect(asha.getByText(label!, { selector: 'dt' }).nextElementSibling).toHaveTextContent(value!);
    expect(asha.getByText('10/10 verified')).toHaveClass('active');
    expect(within(row('Rohan Pawar')).getByText('7/10 verified')).not.toHaveClass('active');
    expect(within(row('Draft Student')).getByText('Documents', { selector: 'dt' }).nextElementSibling).toHaveTextContent('—');
  });

  it('a submitted form whose documents are not all verified says so, with a link to the student page', async () => {
    mockApi();
    renderPage();
    await screen.findByText('Rohan Pawar');
    expect(within(row('Rohan Pawar')).getByText('Not approved yet')).toBeInTheDocument();
    const first = within(row('Rohan Pawar')).getByRole('link', { name: 'Verify the documents of Rohan Pawar first' });
    expect(first).toHaveTextContent('First verify all documents, then approve');
    expect(first).toHaveAttribute('href', `/manage/applicants/${ID.unverified}`);
    /* Approve is there, blurred and locked, until every document is verified. */
    const approve = within(row('Rohan Pawar')).getByRole('button', { name: "Approve Rohan Pawar's form" });
    expect(approve).toBeDisabled();
    expect(approve).toHaveClass('locked');
    expect(approve).toHaveAccessibleDescription(/verify (all|the) documents/i);
    /* Not for a draft, one that can be approved, or one past the Auditor. */
    expect(screen.getAllByText('First verify all documents, then approve')).toHaveLength(1);
  });

  it('approves one form after confirmation; it then waits for a batch', async () => {
    const calls = mockApi();
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: "Approve Asha Kulkarni's form" }));
    const dialog = screen.getByRole('alertdialog', { name: "Approve Asha Kulkarni's form?" });
    expect(dialog).toHaveTextContent(
      'The submitted form will be approved and wait for a batch. Put it into a batch to send it to the Divisional Officer. This cannot be undone.',
    );
    /* A first approval: no reason is asked. */
    expect(within(dialog).queryByLabelText(/^Approval reason/)).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, approve' }));
    expect(
      await screen.findByText("Asha Kulkarni's form approved. Put it into a batch to send it to the Divisional Officer."),
    ).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST' && c.url.endsWith(`/manage/applicants/${ID.submitted}/approve`))?.body).toEqual({});
    await waitFor(() => expect(within(row('Asha Kulkarni')).getByText('Approved: waiting for a batch')).toBeInTheDocument());
    /* Its checkbox is now the one for a batch. */
    expect(within(row('Asha Kulkarni')).getByRole('checkbox', { name: 'Select Asha Kulkarni for a batch' })).toBeInTheDocument();
    expect(within(row('Asha Kulkarni')).getAllByRole('checkbox')).toHaveLength(1);
    expect(row('Asha Kulkarni')).toHaveTextContent('Approved by Auditor (Program Auditor)');
  });

  it('asks the reason of a second approval (a form rejected before): 3 to 500 characters, said at the box', async () => {
    const calls = mockApi();
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: "Approve Meera Joshi's form" }));
    const dialog = screen.getByRole('alertdialog', { name: "Approve Meera Joshi's form?" });
    const box = within(dialog).getByLabelText(/^Approval reason/);
    const yes = within(dialog).getByRole('button', { name: 'Yes, approve' });
    expect(box).toHaveFocus();
    expect(yes).toBeDisabled();
    await userEvent.type(box, '  ok ');
    await userEvent.click(yes);
    expect(within(dialog).getByText('Enter an approval reason of at least 3 characters.')).toBeInTheDocument();
    expect(box).toHaveAttribute('aria-invalid', 'true');
    await userEvent.clear(box);
    await userEvent.click(box);
    await userEvent.paste('x'.repeat(501));
    await userEvent.click(yes);
    expect(within(dialog).getByText('The approval reason can have at most 500 characters.')).toBeInTheDocument();
    /* Nothing was sent. */
    expect(calls.some((c) => c.url.includes('/approve'))).toBe(false);
  });

  it('shows the reason box when the API asks for it (a form rejected meanwhile), and sends the reason then', async () => {
    const calls = mockApi();
    let first = true;
    const real = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (first && url.endsWith(`/manage/applicants/${ID.submitted}/approve`)) {
        first = false;
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Validation failed',
            error: {
              code: 'VALIDATION_ERROR',
              details: [{ field: 'body.reason', message: 'Approval reason is required: the form was rejected before, so this is its second approval.' }],
            },
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return real(input, init);
    }) as typeof fetch;
    try {
      renderPage();
      await userEvent.click(await screen.findByRole('button', { name: "Approve Asha Kulkarni's form" }));
      const dialog = screen.getByRole('alertdialog', { name: "Approve Asha Kulkarni's form?" });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, approve' }));
      expect(
        await within(dialog).findByText('Approval reason is required: the form was rejected before, so this is its second approval.'),
      ).toBeInTheDocument();
      await userEvent.type(within(dialog).getByLabelText(/^Approval reason/), 'Returned form checked');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, approve' }));
      await waitFor(() =>
        expect(calls.find((c) => c.method === 'POST' && c.url.endsWith(`/manage/applicants/${ID.submitted}/approve`))?.body).toEqual({
          reason: 'Returned form checked',
        }),
      );
    } finally {
      globalThis.fetch = real;
    }
  });

  it('approves a student sent back from a batch straight to the Divisional Officer, in the same batch', async () => {
    mockApi();
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: "Approve Meera Joshi's form" }));
    const dialog = screen.getByRole('alertdialog', { name: "Approve Meera Joshi's form?" });
    expect(dialog).toHaveTextContent('The submitted form will go straight back to the Divisional Officer, in the same batch (Pune Batch 1).');
    await userEvent.type(within(dialog).getByLabelText(/^Approval reason/), 'Documents checked');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, approve' }));
    expect(await screen.findByText("Meera Joshi's form approved and sent back to the Divisional Officer in batch Pune Batch 1.")).toBeInTheDocument();
    await waitFor(() => expect(within(row('Meera Joshi')).getByText('With Divisional Officer')).toBeInTheDocument());
    expect(within(row('Meera Joshi')).getByRole('link', { name: 'Pune Batch 1' })).toBeInTheDocument();
    expect(within(row('Meera Joshi')).queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('approves the ticked forms with "Approve selected", and only those', async () => {
    const calls = mockApi();
    renderPage();
    await screen.findByText('Asha Kulkarni');
    expect(screen.getByRole('button', { name: 'Approve selected (0)' })).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: "Select Asha Kulkarni's form for approval" }));
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected (1)' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Approve 1 selected form?' });
    expect(dialog).toHaveTextContent('1 form will be approved and wait for a batch, to be sent to the Divisional Officer. This cannot be undone.');
    expect(within(dialog).queryByLabelText(/^Approval reason/)).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, approve selected' }));
    expect(await screen.findByText('1 form approved. Put it into a batch to send it to the Divisional Officer.')).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/manage/applicants/approve-selected'))?.body).toEqual({ ids: [ID.submitted] });
    /* Approving does not put anyone into the selection for a batch. */
    expect(screen.getByRole('button', { name: 'Create batch (0 of 30)' })).toBeDisabled();
  });

  it('"Select every form" ticks the forms with the Auditor; the dialog tells the ones already in a batch apart', async () => {
    const calls = mockApi();
    renderPage();
    await screen.findByText('Asha Kulkarni');
    const all = screen.getByRole('checkbox', { name: 'Select every form on this page that can be approved' });
    await userEvent.click(all);
    expect(screen.getByRole('button', { name: 'Approve selected (2)' })).toBeEnabled();
    await userEvent.click(all);
    expect(screen.getByRole('button', { name: 'Approve selected (0)' })).toBeDisabled();
    await userEvent.click(all);
    await userEvent.click(screen.getByRole('button', { name: 'Approve selected (2)' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Approve 2 selected forms?' });
    expect(dialog).toHaveTextContent(
      '1 form will be approved and wait for a batch, to be sent to the Divisional Officer. 1 student is already in a batch and will go straight back to the Divisional Officer in it. This cannot be undone.',
    );
    expect(within(dialog).getByText(/Meera Joshi/)).toHaveTextContent('Meera Joshi · back to Pune Batch 1');
    await userEvent.type(within(dialog).getByLabelText(/^Approval reason/), 'Documents checked');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, approve selected' }));
    expect(
      await screen.findByText(
        '2 forms approved. Put those not in a batch yet into one to send them to the Divisional Officer; those already in a batch went straight back to the Divisional Officer.',
      ),
    ).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith('/manage/applicants/approve-selected'))?.body).toEqual({ ids: [ID.submitted, ID.returned], reason: 'Documents checked' });
  });

  it('shows no approve or batch buttons or checkboxes to a view-only account', async () => {
    mockApi('VIEWER');
    renderPage();
    await screen.findByText('Asha Kulkarni');
    await waitFor(() => expect(screen.queryByRole('button', { name: /^(Approve|Create batch|Waiting for a batch)/ })).not.toBeInTheDocument());
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByText('First verify all documents, then approve')).not.toBeInTheDocument();
  });
});
