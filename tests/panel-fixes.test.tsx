import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import ApplicationPage from '../src/pages/ApplicationPage';
import { SessionProvider } from '../src/session';
import type { Applicant, Application, Options } from '../src/types';

/*
 * The panel's list: a record approved by the Auditor cannot be deleted; the "Final Approved Students" card counts and lists
 * the finally approved ones. The student's portal: Approved once finally approved.
 */

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const row = (id: string, name: string, over: Partial<Applicant> & { can_delete?: boolean } = {}) =>
  ({
    id,
    name,
    email: `${id}@example.com`,
    mobile_number: '9765412345',
    stage: 'SUBMITTED',
    stage_label: 'Submitted',
    account_created_at: '2026-10-24T11:30:00Z',
    otp_verified_at: '2026-10-24T11:55:00Z',
    last_login_at: null,
    basic_completed_at: null,
    main_completed_at: null,
    submitted_at: '2026-10-24T12:30:00Z',
    registration_id: 'IPP-000001',
    registration_number: null,
    district_id: null,
    district: null,
    category: null,
    centre: null,
    documents: { uploaded: 0, verified: 0 },
    documents_verified: false,
    final_verified: false,
    last_activity_at: '2026-10-25T09:00:00Z',
    follow_up: null,
    can_approve: false,
    can_batch: false,
    approval: null,
    ...over,
  }) as Applicant;

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('The panel list', () => {
  it('cannot delete a record approved by the Auditor; the Final Approved Students card lists the finally approved', async () => {
    localStorage.setItem('edp.manage.token', 'manage-token');
    const lists: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/manage/me')) return json(200, { data: { id: 'm1', name: 'Program Admin', email: 'admin@example.com', role: 'ADMIN' } });
      if (url.endsWith('/manage/summary'))
        return json(200, {
          data: {
            total: 2,
            counts: { SUBMITTED: 2 },
            stages: [{ code: 'SUBMITTED', label: 'Form submitted', count: 2 }],
            follow_ups: { NONE: 2, PENDING: 0, CALLED: 0, SECOND_CALL: 0, FORM_FILLED: 0 },
            approvals: { AWAITING: 1, APPROVED: 1 },
          },
        });
      if (url.endsWith('/manage/filters')) return json(200, { data: { districts: [], categories: [], centres: [], stages: [] } });
      if (url.includes('/manage/applicants?')) {
        lists.push(url);
        return json(200, {
          data: [row('a1', 'Asha Open', { can_delete: true }), row('a2', 'Kavya Approved', { can_delete: false })],
          meta: { page: 1, limit: 25, total: 2, totalPages: 1 },
        });
      }
      return json(200, { data: [] });
    });
    render(
      <MemoryRouter initialEntries={['/manage']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('button', { name: 'Delete Asha Open' })).toBeEnabled();
    const locked = screen.getByRole('button', { name: 'Delete Kavya Approved' });
    expect(locked).toBeDisabled();
    expect(locked).toHaveAttribute('title', 'Approved by the Auditor: it can no longer be deleted');

    const cards = screen.getByRole('group', { name: 'Filter by stage' });
    const finalCard = within(cards).getByRole('button', { name: /Final Approved Students/ });
    expect(finalCard).toHaveTextContent('1Final Approved Students');
    /* Next to Form submitted. */
    expect(within(cards).getAllByRole('button').map((b) => b.textContent)).toEqual(['2All students', '2Form submitted', '1Final Approved Students']);
    await userEvent.click(finalCard);
    await waitFor(() => expect(lists[lists.length - 1]).toMatch(/application_stage=APPROVED/));
    expect(finalCard).toHaveAttribute('aria-pressed', 'true');
  });
});

describe("The student's portal", () => {
  it('shows Approved once the form is finally approved', async () => {
    localStorage.setItem('edp.token', 'test-token');
    const app = {
      status: 'SUBMITTED',
      current_step: 3,
      steps: { basic_completed: true, main_completed: true },
      editable: false,
      submitted_at: '2026-11-20T10:00:00Z',
      form: { first_name: 'Kavya', last_name: 'Jadhav' },
      draft_files: [],
      submitted_files: [],
      registration: { registration_id: 'IPP-000009', registration_number: '1024170019401327', status: 'APPROVED', aadhaar_masked: null, display: {} },
      view_fields: [],
      documents: [],
      returned: null,
    } as unknown as Application;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/edp/me')) return json(200, { data: { id: 'a1', first_name: 'Kavya', last_name: 'Jadhav', email: 'kavya@example.com' } });
      if (url.endsWith('/edp/options')) return json(200, { data: { document_types: [], support: { message: '', email: null, mobile: null } } as unknown as Options });
      if (url.endsWith('/edp/application')) return json(200, { data: app });
      return json(404, { message: 'not mocked' });
    });
    render(
      <MemoryRouter>
        <SessionProvider>
          <ApplicationPage />
        </SessionProvider>
      </MemoryRouter>,
    );
    const status = await screen.findByText('Status', { selector: 'dt' });
    expect(status.nextElementSibling).toHaveTextContent('Approved');
  });
});
