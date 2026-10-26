import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RegisterPage from '../src/pages/RegisterPage';
import VerifyPage from '../src/pages/VerifyPage';
import { LangProvider } from '../src/i18n';
import { SessionProvider } from '../src/session';
import { forgetSignupPassword, rememberSignupPassword } from '../src/signup';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify" element={<VerifyPage />} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
}

/* GET /edp/options as the API returns it (trimmed). */
const OPTIONS = {
  data: {
    regions: [],
    castes: [],
    educations: [],
    religions: [],
    tracks: [{ code: 'T01', name: 'Data Analytics & Business Intelligence' }],
    document_types: [{ id: 'd1', code: 'PHOTO', name: 'Photo', is_mandatory: true, barcode: null }],
  },
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.restoreAllMocks();
  forgetSignupPassword();
  localStorage.removeItem('edp.token');
});

describe('Create account', () => {
  it('explains the login and keeps the password safe; checks the fields before sending', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, OPTIONS));
    renderAt('/register');
    expect(screen.getByText(/email ID and password to log in to your profile/i)).toBeInTheDocument();
    expect(screen.getByText(/Keep your password safe/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/^Password/), 'abcdefg1');
    await userEvent.type(screen.getByLabelText(/Re-enter Password/), 'abcdefg2');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(screen.getByText('First name is required')).toBeInTheDocument();
    /* Only the documents list was fetched; nothing was submitted. */
    expect(fetchSpy.mock.calls.every(([url]) => String(url).endsWith('/edp/options'))).toBe(true);
  });

  it("sends the account and goes to the OTP page, which counts down the server's timing for the OTP and for Resend", async () => {
    /* A re-sign-up 3 minutes after the first: the OTP sent then has 2 minutes left, and Resend opens with its expiry. */
    const timing = { email: 'kavya@example.com', otp_expires_in: 120, resend_after: 120 };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const u = String(url);
      if (u.endsWith('/auth/register')) return json(201, { data: timing });
      if (u.endsWith('/auth/otp-status')) return json(200, { data: timing });
      if (u.endsWith('/auth/verify-otp')) return json(400, { message: 'Incorrect OTP', error: { code: 'OTP_INCORRECT' } });
      return json(200, OPTIONS);
    });
    renderAt('/register');
    await userEvent.type(screen.getByLabelText(/^First Name/), 'Kavya');
    await userEvent.type(screen.getByLabelText(/^Last Name/), 'Jadhav');
    await userEvent.type(screen.getByLabelText(/^Email ID/), 'kavya@example.com');
    await userEvent.type(screen.getByLabelText(/^Mobile Number/), '9765412345');
    await userEvent.type(screen.getByLabelText(/^Password/), 'abcdefg1');
    await userEvent.type(screen.getByLabelText(/Re-enter Password/), 'abcdefg1');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeInTheDocument();
    expect(screen.getByText(/We have sent a 6-digit OTP to kavya@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/OTP expires in/)).toBeInTheDocument();
    expect(screen.getByText(/^(2:00|1:5\d)$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Resend OTP in (2:00|1:5\d)$/ })).toBeDisabled();
    expect(screen.getByText(/A new OTP can be requested once this one expires/)).toBeInTheDocument();
    const sent = fetchSpy.mock.calls.find(([url]) => String(url).endsWith('/auth/register'))!;
    expect(JSON.parse(String((sent[1] as RequestInit).body))).toMatchObject({ first_name: 'Kavya', email: 'kavya@example.com', confirm_password: 'abcdefg1' });
    /* Straight after the sign-up the page has the server's timing: it does not ask for it again. */
    expect(fetchSpy.mock.calls.some(([url]) => String(url).endsWith('/auth/otp-status'))).toBe(false);
    /* The password chosen here goes with the OTP; the page does not ask for it. */
    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^OTP/), '123456');
    await userEvent.click(screen.getByRole('button', { name: /Verify/ }));
    const verified = fetchSpy.mock.calls.find(([url]) => String(url).endsWith('/auth/verify-otp'))!;
    expect(JSON.parse(String((verified[1] as RequestInit).body))).toEqual({ email: 'kavya@example.com', otp: '123456', password: 'abcdefg1' });
  });

  it('shows "Incorrect OTP" for a wrong code', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).endsWith('/auth/verify-otp')
        ? json(400, { message: 'Incorrect OTP', error: { code: 'OTP_INCORRECT' } })
        : json(200, { data: { email: 'kavya@example.com', otp_expires_in: 300, resend_after: 300 } }),
    );
    renderAt('/verify?email=kavya%40example.com');
    await userEvent.type(screen.getByLabelText(/^OTP/), '123456');
    await userEvent.click(screen.getByRole('button', { name: /Verify/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the password you chose when creating the account');
    await userEvent.type(screen.getByLabelText(/^Password/), 'abcdefg1');
    await userEvent.click(screen.getByRole('button', { name: /Verify/ }));
    expect(await screen.findByText('Incorrect OTP')).toBeInTheDocument();
  });
});

describe('मराठी / English', () => {
  afterEach(() => localStorage.removeItem('edp.lang'));

  it('switches the sign-up screen and its messages to Marathi, and remembers the choice', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, OPTIONS));
    const view = render(
      <MemoryRouter initialEntries={['/register']}>
        <LangProvider>
          <SessionProvider>
            <Routes>
              <Route path="/register" element={<RegisterPage />} />
            </Routes>
          </SessionProvider>
        </LangProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Create account' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'मराठी' }));
    expect(screen.getByRole('heading', { name: 'खाते तयार करा' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'मराठी' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.lang).toBe('mr');
    await userEvent.click(screen.getByRole('button', { name: 'खाते तयार करा' }));
    expect(screen.getByText('पहिले नाव आवश्यक आहे')).toBeInTheDocument();
    expect(screen.getByText('ईमेल आवश्यक आहे')).toBeInTheDocument();
    /* The programme panel follows the language too. */
    expect(screen.getByText('ही कागदपत्रे तयार ठेवा')).toBeInTheDocument();
    expect(localStorage.getItem('edp.lang')).toBe('mr');
    view.unmount();
  });
});

describe('review fixes', () => {
  afterEach(() => localStorage.removeItem('edp.lang'));

  it('translates messages already on screen when the language is switched', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, OPTIONS));
    render(
      <MemoryRouter initialEntries={['/register']}>
        <LangProvider>
          <SessionProvider>
            <Routes>
              <Route path="/register" element={<RegisterPage />} />
            </Routes>
          </SessionProvider>
        </LangProvider>
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('First name is required')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'मराठी' }));
    expect(screen.getByText('पहिले नाव आवश्यक आहे')).toBeInTheDocument();
    expect(screen.queryByText('First name is required')).not.toBeInTheDocument();
  });

  it('links each field to its hint or error and marks required fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, OPTIONS));
    renderAt('/register');
    const password = screen.getByLabelText(/^Password/);
    expect(password).toHaveAttribute('aria-required', 'true');
    expect(password).toHaveAccessibleDescription('At least 8 characters, with a letter and a digit.');
    expect(screen.getByLabelText(/^Middle Name/)).not.toHaveAttribute('aria-required');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByLabelText(/^First Name/)).toHaveAccessibleDescription('First name is required');
  });
});

describe('OTP timing', () => {
  const EXPIRED = 'OTP has expired. Please request a new OTP.';
  type Timing = { otp_expires_in: number; resend_after: number };
  /*
   * The OTP endpoints as the API answers them. `status`: what /auth/otp-status says (the server's timing, asked when the
   * page opens and after an OTP answer); `resend` and `verify`: those endpoints' answers.
   */
  function mockOtpApi(opts: { status: Timing | (() => Timing); resend?: Timing; verify?: () => Response }) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const u = String(url);
      const status = typeof opts.status === 'function' ? opts.status() : opts.status;
      if (u.endsWith('/auth/otp-status')) return json(200, { data: { email: 'kavya@example.com', ...status } });
      if (u.endsWith('/auth/resend-otp')) return json(200, { data: { email: 'kavya@example.com', ...(opts.resend ?? { otp_expires_in: 300, resend_after: 300 }) } });
      if (u.endsWith('/auth/verify-otp') && opts.verify) return opts.verify();
      return json(200, OPTIONS);
    });
  }
  /* `password`: remembered from the sign-up or the login (null: the page was opened without it, e.g. after a reload). */
  const renderVerify = (state: Record<string, unknown> = {}, password: string | null = 'abcdefg1') => {
    if (password) rememberSignupPassword('kavya@example.com', password);
    return render(
      <MemoryRouter initialEntries={[{ pathname: '/verify', search: '?email=kavya%40example.com', state }]}>
        <SessionProvider>
          <Routes>
            <Route path="/verify" element={<VerifyPage />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>,
    );
  };

  it("follows the server's timing when it cannot know when the OTP was sent (from the login, or after a reload)", async () => {
    /* The OTP was sent 4 minutes ago: 1 minute left, and Resend opens with its expiry, not 5 minutes from now. */
    const fetchSpy = mockOtpApi({ status: { otp_expires_in: 60, resend_after: 60 } });
    renderVerify({ notice: { code: 'EMAIL_NOT_VERIFIED', status: 403, message: 'Your email address is not verified yet.' } });
    expect(await screen.findByText(/^(1:00|0:5\d)$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Resend OTP in (1:00|0:5\d)$/ })).toBeDisabled();
    const asked = fetchSpy.mock.calls.find(([u]) => String(u).endsWith('/auth/otp-status'))!;
    expect(JSON.parse(String((asked[1] as RequestInit).body))).toEqual({ email: 'kavya@example.com' });
  });

  it('offers an earlier resend when the API allows one (EDP_OTP_RESEND_SECONDS), and restarts both countdowns', async () => {
    const fetchSpy = mockOtpApi({ status: { otp_expires_in: 280, resend_after: 0 } });
    renderVerify();
    /* The OTP is still valid (4:40 left) and the resend wait is over: both actions are available. */
    expect(await screen.findByText(/^4:[34]\d$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Verify/ })).toBeEnabled();
    expect(screen.getByText(/Email not received\? Check the spam folder/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resend OTP' }));
    expect(await screen.findByText('A new OTP has been sent to kavya@example.com.')).toBeInTheDocument();
    expect(fetchSpy.mock.calls.some(([u]) => String(u).endsWith('/auth/resend-otp'))).toBe(true);
    /* Both restart from the new OTP's 5 minutes (not the old 4:40). */
    expect(screen.getByText(/^(5:00|4:5\d)$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Resend OTP in (5:00|4:5\d)$/ })).toBeDisabled();
  });

  it('expires the OTP after 5 minutes: Verify then says so, and only then a new OTP can be requested', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fetchSpy = mockOtpApi({ status: { otp_expires_in: 300, resend_after: 300 } });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderVerify({ expiresIn: 300, resendAfter: 300 });
      expect(await screen.findByRole('button', { name: /^Resend OTP in [45]:[0-5]\d$/ })).toBeDisabled();
      await user.type(screen.getByLabelText(/OTP/), '123456');

      /* 4 minutes 50 seconds: still valid, no new OTP yet. */
      act(() => vi.advanceTimersByTime(290_000));
      expect(screen.getByText(/^0:(09|10)$/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Resend OTP in 0:(09|10)$/ })).toBeDisabled();

      /* 5 minutes: expired. Verifying now says so (nothing is sent), and Resend OTP is offered. */
      act(() => vi.advanceTimersByTime(11_000));
      expect(screen.getAllByText(EXPIRED).length).toBeGreaterThan(0);
      await user.click(screen.getByRole('button', { name: /Verify/ }));
      expect(screen.getByRole('alert')).toHaveTextContent(EXPIRED);
      expect(fetchSpy.mock.calls.some(([u]) => String(u).endsWith('/auth/verify-otp'))).toBe(false);
      await user.click(screen.getByRole('button', { name: 'Resend OTP' }));
      expect(await screen.findByText('A new OTP has been sent to kavya@example.com.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^Resend OTP in (5:00|4:5\d)$/ })).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the API\'s "expired" answer and offers a new OTP at once', async () => {
    /* The server's timing said 1 minute was left when the page opened; by now it has expired. */
    let expired = false;
    mockOtpApi({
      status: () => (expired ? { otp_expires_in: 0, resend_after: 0 } : { otp_expires_in: 60, resend_after: 60 }),
      verify: () => {
        expired = true;
        return json(400, { message: EXPIRED, error: { code: 'OTP_EXPIRED' } });
      },
    });
    renderVerify();
    await screen.findByText(/^(1:00|0:5\d)$/);
    await userEvent.type(screen.getByLabelText(/OTP/), '123456');
    await userEvent.click(screen.getByRole('button', { name: /Verify/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(EXPIRED);
    expect(screen.getByRole('button', { name: 'Resend OTP' })).toBeEnabled();
  });

  it('after too many wrong OTPs, asks the server again, so Resend opens when the OTP really expires', async () => {
    let locked = false;
    mockOtpApi({
      status: () => (locked ? { otp_expires_in: 0, resend_after: 0 } : { otp_expires_in: 300, resend_after: 300 }),
      verify: () => {
        locked = true;
        return json(429, { message: 'Too many incorrect attempts.', error: { code: 'OTP_TOO_MANY_ATTEMPTS' } });
      },
    });
    renderVerify();
    await screen.findByRole('button', { name: /^Resend OTP in [45]:[0-5]\d$/ });
    await userEvent.type(screen.getByLabelText(/OTP/), '123456');
    await userEvent.click(screen.getByRole('button', { name: /Verify/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Too many incorrect attempts/);
    expect(await screen.findByRole('button', { name: 'Resend OTP' })).toBeEnabled();
  });

  it("asks for the sign-up's password again when the API says it is not that one", async () => {
    const fetchSpy = mockOtpApi({
      status: { otp_expires_in: 300, resend_after: 300 },
      verify: () =>
        json(400, {
          message: 'This is not the password chosen when the account was created. Enter that password, or create the account again.',
          error: { code: 'SIGNUP_PASSWORD_MISMATCH' },
        }),
    });
    renderVerify({}, 'old-pass-1');
    await screen.findByRole('button', { name: /^Resend OTP in/ });
    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^OTP/), '123456');
    await userEvent.click(screen.getByRole('button', { name: /Verify/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This is not the password chosen when the account was created. Enter that password, or create the account again.',
    );
    expect(screen.getByLabelText(/^Password/)).toHaveValue('');
    await userEvent.type(screen.getByLabelText(/^Password/), 'abcdefg1');
    await userEvent.click(screen.getByRole('button', { name: /Verify/ }));
    const bodies = fetchSpy.mock.calls
      .filter(([u]) => String(u).endsWith('/auth/verify-otp'))
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)).password);
    expect(bodies).toEqual(['old-pass-1', 'abcdefg1']);
  });
});
