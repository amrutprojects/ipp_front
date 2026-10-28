import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ApplicationPage from '../src/pages/ApplicationPage';
import { SessionProvider } from '../src/session';
import type { Application, Form, Options } from '../src/types';

const OPTIONS: Options = {
  regions: [{ id: 'r1', code: 'PUN', name: 'Pune' }],
  castes: [{ id: 'c1', code: 'C1', name: 'मराठी' }],
  educations: [{ id: 'e1', code: 'E1', name: 'B.Com' }],
  religions: ['हिंदू'],
  tracks: [{ code: 'T03', name: 'Web Design & Development' }],
  document_types: [{ id: 'd1', code: 'PHOTO', name: 'Photo', is_mandatory: true, barcode: null }],
  support: {
    message: 'If you have any query related to your registration, you can contact us on email ID {email} or mobile number {mobile}.',
    email: 'edp.help@example.com',
    mobile: '+91 80103 85237',
  },
  genders: ['Male', 'Female', 'Transgender'],
  marital_statuses: ['Unmarried', 'Married'],
  districts: [{ id: 'dist1', code: 'PUN', name: 'Pune' }],
  centres: [
    { id: 'cen1', code: 'PUN-01', name: 'Baramati Centre', district_name: 'Pune' },
    { id: 'cen2', code: 'NSK-01', name: 'Nashik Centre', district_name: 'Nashik' },
    { id: 'cen3', code: 'SAT-01', name: 'Satara Centre', district_name: 'Satara' },
  ],
  grading_types: [
    { code: 'PERCENTAGE', name: 'Percentage' },
    { code: 'CGPA', name: 'CGPA' },
  ],
  cgpa_scales: [4, 5, 10],
  qualification_classes: ['Distinction', 'First Class', 'Higher Second Class', 'Second Class', 'Pass Class'],
};
/* The dependent lists: a district's talukas and a centre's technologies. */
const TALUKAS: Record<string, { id: string; code: string; name: string }[]> = { dist1: [{ id: 'tal1', code: 'HVL', name: 'Haveli' }] };
const TECHNOLOGIES: Record<string, { code: string; name: string }[]> = {
  cen1: [{ code: 'T03', name: 'Web Design & Development' }],
  cen2: [{ code: 'T05', name: 'Cyber Security' }],
  cen3: [],
};
const FORM: Form = {
  first_name: 'Kavya',
  last_name: 'Jadhav',
  father_name: 'Suresh Jadhav',
  mother_name: 'Meena Jadhav',
  email: 'kavya@example.com',
  date_of_birth: '2002-06-01',
  current_address: 'Kothrud, Pune',
  aadhaar_number: '482135792463',
  mobile_number: '9765412345',
  religion: 'हिंदू',
  caste_id: 'c1',
  gender: 'Female',
  marital_status: 'Unmarried',
  permanent_address: 'Kothrud, Pune',
  landmark: '',
  district_id: 'dist1',
  taluka_id: 'tal1',
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
const draft = (over: Partial<Application> = {}): Application => ({
  status: 'DRAFT',
  current_step: 1,
  steps: { basic_completed: false, main_completed: false },
  editable: true,
  submitted_at: null,
  form: FORM,
  barcodes: {},
  draft_files: [],
  submitted_files: [],
  registration: null,
  ...over,
});
/* The application as the API returns it after the (final) submission. */
const submitted = (app: Application): Application => ({
  ...app,
  status: 'SUBMITTED',
  editable: false,
  submitted_at: new Date().toISOString(),
  submitted_files: app.draft_files,
  draft_files: [],
  registration: {
    registration_id: 'EDP-000009',
    registration_number: '1024170019401327',
    status: 'SUBMITTED',
    aadhaar_masked: 'XXXX-XXXX-2463',
    display: {},
  },
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/*
 * The EDP API as the page sees it; records every call. `submit` replaces the submit response; `autosaveFails`
 * makes every autosave (complete=false) fail as if the connection dropped.
 */
function mockApi(
  start: Application,
  opts: {
    submit?: () => Promise<Response>;
    autosaveFails?: boolean;
    options?: Options;
    /* Answers a centre's technologies itself (e.g. late, to answer out of order); undefined = the default answer. */
    technologies?: (centreId: string) => Promise<Response> | undefined;
  } = {},
) {
  let app = start;
  const calls: { method: string; url: string; body: unknown; raw?: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body, raw: init?.body });
    if (url.endsWith('/edp/me')) return json(200, { data: { id: 'a1', first_name: 'Kavya', last_name: 'Jadhav', email: 'kavya@example.com' } });
    if (url.endsWith('/edp/options')) return json(200, { data: opts.options ?? OPTIONS });
    if (url.endsWith('/edp/application') && method === 'GET') return json(200, { data: app });
    const taluka = /\/edp\/districts\/([^/]+)\/talukas$/.exec(url);
    if (taluka) return json(200, { data: TALUKAS[taluka[1]!] ?? [] });
    const tech = /\/edp\/centres\/([^/]+)\/technologies$/.exec(url);
    if (tech) {
      const answer = opts.technologies?.(tech[1]!);
      if (answer) return answer;
      return TECHNOLOGIES[tech[1]!] ? json(200, { data: TECHNOLOGIES[tech[1]!] }) : json(404, { message: 'Center not found or inactive' });
    }
    if (url.includes('/application/steps/') && method === 'PUT') {
      const step = Number(url.split('/').pop());
      const complete = (body as { complete: boolean }).complete;
      if (!complete && opts.autosaveFails) throw new TypeError('Failed to fetch');
      if (complete) app = { ...app, current_step: step + 1 };
      return json(200, { data: app });
    }
    if (url.endsWith('/application/documents') && method === 'POST') {
      const fd = init?.body as FormData;
      const [code, file] = [...fd.entries()][0] as [string, File];
      const entry = { doc_type: code, name: code, original_name: file.name, mime_type: file.type, size_bytes: file.size, uploaded_at: '' };
      app = { ...app, draft_files: [...app.draft_files.filter((f) => f.doc_type !== code), entry] };
      return json(201, { data: app });
    }
    if (url.endsWith('/application/submit')) {
      if (opts.submit) return opts.submit();
      app = submitted(app);
      return json(201, { data: { registration_id: 'EDP-000009', registration_number: '1024170019401327', status: 'SUBMITTED' } });
    }
    return json(404, { message: 'not mocked' });
  });
  return calls;
}

function renderPage() {
  localStorage.setItem('edp.token', 'test-token');
  return render(
    <MemoryRouter>
      <SessionProvider>
        <ApplicationPage />
      </SessionProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Save & Next asks first', () => {
  it('asks "are you sure" for a complete step; No stays, Yes saves and moves on', async () => {
    const calls = mockApi(draft());
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Save & Next →' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Save Step 1 of 3 – Basic Details?' });
    expect(within(dialog).getByText(/Step 2 of 3 – Main Form/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'No, stay here' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(calls.some((c) => c.method === 'PUT' && (c.body as { complete: boolean }).complete)).toBe(false);
    expect(screen.getByRole('heading', { name: 'Step 1 of 3 – Basic Details' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save & Next →' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, save & next' }));
    expect(await screen.findByRole('heading', { name: 'Step 2 of 3 – Main Form' })).toBeInTheDocument();
    const saved = calls.find((c) => c.method === 'PUT' && (c.body as { complete: boolean }).complete)!;
    expect(saved.url).toMatch(/\/application\/steps\/1$/);
    expect((saved.body as { data: Record<string, string> }).data).toMatchObject({ first_name: 'Kavya', aadhaar_number: '482135792463' });
  });

  it('shows the field errors instead of asking when the step is incomplete', async () => {
    mockApi(draft({ form: { ...FORM, father_name: '' } }));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Save & Next →' }));
    expect(screen.getByText('Father name is required')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('Final submission: preview, then "are you sure"', () => {
  const ready = () =>
    draft({
      current_step: 3,
      steps: { basic_completed: true, main_completed: true },
      draft_files: [
        { doc_type: 'PHOTO', name: 'Photo', original_name: 'photo.pdf', mime_type: 'application/pdf', size_bytes: 2048, uploaded_at: '' },
      ],
    });

  it('Preview Application shows the whole form read-only and never submits', async () => {
    const calls = mockApi(ready());
    renderPage();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'I accept the declaration' }));
    await userEvent.click(screen.getByRole('button', { name: 'Preview Application' }));

    const preview = screen.getByRole('dialog', { name: 'Preview of your application' });
    for (const section of ['Step 1 of 3 – Basic Details', 'Step 2 of 3 – Main Form', 'Step 3 of 3 – Upload Documents', 'Declaration'])
      expect(within(preview).getByRole('heading', { name: section })).toBeInTheDocument();
    expect(within(preview).getByText('4821 3579 2463')).toBeInTheDocument();
    expect(within(preview).getByText('Web Design & Development')).toBeInTheDocument();
    expect(within(preview).getByText('photo.pdf')).toBeInTheDocument();
    expect(within(preview).queryByRole('button', { name: /submit/i })).not.toBeInTheDocument();

    await userEvent.click(within(preview).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('/application/submit'))).toBe(false);
  });

  it('Submit Application asks "are you sure" and submits only on Yes', async () => {
    const calls = mockApi(ready());
    renderPage();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'I accept the declaration' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));
    let confirm = screen.getByRole('alertdialog', { name: 'Submit your form?' });
    expect(within(confirm).getByText(/Are you sure you want to submit your form?/)).toBeInTheDocument();
    expect(within(confirm).getByText(/cannot be edited or submitted again/)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('/application/submit'))).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));
    confirm = screen.getByRole('alertdialog', { name: 'Submit your form?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Yes, submit' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/application/submit'))).toBe(true));
    expect(calls.find((c) => c.url.endsWith('/application/submit'))!.body).toEqual({ declaration_accepted: true });
    expect(await screen.findByText(/Your form has been submitted successfully. Registration ID: EDP-000009/)).toBeInTheDocument();
    expect(calls.filter((c) => c.url.endsWith('/application/submit'))).toHaveLength(1);
  });

  it('does not open the preview while something is missing', async () => {
    mockApi(ready());
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Preview Application' }));
    expect(screen.getByText('Please accept the declaration')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('Final submission: when things go wrong', () => {
  const ready = (over: Partial<Application> = {}) =>
    draft({
      current_step: 3,
      steps: { basic_completed: true, main_completed: true },
      draft_files: [
        { doc_type: 'PHOTO', name: 'Photo', original_name: 'photo.pdf', mime_type: 'application/pdf', size_bytes: 2048, uploaded_at: '' },
      ],
      ...over,
    });
  const openConfirm = async () => {
    await userEvent.click(await screen.findByRole('checkbox', { name: 'I accept the declaration' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));
  };

  it('a field error from the server closes the dialogs and opens the step it belongs to', async () => {
    mockApi(ready(), {
      submit: async () =>
        json(422, {
          message: 'Validation failed',
          error: { code: 'VALIDATION_ERROR', details: [{ field: 'body.father_name', message: 'Father name may contain only letters' }] },
        }),
    });
    renderPage();
    await openConfirm();
    await userEvent.click(screen.getByRole('button', { name: 'Yes, submit' }));
    expect(await screen.findByRole('heading', { name: 'Step 1 of 3 – Basic Details' })).toBeInTheDocument();
    expect(screen.getByText('Father name may contain only letters')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('submits nothing when the latest changes could not be saved', async () => {
    const calls = mockApi(ready(), { autosaveFails: true });
    renderPage();
    /* A change on step 1 that cannot be saved (the connection is down). */
    await userEvent.click(await screen.findByRole('button', { name: /Basic Details/ }));
    await userEvent.type(screen.getByLabelText(/^Father Name/), 'x');
    await userEvent.click(screen.getByRole('button', { name: /Upload Documents/ }));
    await openConfirm();
    await userEvent.click(screen.getByRole('button', { name: 'Yes, submit' }));
    expect(await screen.findByText(/Your latest changes could not be saved/)).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('/application/submit'))).toBe(false);
  });

  it('keeps the question open while submitting (Escape does nothing, buttons disabled)', async () => {
    let finish: (r: Response) => void = () => undefined;
    const calls = mockApi(ready(), { submit: () => new Promise<Response>((res) => (finish = res)) });
    renderPage();
    await openConfirm();
    await userEvent.click(screen.getByRole('button', { name: 'Yes, submit' }));
    expect(await screen.findByRole('button', { name: 'Submitting…' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog', { name: 'Submit your form?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No, go back' })).toBeDisabled();
    finish(json(201, { data: { registration_id: 'EDP-000010', registration_number: '1', status: 'SUBMITTED' } }));
    expect(await screen.findByText(/Registration ID: EDP-000010/)).toBeInTheDocument();
    expect(calls.filter((c) => c.url.endsWith('/application/submit'))).toHaveLength(1);
  });

});

describe('A submitted form is final', () => {
  const done = () =>
    submitted(
      draft({
        current_step: 3,
        steps: { basic_completed: true, main_completed: true },
        draft_files: [
          { doc_type: 'PHOTO', name: 'Photo', original_name: 'photo.pdf', mime_type: 'application/pdf', size_bytes: 2048, uploaded_at: '' },
        ],
      }),
    );

  it('shows the registration read-only, says it is final, and offers no way to change it', async () => {
    const calls = mockApi(done());
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Your registration' })).toBeInTheDocument();
    expect(screen.getByText(/The submission is final; the form cannot be changed\./)).toBeInTheDocument();
    expect(screen.getByText('EDP-000009')).toBeInTheDocument();
    expect(screen.getByText('photo.pdf')).toBeInTheDocument();
    expect(screen.getByText('Submitted', { selector: 'dd' })).toBeInTheDocument();
    /* Nothing is verified yet, so no verification column (no "Pending" badge either). */
    expect(screen.queryByRole('columnheader', { name: 'Verification' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Pending|admin panel|Student Registrations/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit|resubmit|submit|save/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('after submitting, the page shows the final registration with no edit option', async () => {
    mockApi(draft({ current_step: 3, steps: { basic_completed: true, main_completed: true }, draft_files: done().submitted_files }));
    renderPage();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'I accept the declaration' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, submit' }));
    expect(await screen.findByRole('heading', { name: 'Your registration' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit|resubmit/i })).not.toBeInTheDocument();
  });

  /* A new page load: the options, with the contact, are fetched once per load. */
  async function renderFreshPage() {
    vi.resetModules();
    const { default: Page } = await import('../src/pages/ApplicationPage');
    const { SessionProvider: Provider } = await import('../src/session');
    localStorage.setItem('edp.token', 'test-token');
    return render(
      <MemoryRouter>
        <Provider>
          <Page />
        </Provider>
      </MemoryRouter>,
    );
  }

  it('says whom to contact with a query: the message from the settings, {email} and {mobile} as links', async () => {
    mockApi(done());
    await renderFreshPage();
    const note = await screen.findByText(/If you have any query related to your registration, you can contact us on/);
    expect(note).toHaveTextContent(
      'If you have any query related to your registration, you can contact us on email ID edp.help@example.com or mobile number +91 80103 85237.',
    );
    expect(within(note).getByRole('link', { name: 'edp.help@example.com' })).toHaveAttribute('href', 'mailto:edp.help@example.com');
    expect(within(note).getByRole('link', { name: '+91 80103 85237' })).toHaveAttribute('href', 'tel:+918010385237');
  });

  it('shows a message without placeholders followed by the contacts that are set', async () => {
    mockApi(done(), { options: { ...OPTIONS, support: { message: 'Call the EDP office for help.', email: null, mobile: '+91 80103 85237' } } });
    await renderFreshPage();
    const note = await screen.findByText(/Call the EDP office for help\./);
    expect(note).toHaveTextContent('Call the EDP office for help. Mobile: +91 80103 85237');
    expect(within(note).getByRole('link', { name: '+91 80103 85237' })).toHaveAttribute('href', 'tel:+918010385237');
    expect(screen.queryByRole('link', { name: /@/ })).not.toBeInTheDocument();
  });

  it('shows nothing when the message is empty', async () => {
    mockApi(done(), { options: { ...OPTIONS, support: { message: '', email: 'edp.help@example.com', mobile: null } } });
    await renderFreshPage();
    expect(await screen.findByRole('heading', { name: 'Your registration' })).toBeInTheDocument();
    expect(screen.queryByText(/contact/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /@|\+91/ })).not.toBeInTheDocument();
  });
});

describe('Email in the form', () => {
  it("is the account's email, read-only, and never sent changed", async () => {
    const calls = mockApi(draft());
    renderPage();
    const email = (await screen.findByLabelText(/^Email/)) as HTMLInputElement;
    expect(email).toHaveValue('kavya@example.com');
    expect(email).toHaveAttribute('readonly');
    expect(email).toHaveAccessibleDescription(/cannot be changed/);
    await userEvent.type(email, 'x');
    expect(email).toHaveValue('kavya@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Save & Next →' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, save & next' }));
    await screen.findByRole('heading', { name: 'Step 2 of 3 – Main Form' });
    for (const c of calls.filter((c) => c.method === 'PUT'))
      expect((c.body as { data: Record<string, string> }).data.email ?? 'kavya@example.com').toBe('kavya@example.com');
  });
});

describe('Step 2: center and technology', () => {
  const step2 = (over: Partial<Form> = {}) =>
    draft({ current_step: 2, steps: { basic_completed: true, main_completed: false }, form: { ...FORM, ...over } });
  const techSelect = () => screen.getByLabelText(/^Technology/) as HTMLSelectElement;
  const techNames = () => [...techSelect().options].filter((o) => o.value).map((o) => o.text);

  it('changing the center clears the technology at once, saves that, and ignores a late answer for an earlier center', async () => {
    let finishCen2: (r: Response) => void = () => undefined;
    const calls = mockApi(step2(), {
      technologies: (id) => (id === 'cen2' ? new Promise<Response>((res) => (finishCen2 = res)) : undefined),
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Step 2 of 3 – Main Form' });
    await waitFor(() => expect(techNames()).toEqual(['Web Design & Development']));
    expect(techSelect().value).toBe('T03');

    const centre = screen.getByLabelText(/^Center Name/);
    await userEvent.selectOptions(centre, 'cen2');
    expect(techSelect().value).toBe('');
    expect(techSelect()).toBeDisabled();
    expect(within(techSelect()).getByRole('option', { name: 'Loading technologies…' })).toBeInTheDocument();

    /* Back to the first center before the second one's answer arrives; that late answer must not win. */
    await userEvent.selectOptions(centre, 'cen1');
    await waitFor(() => expect(techNames()).toEqual(['Web Design & Development']));
    finishCen2(json(200, { data: [{ code: 'T05', name: 'Cyber Security' }] }));
    await new Promise((r) => setTimeout(r, 50));
    expect(techNames()).toEqual(['Web Design & Development']);
    expect(techSelect().value).toBe('');

    await waitFor(
      () => {
        const autosave = calls.filter((c) => c.method === 'PUT' && c.url.endsWith('/steps/2'));
        expect(autosave.slice(-1)[0]?.body).toMatchObject({ complete: false, data: { centre_id: 'cen1', technology: '' } });
      },
      { timeout: 3000 },
    );
  });

  it('says so when the center offers no technologies, and keeps the technology disabled', async () => {
    mockApi(step2({ centre_id: 'cen3', technology: '' }));
    renderPage();
    expect(await screen.findByText(/No technologies are currently offered at this center/)).toBeInTheDocument();
    expect(techSelect()).toBeDisabled();
  });

  it('on resume, clears a saved technology the center no longer offers, with a warning', async () => {
    mockApi(step2({ technology: 'T12' }));
    renderPage();
    expect(await screen.findByText(/no longer offered at this center/)).toBeInTheDocument();
    expect(techSelect().value).toBe('');
  });

  it('asks for the CGPA scale only for CGPA and checks the score against it', async () => {
    mockApi(step2({ grading_type: 'CGPA', cgpa_scale: '10', score: '11' }));
    renderPage();
    await screen.findByRole('heading', { name: 'Step 2 of 3 – Main Form' });
    expect(screen.getByLabelText(/^CGPA Scale/)).toHaveValue('10');
    await userEvent.click(screen.getByRole('button', { name: 'Save & Next →' }));
    expect(screen.getByText('CGPA must be between 0 and 10')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(/^Grading Type/), 'PERCENTAGE');
    expect(screen.queryByLabelText(/^CGPA Scale/)).not.toBeInTheDocument();
  });

  it('rejects a percentage over 100', async () => {
    mockApi(step2({ score: '100.5' }));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Save & Next →' }));
    expect(screen.getByText('Percentage must be between 0 and 100')).toBeInTheDocument();
    expect(screen.getByText(/Please correct the highlighted fields: Score\./)).toBeInTheDocument();
  });
});

describe('Step 1: new fields', () => {
  it('shows the disability details only for Yes, and clears them when switched back to No', async () => {
    const calls = mockApi(draft());
    renderPage();
    const group = await screen.findByRole('group', { name: /Person with Disability/ });
    expect(screen.queryByLabelText(/^Type of Disability/)).not.toBeInTheDocument();
    await userEvent.click(within(group).getByRole('radio', { name: 'Yes' }));
    await userEvent.type(screen.getByLabelText(/^Type of Disability/), 'Locomotor');
    await userEvent.click(screen.getByRole('button', { name: 'Save & Next →' }));
    expect(screen.getByText('Disability certificate number is required')).toBeInTheDocument();
    await userEvent.click(within(group).getByRole('radio', { name: 'No' }));
    expect(screen.queryByLabelText(/^Type of Disability/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save & Next →' }));
    expect(screen.getByRole('alertdialog', { name: /Save Step 1 of 3/ })).toBeInTheDocument();
    await waitFor(
      () => {
        const autosave = calls.filter((c) => c.method === 'PUT' && c.url.endsWith('/steps/1'));
        expect(autosave.slice(-1)[0]?.body).toMatchObject({ data: { disability_status: 'No', disability_type: '' } });
      },
      { timeout: 3000 },
    );
  });

  it('keeps only digits in the PIN code, and copies the current address while "same" is ticked', async () => {
    mockApi(draft({ form: { ...FORM, permanent_address: '' } }));
    renderPage();
    const pin = (await screen.findByLabelText(/^PIN Code/)) as HTMLInputElement;
    await userEvent.clear(pin);
    await userEvent.type(pin, '41a1-0389');
    expect(pin).toHaveValue('411038');
    await userEvent.click(screen.getByRole('checkbox', { name: /same as the current address/ }));
    expect(screen.getByLabelText(/^Permanent Address/)).toHaveValue('Kothrud, Pune');
    await userEvent.type(screen.getByLabelText(/^Current Address/), ', MH');
    expect(screen.getByLabelText(/^Permanent Address/)).toHaveValue('Kothrud, Pune, MH');
  });

  it('accepts an empty alternate mobile number but not an invalid one', async () => {
    mockApi(draft({ form: { ...FORM, alternate_mobile_number: '12345' } }));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Save & Next →' }));
    expect(screen.getByText(/Alternate mobile number must be a 10-digit/)).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText(/^Alternate Mobile Number/));
    await userEvent.click(screen.getByRole('button', { name: 'Save & Next →' }));
    expect(screen.getByRole('alertdialog', { name: /Save Step 1 of 3/ })).toBeInTheDocument();
  });

  it('loads the talukas of the chosen district and clears the taluka when the district changes', async () => {
    mockApi(draft({ form: { ...FORM, district_id: '', taluka_id: '' } }));
    renderPage();
    const taluka = (await screen.findByLabelText(/^Taluka/)) as HTMLSelectElement;
    expect(taluka).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText(/^District/), 'dist1');
    await waitFor(() => expect(taluka).toBeEnabled());
    await userEvent.selectOptions(taluka, 'tal1');
    await userEvent.selectOptions(screen.getByLabelText(/^District/), '');
    expect(taluka.value).toBe('');
    expect(taluka).toBeDisabled();
  });
});

describe('Step 3: Upload Documents', () => {
  /* GET /edp/options → document_types, exactly as the server lists them (order, names, mandatory). */
  const DOCS: Options['document_types'] = [
    { id: 'd1', code: 'PHOTO', name: 'Photo', is_mandatory: true, barcode: null },
    { id: 'd2', code: 'SIGNATURE', name: 'Signature', is_mandatory: true, barcode: null },
    { id: 'd3', code: 'AADHAAR_CARD', name: 'Aadhar Card', is_mandatory: true, barcode: null },
    { id: 'd4', code: 'AADHAAR_PHOTO', name: 'Applicant Photograph with Aadhaar', is_mandatory: true, barcode: null },
    { id: 'd5', code: 'APPLICANT_VIDEO', name: 'Applicant Video with Aadhaar', is_mandatory: false, barcode: null, formats: ['MP4'], max_mb: 50 },
    { id: 'd6', code: 'PAN_CARD', name: 'PAN Card', is_mandatory: true, barcode: null },
    { id: 'd7', code: 'HSC_DIPLOMA', name: '12th Pass Or 3 Years Diploma Pass Marksheet / Certificate', is_mandatory: true, barcode: null },
    { id: 'd8', code: 'EDU_CERT', name: 'Highest Qualification Certificate / Marksheet', is_mandatory: true, barcode: null },
    { id: 'd9', code: 'INCOME_EWS', name: 'EWS Certificate', is_mandatory: true, barcode: null },
    { id: 'd10', code: 'SCHOOL_LEAVING', name: 'School Leaving Certificate / Transfer Certificate', is_mandatory: true, barcode: null },
    { id: 'd11', code: 'DOMICILE', name: 'Domicile of Certificate Maharashtra', is_mandatory: true, barcode: null },
  ];
  const withDocs: Options = { ...OPTIONS, document_types: DOCS };
  const file = (code: string, original_name = `${code.toLowerCase()}.pdf`) => ({
    doc_type: code,
    name: DOCS.find((d) => d.code === code)?.name ?? code,
    original_name,
    mime_type: 'application/pdf',
    size_bytes: 2048,
    uploaded_at: '',
  });
  const mandatory = DOCS.filter((d) => d.is_mandatory);
  /* A new page load, so the options (with these document types) are fetched again. */
  async function renderFresh() {
    vi.resetModules();
    const { default: Page } = await import('../src/pages/ApplicationPage');
    const { SessionProvider: Provider } = await import('../src/session');
    localStorage.setItem('edp.token', 'test-token');
    return render(
      <MemoryRouter>
        <Provider>
          <Page />
        </Provider>
      </MemoryRouter>,
    );
  }
  const step3 = (files: Application['draft_files']) =>
    draft({ current_step: 3, steps: { basic_completed: true, main_completed: true }, draft_files: files });
  const labels = () => [...document.querySelectorAll('.doc-field > .label')].map((l) => l.textContent?.replace(/\s+/g, ' ').trim());

  it('shows the server list in its order, * for mandatory ones, the video as optional, and nothing else', async () => {
    /* A caste certificate uploaded before the list changed: no longer listed, so not shown. */
    mockApi(step3([file('PHOTO'), file('CASTE_CERT', 'caste.pdf')]), { options: withDocs });
    await renderFresh();
    expect(await screen.findByRole('heading', { name: 'Upload Documents' })).toBeInTheDocument();
    expect(screen.getByText('Please fill in all required fields marked with *')).toBeInTheDocument();
    expect(labels()).toEqual([
      'Photo *',
      'Signature *',
      'Aadhar Card *',
      'Applicant Photograph with Aadhaar *',
      'Applicant Video with Aadhaar (optional)',
      'PAN Card *',
      '12th Pass Or 3 Years Diploma Pass Marksheet / Certificate *',
      'Highest Qualification Certificate / Marksheet *',
      'EWS Certificate *',
      'School Leaving Certificate / Transfer Certificate *',
      'Domicile of Certificate Maharashtra *',
    ]);
    expect(screen.queryByText(/caste\.pdf/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Caste Certificate|Disability Certificate|Change in Name/)).not.toBeInTheDocument();
    expect(screen.getAllByText('No file chosen')).toHaveLength(10);
    expect(screen.getAllByText('Click or drag file')).toHaveLength(11);
    /* Ten documents take PDF / JPG / PNG up to 5 MB; the Applicant Video an MP4 up to 50 MB. */
    expect(screen.getAllByText('PDF, JPG, PNG · max 5MB')).toHaveLength(10);
    expect(screen.getAllByText('Accepted formats: PDF, JPG, JPEG, PNG (max 5MB)')).toHaveLength(10);
    expect(screen.getAllByText('MP4 · max 50MB')).toHaveLength(1);
    expect(screen.getAllByText('Accepted formats: MP4 (max 50MB)')).toHaveLength(1);
    /* The uploaded photo: its name in the file area, with View / Replace / Remove. */
    expect(document.getElementById('doc-PHOTO')).toHaveTextContent('photo.pdf');
    for (const action of ['View', 'Replace', 'Remove']) expect(screen.getByRole('button', { name: `${action} Photo` })).toBeInTheDocument();
    /* No barcode fields any more (not under the EWS or domicile certificate either). */
    expect(screen.queryByLabelText(/Barcode/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Barcode/i)).not.toBeInTheDocument();
    expect(document.querySelectorAll('input[type="text"], input:not([type])')).toHaveLength(0);
    for (const name of ['Previous', 'Preview Application', 'Submit Application']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
  });

  it('requires exactly the mandatory documents (not the video) before submitting', async () => {
    const calls = mockApi(step3([file('PHOTO')]), { options: withDocs });
    await renderFresh();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'I accept the declaration' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));
    for (const d of mandatory.filter((d) => d.code !== 'PHOTO')) expect(screen.getByText(`${d.name} is required`)).toBeInTheDocument();
    expect(screen.queryByText('Photo is required')).not.toBeInTheDocument();
    expect(screen.queryByText(/Applicant Video with Aadhaar is required/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('/application/submit'))).toBe(false);
  });

  it('the Applicant Video is optional: all mandatory documents are enough to submit', async () => {
    /* Barcodes the server may still return from an older draft are not sent back. */
    const calls = mockApi({ ...step3(mandatory.map((d) => file(d.code))), barcodes: { INCOME_EWS: '123456789012345678' } }, { options: withDocs });
    await renderFresh();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'I accept the declaration' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit Application' }));
    await userEvent.click(within(screen.getByRole('alertdialog', { name: 'Submit your form?' })).getByRole('button', { name: 'Yes, submit' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/application/submit'))).toBe(true));
    expect(calls.find((c) => c.url.endsWith('/application/submit'))!.body).toEqual({ declaration_accepted: true });
    expect(calls.some((c) => c.url.endsWith('/application/steps/3'))).toBe(false);
  });

  it('drops a step-3 value left unsaved by an older version instead of sending it', async () => {
    localStorage.setItem('edp.pending.a1', JSON.stringify({ 3: { INCOME_EWS: '123456789012345678' } }));
    const calls = mockApi(step3(mandatory.map((d) => file(d.code))), { options: withDocs });
    await renderFresh();
    await screen.findByRole('heading', { name: 'Upload Documents' });
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.some((c) => c.url.includes('/application/steps/'))).toBe(false);
    expect(localStorage.getItem('edp.pending.a1')).toBeNull();
  });

  it('offers the Self-Declaration Form for download', async () => {
    mockApi(step3([]), { options: withDocs });
    await renderFresh();
    const block = (await screen.findByRole('heading', { name: 'Download documents' })).closest('section')!;
    expect(within(block).getByText('Self-Declaration Form')).toBeInTheDocument();
    const link = within(block).getByRole('link', { name: 'Self-Declaration_Form.pdf' });
    expect(link).toHaveAttribute('href', '/Self-Declaration_Form.pdf');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('download');
  });

  it('uploads a file dropped on the file area, under the document code', async () => {
    const calls = mockApi(step3([]), { options: withDocs });
    await renderFresh();
    await screen.findByRole('heading', { name: 'Upload Documents' });
    const area = document.getElementById('doc-AADHAAR_CARD')!;
    const dropped = new File(['%PDF-1.4'], 'aadhaar.pdf', { type: 'application/pdf' });
    fireEvent.dragOver(area, { dataTransfer: { files: [dropped], dropEffect: 'none' } });
    fireEvent.drop(area, { dataTransfer: { files: [dropped] } });
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/application/documents'))).toBe(true));
    const sent = calls.find((c) => c.method === 'POST' && c.url.endsWith('/application/documents'))!.raw as FormData;
    expect([...sent.keys()]).toEqual(['AADHAAR_CARD']);
    expect((sent.get('AADHAAR_CARD') as File).name).toBe('aadhaar.pdf');
    await waitFor(() => expect(area).toHaveTextContent('aadhaar.pdf'));
  });

  it('rejects a dropped file of another type without uploading it', async () => {
    const calls = mockApi(step3([]), { options: withDocs });
    await renderFresh();
    await screen.findByRole('heading', { name: 'Upload Documents' });
    fireEvent.drop(document.getElementById('doc-PAN_CARD')!, { dataTransfer: { files: [new File(['x'], 'pan.docx')] } });
    expect(await screen.findByText('Only PDF, JPG, JPEG or PNG files are accepted')).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('/application/documents'))).toBe(false);
  });

  it('takes an MP4 of up to 50 MB for the Applicant Video, and PDF / JPG / PNG of up to 5 MB for the other documents', async () => {
    const calls = mockApi(step3([]), { options: withDocs });
    await renderFresh();
    await screen.findByRole('heading', { name: 'Upload Documents' });
    const video = document.getElementById('doc-APPLICANT_VIDEO')!;
    expect(video).toHaveTextContent('MP4 · max 50MB');
    expect(screen.getByText('Accepted formats: MP4 (max 50MB)')).toBeInTheDocument();
    expect(screen.getByLabelText('Upload Applicant Video with Aadhaar')).toHaveAttribute('accept', '.mp4,video/mp4');
    expect(document.getElementById('doc-PHOTO')).toHaveTextContent('PDF, JPG, PNG · max 5MB');
    expect(screen.getByLabelText('Upload Photo')).toHaveAttribute('accept', '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png');

    /* A PDF is not a video; a video over 50 MB is refused; neither is uploaded. */
    fireEvent.drop(video, { dataTransfer: { files: [new File(['%PDF'], 'video.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText('Only MP4 files are accepted')).toBeInTheDocument();
    const big = new File(['v'], 'video.mp4', { type: 'video/mp4' });
    Object.defineProperty(big, 'size', { value: 51 * 1024 * 1024 });
    fireEvent.drop(video, { dataTransfer: { files: [big] } });
    expect(await screen.findByText('File is larger than 50 MB')).toBeInTheDocument();
    /* An MP4 is not accepted for a document such as the Photo. */
    fireEvent.drop(document.getElementById('doc-PHOTO')!, { dataTransfer: { files: [new File(['v'], 'photo.mp4', { type: 'video/mp4' })] } });
    expect(await screen.findByText('Only PDF, JPG, JPEG or PNG files are accepted')).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('/application/documents'))).toBe(false);

    /* A 20 MB MP4 is uploaded for the video. */
    const ok = new File(['v'], 'aadhaar-video.mp4', { type: 'video/mp4' });
    Object.defineProperty(ok, 'size', { value: 20 * 1024 * 1024 });
    fireEvent.drop(video, { dataTransfer: { files: [ok] } });
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/application/documents'))).toBe(true));
  });

  it('the file area opens the file chooser from the keyboard, and a chosen file is uploaded', async () => {
    const calls = mockApi(step3([]), { options: withDocs });
    await renderFresh();
    await screen.findByRole('heading', { name: 'Upload Documents' });
    const open = vi.spyOn(HTMLInputElement.prototype, 'click');
    document.getElementById('doc-APPLICANT_VIDEO')!.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(open).toHaveBeenCalledTimes(2);
    open.mockRestore();
    await userEvent.upload(screen.getByLabelText('Upload Applicant Video with Aadhaar'), new File(['v'], 'video.mp4', { type: 'video/mp4' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/application/documents'))).toBe(true));
    expect([...(calls.find((c) => c.url.endsWith('/application/documents'))!.raw as FormData).keys()]).toEqual(['APPLICANT_VIDEO']);
  });
});
