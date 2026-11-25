import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import { DEFAULT_SUPPORT_MESSAGE, SupportMessage } from '../src/components/SupportMessage';
import type { BatchSettings, HelpSettings, ManageRole, SupportSettings, WelcomeSettings } from '../src/types';
import { helpIssues, supportIssues, welcomeIssues } from '../src/validation';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const VIEW_ONLY = 'Your account can only view. Ask an administrator to make this change.';

const SETTINGS: SupportSettings = {
  message: 'For help write to {email} or call {mobile}.',
  email: 'help@example.com',
  mobile: '+91 90000 00000',
  updated_at: '2026-10-27T09:00:00Z',
  updated_by: 'Program Admin',
};
const WELCOME: WelcomeSettings = {
  enabled: true,
  title: 'Congratulations, your account is created',
  message: 'Your mobile number is verified. Fill in the form in three steps.',
  button_label: 'Start my form',
  updated_at: null,
  updated_by: null,
};
const HELP: HelpSettings = {
  enabled: true,
  title: 'Need help?',
  intro: 'The programme office answers between 10 am and 6 pm.',
  fields: [
    { label: 'Contact Number', value: '9000000001' },
    { label: 'Email ID', value: 'help@example.com' },
  ],
  updated_at: null,
  updated_by: null,
};
const BATCH: BatchSettings = { size: 30, updated_at: '2026-11-25T09:00:00Z', updated_by: 'Program Admin' };
/* The settings rows the page loads, one per section. */
const SAVED: Record<string, unknown> = { batch: BATCH, support: SETTINGS, welcome: WELCOME, help: HELP };

function mockApi(opts: { role?: ManageRole; put?: (body: unknown) => Response; putRow?: keyof typeof SAVED } = {}) {
  const role = opts.role ?? 'ADMIN';
  const calls: { method: string; url: string; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    if (url.endsWith('/manage/me')) return json(200, { data: { id: 'm1', name: 'Program Admin', email: 'admin@example.com', role } });
    const row = /\/manage\/settings\/(batch|support|welcome|help)$/.exec(url)?.[1];
    if (row && method === 'GET') return json(200, { data: SAVED[row] });
    if (row && method === 'PUT') {
      if (opts.put && row === (opts.putRow ?? 'support')) return opts.put(body);
      if (role !== 'ADMIN') return json(403, { message: VIEW_ONLY });
      return json(200, { data: { ...(body as object), updated_at: '2026-10-28T10:00:00Z', updated_by: 'Program Admin' } });
    }
    return json(404, { message: 'not mocked' });
  });
  return calls;
}

/* Each setting is its own section on the page (loaded on its own), so every query says which one it is about. */
async function section(name: string) {
  const region = await screen.findByRole('region', { name });
  await waitFor(() => expect(within(region).queryByText('Loading…')).not.toBeInTheDocument());
  return region;
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
    const { container } = render(<SupportMessage support={{ message: DEFAULT_SUPPORT_MESSAGE, email: 'a@b.in', mobile: '+91 (90) 000-00000' }} />);
    expect(container).toHaveTextContent(
      'If you have any query related to your registration, you can contact us on email ID a@b.in or mobile number +91 (90) 000-00000.',
    );
    expect(screen.getByRole('link', { name: 'a@b.in' })).toHaveAttribute('href', 'mailto:a@b.in');
    expect(screen.getByRole('link', { name: '+91 (90) 000-00000' })).toHaveAttribute('href', 'tel:+919000000000');
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
    expect(supportIssues({ message: 'Ask the office please.', email: '', mobile: '+91 (90) 000-00000' })).toEqual({});
  });
});

describe('welcomeIssues and helpIssues', () => {
  it('mirror the API rules for the welcome message', () => {
    expect(welcomeIssues({ enabled: true, title: '', message: '', button_label: '' })).toEqual({
      title: 'Title is required',
      message: 'Message is required',
    });
    expect(welcomeIssues({ enabled: true, title: 'Hi', message: 'too short', button_label: 'x'.repeat(61) })).toEqual({
      title: 'Title must be 3–120 characters',
      message: 'Message must be 10–1000 characters',
      button_label: 'Button label must be at most 60 characters',
    });
    expect(welcomeIssues({ enabled: true, title: 'Congratulations!', message: 'Your account is ready.', button_label: '' })).toEqual({});
  });

  it('mirror the API rules for the Help button, naming the line that is wrong', () => {
    const rows = (...f: { label: string; value: string }[]) => ({ enabled: true, title: 'Need help?', intro: '', fields: f });
    expect(helpIssues(rows())).toEqual({ fields: 'Add at least one contact detail to show in the Help panel' });
    expect(helpIssues(rows({ label: 'Contact Number', value: '' }, { label: '', value: 'a@b.in' }))).toEqual({
      'fields.0.value': 'Value is required when a field name is given',
      'fields.1.label': 'Field name is required when a value is given',
      fields: 'Add at least one contact detail to show in the Help panel',
    });
    /* Switched off: the lines may be left blank, the content is simply not shown. */
    expect(helpIssues({ ...rows(), enabled: false })).toEqual({});
    expect(helpIssues(rows({ label: 'Email ID', value: 'a@b.in' }, { label: '', value: '' }))).toEqual({});
  });
});

describe('Settings (tracking panel)', () => {
  it('is linked from the nav and loads the portal settings with a preview and who changed them last', async () => {
    mockApi();
    renderAt('/manage/settings');
    const support = await section('Support contact');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/manage/settings');
    expect(within(support).getByLabelText(/^Message/)).toHaveValue(SETTINGS.message);
    expect(within(support).getByLabelText(/^Email/)).toHaveValue('help@example.com');
    expect(within(support).getByLabelText(/^Mobile/)).toHaveValue('+91 90000 00000');
    expect(within(support).getByText('Use {email} and {mobile} where the email and mobile number should appear.')).toBeInTheDocument();
    const preview = within(support).getByRole('group', { name: 'Preview' });
    expect(preview).toHaveTextContent('For help write to help@example.com or call +91 90000 00000.');
    expect(within(preview).getByRole('link', { name: 'help@example.com' })).toHaveAttribute('href', 'mailto:help@example.com');
    expect(within(support).getByText(/^Last updated .* by Program Admin$/)).toBeInTheDocument();

    /* The congratulations popup and the Help button: saved values in their boxes, never saved yet in the note below. */
    const welcome = await section('Welcome message');
    expect(within(welcome).getByLabelText(/^Title/)).toHaveValue(WELCOME.title);
    expect(within(welcome).getByLabelText(/^Message/)).toHaveValue(WELCOME.message);
    expect(within(welcome).getByLabelText(/^Button label/)).toHaveValue('Start my form');
    expect(within(welcome).getByRole('checkbox', { name: 'Show this popup to students' })).toBeChecked();
    expect(within(welcome).getByText('Not saved yet: the portal is using its default wording.')).toBeInTheDocument();

    const help = await section('Help button');
    expect(within(help).getByLabelText('Field 1 name')).toHaveValue('Contact Number');
    expect(within(help).getByLabelText('Field 1 value')).toHaveValue('9000000001');
    expect(within(help).getByLabelText('Field 2 name')).toHaveValue('Email ID');
    expect(within(help).getByLabelText('Field 2 value')).toHaveValue('help@example.com');
    /* Four lines are always offered, filled in or not. */
    expect(within(help).getByLabelText('Field 4 name')).toHaveValue('');
    expect(within(help).queryByLabelText('Field 5 name')).not.toBeInTheDocument();
  });

  it('updates the preview live, resets to the default text and saves the right PUT body', async () => {
    const calls = mockApi();
    renderAt('/manage/settings');
    const support = await section('Support contact');
    const message = within(support).getByLabelText(/^Message/);
    await userEvent.clear(message);
    await userEvent.type(message, 'Ask us at {{email}');
    expect(within(support).getByRole('group', { name: 'Preview' })).toHaveTextContent('Ask us at help@example.com');
    await userEvent.click(within(support).getByRole('button', { name: 'Reset to default text' }));
    expect(message).toHaveValue(DEFAULT_SUPPORT_MESSAGE);
    await userEvent.clear(within(support).getByLabelText(/^Mobile/));
    await userEvent.type(within(support).getByLabelText(/^Mobile/), ' 9876543210 ');
    await userEvent.click(within(support).getByRole('button', { name: 'Save' }));
    expect(await within(support).findByText('Support contact saved.')).toBeInTheDocument();
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toMatch(/\/edp\/manage\/settings\/support$/);
    expect(put.body).toEqual({ message: DEFAULT_SUPPORT_MESSAGE, email: 'help@example.com', mobile: '9876543210' });
    expect(within(support).getByLabelText(/^Mobile/)).toHaveValue('9876543210');
  });

  it('saves the congratulations popup students see once their account is created', async () => {
    const calls = mockApi();
    renderAt('/manage/settings');
    const welcome = await section('Welcome message');
    const title = within(welcome).getByLabelText(/^Title/);
    await userEvent.clear(title);
    await userEvent.type(title, '  Congratulations, you are registered!  ');
    expect(within(welcome).getByRole('group', { name: 'Preview' })).toHaveTextContent('Congratulations, you are registered!');

    await userEvent.click(within(welcome).getByRole('button', { name: 'Save' }));
    expect(await within(welcome).findByText('Welcome message saved.')).toBeInTheDocument();
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toMatch(/\/edp\/manage\/settings\/welcome$/);
    expect(put.body).toEqual({
      enabled: true,
      title: 'Congratulations, you are registered!',
      message: WELCOME.message,
      button_label: 'Start my form',
    });
  });

  it('saves the Help button: four name and value lines, blank ones and all', async () => {
    const calls = mockApi();
    renderAt('/manage/settings');
    const help = await section('Help button');
    await userEvent.type(within(help).getByLabelText('Field 3 name'), 'WhatsApp');
    await userEvent.type(within(help).getByLabelText('Field 3 value'), ' 9876543210 ');
    await userEvent.click(within(help).getByRole('button', { name: 'Save' }));
    expect(await within(help).findByText('Help button saved.')).toBeInTheDocument();
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toMatch(/\/edp\/manage\/settings\/help$/);
    expect(put.body).toEqual({
      enabled: true,
      title: 'Need help?',
      intro: HELP.intro,
      fields: [
        { label: 'Contact Number', value: '9000000001' },
        { label: 'Email ID', value: 'help@example.com' },
        { label: 'WhatsApp', value: '9876543210' },
        { label: '', value: '' },
      ],
    });
  });

  it('saves the batch size, an exact whole number from 1 to 100', async () => {
    const calls = mockApi();
    renderAt('/manage/settings');
    const batch = await section('Batch size');
    const size = within(batch).getByLabelText(/^Number of students in one batch \(exact, 1–100\)/);
    expect(size).toHaveValue(30);
    expect(within(batch).getByText(/^Last updated .* by Program Admin$/)).toBeInTheDocument();

    for (const bad of ['0', '101', '2.5']) {
      await userEvent.clear(size);
      await userEvent.type(size, bad);
      await userEvent.click(within(batch).getByRole('button', { name: 'Save' }));
      expect(within(batch).getByText('Enter a whole number from 1 to 100')).toBeInTheDocument();
    }
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);

    await userEvent.clear(size);
    await userEvent.type(size, '25');
    await userEvent.click(within(batch).getByRole('button', { name: 'Save' }));
    expect(await within(batch).findByText('Batch size saved.')).toBeInTheDocument();
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toMatch(/\/edp\/manage\/settings\/batch$/);
    expect(put.body).toEqual({ size: 25 });
    expect(size).toHaveValue(25);
  });

  it('gives the program support address as the example email', async () => {
    mockApi();
    renderAt('/manage/settings');
    expect(await section('Help button')).toHaveTextContent('Email ID / support@sumago.ai.');
  });

  it('refuses a half-filled Help line before sending anything', async () => {
    const calls = mockApi();
    renderAt('/manage/settings');
    const help = await section('Help button');
    await userEvent.type(within(help).getByLabelText('Field 3 value'), '9876543210');
    await userEvent.click(within(help).getByRole('button', { name: 'Save' }));
    expect(within(help).getByText('Field name is required when a value is given')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('checks the form before sending and shows server field errors (422) at their fields', async () => {
    let answer = json(422, {
      message: 'Validation failed',
      error: { code: 'VALIDATION_ERROR', details: [{ field: 'body.email', message: 'Email is required because the message uses {email}' }] },
    });
    const calls = mockApi({ put: () => answer });
    renderAt('/manage/settings');
    const support = await section('Support contact');
    const email = within(support).getByLabelText(/^Email/);
    await userEvent.clear(email);
    await userEvent.click(within(support).getByRole('button', { name: 'Save' }));
    expect(within(support).getByText('Email is required because the message uses {email}')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);

    await userEvent.type(email, 'other@example.com');
    await userEvent.click(within(support).getByRole('button', { name: 'Save' }));
    expect(await within(support).findByText('Email is required because the message uses {email}')).toBeInTheDocument();
    expect(within(support).getByText('Please correct the highlighted fields.')).toBeInTheDocument();

    answer = json(403, { message: VIEW_ONLY });
    await userEvent.click(within(support).getByRole('button', { name: 'Save' }));
    expect(await within(support).findByText(VIEW_ONLY)).toBeInTheDocument();
  });

  it('a viewer sees every setting read-only, with the View only note and no Save', async () => {
    const calls = mockApi({ role: 'VIEWER' });
    renderAt('/manage/settings');
    const support = await section('Support contact');
    expect(within(support).getByLabelText(/^Message/)).toHaveAttribute('readonly');
    expect(within(support).getByLabelText(/^Email/)).toHaveAttribute('readonly');
    expect(within(support).getByLabelText(/^Mobile/)).toHaveAttribute('readonly');
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(within(support).getByText(/^View only: /)).toBeInTheDocument();
    expect(within(support).getByRole('group', { name: 'Preview' })).toHaveTextContent('For help write to help@example.com');
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset to default text' })).not.toBeInTheDocument();

    const welcome = await section('Welcome message');
    expect(within(welcome).getByLabelText(/^Title/)).toHaveAttribute('readonly');
    expect(within(welcome).getByRole('checkbox', { name: 'Show this popup to students' })).toBeDisabled();
    const help = await section('Help button');
    expect(within(help).getByLabelText('Field 1 value')).toHaveAttribute('readonly');
    expect(within(await section('Batch size')).getByLabelText(/^Number of students in one batch/)).toBeDisabled();
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });
});
