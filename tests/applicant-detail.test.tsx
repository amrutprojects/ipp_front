import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ApplicantDetailPage from '../src/pages/manage/ApplicantDetailPage';
import ManagePage from '../src/pages/manage/ManagePage';
import { SessionProvider } from '../src/session';
import type { Applicant, ApplicantDetail, Form } from '../src/types';

const ID = '11111111-1111-4111-8111-111111111111';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const row: Applicant = {
  id: ID,
  name: 'Kavya Jadhav',
  email: 'kavya@example.com',
  mobile_number: '9765412345',
  stage: 'SUBMITTED',
  stage_label: 'Submitted',
  account_created_at: '2026-10-24T11:30:00Z',
  otp_verified_at: '2026-10-24T11:55:00Z',
  last_login_at: '2026-10-25T09:00:00Z',
  basic_completed_at: '2026-10-24T11:57:00Z',
  main_completed_at: '2026-10-24T12:10:00Z',
  submitted_at: '2026-10-24T12:30:00Z',
  registration_id: 'EDP-000001',
  registration_number: '1028153012345678',
  last_activity_at: '2026-10-25T09:00:00Z',
  follow_up: null,
};

const FORM: Form = {
  first_name: 'Kavya',
  last_name: 'Jadhav',
  father_name: 'Suresh Jadhav',
  mother_name: 'Meena Jadhav',
  email: 'kavya@example.com',
  date_of_birth: '2002-06-01',
  current_address: 'Kothrud, Pune',
  aadhaar_number: '',
  mobile_number: '9765412345',
  religion: 'Hindu',
  caste_id: 'c1',
  gender: 'Female',
  marital_status: 'Unmarried',
  permanent_address: 'Kothrud, Pune',
  landmark: '',
  district_id: 'dist1',
  taluka: 'Haveli',
  pin_code: '411038',
  alternate_mobile_number: '',
  alternate_email: '',
  disability_status: 'No',
  disability_type: '',
  disability_certificate_number: '',
  region_id: 'r1',
  centre_id: 'cen1',
  technology: 'T03',
  education_id: 'e1',
  qualification_name: 'B.Com',
  qualification_stream: 'Accountancy',
  qualification_board: 'Savitribai Phule Pune University',
  qualification_completed_on: '2023-05-31',
  grading_type: 'PERCENTAGE',
  cgpa_scale: '',
  score: '72.50',
  qualification_class: 'First Class',
};

const detail = (over: Partial<ApplicantDetail> = {}, form: Partial<Form> = {}): ApplicantDetail => ({
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
  registration: { registration_id: 'EDP-000001', registration_number: '1028153012345678' },
  aadhaar_masked: 'XXXX-XXXX-2463',
  form: { ...FORM, ...form },
  display: {
    caste: 'Maratha',
    course_centre: 'Pune',
    education: 'B.Com',
    centre: 'Baramati Centre',
    district: 'Pune',
    taluka: 'Haveli',
    religion: 'Hindu',
    technology: 'Web Design & Development',
    gender: 'Female',
    marital_status: 'Unmarried',
  },
  documents: [
    {
      code: 'PHOTO',
      name: 'Photo',
      required: true,
      file: { doc_type: 'PHOTO', name: 'Photo', original_name: 'photo.jpg', mime_type: 'image/jpeg', size_bytes: 2048, uploaded_at: '2026-10-24T12:20:00Z' },
    },
    { code: 'APPLICANT_VIDEO', name: 'Applicant Video with Aadhaar', required: false, file: null },
    { code: 'PAN_CARD', name: 'PAN Card', required: true, file: null },
  ],
  ...over,
});

function mockApi(answer: () => Response, role: 'ADMIN' | 'VIEWER' = 'ADMIN') {
  const calls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith('/manage/me')) return json(200, { data: { id: 'm1', name: 'EDP Admin', email: 'edp.admin@example.com', role } });
    if (url.endsWith('/manage/summary'))
      return json(200, { data: { total: 1, counts: {}, stages: [], follow_ups: { NONE: 1, PENDING: 0, CALLED: 0, SECOND_CALL: 0, FORM_FILLED: 0 } } });
    if (url.includes('/manage/applicants?')) return json(200, { data: [row], meta: { page: 1, limit: 25, total: 1, totalPages: 1 } });
    if (url.endsWith('/follow-ups')) return json(200, { data: [] });
    if (url.endsWith('/file')) return new Response(new Blob(['jpeg']), { status: 200 });
    if (url.endsWith('/file?download=1'))
      return new Response(new Blob(['jpeg']), {
        status: 200,
        headers: { 'Content-Disposition': `attachment; filename="EDP-000007_Kavya_Jadhav_Photo.jpg"; filename*=UTF-8''EDP-000007_Kavya_Jadhav_Photo.jpg` },
      });
    if (url.endsWith('/documents.zip'))
      return new Response(new Blob(['PK']), {
        status: 200,
        headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="EDP-000007_Kavya_Jadhav.zip"' },
      });
    if (url.endsWith(`/manage/applicants/${ID}`)) return answer();
    return json(404, { message: 'not mocked' });
  });
  return calls;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <Routes>
          <Route path="/manage" element={<ManagePage />} />
          <Route path="/manage/applicants/:id" element={<ApplicantDetailPage />} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
/* The value next to a label in a card. */
const valueOf = (card: HTMLElement, label: string) => within(card).getByText(label, { selector: 'dt' }).nextElementSibling;

beforeEach(() => localStorage.setItem('edp.manage.token', 'manage-token'));
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Tracking panel: one student', () => {
  it('View on a row opens the student page, and Back returns to the list', async () => {
    mockApi(() => json(200, { data: detail() }));
    renderAt('/manage');
    const view = await screen.findByRole('link', { name: 'View Kavya Jadhav' });
    expect(view).toHaveAttribute('href', `/manage/applicants/${ID}`);
    await userEvent.click(view);
    expect(await screen.findByRole('heading', { name: 'Kavya Jadhav', level: 2 })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: '← Back to Applicants' }));
    expect(await screen.findByRole('heading', { name: 'Student tracking' })).toBeInTheDocument();
  });

  it('shows the whole form with names, the masked Aadhaar, and — for empty values', async () => {
    mockApi(() => json(200, { data: detail() }));
    renderAt(`/manage/applicants/${ID}`);
    expect(await screen.findByRole('heading', { name: 'Kavya Jadhav', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('EDP-000001')).toBeInTheDocument();
    expect(screen.getByText('1028153012345678')).toBeInTheDocument();

    const basic = screen.getByRole('region', { name: 'Basic Details' });
    expect(valueOf(basic, 'Aadhaar Number')).toHaveTextContent('XXXX-XXXX-2463');
    expect(valueOf(basic, 'Caste')).toHaveTextContent('Maratha');
    expect(valueOf(basic, 'Date of Birth')).toHaveTextContent('01/06/2002');
    expect(valueOf(basic, 'Alternate Mobile Number')).toHaveTextContent('—');
    expect(valueOf(basic, 'Person with Disability')).toHaveTextContent('No');
    expect(within(basic).queryByText('Type of Disability')).not.toBeInTheDocument();
    expect(within(basic).queryByText('Disability Certificate Number')).not.toBeInTheDocument();

    const address = screen.getByRole('region', { name: 'Address' });
    expect(valueOf(address, 'Landmark')).toHaveTextContent('—');
    expect(valueOf(address, 'Taluka')).toHaveTextContent('Haveli');

    const course = screen.getByRole('region', { name: 'Course & Center' });
    expect(valueOf(course, 'Course District')).toHaveTextContent('Pune');
    expect(valueOf(course, 'Center Name')).toHaveTextContent('Baramati Centre');
    expect(valueOf(course, 'Technology')).toHaveTextContent('Web Design & Development');

    const qualification = screen.getByRole('region', { name: 'Qualification' });
    expect(valueOf(qualification, 'Score')).toHaveTextContent('72.50%');
    expect(valueOf(qualification, 'Qualification Completed On')).toHaveTextContent('31/05/2023');
    expect(await within(screen.getByRole('region', { name: 'Follow-ups' })).findByText('No follow-up recorded yet.')).toBeInTheDocument();
  });

  it('shows the disability details only when the answer is Yes, and a CGPA score out of its scale', async () => {
    mockApi(() =>
      json(200, {
        data: detail({}, { disability_status: 'Yes', disability_type: 'Locomotor', disability_certificate_number: 'MH/1234', grading_type: 'CGPA', cgpa_scale: '10', score: '8.2' }),
      }),
    );
    renderAt(`/manage/applicants/${ID}`);
    const basic = await screen.findByRole('region', { name: 'Basic Details' });
    expect(valueOf(basic, 'Type of Disability')).toHaveTextContent('Locomotor');
    expect(valueOf(basic, 'Disability Certificate Number')).toHaveTextContent('MH/1234');
    expect(valueOf(screen.getByRole('region', { name: 'Qualification' }), 'Score')).toHaveTextContent('8.2 / 10');
  });

  it('lists the documents, marks the mandatory ones, and opens a file from the manage API', async () => {
    const calls = mockApi(() => json(200, { data: detail() }));
    const tab = { location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    URL.createObjectURL = vi.fn(() => 'blob:photo');
    URL.revokeObjectURL = vi.fn();
    renderAt(`/manage/applicants/${ID}`);
    const docs = await screen.findByRole('region', { name: 'Documents' });
    const photo = within(docs).getByRole('row', { name: /Photo/ });
    expect(photo).toHaveTextContent('Photo *');
    expect(photo).toHaveTextContent('photo.jpg (2 KB)');
    const video = within(docs).getByRole('row', { name: /Applicant Video/ });
    expect(video).toHaveTextContent('Not uploaded');
    expect(video).not.toHaveTextContent('*');
    expect(within(video).queryByRole('button', { name: /View/ })).not.toBeInTheDocument();
    expect(within(docs).getByRole('row', { name: /PAN Card/ })).toHaveTextContent('PAN Card *Not uploaded');

    await userEvent.click(within(docs).getByRole('button', { name: 'View Photo' }));
    await waitFor(() => expect(calls.some((u) => u.endsWith(`/manage/applicants/${ID}/documents/PHOTO/file`))).toBe(true));
    await waitFor(() => expect(tab.location.href).toBe('blob:photo'));
  });

  it('downloads one document under the candidate name, and all documents as one ZIP', async () => {
    const calls = mockApi(() => json(200, { data: detail() }));
    URL.createObjectURL = vi.fn(() => 'blob:file');
    URL.revokeObjectURL = vi.fn();
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
    renderAt(`/manage/applicants/${ID}`);
    const docs = await screen.findByRole('region', { name: 'Documents' });
    expect(within(docs).getByText(/of 11 documents uploaded|documents uploaded/)).toBeInTheDocument();
    /* Only uploaded documents can be downloaded. */
    expect(within(within(docs).getByRole('row', { name: /Applicant Video/ })).queryByRole('button', { name: /Download/ })).not.toBeInTheDocument();

    await userEvent.click(within(docs).getByRole('button', { name: 'Download Photo' }));
    await waitFor(() => expect(saved).toEqual(['EDP-000007_Kavya_Jadhav_Photo.jpg']));
    expect(calls).toContainEqual(expect.stringMatching(new RegExp(`/manage/applicants/${ID}/documents/PHOTO/file[?]download=1$`)));

    await userEvent.click(within(docs).getByRole('button', { name: 'Download all documents (ZIP)' }));
    await waitFor(() => expect(saved).toEqual(['EDP-000007_Kavya_Jadhav_Photo.jpg', 'EDP-000007_Kavya_Jadhav.zip']));
    expect(calls).toContainEqual(expect.stringMatching(new RegExp(`/manage/applicants/${ID}/documents[.]zip$`)));
    expect(within(docs).getByRole('button', { name: 'Download all documents (ZIP)' })).toBeEnabled();
  });

  it('an admin can add a follow-up; a viewer sees the follow-ups and can view and download, but cannot add one', async () => {
    mockApi(() => json(200, { data: detail() }));
    const admin = renderAt(`/manage/applicants/${ID}`);
    expect(await screen.findByRole('button', { name: 'Add follow-up' })).toBeInTheDocument();
    admin.unmount();
    vi.restoreAllMocks();

    mockApi(() => json(200, { data: detail() }), 'VIEWER');
    renderAt(`/manage/applicants/${ID}`);
    const docs = await screen.findByRole('region', { name: 'Documents' });
    await screen.findByText('View only');
    expect(within(docs).getByRole('button', { name: 'View Photo' })).toBeInTheDocument();
    expect(within(docs).getByRole('button', { name: 'Download Photo' })).toBeInTheDocument();
    expect(within(docs).getByRole('button', { name: 'Download all documents (ZIP)' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Follow-ups' })).toHaveTextContent('No follow-up recorded yet.');
    expect(screen.queryByRole('button', { name: 'Add follow-up' })).not.toBeInTheDocument();
  });

  it('says "Not submitted yet" for a draft', async () => {
    mockApi(() =>
      json(200, {
        data: detail({ status: 'DRAFT', registration: null, steps: { basic_completed_at: '2026-10-24T11:57:00Z', main_completed_at: null, submitted_at: null } }),
      }),
    );
    renderAt(`/manage/applicants/${ID}`);
    expect(await screen.findByText('Not submitted yet')).toBeInTheDocument();
    expect(screen.getByText('Step 1 filled (Basic Details)')).toBeInTheDocument();
  });

  it('says so when the student does not exist', async () => {
    mockApi(() => json(404, { message: 'Applicant not found' }));
    renderAt(`/manage/applicants/${ID}`);
    expect(await screen.findByText('This student was not found.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Back to Applicants' })).toHaveAttribute('href', '/manage');
  });
});
