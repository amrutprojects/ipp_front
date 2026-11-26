import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ApplicantDetailPage from '../src/pages/manage/ApplicantDetailPage';
import ManagePage from '../src/pages/manage/ManagePage';
import { SessionProvider } from '../src/session';
import type { Applicant, ApplicantDetail, Approval, ApprovalEvent, Form, FormField, ViewField } from '../src/types';

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
  registration_id: 'IPP-000001',
  registration_number: '1028153012345678',
  district_id: 'dist1',
  district: 'Pune',
  category: 'Maratha',
  centre: 'Baramati Centre',
  documents: { uploaded: 1, verified: 0 },
  documents_verified: false,
  final_verified: false,
  last_activity_at: '2026-10-25T09:00:00Z',
  follow_up: null,
  can_approve: false,
  can_batch: false,
  approval: null,
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
  educational_status: '',
  qualification_name: 'B.Com',
  qualification_stream: 'Accountancy',
  qualification_board: 'Savitribai Phule Pune University',
  qualification_completed_on: '2023-05-31',
  grading_type: 'PERCENTAGE',
  cgpa_scale: '',
  score: '72.50',
  qualification_class: 'First Class',
};

/* Submitted, with the Auditor. */
const NOT_APPROVED: Approval = {
  stage: null,
  stage_label: null,
  stage_updated_at: null,
  approved_at: null,
  approved_by: null,
  last_event: null,
  register_id: null,
  batch: null,
};

const detail = (over: Partial<ApplicantDetail> = {}, form: Partial<Record<FormField, string>> = {}): ApplicantDetail => ({
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
      verified: { verified: false, at: null, by: null },
    },
    { code: 'APPLICANT_VIDEO', name: 'Applicant Video with Aadhaar', required: false, kind: 'VIDEO', file: null, verified: null },
    { code: 'PAN_CARD', name: 'PAN Card', required: true, file: null, verified: null },
  ],
  edits: [],
  can_edit: true,
  locked_fields: [],
  approval: NOT_APPROVED,
  history: [],
  ...over,
});

/* `verify` answers POST …/documents/:docType/verify, from its document and body; `approve` POST …/approve. */
function mockApi(
  answer: () => Response,
  role: 'ADMIN' | 'VIEWER' = 'ADMIN',
  opts: { verify?: (code: string, body: { verified: boolean }) => Response; approve?: () => Response } = {},
) {
  const calls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    calls.push(url);
    const check = /\/documents\/([^/]+)\/verify$/.exec(url)?.[1];
    if (opts.verify && check && init?.method === 'POST') return opts.verify(check, JSON.parse(String(init.body)) as { verified: boolean });
    if (opts.approve && url.endsWith(`/manage/applicants/${ID}/approve`)) return opts.approve();
    if (url.endsWith('/manage/filters')) return json(200, { data: { districts: [], categories: [], centres: [], stages: [] } });
    if (url.endsWith('/manage/settings/batch')) return json(200, { data: { size: 2, updated_at: null, updated_by: null } });
    if (url.endsWith('/manage/me')) return json(200, { data: { id: 'm1', name: 'Program Admin', email: 'admin@example.com', role } });
    if (url.endsWith('/manage/summary'))
      return json(200, { data: { total: 1, counts: {}, stages: [], follow_ups: { NONE: 1, PENDING: 0, CALLED: 0, SECOND_CALL: 0, FORM_FILLED: 0 } } });
    if (url.includes('/manage/applicants?')) return json(200, { data: [row], meta: { page: 1, limit: 25, total: 1, totalPages: 1 } });
    if (url.endsWith('/follow-ups')) return json(200, { data: [] });
    if (url.endsWith('/file')) return new Response(new Blob(['jpeg']), { status: 200 });
    if (url.endsWith('/file?download=1'))
      return new Response(new Blob(['jpeg']), {
        status: 200,
        headers: { 'Content-Disposition': `attachment; filename="IPP-000007_Kavya_Jadhav_Photo.jpg"; filename*=UTF-8''IPP-000007_Kavya_Jadhav_Photo.jpg` },
      });
    if (url.endsWith('/documents.zip'))
      return new Response(new Blob(['PK']), {
        status: 200,
        headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="IPP-000007_Kavya_Jadhav.zip"' },
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
    expect(screen.getByText('IPP-000001')).toBeInTheDocument();
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
    await waitFor(() => expect(saved).toEqual(['IPP-000007_Kavya_Jadhav_Photo.jpg']));
    expect(calls).toContainEqual(expect.stringMatching(new RegExp(`/manage/applicants/${ID}/documents/PHOTO/file[?]download=1$`)));

    await userEvent.click(within(docs).getByRole('button', { name: 'Download all documents (ZIP)' }));
    await waitFor(() => expect(saved).toEqual(['IPP-000007_Kavya_Jadhav_Photo.jpg', 'IPP-000007_Kavya_Jadhav.zip']));
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

  it('says "Not submitted yet" for a draft, without an approval stage or a way to verify its documents', async () => {
    mockApi(() =>
      json(200, {
        data: detail({
          status: 'DRAFT',
          registration: null,
          approval: null,
          steps: { basic_completed_at: '2026-10-24T11:57:00Z', main_completed_at: null, submitted_at: null },
        }),
      }),
    );
    renderAt(`/manage/applicants/${ID}`);
    expect(await screen.findByText('Not submitted yet')).toBeInTheDocument();
    expect(screen.getByText('Step 1 filled (Basic Details)')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Approval stage' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Approval history' })).not.toBeInTheDocument();
    /* Signed in as an admin (Add follow-up is offered), yet nothing to mark. */
    expect(await screen.findByRole('button', { name: 'Add follow-up' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Verification' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Verify|Approve)/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/documents verified/)).not.toBeInTheDocument();
  });

  /* Two uploaded documents, the first verified. */
  const twoDocuments = (): ApplicantDetail['documents'] => {
    const [photo, video, pan] = detail().documents;
    return [
      { ...photo!, verified: { verified: true, at: '2026-11-25T12:00:00Z', by: 'Program Admin' } },
      video!,
      { ...pan!, file: { ...photo!.file!, doc_type: 'PAN_CARD', original_name: 'pan.pdf' }, verified: { verified: false, at: null, by: null } },
    ];
  };

  it('each uploaded document is verified on its own (who and when), and can be undone; the form can be approved once all are', async () => {
    const bodies: unknown[] = [];
    let current = detail({ documents: twoDocuments() });
    const calls = mockApi(() => json(200, { data: current }), 'ADMIN', {
      verify: (code, body) => {
        bodies.push([code, body]);
        return json(200, {
          data: {
            verified: body.verified,
            at: body.verified ? '2026-11-25T12:30:00Z' : null,
            by: body.verified ? 'Program Admin' : null,
            documents: { uploaded: 2, verified: body.verified ? 2 : 1 },
          },
        });
      },
      approve: () => {
        current = detail({ documents: twoDocuments(), approval: { ...NOT_APPROVED, stage: 'BATCH', stage_label: 'Approved: waiting for a batch' } });
        return json(200, { data: { approved: 1 } });
      },
    });
    renderAt(`/manage/applicants/${ID}`);
    const docs = await screen.findByRole('region', { name: 'Documents' });
    expect(within(docs).getByText('1 of 2 documents verified')).toBeInTheDocument();
    expect(within(docs).getByText('2 of 3 documents uploaded')).toBeInTheDocument();
    const photo = within(docs).getByRole('row', { name: /photo\.jpg/ });
    expect(photo).toHaveTextContent(/Verified.*Program Admin · 25 Nov(ember)? 2026/);
    /* A document that is not uploaded has nothing to verify. */
    expect(within(within(docs).getByRole('row', { name: /Applicant Video/ })).queryByRole('button')).not.toBeInTheDocument();

    const approve = await screen.findByRole('button', { name: 'Approve' });
    expect(approve).toBeDisabled();
    expect(approve).toHaveAccessibleDescription('First verify all documents, then approve (1 of 2 verified).');

    await userEvent.click(within(docs).getByRole('button', { name: 'Verify PAN Card' }));
    expect(await within(docs).findByText('2 of 2 documents verified')).toBeInTheDocument();
    expect(approve).toBeEnabled();
    await userEvent.click(within(docs).getByRole('button', { name: 'Undo the verification of PAN Card' }));
    expect(await within(docs).findByText('1 of 2 documents verified')).toBeInTheDocument();
    expect(approve).toBeDisabled();
    await userEvent.click(within(docs).getByRole('button', { name: 'Verify PAN Card' }));
    await within(docs).findByText('2 of 2 documents verified');
    expect(bodies).toEqual([
      ['PAN_CARD', { verified: true }],
      ['PAN_CARD', { verified: false }],
      ['PAN_CARD', { verified: true }],
    ]);

    await userEvent.click(approve);
    const dialog = screen.getByRole('alertdialog', { name: "Approve Kavya Jadhav's form?" });
    expect(dialog).toHaveTextContent('The submitted form (IPP-000001) will be approved and wait for a batch.');
    expect(within(dialog).queryByLabelText(/^Approval reason/)).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, approve' }));
    expect(await screen.findByText("Kavya Jadhav's form approved. Put it into a batch to send it to the Divisional Officer.")).toBeInTheDocument();
    expect(await screen.findByText('Approved: waiting for a batch')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(calls.some((u) => u.endsWith(`/manage/applicants/${ID}/approve`))).toBe(true);
  });

  it('shows why a document could not be verified, and leaves it as it was', async () => {
    mockApi(() => json(200, { data: detail() }), 'ADMIN', { verify: () => json(409, { message: 'The form is finally approved' }) });
    renderAt(`/manage/applicants/${ID}`);
    const docs = await screen.findByRole('region', { name: 'Documents' });
    await userEvent.click(await within(docs).findByRole('button', { name: 'Verify Photo' }));
    expect(await within(docs).findByText('The form is finally approved')).toBeInTheDocument();
    expect(within(docs).getByText('0 of 1 documents verified')).toBeInTheDocument();
    expect(within(docs).getByRole('button', { name: 'Verify Photo' })).toBeEnabled();
  });

  it('after the final approval nothing can be verified or approved, and the form cannot be edited', async () => {
    mockApi(() =>
      json(200, {
        data: detail({ documents: twoDocuments(), can_edit: false, approval: { ...NOT_APPROVED, stage: 'APPROVED', stage_label: 'Final approved' } }),
      }),
    );
    renderAt(`/manage/applicants/${ID}`);
    expect(await screen.findByRole('button', { name: 'Add follow-up' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Verify|Undo|Approve)/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit form' })).not.toBeInTheDocument();
  });

  it('a viewer sees what is verified, by whom and when, without a way to change anything', async () => {
    mockApi(() => json(200, { data: detail({ documents: twoDocuments() }) }), 'VIEWER');
    renderAt(`/manage/applicants/${ID}`);
    const docs = await screen.findByRole('region', { name: 'Documents' });
    await screen.findByText('View only');
    expect(within(docs).getByText('1 of 2 documents verified')).toBeInTheDocument();
    expect(within(docs).getByRole('row', { name: /photo\.jpg/ })).toHaveTextContent(/Verified.*Program Admin · 25 Nov(ember)? 2026/);
    expect(screen.queryByRole('button', { name: /^(Verify|Undo|Approve)/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit form' })).not.toBeInTheDocument();
  });

  it('shows the form under the current names of the fields and documents, own fields in a card of their own', async () => {
    const field = (key: string, step: number, label_en: string, text: string, over: Partial<ViewField> = {}): ViewField => ({
      key,
      step,
      label_en,
      label_mr: null,
      type: 'TEXT',
      value: text,
      text,
      custom: false,
      ...over,
    });
    mockApi(() =>
      json(200, {
        data: detail({
          view_fields: [
            field('first_name', 1, 'Given Name', 'Kavya'),
            field('caste_id', 1, 'Category of the student', 'Maratha', { type: 'DROPDOWN', value: 'c1' }),
            field('district_id', 1, 'Home District', 'Pune', { type: 'DROPDOWN', value: 'dist1' }),
            field('date_of_birth', 1, 'Birth Date', '2002-06-01', { type: 'DATE' }),
            field('disability_status', 1, 'Person with Disability', 'No'),
            field('disability_type', 1, 'Type of Disability', ''),
            field('x_hobby', 1, 'Hobby', 'Reading', { custom: true }),
            field('technology', 2, 'Course Technology', 'Web Design & Development', { type: 'DROPDOWN', value: 'T03' }),
            field('qualification_board', 2, 'College Name', 'Sample College'),
            field('educational_status', 2, 'Educational Status', 'Final Year', { type: 'DROPDOWN', value: 'FINAL' }),
            field('grading_type', 2, 'Grading', 'Percentage', { type: 'DROPDOWN', value: 'PERCENTAGE' }),
            field('score', 2, 'Marks', '72.50'),
          ],
          documents: [{ ...detail().documents[0]!, name: 'Passport Photo' }],
        }),
      }),
    );
    renderAt(`/manage/applicants/${ID}`);
    const basic = await screen.findByRole('region', { name: 'Basic Details' });
    expect(valueOf(basic, 'Given Name')).toHaveTextContent('Kavya');
    expect(valueOf(basic, 'Category of the student')).toHaveTextContent('Maratha');
    expect(valueOf(basic, 'Birth Date')).toHaveTextContent('01/06/2002');
    expect(within(basic).queryByText('Type of Disability')).not.toBeInTheDocument();
    expect(valueOf(screen.getByRole('region', { name: 'Address' }), 'Home District')).toHaveTextContent('Pune');
    expect(valueOf(screen.getByRole('region', { name: 'Course & Center' }), 'Course Technology')).toHaveTextContent('Web Design & Development');
    const qualification = screen.getByRole('region', { name: 'Qualification' });
    expect(valueOf(qualification, 'College Name')).toHaveTextContent('Sample College');
    expect(valueOf(qualification, 'Educational Status')).toHaveTextContent('Final Year');
    expect(valueOf(qualification, 'Marks')).toHaveTextContent('72.50%');
    expect(valueOf(screen.getByRole('region', { name: 'Additional details' }), 'Hobby')).toHaveTextContent('Reading');
    expect(screen.queryByText('First Name')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Documents' })).getByRole('button', { name: 'View Passport Photo' })).toBeInTheDocument();
  });

  it('lists what was changed on the form: when, who, and each field from → to', async () => {
    mockApi(() =>
      json(200, {
        data: detail({
          edits: [
            {
              at: '2026-11-25T12:00:00Z',
              by: 'Program Admin',
              changes: [
                { key: 'father_name', label: 'Father Name', from: 'Suresh Jadav', to: 'Suresh Jadhav' },
                { key: 'landmark', label: 'Landmark', from: null, to: 'Near the bus stand' },
              ],
            },
          ],
        }),
      }),
    );
    renderAt(`/manage/applicants/${ID}`);
    const changes = await screen.findByRole('region', { name: 'Changes' });
    expect(changes).toHaveTextContent(/25 Nov(ember)? 2026.*Program Admin/);
    expect(changes).toHaveTextContent('Father Name: Suresh Jadav → Suresh Jadhav');
    expect(changes).toHaveTextContent('Landmark: — → Near the bus stand');
  });

  it('shows the whole approval history, newest first, with who, when and why, and links the batch', async () => {
    const move = (over: Partial<ApprovalEvent>): ApprovalEvent => ({
      action: 'APPROVE',
      from: { stage: 'AUDITOR', name: 'Auditor' },
      to: { stage: 'BATCH', name: 'Batch' },
      reason: null,
      by: 'Program Auditor',
      at: '2026-11-21T12:00:00Z',
      ...over,
    });
    const rejected = move({
      action: 'REJECT',
      from: { stage: 'COEP', name: 'COEP' },
      to: { stage: 'DIVISION', name: 'Divisional Officer' },
      reason: 'Photo is not clear',
      by: 'COEP Reviewer',
      at: '2026-11-24T12:00:00Z',
    });
    const history = [
      rejected,
      move({
        from: { stage: 'DIVISION', name: 'Divisional Officer' },
        to: { stage: 'COEP', name: 'COEP' },
        by: 'Divisional Officer Pune',
        at: '2026-11-23T12:00:00Z',
      }),
      move({ from: { stage: 'BATCH', name: 'Batch' }, to: { stage: 'DIVISION', name: 'Divisional Officer' }, at: '2026-11-22T12:00:00Z' }),
      move({}),
    ];
    mockApi(() =>
      json(200, {
        data: detail({
          history,
          approval: {
            ...NOT_APPROVED,
            stage: 'DIVISION',
            stage_label: 'With Divisional Officer',
            last_event: rejected,
            batch: { id: 'b1', name: 'Pune Batch 1' },
          },
        }),
      }),
    );
    renderAt(`/manage/applicants/${ID}`);
    const card = await screen.findByRole('region', { name: 'Approval history' });
    const moves = within(card).getAllByRole('listitem');
    expect(moves).toHaveLength(4);
    expect(moves[0]).toHaveTextContent(/Rejected by COEP.*sent back to Divisional Officer.*24 Nov(ember)? 2026.*COEP Reviewer.*Rejection reason: Photo is not clear/);
    expect(moves[1]).toHaveTextContent(/Approved by Divisional Officer.*sent to COEP.*Divisional Officer Pune/);
    expect(moves[2]).toHaveTextContent(/Put into a batch.*sent to Divisional Officer/);
    expect(moves[3]).toHaveTextContent(/Approved by Auditor.*waiting for a batch.*Program Auditor/);
    const stage = screen.getByRole('group', { name: 'Approval stage' });
    expect(stage).toHaveTextContent('Rejected by COEP: Photo is not clear');
    expect(within(stage).getByRole('link', { name: 'Pune Batch 1' })).toHaveAttribute('href', '/manage/batches/b1');
  });

  it('shows the approval stage of a submitted form: with the Auditor, then at a stage', async () => {
    mockApi(() => json(200, { data: detail() }));
    const a = renderAt(`/manage/applicants/${ID}`);
    expect(await screen.findByRole('group', { name: 'Approval stage' })).toHaveTextContent('Not approved yet');
    expect(screen.getByRole('region', { name: 'Approval history' })).toHaveTextContent('No approval or rejection yet.');
    a.unmount();
    vi.restoreAllMocks();

    mockApi(() =>
      json(200, {
        data: detail({
          approval: {
            ...NOT_APPROVED,
            stage: 'ADMIN',
            stage_label: 'With Admin (final approval)',
            last_event: {
              action: 'APPROVE',
              from: { stage: 'HEAD_OFFICE', name: 'Head Office' },
              to: { stage: 'ADMIN', name: 'Admin' },
              reason: null,
              by: 'Head Office Reviewer',
              at: '2026-11-25T12:00:00Z',
            },
          },
        }),
      }),
    );
    renderAt(`/manage/applicants/${ID}`);
    const stage = await screen.findByRole('group', { name: 'Approval stage' });
    expect(stage).toHaveTextContent('With Admin (final approval)');
    expect(stage).toHaveTextContent('Approved by Head Office (Head Office Reviewer)');
  });

  it('says so when the student does not exist', async () => {
    mockApi(() => json(404, { message: 'Applicant not found' }));
    renderAt(`/manage/applicants/${ID}`);
    expect(await screen.findByText('This student was not found.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Back to Applicants' })).toHaveAttribute('href', '/manage');
  });
});
