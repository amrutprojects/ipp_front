import { render, screen, waitFor, within } from '@testing-library/react';
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
  support: { email: 'edp.help@example.com', mobile: '+91 80103 85237' },
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
  region_id: 'r1',
  technology: 'T03',
  education_id: 'e1',
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
    registration_id: 'REG-000009',
    registration_number: '1024170019401327',
    status: 'REGISTRATION_PENDING',
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
  opts: { submit?: () => Promise<Response>; autosaveFails?: boolean; options?: Options } = {},
) {
  let app = start;
  const calls: { method: string; url: string; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    if (url.endsWith('/edp/me')) return json(200, { data: { id: 'a1', first_name: 'Kavya', last_name: 'Jadhav', email: 'kavya@example.com' } });
    if (url.endsWith('/edp/options')) return json(200, { data: opts.options ?? OPTIONS });
    if (url.endsWith('/edp/application') && method === 'GET') return json(200, { data: app });
    if (url.includes('/application/steps/') && method === 'PUT') {
      const step = Number(url.split('/').pop());
      const complete = (body as { complete: boolean }).complete;
      if (!complete && opts.autosaveFails) throw new TypeError('Failed to fetch');
      if (complete) app = { ...app, current_step: step + 1 };
      return json(200, { data: app });
    }
    if (url.endsWith('/application/submit')) {
      if (opts.submit) return opts.submit();
      app = submitted(app);
      return json(201, { data: { registration_id: 'REG-000009', registration_number: '1024170019401327', status: 'REGISTRATION_PENDING' } });
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

  it('previews the whole form, asks once more, and submits only on Yes', async () => {
    const calls = mockApi(ready());
    renderPage();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'I accept the declaration' }));
    await userEvent.click(screen.getByRole('button', { name: 'Preview & Submit' }));

    const preview = screen.getByRole('dialog', { name: 'Preview of your form before submitting' });
    for (const section of ['Step 1 of 3 – Basic Details', 'Step 2 of 3 – Main Form', 'Step 3 of 3 – Upload Documents', 'Declaration'])
      expect(within(preview).getByRole('heading', { name: section })).toBeInTheDocument();
    expect(within(preview).getByText('4821 3579 2463')).toBeInTheDocument();
    expect(within(preview).getByText('Web Design & Development')).toBeInTheDocument();
    expect(within(preview).getByText('photo.pdf')).toBeInTheDocument();
    expect(within(preview).getByText(/cannot be edited or submitted again/)).toBeInTheDocument();

    await userEvent.click(within(preview).getByRole('button', { name: 'Submit' }));
    let confirm = screen.getByRole('alertdialog', { name: 'Submit your form?' });
    expect(within(confirm).getByText(/Are you sure you want to submit your form\?/)).toBeInTheDocument();
    expect(within(confirm).getByText(/cannot be edited or submitted again/)).toBeInTheDocument();
    /* Escape closes only the question; the preview stays. */
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Preview of your form before submitting' })).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('/application/submit'))).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    confirm = screen.getByRole('alertdialog', { name: 'Submit your form?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Yes, submit' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/application/submit'))).toBe(true));
    expect(calls.find((c) => c.url.endsWith('/application/submit'))!.body).toMatchObject({ declaration_accepted: true });
    expect(await screen.findByText(/Your form has been submitted successfully\. Registration ID: REG-000009/)).toBeInTheDocument();
  });

  it('does not open the preview while something is missing', async () => {
    mockApi(ready());
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Preview & Submit' }));
    expect(screen.getByText('Please accept the declaration')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('button', { name: 'Preview & Submit' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Submit' }));
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
    expect(screen.getByRole('button', { name: 'No, go back to the preview' })).toBeDisabled();
    finish(json(201, { data: { registration_id: 'REG-000010', registration_number: '1', status: 'REGISTRATION_PENDING' } }));
    expect(await screen.findByText(/Registration ID: REG-000010/)).toBeInTheDocument();
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
    expect(screen.getByText('REG-000009')).toBeInTheDocument();
    expect(screen.getByText('photo.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit|resubmit|submit|save/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('after submitting, the page shows the final registration with no edit option', async () => {
    mockApi(draft({ current_step: 3, steps: { basic_completed: true, main_completed: true }, draft_files: done().submitted_files }));
    renderPage();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'I accept the declaration' }));
    await userEvent.click(screen.getByRole('button', { name: 'Preview & Submit' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Submit' }));
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

  it('says whom to contact with a query, with the email ID and mobile number from the API settings', async () => {
    mockApi(done());
    await renderFreshPage();
    const note = await screen.findByText(/If you have any query related to your registration, you can contact us on/);
    expect(note).toHaveTextContent(
      'If you have any query related to your registration, you can contact us on email ID edp.help@example.com or mobile number +91 80103 85237.',
    );
    expect(within(note).getByRole('link', { name: 'edp.help@example.com' })).toHaveAttribute('href', 'mailto:edp.help@example.com');
    expect(within(note).getByRole('link', { name: '+91 80103 85237' })).toHaveAttribute('href', 'tel:+918010385237');
  });

  it('names only what is set', async () => {
    mockApi(done(), { options: { ...OPTIONS, support: { email: null, mobile: '+91 80103 85237' } } });
    await renderFreshPage();
    expect(await screen.findByText(/you can contact us on/)).toHaveTextContent(
      'If you have any query related to your registration, you can contact us on mobile number +91 80103 85237.',
    );
    expect(screen.queryByRole('link', { name: /@/ })).not.toBeInTheDocument();
  });

  it('names the programme office when neither is set', async () => {
    mockApi(done(), { options: { ...OPTIONS, support: { email: null, mobile: null } } });
    await renderFreshPage();
    expect(
      await screen.findByText('If you have any query related to your registration, please contact the programme office.'),
    ).toBeInTheDocument();
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
