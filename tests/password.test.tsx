import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ForgotPasswordPage from '../src/pages/ForgotPasswordPage';
import LoginPage from '../src/pages/LoginPage';
import ResetPasswordPage from '../src/pages/ResetPasswordPage';
import { SessionProvider } from '../src/session';
import { forgetSignupPassword, signupPasswordFor } from '../src/signup';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const OPTIONS = { data: { regions: [], castes: [], educations: [], religions: [], tracks: [], document_types: [] } };
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';

/* The address the page is at now (to check what stays in the address bar). */
function Where() {
  const l = useLocation();
  return <output data-testid="where">{l.pathname + l.search}</output>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Where />
      <SessionProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify" element={<h1>Verify your email</h1>} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
}

/* The API as these pages see it; records each call's path and body. */
function mockApi(answers: Record<string, () => Response>) {
  const calls: { path: string; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const path = Object.keys(answers).find((p) => url.endsWith(p));
    calls.push({ path: path ?? url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
    return path ? answers[path]() : json(200, OPTIONS);
  });
  return calls;
}

/* These tests are about the password flow: the caste eligibility step before the login form is confirmed already. */
beforeEach(() => sessionStorage.setItem('edp.casteConfirmed', '1'));
afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
  forgetSignupPassword();
});

describe('Forgot password', () => {
  it('is offered on the login page, with the email typed there', async () => {
    mockApi({});
    renderAt('/login');
    await userEvent.type(screen.getByLabelText(/^Email ID/), 'Kavya@Example.com');
    await userEvent.click(screen.getByRole('link', { name: 'Forgot password?' }));
    expect(screen.getByRole('heading', { name: 'Forgot password?' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email ID/)).toHaveValue('kavya@example.com');
  });

  it('sends a reset link to the registered email, says so, and offers another only after a minute', async () => {
    const calls = mockApi({
      '/auth/forgot-password': () =>
        json(200, { data: { email: 'kavya@example.com', link_valid_minutes: 30, resend_after: 60 }, message: 'sent' }),
    });
    renderAt('/forgot-password');
    await userEvent.click(screen.getByRole('button', { name: 'Send password reset link' }));
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/auth/forgot-password')).toBe(false);

    await userEvent.type(screen.getByLabelText(/^Email ID/), 'kavya@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send password reset link' }));
    expect(
      await screen.findByText(
        'A password reset link has been sent to kavya@example.com. The link is valid for 30 minutes. If you do not see the email, check the spam folder.',
      ),
    ).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/auth/forgot-password')!.body).toEqual({ email: 'kavya@example.com' });
    expect(screen.getByRole('button', { name: /^Send the link again in (1:00|0:5\d)$/ })).toBeDisabled();
  });

  it('says when the email ID is not registered', async () => {
    mockApi({
      '/auth/forgot-password': () =>
        json(404, { message: 'This email ID is not registered. Kindly check your email ID.', error: { code: 'EMAIL_NOT_REGISTERED' } }),
    });
    renderAt('/forgot-password');
    await userEvent.type(screen.getByLabelText(/^Email ID/), 'nobody@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send password reset link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This email ID is not registered. Kindly check your email ID.');
    expect(screen.queryByText(/has been sent/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Email ID/)).toHaveAttribute('aria-invalid', 'true');
    /* Correcting the email clears it. */
    await userEvent.type(screen.getByLabelText(/^Email ID/), 'x');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the password of a login whose email is not verified yet for the OTP page (in memory only)', async () => {
    mockApi({
      '/auth/login': () =>
        json(403, { message: 'Your email address is not verified yet.', error: { code: 'EMAIL_NOT_VERIFIED' } }),
    });
    renderAt('/login');
    await userEvent.type(screen.getByLabelText(/^Email ID/), 'Kavya@Example.com');
    await userEvent.type(screen.getByLabelText(/^Password/), 'abcdefg1');
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));
    expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeInTheDocument();
    expect(signupPasswordFor('kavya@example.com')).toBe('abcdefg1');
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('abcdefg1');
  });
});

describe('Reset password (the emailed link)', () => {
  it('checks the link, takes the new password twice, and goes to the login with "password changed"', async () => {
    const calls = mockApi({
      '/auth/reset-password/check': () => json(200, { data: { email: 'kavya@example.com' } }),
      '/auth/reset-password': () => json(200, { data: { email: 'kavya@example.com' }, message: 'changed' }),
    });
    renderAt(`/reset-password?token=${TOKEN}`);
    expect(await screen.findByText('Enter a new password for the account kavya@example.com.')).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/auth/reset-password/check')).toEqual({ path: '/auth/reset-password/check', body: { token: TOKEN } });
    /* The token is no longer in the address. */
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/reset-password$/);

    await userEvent.type(screen.getByLabelText(/^New Password/), 'newpass1');
    await userEvent.type(screen.getByLabelText(/^Re-enter New Password/), 'newpass2');
    await userEvent.click(screen.getByRole('button', { name: 'Save password' }));
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/auth/reset-password')).toBe(false);

    await userEvent.clear(screen.getByLabelText(/^Re-enter New Password/));
    await userEvent.type(screen.getByLabelText(/^Re-enter New Password/), 'newpass1');
    await userEvent.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByRole('heading', { name: 'Student login' })).toBeInTheDocument();
    expect(screen.getByText('Your password has been changed. Please log in with your new password.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email ID/)).toHaveValue('kavya@example.com');
    expect(calls.find((c) => c.path === '/auth/reset-password')!.body).toEqual({
      token: TOKEN,
      password: 'newpass1',
      confirm_password: 'newpass1',
    });
  });

  it('says when the link has expired, and offers a new one', async () => {
    mockApi({
      '/auth/reset-password/check': () =>
        json(400, { message: 'This password reset link has expired. Please request a new link.', error: { code: 'RESET_LINK_EXPIRED' } }),
    });
    renderAt(`/reset-password?token=${TOKEN}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('This password reset link has expired. Please request a new link.');
    expect(screen.queryByLabelText(/^New Password/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Request a new link' }));
    expect(screen.getByRole('heading', { name: 'Forgot password?' })).toBeInTheDocument();
  });

  it('says when the link was used meanwhile (e.g. in another tab)', async () => {
    mockApi({
      '/auth/reset-password/check': () => json(200, { data: { email: 'kavya@example.com' } }),
      '/auth/reset-password': () =>
        json(400, { message: 'not valid', error: { code: 'RESET_LINK_INVALID' } }),
    });
    renderAt(`/reset-password?token=${TOKEN}`);
    await screen.findByLabelText(/^New Password/);
    await userEvent.type(screen.getByLabelText(/^New Password/), 'newpass1');
    await userEvent.type(screen.getByLabelText(/^Re-enter New Password/), 'newpass1');
    await userEvent.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This password reset link is not valid or has already been used. Please request a new link.',
    );
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Request a new link' })).toBeInTheDocument();
  });

  it('refuses a link without its token without asking the API', async () => {
    const calls = mockApi({});
    renderAt('/reset-password');
    expect(await screen.findByRole('alert')).toHaveTextContent(/not valid or has already been used/);
    expect(calls.some((c) => c.path.includes('reset-password'))).toBe(false);
  });

  it('offers to try again (keeping the link) when the check itself fails, e.g. no connection', async () => {
    let online = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/reset-password/check')) {
        if (!online) throw new TypeError('Failed to fetch');
        return json(200, { data: { email: 'kavya@example.com' } });
      }
      return json(200, OPTIONS);
    });
    renderAt(`/reset-password?token=${TOKEN}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not reach the server/);
    expect(screen.queryByRole('link', { name: 'Request a new link' })).not.toBeInTheDocument();
    online = true;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Enter a new password for the account kavya@example.com.')).toBeInTheDocument();
  });
});
