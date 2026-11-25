import { StrictMode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BASIC_FIELDS, MAIN_FIELDS, type Application, type Form, type HelpContent, type Options, type WelcomeContent } from '../src/types';

const blankForm = () => Object.fromEntries([...BASIC_FIELDS, ...MAIN_FIELDS].map((k) => [k, ''])) as Form;
const DRAFT: Application = {
  status: 'DRAFT',
  current_step: 1,
  steps: { basic_completed: false, main_completed: false },
  editable: true,
  submitted_at: null,
  form: blankForm(),
  barcodes: {},
  draft_files: [],
  submitted_files: [],
  registration: null,
};

const WELCOME: WelcomeContent = {
  enabled: true,
  title: 'Congratulations, Kavya!',
  message: 'Your account is ready. Fill in the form in three steps.',
  button_label: 'Start my form',
};
const HELP: HelpContent = {
  enabled: true,
  title: 'Need any help?',
  intro: 'The programme office answers between 10 am and 6 pm.',
  fields: [
    { label: 'Contact Number', value: '+91 90000 00000' },
    { label: 'Email ID', value: 'help@example.com' },
    { label: 'WhatsApp', value: '9876543210' },
    { label: 'Office hours', value: 'Monday to Friday' },
  ],
};
const OPTIONS: Options = {
  regions: [],
  castes: [],
  educations: [],
  document_types: [],
  religions: [],
  tracks: [],
  genders: [],
  marital_statuses: [],
  districts: [],
  centres: [],
  grading_types: [],
  cgpa_scales: [],
  qualification_classes: [],
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function mockApi(options: Options) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/edp/me')) return json(200, { data: { id: 'a1', first_name: 'Kavya', last_name: 'Jadhav', email: 'kavya@example.com' } });
    if (url.endsWith('/edp/options')) return json(200, { data: options });
    if (url.endsWith('/edp/application')) return json(200, { data: DRAFT });
    if (url.endsWith('/auth/otp-status'))
      return json(200, { data: { email: 'kavya@example.com', otp_expires_in: 300, resend_after: 300, mobile_masked: '+91XXXXXX5147' } });
    return json(404, { message: 'not mocked' });
  });
}

/*
 * A fresh page load: the options cache in ui.tsx starts empty, so each test gets its own settings, and nothing is owed
 * until the OTP page says so. `justVerified` is the hand-over the OTP page makes (welcome.ts).
 */
async function renderApplication(justVerified: boolean) {
  vi.resetModules();
  const { default: Page } = await import('../src/pages/ApplicationPage');
  const { SessionProvider } = await import('../src/session');
  const { oweWelcome } = await import('../src/welcome');
  if (justVerified) oweWelcome();
  localStorage.setItem('edp.token', 'test-token');
  return render(
    <MemoryRouter initialEntries={['/application']}>
      <SessionProvider>
        <Page />
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

describe('The congratulations dialog', () => {
  /* The student's own path: the OTP is verified, the account exists, and the dialog is the first thing they see. */
  it('opens right after Verify & create account', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/otp-status'))
        return json(200, { data: { email: 'kavya@example.com', otp_expires_in: 300, resend_after: 300, mobile_masked: '+91XXXXXX5147' } });
      if (url.endsWith('/auth/verify-otp'))
        return json(200, {
          data: {
            token: 'student-token',
            expires_at: '2026-12-01T00:00:00Z',
            account: { id: 'a1', first_name: 'Kavya', last_name: 'Jadhav', email: 'kavya@example.com' },
          },
        });
      if (url.endsWith('/edp/me')) return json(200, { data: { id: 'a1', first_name: 'Kavya', last_name: 'Jadhav', email: 'kavya@example.com' } });
      if (url.endsWith('/edp/options')) return json(200, { data: { ...OPTIONS, welcome: WELCOME } });
      if (url.endsWith('/edp/application')) return json(200, { data: DRAFT });
      return json(404, { message: 'not mocked' });
    });
    vi.resetModules();
    const { default: App } = await import('../src/App');
    const { rememberSignupPassword } = await import('../src/signup');
    rememberSignupPassword('kavya@example.com', 'abcdefg1');
    /* StrictMode and the router flags exactly as main.tsx renders them: effects run twice and navigation is a transition. */
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/verify?email=kavya%40example.com']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <App />
        </MemoryRouter>
      </StrictMode>,
    );
    await userEvent.type(await screen.findByLabelText(/^OTP/), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Verify & create account' }));

    const dialog = await screen.findByRole('dialog', { name: 'Congratulations, Kavya!' });
    expect(within(dialog).getByText('Your account is ready. Fill in the form in three steps.')).toBeInTheDocument();
    /* It waits for the student: the form loading behind it must not take it away. */
    expect(await screen.findByRole('heading', { name: 'Step 1 of 3 – Basic Details' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Congratulations, Kavya!' })).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Step 1 of 3 – Basic Details' })).toBeInTheDocument();
  });

  it('greets a student arriving from the OTP screen, in the wording set in the tracking panel', async () => {
    mockApi({ ...OPTIONS, welcome: WELCOME });
    await renderApplication(true);
    const dialog = await screen.findByRole('dialog', { name: 'Congratulations, Kavya!' });
    expect(within(dialog).getByText('Your account is ready. Fill in the form in three steps.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Start my form' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('falls back to the portal wording when no message has been saved, and keeps the form behind it', async () => {
    mockApi(OPTIONS);
    await renderApplication(true);
    const dialog = await screen.findByRole('dialog', { name: 'Congratulations! Your account is created' });
    expect(within(dialog).getByRole('button', { name: 'Start filling my form' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Step 1 of 3 – Basic Details' })).toBeInTheDocument();
  });

  it('is not shown on an ordinary visit, nor when an admin has switched it off', async () => {
    mockApi({ ...OPTIONS, welcome: WELCOME });
    const plain = await renderApplication(false);
    expect(await screen.findByRole('heading', { name: 'Step 1 of 3 – Basic Details' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    plain.unmount();

    mockApi({ ...OPTIONS, welcome: { ...WELCOME, enabled: false } });
    await renderApplication(true);
    expect(await screen.findByRole('heading', { name: 'Step 1 of 3 – Basic Details' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('The Help button', () => {
  it('opens the contact details set in the tracking panel, with dialable and mailable values', async () => {
    mockApi({ ...OPTIONS, help: HELP });
    await renderApplication(false);
    const button = await screen.findByRole('button', { name: 'Help' });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(button);
    const panel = screen.getByRole('dialog', { name: 'Need any help?' });
    expect(within(panel).getByText('The programme office answers between 10 am and 6 pm.')).toBeInTheDocument();
    /* Every line is a name and its value, as the admins named them. */
    expect(within(panel).getAllByRole('term').map((t) => t.textContent)).toEqual(['Contact Number', 'Email ID', 'WhatsApp', 'Office hours']);
    expect(within(panel).getByRole('link', { name: '+91 90000 00000' })).toHaveAttribute('href', 'tel:+919000000000');
    expect(within(panel).getByRole('link', { name: 'help@example.com' })).toHaveAttribute('href', 'mailto:help@example.com');
    expect(within(panel).getByRole('link', { name: '9876543210' })).toHaveAttribute('href', 'tel:9876543210');
    /* Not a number and not an address: shown as written. */
    expect(within(panel).getByText('Monday to Friday').closest('a')).toBeNull();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Need any help?' })).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('is there before a student has an account, on the OTP screen', async () => {
    mockApi({ ...OPTIONS, help: HELP });
    vi.resetModules();
    const { default: VerifyPage } = await import('../src/pages/VerifyPage');
    const { SessionProvider } = await import('../src/session');
    const { LangProvider } = await import('../src/i18n');
    render(
      <MemoryRouter initialEntries={['/verify?email=kavya@example.com']}>
        <LangProvider>
          <SessionProvider>
            <Routes>
              <Route path="/verify" element={<VerifyPage />} />
            </Routes>
          </SessionProvider>
        </LangProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Verify your mobile number' })).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Help' }));
    expect(within(screen.getByRole('dialog', { name: 'Need any help?' })).getByRole('link', { name: 'help@example.com' })).toBeInTheDocument();
  });

  it('is not shown when it is switched off, or when no contact detail has been set', async () => {
    mockApi({ ...OPTIONS, help: { ...HELP, enabled: false } });
    const off = await renderApplication(false);
    expect(await screen.findByRole('heading', { name: 'Step 1 of 3 – Basic Details' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Help' })).not.toBeInTheDocument();
    off.unmount();

    mockApi({ ...OPTIONS, help: { ...HELP, fields: [{ label: 'Contact Number', value: '   ' }] } });
    await renderApplication(false);
    expect(await screen.findByRole('heading', { name: 'Step 1 of 3 – Basic Details' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Help' })).not.toBeInTheDocument();
  });
});
