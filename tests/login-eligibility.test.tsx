import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const CASTES = [
  { id: 'c1', code: 'C01', name: 'राजपूत' },
  { id: 'c2', code: 'C02', name: 'कुणबी' },
];
const OPTIONS = { data: { regions: [], castes: CASTES, educations: [], religions: [], tracks: [], document_types: [] } };

/* GET /edp/options answers `options` (or fails); every call is recorded. */
function mockApi(options: () => Response = () => json(200, OPTIONS)) {
  const calls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    calls.push(String(input));
    return String(input).endsWith('/edp/options') ? options() : json(404, { message: 'Not found' });
  });
  return calls;
}

/* A fresh page load: the options cache in ui.tsx starts empty. */
async function renderLogin(path = '/login') {
  vi.resetModules();
  const { default: LoginPage } = await import('../src/pages/LoginPage');
  const { default: RegisterPage } = await import('../src/pages/RegisterPage');
  const { SessionProvider } = await import('../src/session');
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('Login: caste eligibility before the login form', () => {
  it('lists the eligible castes from the Caste master and opens the login form only after the checkbox is ticked', async () => {
    mockApi();
    await renderLogin();
    expect(await screen.findByRole('heading', { name: 'Eligibility' })).toBeInTheDocument();
    expect(await screen.findByText('राजपूत')).toBeInTheDocument();
    expect(screen.getByText('कुणबी')).toBeInTheDocument();
    /* No login form yet. */
    expect(screen.queryByLabelText(/^Email ID/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Login' })).not.toBeInTheDocument();
    /* Creating an account is still offered. */
    expect(screen.getByRole('link', { name: 'Create an account' })).toBeInTheDocument();

    /* Proceed stays disabled until the box is ticked. */
    const proceed = screen.getByRole('button', { name: 'Proceed to Login' });
    expect(proceed).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: /I belong to one of the castes listed above/ }));
    expect(screen.queryByLabelText(/^Email ID/)).not.toBeInTheDocument();
    expect(proceed).toBeEnabled();
    await userEvent.click(proceed);
    expect(screen.getByRole('heading', { name: 'Student login' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email ID/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByText(/You confirmed that your caste is in the eligible list/)).toBeInTheDocument();
    expect(sessionStorage.getItem('edp.casteConfirmed')).toBe('1');
  });

  it('remembers the confirmation for the session, and "Change" shows the list again', async () => {
    sessionStorage.setItem('edp.casteConfirmed', '1');
    mockApi();
    await renderLogin();
    expect(screen.getByRole('heading', { name: 'Student login' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Eligibility' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(await screen.findByRole('heading', { name: 'Eligibility' })).toBeInTheDocument();
    expect(await screen.findByText('राजपूत')).toBeInTheDocument();
    expect(sessionStorage.getItem('edp.casteConfirmed')).toBeNull();
  });

  it('offers a retry when the list cannot be loaded, and does not open the form', async () => {
    let fail = true;
    mockApi(() => (fail ? json(500, { message: 'Server error' }) : json(200, OPTIONS)));
    await renderLogin();
    expect(await screen.findByText('The list of castes could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Email ID/)).not.toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('राजपूत')).toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: /I belong to one of the castes listed above/ })).toBeInTheDocument();
  });

  it('lets a candidate search the list for their caste', async () => {
    mockApi(() =>
      json(200, {
        data: { ...OPTIONS.data, castes: [...CASTES, ...Array.from({ length: 8 }, (_, i) => ({ id: `x${i}`, code: `X${i}`, name: `Caste ${i}` }))] },
      }),
    );
    await renderLogin();
    expect(await screen.findByText('10 castes')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find your caste' }), 'कुण');
    expect(screen.getByText('कुणबी')).toBeInTheDocument();
    expect(screen.queryByText('राजपूत')).not.toBeInTheDocument();
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Find your caste' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find your caste' }), 'zzz');
    expect(screen.getByText('No caste in the list matches this name.')).toBeInTheDocument();
  });
});

describe('Create account: the same caste eligibility first', () => {
  it('shows the castes, and opens the create-account form only after the box is ticked and Proceed is clicked', async () => {
    mockApi();
    await renderLogin('/register');
    expect(await screen.findByRole('heading', { name: 'Eligibility' })).toBeInTheDocument();
    expect(await screen.findByText('राजपूत')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Create account' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Login' })).toBeInTheDocument();
    const proceed = screen.getByRole('button', { name: 'Proceed to Create Account' });
    expect(proceed).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: /I belong to one of the castes listed above/ }));
    await userEvent.click(proceed);
    expect(screen.getByRole('heading', { name: 'Create account' })).toBeInTheDocument();
    expect(screen.getByText(/You confirmed that your caste is in the eligible list/)).toBeInTheDocument();
  });

  it('shares the confirmation with the login page (one confirmation per session)', async () => {
    sessionStorage.setItem('edp.casteConfirmed', '1');
    mockApi();
    await renderLogin('/register');
    expect(screen.getByRole('heading', { name: 'Create account' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Eligibility' })).not.toBeInTheDocument();
  });
});
