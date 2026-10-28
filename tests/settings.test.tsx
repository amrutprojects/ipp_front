import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import { DEFAULT_SUPPORT_MESSAGE, SupportMessage } from '../src/components/SupportMessage';
import type { ManageRole, SupportSettings } from '../src/types';
import { supportIssues } from '../src/validation';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const VIEW_ONLY = 'Your account can only view. Ask an administrator to make this change.';

const SETTINGS: SupportSettings = {
  message: 'For help write to {email} or call {mobile}.',
  email: 'edp.help@example.com',
  mobile: '+91 80103 85237',
  updated_at: '2026-10-27T09:00:00Z',
  updated_by: 'EDP Admin',
};

function mockApi(opts: { role?: ManageRole; put?: (body: unknown) => Response } = {}) {
  const role = opts.role ?? 'ADMIN';
  const calls: { method: string; url: string; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    if (url.endsWith('/manage/me')) return json(200, { data: { id: 'm1', name: 'EDP Admin', email: 'edp.admin@example.com', role } });
    if (url.endsWith('/manage/settings/support') && method === 'GET') return json(200, { data: SETTINGS });
    if (url.endsWith('/manage/settings/support') && method === 'PUT') {
      if (opts.put) return opts.put(body);
      if (role !== 'ADMIN') return json(403, { message: VIEW_ONLY });
      const b = body as { message: string; email: string | null; mobile: string | null };
      return json(200, { data: { ...b, updated_at: '2026-10-28T10:00:00Z', updated_by: 'EDP Admin' } });
    }
    return json(404, { message: 'not mocked' });
  });
  return calls;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.setItem('edp.manage.token', 'manage-token');
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('SupportMessage', () => {
  it('turns {email} and {mobile} into mailto: and tel: links', () => {
    const { container } = render(<SupportMessage support={{ message: DEFAULT_SUPPORT_MESSAGE, email: 'a@b.in', mobile: '+91 (80) 103-85237' }} />);
    expect(container).toHaveTextContent(
      'If you have any query related to your registration, you can contact us on email ID a@b.in or mobile number +91 (80) 103-85237.',
    );
    expect(screen.getByRole('link', { name: 'a@b.in' })).toHaveAttribute('href', 'mailto:a@b.in');
    expect(screen.getByRole('link', { name: '+91 (80) 103-85237' })).toHaveAttribute('href', 'tel:+918010385237');
  });

  it('shows a message without placeholders, then the contacts that are set', () => {
    const { container } = render(<SupportMessage support={{ message: 'Ask the office.', email: 'a@b.in', mobile: '9876543210' }} />);
    expect(container).toHaveTextContent('Ask the office. Email: a@b.in, Mobile: 9876543210');
    expect(screen.getByRole('link', { name: 'a@b.in' })).toHaveAttribute('href', 'mailto:a@b.in');
    expect(screen.getByRole('link', { name: '9876543210' })).toHaveAttribute('href', 'tel:9876543210');
  });

  it('shows the message alone when no contact is set, and nothing for an empty message', () => {
    const a = render(<SupportMessage support={{ message: 'Ask the office.', email: null, mobile: null }} />);
    expect(a.container).toHaveTextContent(/^Ask the office\.$/);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    a.unmount();
    const b = render(<SupportMessage support={{ message: '   ', email: 'a@b.in', mobile: '9876543210' }} />);
    expect(b.container).toBeEmptyDOMElement();
  });

  it('never renders the message as HTML', () => {
    const { container } = render(<SupportMessage support={{ message: '<b>bold</b> {email}', email: 'a@b.in', mobile: null }} />);
    expect(container.querySelector('b')).toBeNull();
    expect(container).toHaveTextContent('<b>bold</b> a@b.in');
  });
});

describe('supportIssues', () => {
  it('mirrors the API rules', () => {
    expect(supportIssues({ message: 'short', email: '', mobile: '' })).toEqual({ message: 'Message must be 10–500 characters' });
    expect(supportIssues({ message: '', email: '', mobile: '' })).toEqual({ message: 'Message is required' });
    expect(supportIssues({ message: 'Write to {email} or call {mobile}', email: '', mobile: '' })).toEqual({
      email: 'Email is required because the message uses {email}',
      mobile: 'Mobile is required because the message uses {mobile}',
    });
    expect(supportIssues({ message: 'Ask the office please.', email: 'nope@', mobile: '12' })).toEqual({
      email: 'Enter a valid email address',
      mobile: 'Enter a valid mobile number',
    });
    expect(supportIssues({ message: 'Ask the office please.', email: '', mobile: '+91 (80) 103-85237' })).toEqual({});
  });
});

describe('Settings (tracking panel)', () => {
  it('is linked from the nav and loads the saved values, a preview and who changed them last', async () => {
    mockApi();
    renderAt('/manage/settings');
    expect(await screen.findByRole('heading', { name: 'Support contact' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/manage/settings');
    expect(await screen.findByLabelText(/^Message/)).toHaveValue(SETTINGS.message);
    expect(screen.getByLabelText(/^Email/)).toHaveValue('edp.help@example.com');
    expect(screen.getByLabelText(/^Mobile/)).toHaveValue('+91 80103 85237');
    expect(screen.getByText('Use {email} and {mobile} where the email and mobile number should appear.')).toBeInTheDocument();
    const preview = screen.getByRole('group', { name: 'Preview' });
    expect(preview).toHaveTextContent('For help write to edp.help@example.com or call +91 80103 85237.');
    expect(within(preview).getByRole('link', { name: 'edp.help@example.com' })).toHaveAttribute('href', 'mailto:edp.help@example.com');
    expect(screen.getByText(/^Last updated .* by EDP Admin$/)).toBeInTheDocument();
  });

  it('updates the preview live, resets to the default text and saves the right PUT body', async () => {
    const calls = mockApi();
    renderAt('/manage/settings');
    const message = await screen.findByLabelText(/^Message/);
    await userEvent.clear(message);
    await userEvent.type(message, 'Ask us at {{email}');
    expect(screen.getByRole('group', { name: 'Preview' })).toHaveTextContent('Ask us at edp.help@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Reset to default text' }));
    expect(message).toHaveValue(DEFAULT_SUPPORT_MESSAGE);
    await userEvent.clear(screen.getByLabelText(/^Mobile/));
    await userEvent.type(screen.getByLabelText(/^Mobile/), ' 9876543210 ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Support contact saved.')).toBeInTheDocument();
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toMatch(/\/edp\/manage\/settings\/support$/);
    expect(put.body).toEqual({ message: DEFAULT_SUPPORT_MESSAGE, email: 'edp.help@example.com', mobile: '9876543210' });
    expect(screen.getByLabelText(/^Mobile/)).toHaveValue('9876543210');
  });

  it('checks the form before sending and shows server field errors (422) at their fields', async () => {
    let answer = json(422, {
      message: 'Validation failed',
      error: { code: 'VALIDATION_ERROR', details: [{ field: 'body.email', message: 'Email is required because the message uses {email}' }] },
    });
    const calls = mockApi({ put: () => answer });
    renderAt('/manage/settings');
    const email = await screen.findByLabelText(/^Email/);
    await userEvent.clear(email);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Email is required because the message uses {email}')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);

    await userEvent.type(email, 'other@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Email is required because the message uses {email}')).toBeInTheDocument();
    expect(screen.getByText('Please correct the highlighted fields.')).toBeInTheDocument();

    answer = json(403, { message: VIEW_ONLY });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(VIEW_ONLY)).toBeInTheDocument();
  });

  it('a viewer sees the values read-only, with the View only note and no Save', async () => {
    const calls = mockApi({ role: 'VIEWER' });
    renderAt('/manage/settings');
    expect(await screen.findByLabelText(/^Message/)).toHaveAttribute('readonly');
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('readonly');
    expect(screen.getByLabelText(/^Mobile/)).toHaveAttribute('readonly');
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText(/^View only: /)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset to default text' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Preview' })).toHaveTextContent('For help write to edp.help@example.com');
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });
});
