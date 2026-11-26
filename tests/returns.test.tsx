import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import ApplicationPage from '../src/pages/ApplicationPage';
import { SETTING_TITLE, type FormReturn, type Returns } from '../src/returns';
import { SessionProvider } from '../src/session';
import type { ApplicantDetail, Application, Form, Options } from '../src/types';

/*
 * "Enable Rejection Email Notification and Resubmission": the Settings card, the Auditor's "Reject and send back to
 * candidate" on the student page, and the candidate correcting the form and saving it, which resubmits it.
 */

const ID = '11111111-1111-4111-8111-111111111111';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
type Call = { method: string; url: string; body: unknown };

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

/* ------------------------------------------------------------------------------------------------------------ Settings */

describe('Settings: Enable Rejection Email Notification and Resubmission', () => {
  it('is shown off until saved, and an ADMIN switches it on', async () => {
    localStorage.setItem('edp.manage.token', 'manage-token');
    const calls: Call[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ method, url, body });
      if (url.endsWith('/manage/me')) return json(200, { data: { id: 'm1', name: 'Program Admin', email: 'admin@example.com', role: 'ADMIN' } });
      if (url.endsWith('/manage/settings/rejection'))
        return method === 'PUT'
          ? json(200, { data: { ...(body as object), updated_at: '2026-11-26T10:00:00Z', updated_by: 'Program Admin' } })
          : json(200, { data: { enabled: false, updated_at: null, updated_by: null } });
      return json(404, { message: 'not mocked' });
    });
    render(
      <MemoryRouter initialEntries={['/manage/settings']}>
        <App />
      </MemoryRouter>,
    );
    const card = await screen.findByRole('region', { name: SETTING_TITLE });
    const toggle = await within(card).findByRole('checkbox', { name: SETTING_TITLE });
    expect(toggle).not.toBeChecked();
    expect(within(card).getByText('Not saved yet: switched off.')).toBeInTheDocument();
    await userEvent.click(toggle);
    await userEvent.click(within(card).getByRole('button', { name: 'Save' }));
    expect(await within(card).findByText('Setting saved.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ enabled: true });
    expect(within(card).getByRole('checkbox', { name: SETTING_TITLE })).toBeChecked();
  });
});

/* ------------------------------------------------------------------------------------------------- the Auditor's page */

const detail = (): ApplicantDetail =>
  ({
    account: {
      id: ID,
      name: 'Kavya Jadhav',
      email: 'kavya@example.com',
      mobile_number: '9765412345',
      created_at: '2026-10-24T11:30:00Z',
      email_verified_at: '2026-10-24T11:55:00Z',
      last_login_at: '2026-10-25T09:00:00Z',
    },
    status: 'SUBMITTED',
    steps: { basic_completed_at: '2026-10-24T11:57:00Z', main_completed_at: '2026-10-24T12:10:00Z', submitted_at: '2026-10-24T12:30:00Z' },
    registration: { registration_id: 'IPP-000001', registration_number: '1028153012345678' },
    aadhaar_masked: 'XXXX-XXXX-2463',
    form: { first_name: 'Kavya', last_name: 'Jadhav' },
    display: {},
    documents: [],
    edits: [],
    can_edit: true,
    locked_fields: [],
    approval: { stage: null, stage_label: null, stage_updated_at: null, approved_at: null, approved_by: null, last_event: null, register_id: null, batch: null },
    history: [],
  }) as unknown as ApplicantDetail;

const RETURN: FormReturn = {
  seq: '1',
  reason: 'Upload a clear photo of the Aadhaar card',
  by: 'Program Admin',
  at: '2026-11-26T10:00:00Z',
  email_status: 'SENT',
  email_at: '2026-11-26T10:00:05Z',
  resubmitted_at: null,
};

describe("The Auditor's student page", () => {
  it('rejects a form with a reason and sends it back; it then shows as with the candidate, without Approve', async () => {
    localStorage.setItem('edp.manage.token', 'manage-token');
    let returns: Returns = { enabled: true, open: null, can_return: true, returns: [] };
    const calls: Call[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ method, url, body });
      if (url.endsWith('/manage/me')) return json(200, { data: { id: 'm1', name: 'Program Admin', email: 'admin@example.com', role: 'ADMIN' } });
      if (url.endsWith(`/manage/applicants/${ID}/return`) && method === 'POST') {
        returns = { enabled: true, open: RETURN, can_return: false, returns: [RETURN] };
        return json(200, { data: { email: 'SENT' } });
      }
      if (url.endsWith(`/manage/applicants/${ID}/returns`)) return json(200, { data: returns });
      if (url.endsWith('/follow-ups')) return json(200, { data: [] });
      if (url.endsWith(`/manage/applicants/${ID}`)) return json(200, { data: detail() });
      return json(404, { message: 'not mocked' });
    });
    render(
      <MemoryRouter initialEntries={[`/manage/applicants/${ID}`]}>
        <App />
      </MemoryRouter>,
    );
    const reject = await screen.findByRole('button', { name: 'Reject and send back to candidate' });
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    await userEvent.click(reject);
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Yes, reject and send back' });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Rejection reason/), 'no');
    await userEvent.click(confirm);
    expect(within(dialog).getByText('Enter a rejection reason of at least 3 characters.')).toBeInTheDocument();
    await userEvent.clear(within(dialog).getByLabelText(/Rejection reason/));
    await userEvent.type(within(dialog).getByLabelText(/Rejection reason/), RETURN.reason);
    await userEvent.click(confirm);

    expect(await screen.findByText(/form was sent back to the candidate\. An e-mail with the reason was sent/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/return'))?.body).toEqual({ reason: RETURN.reason });
    const card = await screen.findByRole('region', { name: 'Sent back to the candidate' });
    expect(within(card).getByText(/With the candidate for correction since/)).toBeInTheDocument();
    expect(within(card).getByText(RETURN.reason)).toBeInTheDocument();
    expect(within(card).getByText(/E-mail sent to the candidate/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Reject and send back to candidate' })).not.toBeInTheDocument();
  });

  it('offers no rejection while the setting is off', async () => {
    localStorage.setItem('edp.manage.token', 'manage-token');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/manage/me')) return json(200, { data: { id: 'm1', name: 'Program Admin', email: 'admin@example.com', role: 'ADMIN' } });
      if (url.endsWith(`/manage/applicants/${ID}/returns`)) return json(200, { data: { enabled: false, open: null, can_return: false, returns: [] } });
      if (url.endsWith('/follow-ups')) return json(200, { data: [] });
      if (url.endsWith(`/manage/applicants/${ID}`)) return json(200, { data: detail() });
      return json(404, { message: 'not mocked' });
    });
    render(
      <MemoryRouter initialEntries={[`/manage/applicants/${ID}`]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reject and send back to candidate' })).not.toBeInTheDocument());
  });
});

/* ------------------------------------------------------------------------------------------------------- the candidate */

const OPTIONS: Options = {
  regions: [{ id: 'r1', code: 'PUN', name: 'Pune' }],
  castes: [{ id: 'c1', code: 'C1', name: 'मराठी' }],
  educations: [{ id: 'e1', code: 'E1', name: 'B.Com' }],
  religions: ['हिंदू'],
  tracks: [{ code: 'T03', name: 'Web Design & Development' }],
  document_types: [{ id: 'd1', code: 'PHOTO', name: 'Photo', is_mandatory: true, barcode: null }],
  support: { message: '', email: null, mobile: null },
  genders: ['Male', 'Female', 'Transgender'],
  marital_statuses: ['Unmarried', 'Married'],
  districts: [{ id: 'dist1', code: 'PUN', name: 'Pune' }],
  centres: [{ id: 'cen1', code: 'PUN-01', name: 'Baramati Centre', district_name: 'Pune' }],
  grading_types: [{ code: 'PERCENTAGE', name: 'Percentage' }],
  cgpa_scales: [4, 5, 10],
  qualification_classes: ['First Class'],
} as unknown as Options;
const FORM = {
  first_name: 'Kavya',
  last_name: 'Jadhav',
  father_name: 'Suresh Jadhav',
  mother_name: 'Meena Jadhav',
  email: 'kavya@example.com',
  date_of_birth: '2002-06-01',
  current_address: 'Kothrud, Pune',
  aadhaar_number: '',
  mobile_number: '9765412345',
  religion: 'हिंदू',
  caste_id: 'c1',
  gender: 'Female',
  marital_status: 'Unmarried',
  permanent_address: 'Kothrud, Pune',
  district_id: 'dist1',
  pin_code: '411038',
  disability_status: 'No',
  region_id: 'r1',
  centre_id: 'cen1',
  technology: 'T03',
  education_id: 'e1',
  qualification_name: 'B.Com',
  qualification_stream: 'Accountancy',
  qualification_board: 'Savitribai Phule Pune University',
  qualification_completed_on: '2023-05-31',
  grading_type: 'PERCENTAGE',
  score: '72.50',
  qualification_class: 'First Class',
} as unknown as Form;
const submitted = (returned: { reason: string; at: string } | null) =>
  ({
    status: 'SUBMITTED',
    current_step: 3,
    steps: { basic_completed: true, main_completed: true },
    editable: false,
    submitted_at: '2026-11-20T10:00:00Z',
    form: FORM,
    draft_files: [],
    submitted_files: [],
    registration: { registration_id: 'IPP-000009', registration_number: '1024170019401327', status: 'SUBMITTED', aadhaar_masked: 'XXXX-XXXX-2463', display: {} },
    view_fields: [],
    documents: [],
    returned,
    locked_fields: returned ? ['email'] : [],
  }) as unknown as Application;

describe('The candidate corrects a form sent back', () => {
  it('sees the reason, corrects a field, and "Save and resubmit" saves the change and resubmits the form', async () => {
    localStorage.setItem('edp.token', 'test-token');
    let app = submitted({ reason: 'Father name is misspelt', at: '2026-11-26T10:00:00Z' });
    const calls: Call[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ method, url, body });
      if (url.endsWith('/edp/me')) return json(200, { data: { id: 'a1', first_name: 'Kavya', last_name: 'Jadhav', email: 'kavya@example.com' } });
      if (url.endsWith('/edp/options')) return json(200, { data: OPTIONS });
      if (url.endsWith('/edp/application') && method === 'GET') return json(200, { data: app });
      if (url.endsWith('/application/correction') && method === 'PUT') return json(200, { data: app });
      if (url.endsWith('/application/resubmit') && method === 'POST') {
        app = submitted(null);
        return json(200, { data: app });
      }
      return json(404, { message: 'not mocked' });
    });
    render(
      <MemoryRouter>
        <SessionProvider>
          <ApplicationPage />
        </SessionProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Your form was sent back for correction' })).toBeInTheDocument();
    expect(screen.getByText('Father name is misspelt')).toBeInTheDocument();
    const father = screen.getByLabelText(/^Father/) as HTMLInputElement;
    await userEvent.clear(father);
    await userEvent.type(father, 'Suresh Jadhavv');
    await userEvent.click(screen.getByRole('button', { name: 'Save and resubmit' }));

    expect(await screen.findByText('Your corrected form is saved and has been sent back to the Auditor for review and approval.')).toBeInTheDocument();
    const put = calls.find((c) => c.method === 'PUT' && c.url.endsWith('/application/correction'));
    expect(put?.body).toEqual({ data: { father_name: 'Suresh Jadhavv' } });
    const order = calls.filter((c) => c.method !== 'GET').map((c) => c.url.split('/edp')[1]);
    expect(order).toEqual(['/application/correction', '/application/resubmit']);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Your form was sent back for correction' })).not.toBeInTheDocument());
  });

  it('with nothing changed, "Save and resubmit" only resubmits', async () => {
    localStorage.setItem('edp.token', 'test-token');
    const calls: Call[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ method, url, body: undefined });
      if (url.endsWith('/edp/me')) return json(200, { data: { id: 'a1', first_name: 'Kavya', last_name: 'Jadhav', email: 'kavya@example.com' } });
      if (url.endsWith('/edp/options')) return json(200, { data: OPTIONS });
      if (url.endsWith('/edp/application')) return json(200, { data: submitted({ reason: 'Photo replaced?', at: '2026-11-26T10:00:00Z' }) });
      if (url.endsWith('/application/resubmit')) return json(200, { data: submitted(null) });
      return json(404, { message: 'not mocked' });
    });
    render(
      <MemoryRouter>
        <SessionProvider>
          <ApplicationPage />
        </SessionProvider>
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Save and resubmit' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/application/resubmit'))).toBe(true));
    expect(calls.some((c) => c.url.endsWith('/application/correction'))).toBe(false);
  });
});
