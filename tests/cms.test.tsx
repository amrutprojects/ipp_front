import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { CmsCourse, CmsFaq, Doc } from '../src/pages/manage/cms/cmsTypes';
import type { ManageRole } from '../src/types';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const cta = (label: string, action: string) => ({ enabled: true, label, action, url: '', section: 'home' });
const CONTENT: Doc = {
  links: { register_url: 'https://ipp.sumago.ai/register', login_url: 'https://ipp.sumago.ai/login', landing_url: 'https://landing.example.test/' },
  branding: { logo_alt: 'Logo', title_line1: '3 MONTH INTERNSHIP', title_line2: '& PLACEMENT PROGRAM', show_title_with_logo: true },
  hero: {
    badge_tag: '100% FREE',
    title_line1: '3 MONTH INTERNSHIP',
    paragraphs: ['First paragraph'],
    primary: cta('Register Now', 'register'),
    secondary: cta('Login', 'login'),
    stats: [{ icon: 'gift', value: '100%', label: 'FREE Training', enabled: true }],
  },
  courses: { enabled: true, eyebrow: 'Courses', title: 'Choose Your Career Path', subtitle: '', button_label: 'Register Now', closed_label: 'Closed', note: '' },
  faqs: { enabled: true, eyebrow: 'FAQs', title: 'Frequently Asked Questions', subtitle: '' },
};
const course = (over: Partial<CmsCourse>): CmsCourse => ({
  id: 'c1',
  title: 'Certification Course in Cyber Security',
  short_title: 'Cyber Security',
  description: 'Learn security.',
  icon: 'shield',
  tags: ['Network Security'],
  registration_open: true,
  display_order: 10,
  is_active: true,
  updated_at: '2026-11-27T10:00:00Z',
  ...over,
});
const COURSES = [course({}), course({ id: 'c2', title: 'Certification Course in Cyber Defence', short_title: null, is_active: false, display_order: 20 })];
const FAQS: CmsFaq[] = [
  { id: 'f1', question: 'Which courses are available?', answer: 'Training is available in:', answer_kind: 'COURSES', display_order: 10, is_active: true, updated_at: '' },
  { id: 'f2', question: 'Is the programme free?', answer: 'Yes.', answer_kind: 'TEXT', display_order: 20, is_active: true, updated_at: '' },
];

interface Opts {
  role?: ManageRole;
  write?: (method: string, path: string, body: unknown) => Response | undefined;
}
function mockApi(opts: Opts = {}) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://x');
    const path = url.pathname.replace(/^.*\/edp/, '');
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body });
    if (path === '/manage/me') return json(200, { data: { id: 'm1', name: 'Program Auditor', email: 'a@example.com', role: opts.role ?? 'ADMIN' } });
    if (method !== 'GET') {
      const answer = opts.write?.(method, path, body);
      if (answer) return answer;
      if (path === '/manage/cms/landing')
        return json(200, { message: 'Landing page saved', data: { content: (body as { content: Doc }).content, defaults: CONTENT, logo: null, updated_at: '2026-11-27T11:00:00Z', updated_by: 'Program Auditor' } });
      if (path.startsWith('/manage/cms/courses/')) return json(200, { data: { ...COURSES.find((c) => path.endsWith(c.id)), ...(body as object) } });
      return json(method === 'POST' ? 201 : 200, { data: {} });
    }
    if (path === '/manage/cms/landing') return json(200, { data: { content: CONTENT, defaults: CONTENT, logo: null, updated_at: null, updated_by: null } });
    if (path === '/manage/cms/courses') return json(200, { data: COURSES });
    if (path === '/manage/cms/faqs') return json(200, { data: FAQS });
    return json(404, { message: 'not mocked' });
  });
  return calls;
}
const writes = (calls: ReturnType<typeof mockApi>) => calls.filter((c) => c.method !== 'GET').map((c) => [c.method, c.path, c.body]);
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

describe('Manage → CMS', () => {
  it('is in the panel menu and saves the texts of every tab together', async () => {
    const calls = mockApi();
    renderAt('/manage/cms/hero');
    expect(await screen.findByRole('link', { name: 'CMS' })).toHaveAttribute('href', '/manage/cms');
    const title = await screen.findByLabelText('Title, first line');
    expect(title).toHaveValue('3 MONTH INTERNSHIP');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByText('Not saved yet: the page uses its default texts')).toBeInTheDocument();

    await userEvent.clear(title);
    await userEvent.type(title, 'NEW TITLE');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hero (unsaved changes)' })).toBeInTheDocument();

    /* Another tab keeps the change; both are sent together. */
    await userEvent.click(screen.getByRole('link', { name: 'Site & links' }));
    const second = await screen.findByLabelText('Second line');
    await userEvent.clear(second);
    await userEvent.type(second, 'PROGRAMME');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Landing page saved. The page shows the changes within a minute.')).toBeInTheDocument();
    const [put] = writes(calls);
    expect(put?.[0]).toBe('PUT');
    expect(put?.[1]).toBe('/manage/cms/landing');
    const sent = (put?.[2] as { content: Doc }).content as { hero: Doc; branding: Doc };
    expect(sent.hero.title_line1).toBe('NEW TITLE');
    expect(sent.branding.title_line2).toBe('PROGRAMME');
    expect(screen.getByRole('link', { name: 'Preview the page ↗' })).toHaveAttribute('href', 'https://landing.example.test/');
  });

  it('shows what the API refuses at its box and marks the tab', async () => {
    mockApi({
      write: (_method, path) =>
        path === '/manage/cms/landing'
          ? json(422, {
              message: 'Validation failed',
              error: { code: 'VALIDATION_ERROR', details: [{ field: 'body.content.hero.primary.label', message: 'Button text is required' }] },
            })
          : undefined,
    });
    renderAt('/manage/cms/hero');
    const label = (await screen.findAllByLabelText('Button text'))[0]!;
    await userEvent.clear(label);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Not saved: please correct the highlighted boxes on Hero.')).toBeInTheDocument();
    expect(screen.getByText('Button text is required')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hero (needs a correction)' })).toBeInTheDocument();
  });

  it('lists the courses with view, edit, active / inactive, registration and delete', async () => {
    const calls = mockApi();
    renderAt('/manage/cms/courses');
    const cyber = await screen.findByRole('row', { name: /Certification Course in Cyber Security/ });
    expect(within(cyber).getByText('Open')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /Cyber Defence/ })).getByText('Inactive')).toBeInTheDocument();

    await userEvent.click(within(cyber).getByRole('button', { name: 'Make Certification Course in Cyber Security inactive' }));
    expect(await screen.findByText('Course Certification Course in Cyber Security set to Inactive.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close registration for Certification Course in Cyber Security' }));
    await waitFor(() =>
      expect(writes(calls)).toEqual([
        ['PATCH', '/manage/cms/courses/c1', { is_active: false }],
        ['PATCH', '/manage/cms/courses/c1', { registration_open: false }],
      ]),
    );

    await userEvent.click(screen.getByRole('button', { name: 'View Certification Course in Cyber Defence' }));
    const view = screen.getByRole('dialog', { name: 'Certification Course in Cyber Defence' });
    expect(within(view).getByText('Shown in lists as')).toBeInTheDocument();
    await userEvent.click(within(view).getByRole('button', { name: 'Close' }));

    await userEvent.click(screen.getByRole('button', { name: 'Edit Certification Course in Cyber Defence' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Certification Course in Cyber Defence' });
    const tags = within(dialog).getByLabelText('Technologies (chips)');
    await userEvent.clear(tags);
    await userEvent.type(tags, 'Firewalls, firewalls,  SOC ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writes(calls)[2]).toEqual(['PATCH', '/manage/cms/courses/c2', { tags: ['Firewalls', 'SOC'] }]));

    await userEvent.click(screen.getByRole('button', { name: 'Delete Certification Course in Cyber Defence' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Delete Certification Course in Cyber Defence?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Yes, delete' }));
    await waitFor(() => expect(writes(calls)[3]).toEqual(['DELETE', '/manage/cms/courses/c2', undefined]));
  });

  it('lists the FAQs; a written answer is required, the list of courses needs none', async () => {
    const calls = mockApi();
    renderAt('/manage/cms/faqs');
    const listing = await screen.findByRole('row', { name: /Which courses are available\?/ });
    expect(within(listing).getByText('List of active courses')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '+ Add question' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a question' });
    await userEvent.type(within(dialog).getByLabelText(/^Question/), 'Who teaches?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(within(dialog).getByText('Answer is required')).toBeInTheDocument();
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: /^Answer/ }), 'COURSES');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(writes(calls)).toEqual([['POST', '/manage/cms/faqs', { question: 'Who teaches?', answer_kind: 'COURSES', answer: '', is_active: true }]]),
    );
  });

  it('is read-only for a VIEWER', async () => {
    mockApi({ role: 'VIEWER' });
    renderAt('/manage/cms/courses');
    expect(await screen.findByText('View only: your account can see the landing page content but not change it.')).toBeInTheDocument();
    expect(await screen.findByRole('row', { name: /Cyber Security/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Add course' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeDisabled();
  });
});
