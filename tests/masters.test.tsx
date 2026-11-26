import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import type { DistrictTechnologies, ManageRole, MasterDocument, MasterField, MasterKind, MasterOption } from '../src/types';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const KINDS: MasterKind[] = [
  { kind: 'CASTE', name: 'Caste', count: 3, active: 2, can_add: true, can_delete: true, stored_as: 'master' },
  { kind: 'GRADING_TYPE', name: 'Grading type', count: 2, active: 2, can_add: false, can_delete: false, stored_as: 'code' },
  { kind: 'TECHNOLOGY', name: 'Technology', count: 2, active: 1, can_add: true, can_delete: true, stored_as: 'code' },
];
const option = (over: Partial<MasterOption>): MasterOption => ({
  id: 'o1',
  value: 'v1',
  code: 'C1',
  name_en: 'Maratha',
  name_mr: 'मराठा',
  order: 1,
  is_active: true,
  is_system: false,
  in_use: false,
  ...over,
});
const OPTIONS: Record<string, MasterOption[]> = {
  CASTE: [option({ in_use: true }), option({ id: 'o2', name_en: 'Kunbi', name_mr: null, order: 2, is_active: false })],
  GRADING_TYPE: [option({ id: 'g1', name_en: 'Percentage', name_mr: null, is_system: true })],
  TECHNOLOGY: [
    option({ id: 't1', value: 'T01', code: 'T01', name_en: 'Data Analytics', name_mr: null }),
    option({ id: 't3', value: 'T03', code: 'T03', name_en: 'Web Design', name_mr: null, order: 2 }),
    option({ id: 't9', value: 'T09', code: 'T09', name_en: 'Old Track', name_mr: null, order: 3, is_active: false }),
  ],
  'FIELD:x_shift': [option({ id: 's1', value: 'M', code: 'M', name_en: 'Morning', name_mr: 'सकाळ' })],
};
const DOCUMENTS: MasterDocument[] = [
  { id: 'd2', code: 'VIDEO', name_en: 'Introduction video', name_mr: null, required: false, is_active: true, is_system: false, kind: 'VIDEO', order: 2, in_use: 3 },
  { id: 'd1', code: 'PHOTO', name_en: 'Photo', name_mr: 'छायाचित्र', required: true, is_active: true, is_system: true, kind: 'DOCUMENT', order: 1, in_use: true },
];
const field = (over: Partial<MasterField>): MasterField => ({
  id: 'f1',
  key: 'first_name',
  step: 1,
  label_en: 'First Name',
  label_mr: 'पहिले नाव',
  required: true,
  type: 'TEXT',
  custom: false,
  order: 1,
  options_kind: null,
  help_en: null,
  help_mr: null,
  is_active: true,
  ...over,
});
const FIELDS: MasterField[] = [
  field({ types: ['TEXT'] }),
  field({ id: 'f2', key: 'gender', label_en: 'Gender', label_mr: 'लिंग', type: 'DROPDOWN', types: ['DROPDOWN', 'RADIO'], options_kind: 'GENDER', order: 2 }),
  field({ id: 'f3', key: 'x_shift', label_en: 'Preferred shift', label_mr: null, custom: true, required: false, type: 'DROPDOWN', options_kind: 'FIELD:x_shift', order: 3 }),
  field({ id: 'f6', key: 'x_about', label_en: 'About you', label_mr: null, custom: true, required: false, type: 'TEXTAREA', order: 4 }),
  field({ id: 'f4', key: 'technology', step: 2, label_en: 'Technology', label_mr: 'तंत्रज्ञान', type: 'DROPDOWN', options_kind: 'TECHNOLOGY' }),
  field({ id: 'f5', key: 'qualification_board', step: 2, label_en: 'College Name', label_mr: null, types: ['TEXT', 'TEXTAREA', 'NUMBER', 'DROPDOWN'], order: 2 }),
  /* Given choices of its own. */
  field({
    id: 'f7',
    key: 'taluka',
    step: 2,
    label_en: 'Taluka',
    label_mr: null,
    type: 'DROPDOWN',
    by_type: true,
    options_kind: 'FIELD:taluka',
    types: ['TEXT', 'DROPDOWN'],
    validation: { rules: [], custom: [{ kind: 'REGEX', source: '.+', message_en: 'No', message_mr: null }] },
    order: 3,
  }),
];
/* As the page lists them: by step, then order. */
const inOrder = (a: string, b: string) => {
  const of = (name: string) => FIELDS.find((f) => name === f.label_en)!;
  return of(a).step - of(b).step || of(a).order - of(b).order;
};
const DISTRICT_TECH: DistrictTechnologies[] = [
  { district_id: 'pune', district: 'Pune', all: true, codes: [] },
  { district_id: 'satara', district: 'Satara', all: false, codes: ['T03', 'T09'] },
];
const DISTRICTS = [
  { id: 'pune', name: 'Pune', code: 'MH-PUN', state_id: 's1', state: 'Maharashtra', is_active: true, in_use: true },
  { id: 'satara', name: 'Satara', code: 'MH-SAT', state_id: 's1', state: 'Maharashtra', is_active: false, in_use: false },
];

interface Opts {
  role?: ManageRole;
  /* Answers a write; undefined = done. */
  write?: (method: string, path: string, body: unknown) => Response | undefined;
}
function mockApi(opts: Opts = {}) {
  const calls: { method: string; path: string; query: URLSearchParams; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://x');
    const path = url.pathname.replace(/^.*\/edp/, '');
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, query: url.searchParams, body });
    if (path === '/manage/me') return json(200, { data: { id: 'm1', name: 'Program Auditor', email: 'a@example.com', role: opts.role ?? 'ADMIN' } });
    if (method !== 'GET') return opts.write?.(method, path, body) ?? json(method === 'POST' ? 201 : 200, { data: {} });
    if (path === '/manage/masters') return json(200, { data: KINDS });
    const kind = /^\/manage\/masters\/([^/]+)$/.exec(path)?.[1];
    if (kind) {
      const items = OPTIONS[decodeURIComponent(kind)] ?? [];
      return json(200, { data: items, meta: { page: 1, limit: 25, total: items.length, totalPages: 1 } });
    }
    if (path === '/manage/technologies/districts') return json(200, { data: DISTRICT_TECH });
    if (path === '/manage/documents') return json(200, { data: DOCUMENTS });
    if (path === '/manage/fields') return json(200, { data: FIELDS });
    if (path === '/manage/districts') return json(200, { data: DISTRICTS });
    if (path === '/geography/states') return json(200, { data: [{ id: 's1', code: 'MH', name: 'Maharashtra' }] });
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
const row = (name: RegExp) => screen.getByRole('row', { name });
const cells = (r: HTMLElement) => within(r).getAllByRole('cell').map((c) => c.textContent?.replace(/\s+/g, ' ').trim());

beforeEach(() => {
  localStorage.setItem('edp.manage.token', 'manage-token');
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Masters: the tab', () => {
  it('opens on the dropdown lists, with a link to every master; Center Master is one of them', async () => {
    mockApi();
    renderAt('/manage/masters');
    expect(await screen.findByRole('heading', { name: 'Caste' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Masters' })).toHaveClass('active');
    const nav = screen.getByRole('navigation', { name: 'Masters' });
    expect(within(nav).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Dropdown lists', '/manage/masters/lists'],
      ['Technologies', '/manage/masters/technologies'],
      ['Documents', '/manage/masters/documents'],
      ['Form fields', '/manage/masters/fields'],
      ['States', '/manage/masters/states'],
      ['Districts', '/manage/masters/districts'],
      ['Talukas', '/manage/masters/talukas'],
      ['Center Master', '/manage/centres'],
    ]);
    /* Center Master has no tab of its own any more. */
    expect(within(screen.getByRole('navigation', { name: 'Tracking panel sections' })).queryByRole('link', { name: 'Center Master' })).not.toBeInTheDocument();
  });
});

describe('Masters: dropdown lists', () => {
  it('shows one list at a time, with both names, order, status and use; the technologies have their own page', async () => {
    const calls = mockApi();
    renderAt('/manage/masters/lists');
    const kinds = await screen.findByRole('navigation', { name: 'Dropdown lists' });
    expect(within(kinds).getAllByRole('link').map((a) => a.textContent)).toEqual(['Caste2 of 3 active', 'Grading type2 of 2 active']);
    await screen.findByText('Maratha');
    expect(cells(row(/Maratha/)).slice(0, 5)).toEqual(['1', 'Maratha', 'मराठा', 'Active', 'In use']);
    expect(cells(row(/Kunbi/)).slice(0, 5)).toEqual(['2', 'Kunbi', '—', 'Inactive', '—']);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search Caste' }), 'mar');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'ACTIVE');
    await waitFor(() => {
      const last = calls.filter((c) => c.path === '/manage/masters/CASTE').slice(-1)[0]!;
      expect([last.query.get('search'), last.query.get('status'), last.query.get('page')]).toEqual(['mar', 'ACTIVE', '1']);
    });

    await userEvent.click(within(kinds).getByRole('link', { name: /Grading type/ }));
    expect(await screen.findByRole('heading', { name: 'Grading type' })).toBeInTheDocument();
    expect(await screen.findByText('Percentage')).toBeInTheDocument();
    /* Built in: renamed and switched off, not added to or deleted. */
    expect(screen.queryByRole('button', { name: '+ Add' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Percentage' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Percentage' })).not.toBeInTheDocument();
  });

  it('adds a choice with both names, and shows a duplicate at once', async () => {
    let answer: Response | undefined = json(409, { message: 'This name is already in the list' });
    const calls = mockApi({ write: () => answer });
    renderAt('/manage/masters/lists/CASTE');
    await userEvent.click(await screen.findByRole('button', { name: '+ Add' }));
    const dialog = screen.getByRole('dialog', { name: 'Add to Caste' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(within(dialog).getByText('English name is required')).toBeInTheDocument();
    expect(writes(calls)).toEqual([]);
    await userEvent.type(within(dialog).getByLabelText(/Name \(English\)/), ' Maratha Kunbi ');
    await userEvent.type(within(dialog).getByLabelText(/Name \(Marathi\)/), 'मराठा कुणबी');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await within(dialog).findByText('This name is already in the list')).toBeInTheDocument();
    answer = undefined;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Maratha Kunbi added.')).toBeInTheDocument();
    expect(writes(calls)[1]).toEqual(['POST', '/manage/masters/CASTE', { name_en: 'Maratha Kunbi', name_mr: 'मराठा कुणबी' }]);
    /* The counts beside the lists are asked again. */
    expect(calls.filter((c) => c.path === '/manage/masters').length).toBeGreaterThan(1);
  });

  it('renames and reorders a choice (only what changed is sent), switches it on and off, and deletes it after asking', async () => {
    const calls = mockApi();
    renderAt('/manage/masters/lists/CASTE');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Maratha' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Maratha' });
    const mr = within(dialog).getByLabelText(/Name \(Marathi\)/);
    await userEvent.clear(mr);
    const order = within(dialog).getByLabelText(/Order/);
    await userEvent.clear(order);
    await userEvent.type(order, '5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Maratha saved.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Activate Kunbi' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Deactivate Kunbi' })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Delete Kunbi' }));
    const ask = screen.getByRole('alertdialog', { name: 'Delete Kunbi?' });
    expect(ask).toHaveTextContent('Forms that already use it keep showing its name.');
    await userEvent.click(within(ask).getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByText('Kunbi deleted.')).toBeInTheDocument();
    expect(writes(calls)).toEqual([
      ['PATCH', '/manage/masters/CASTE/o1', { name_mr: null, order: 5 }],
      ['PATCH', '/manage/masters/CASTE/o2', { is_active: true }],
      ['DELETE', '/manage/masters/CASTE/o2', undefined],
    ]);
  });

  it('shows why a switch or a delete was refused', async () => {
    mockApi({ write: () => json(409, { message: 'It cannot be changed now' }) });
    renderAt('/manage/masters/lists/CASTE');
    await userEvent.click(await screen.findByRole('button', { name: 'Deactivate Maratha' }));
    expect(await screen.findByText('It cannot be changed now')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deactivate Maratha' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Maratha' }));
    const ask = screen.getByRole('alertdialog', { name: 'Delete Maratha?' });
    await userEvent.click(within(ask).getByRole('button', { name: 'Yes, delete' }));
    expect(await within(ask).findByText('It cannot be changed now')).toBeInTheDocument();
  });
});

describe('Masters: technologies', () => {
  it('sets the technologies of a district; none ticked is refused, All technologies clears the selection', async () => {
    const calls = mockApi();
    renderAt('/manage/masters/technologies');
    expect(await screen.findByRole('region', { name: 'Technologies' })).toBeInTheDocument();
    const section = await screen.findByRole('region', { name: 'District-wise technologies' });
    const district = await within(section).findByLabelText('District');
    expect([...(district as HTMLSelectElement).options].map((o) => o.text)).toEqual(['Select district', 'Pune – All technologies', 'Satara – 2 selected']);

    await userEvent.selectOptions(district, 'satara');
    expect(within(section).getByRole('radio', { name: 'Only the ticked ones' })).toBeChecked();
    /* An inactive one is shown only while it is still selected. */
    expect(within(section).getByRole('checkbox', { name: /Old Track \(inactive\)/ })).toBeChecked();
    expect(within(section).getByRole('checkbox', { name: /Web Design/ })).toBeChecked();
    await userEvent.click(within(section).getByRole('checkbox', { name: /Old Track/ }));
    await userEvent.click(within(section).getByRole('checkbox', { name: /Web Design/ }));
    await userEvent.click(within(section).getByRole('button', { name: 'Save' }));
    expect(within(section).getByText('Tick at least one technology, or choose All technologies.')).toBeInTheDocument();
    expect(writes(calls)).toEqual([]);

    await userEvent.click(within(section).getByRole('checkbox', { name: /Data Analytics/ }));
    await userEvent.click(within(section).getByRole('button', { name: 'Save' }));
    expect(await within(section).findByText('Technologies of Satara saved.')).toBeInTheDocument();
    expect(within(section).getByRole('option', { name: 'Satara – 1 selected' })).toBeInTheDocument();

    await userEvent.click(within(section).getByRole('radio', { name: 'All technologies' }));
    expect(within(section).queryByRole('checkbox')).not.toBeInTheDocument();
    await userEvent.click(within(section).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(section).getByRole('option', { name: 'Satara – All technologies' })).toBeInTheDocument());
    expect(writes(calls)).toEqual([
      ['PUT', '/manage/technologies/districts/satara', { codes: ['T01'] }],
      ['PUT', '/manage/technologies/districts/satara', { codes: [] }],
    ]);
  });

  it('a technology added or renamed is offered for the districts at once', async () => {
    const calls = mockApi();
    renderAt('/manage/masters/technologies');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Web Design' }));
    await userEvent.type(within(screen.getByRole('dialog')).getByLabelText(/Name \(English\)/), ' & Development');
    const before = calls.filter((c) => c.path === '/manage/technologies/districts').length;
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));
    await screen.findByText('Web Design & Development saved.');
    expect(writes(calls)).toEqual([['PATCH', '/manage/masters/TECHNOLOGY/t3', { name_en: 'Web Design & Development' }]]);
    await waitFor(() => expect(calls.filter((c) => c.path === '/manage/technologies/districts').length).toBe(before + 1));
  });
});

describe('Masters: documents', () => {
  it('lists them in order, adds one with its kind, and offers deletion for every document', async () => {
    const calls = mockApi();
    renderAt('/manage/masters/documents');
    await screen.findByText('Photo');
    const rows = screen.getAllByRole('row').slice(1);
    expect(cells(rows[0]!).slice(0, 7)).toEqual(['1', 'Photo', 'छायाचित्र', 'Document', 'Required', 'Active', 'In use']);
    expect(cells(rows[1]!).slice(0, 7)).toEqual(['2', 'Introduction video', '—', 'Video', 'Optional', 'Active', 'Used on 3 forms']);
    expect(screen.getByRole('button', { name: 'Delete Photo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Introduction video' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete Photo' }));
    const confirmation = screen.getByRole('alertdialog', { name: 'Delete Photo?' });
    expect(confirmation).toHaveTextContent('Are you sure you want to delete this document?');
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }));
    expect(writes(calls)).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Delete Photo' }));
    await userEvent.click(within(screen.getByRole('alertdialog', { name: 'Delete Photo?' })).getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByText('Photo deleted.')).toBeInTheDocument();
    expect(writes(calls)).toEqual([['DELETE', '/manage/documents/d1', undefined]]);
    calls.length = 0;

    await userEvent.click(screen.getByRole('button', { name: '+ Add document' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a document' });
    await userEvent.type(within(dialog).getByLabelText(/Name \(English\)/), 'Bank Passbook');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Required/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Bank Passbook added.')).toBeInTheDocument();

    /* A built-in one: renamed, made optional, switched off. */
    await userEvent.click(screen.getByRole('button', { name: 'Edit Photo' }));
    const edit = screen.getByRole('dialog', { name: 'Edit Photo' });
    expect(within(edit).queryByLabelText(/^File/)).not.toBeInTheDocument();
    await userEvent.click(within(edit).getByRole('checkbox', { name: /Required/ }));
    await userEvent.click(within(edit).getByRole('button', { name: 'Save' }));
    await screen.findByText('Photo saved.');
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate Photo' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Activate Photo' })).toBeInTheDocument());
    expect(writes(calls)).toEqual([
      ['POST', '/manage/documents', { name_en: 'Bank Passbook', required: false, kind: 'DOCUMENT' }],
      ['PATCH', '/manage/documents/d1', { required: false }],
      ['PATCH', '/manage/documents/d1', { is_active: false }],
    ]);
  });
});

describe('Masters: form fields', () => {
  it('lists the fields by step; every one can be switched off, none is locked', async () => {
    const calls = mockApi();
    renderAt('/manage/masters/fields');
    const step1 = await screen.findByRole('region', { name: 'Step 1 – Basic Details' });
    expect(document.body).not.toHaveTextContent(/core/i);
    /* Every field: View, Edit, Activate / Deactivate and Delete, also the program's own. */
    expect(screen.getAllByRole('button', { name: /^(Activate|Deactivate) / }).map((s) => s.getAttribute('aria-label')!.replace(/^(Activate|Deactivate) /, ''))).toEqual(
      FIELDS.map((f) => f.label_en).sort(inOrder),
    );
    for (const f of FIELDS) {
      expect(screen.getByRole('button', { name: `View ${f.label_en}` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Delete ${f.label_en}` })).toBeInTheDocument();
    }
    await userEvent.click(within(step1).getByRole('button', { name: 'Deactivate First Name' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Activate First Name' })).toBeInTheDocument());
    expect(writes(calls)).toEqual([['PATCH', '/manage/fields/f1', { is_active: false }]]);
    expect(within(step1).getAllByText('Own field')).toHaveLength(2);
    expect(within(step1).getByRole('button', { name: 'Delete Gender' })).toBeInTheDocument();
    expect(within(step1).getByRole('button', { name: 'Delete Preferred shift' })).toBeInTheDocument();
    /* Where the choices of a dropdown are managed. */
    expect(screen.getByRole('link', { name: 'Choices of Gender' })).toHaveAttribute('href', '/manage/masters/lists/GENDER');
    expect(screen.getByRole('link', { name: 'Choices of Technology' })).toHaveAttribute('href', '/manage/masters/technologies');
    /* Choices of its own, also of a field of the program; its checks are said too. */
    await userEvent.click(screen.getByRole('button', { name: 'Choices of Taluka' }));
    expect(await screen.findByRole('region', { name: 'Choices of Taluka' })).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/manage/masters/FIELD%3Ataluka')).toBe(true);
    expect(screen.getByText('Checks: 1 expression')).toBeInTheDocument();
  });

  it('a field of the program is edited in full: step, type, validation, required and active', async () => {
    const calls = mockApi();
    renderAt('/manage/masters/fields');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit First Name' }));
    let dialog = screen.getByRole('dialog', { name: 'Edit First Name' });
    /* Its type stays, and why; what is done without it. */
    const typeOf = () => within(dialog).getByLabelText(/^Type/) as HTMLSelectElement;
    const types = () => [...typeOf().options].map((o) => o.value);
    expect(typeOf()).toBeDisabled();
    expect(typeOf()).toHaveAccessibleDescription('The type of this field stays: its answers are used elsewhere too.');
    expect(dialog).toHaveTextContent("Not asked: the name of the student's account is used.");
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Step/), '2');
    await userEvent.type(within(dialog).getByLabelText('Minimum characters'), '2');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Required' }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Active: asked in the form' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByText('Field First Name saved.');

    /* A list: one choice of it, as a dropdown or radio buttons. */
    await userEvent.click(screen.getByRole('button', { name: 'Edit Gender' }));
    dialog = screen.getByRole('dialog', { name: 'Edit Gender' });
    expect(types()).toEqual(['DROPDOWN', 'RADIO']);
    await userEvent.selectOptions(typeOf(), 'RADIO');
    expect(within(dialog).queryByRole('group', { name: /^Choices/ })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByText('Field Gender saved.');

    /* Any other: every type; one with choices is given them at once. */
    await userEvent.click(screen.getByRole('button', { name: 'Edit College Name' }));
    dialog = screen.getByRole('dialog', { name: 'Edit College Name' });
    expect(types()).toEqual(['TEXT', 'TEXTAREA', 'NUMBER', 'DROPDOWN']);
    await userEvent.selectOptions(typeOf(), 'DROPDOWN');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('Add at least one choice')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Choice 1 (English)'), 'Government College');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByText('Field College Name saved.');
    expect(writes(calls)).toEqual([
      ['PATCH', '/manage/fields/f1', { required: false, is_active: false, step: 2, validation: { rules: [{ type: 'min_length', value: 2 }], custom: [] } }],
      ['PATCH', '/manage/fields/f2', { type: 'RADIO' }],
      ['PATCH', '/manage/fields/f5', { type: 'DROPDOWN', options: [{ name_en: 'Government College' }] }],
    ]);
  });

  it('an older API that does not say the types: a field of the program keeps its own', async () => {
    mockApi();
    renderAt('/manage/masters/fields');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Technology' }));
    const type = within(screen.getByRole('dialog', { name: 'Edit Technology' })).getByLabelText(/^Type/) as HTMLSelectElement;
    expect([...type.options].map((o) => o.value)).toEqual(['DROPDOWN']);
    expect(type).toBeDisabled();
  });

  it('renames a field in both languages, makes one optional and gives it a help text; only what changed is sent', async () => {
    const calls = mockApi();
    renderAt('/manage/masters/fields');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit First Name' }));
    let dialog = screen.getByRole('dialog', { name: 'Edit First Name' });
    const label = within(dialog).getByLabelText(/Label \(English\)/);
    await userEvent.clear(label);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('English label is required')).toBeInTheDocument();
    await userEvent.type(label, 'Given Name');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByText('Field Given Name saved.');

    await userEvent.click(screen.getByRole('button', { name: 'Edit College Name' }));
    dialog = screen.getByRole('dialog', { name: 'Edit College Name' });
    await userEvent.type(within(dialog).getByLabelText(/Label \(Marathi\)/), 'महाविद्यालयाचे नाव');
    await userEvent.type(within(dialog).getByLabelText(/Help text \(English\)/), 'As on the marksheet');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Required' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByText('Field College Name saved.');
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate Gender' }));
    await waitFor(() => expect(writes(calls)).toHaveLength(3));
    expect(writes(calls)).toEqual([
      ['PATCH', '/manage/fields/f1', { label_en: 'Given Name' }],
      ['PATCH', '/manage/fields/f5', { label_mr: 'महाविद्यालयाचे नाव', help_en: 'As on the marksheet', required: false }],
      ['PATCH', '/manage/fields/f2', { is_active: false }],
    ]);
  });

  it('adds an own dropdown field with its choices, edits its choices and deletes it', async () => {
    const calls = mockApi();
    renderAt('/manage/masters/fields');
    await userEvent.click(await screen.findByRole('button', { name: 'Add a field to Step 2 – Main Form' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a field' });
    expect(within(dialog).getByLabelText(/^Step/)).toHaveValue('2');
    await userEvent.type(within(dialog).getByLabelText(/Label \(English\)/), 'Laptop');
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Type/), 'DROPDOWN');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(within(dialog).getByText('Add at least one choice')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Choice 1 (English)'), 'Own');
    await userEvent.type(within(dialog).getByLabelText('Choice 2 (Marathi)'), 'नाही');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(within(dialog).getByText('Every choice needs an English name')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Choice 2 (English)'), 'None');
    await userEvent.click(within(dialog).getByRole('button', { name: '+ Add a choice' }));
    await userEvent.type(within(dialog).getByLabelText('Choice 3 (English)'), 'Shared');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Required/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Field Laptop added.')).toBeInTheDocument();

    /* The choices of an own dropdown are edited here. */
    await userEvent.click(screen.getByRole('button', { name: 'Choices of Preferred shift' }));
    const choices = await screen.findByRole('region', { name: 'Choices of Preferred shift' });
    expect(await within(choices).findByText('Morning')).toBeInTheDocument();
    await userEvent.click(within(choices).getByRole('button', { name: '+ Add' }));
    await userEvent.type(within(screen.getByRole('dialog')).getByLabelText(/Name \(English\)/), 'Night');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add' }));
    await screen.findByText('Night added.');

    await userEvent.click(screen.getByRole('button', { name: 'Delete Preferred shift' }));
    const ask = screen.getByRole('alertdialog', { name: 'Delete Preferred shift?' });
    expect(ask).toHaveTextContent('Answers already given stay stored, and it can be restored from Deleted fields.');
    await userEvent.click(within(ask).getByRole('button', { name: 'Yes, delete' }));
    expect(await screen.findByText('Field Preferred shift deleted.')).toBeInTheDocument();
    expect(writes(calls)).toEqual([
      [
        'POST',
        '/manage/fields',
        {
          step: 2,
          label_en: 'Laptop',
          type: 'DROPDOWN',
          required: true,
          options: [{ name_en: 'Own' }, { name_en: 'None', name_mr: 'नाही' }, { name_en: 'Shared' }],
        },
      ],
      ['POST', '/manage/masters/FIELD%3Ax_shift', { name_en: 'Night' }],
      ['DELETE', '/manage/fields/f3', undefined],
    ]);
  });

  it('an own field can also change its step and type', async () => {
    const calls = mockApi();
    renderAt('/manage/masters/fields');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Preferred shift' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Preferred shift' });
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Step/), '2');
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Type/), 'TEXT');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByText('Field Preferred shift saved.');
    expect(writes(calls)).toEqual([['PATCH', '/manage/fields/f3', { step: 2, type: 'TEXT' }]]);
  });

  it('an own field that becomes a dropdown is given its choices at once', async () => {
    const calls = mockApi();
    renderAt('/manage/masters/fields');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit About you' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit About you' });
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Type/), 'DROPDOWN');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('Add at least one choice')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Choice 1 (English)'), 'Short');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByText('Field About you saved.');
    expect(writes(calls)).toEqual([['PATCH', '/manage/fields/f6', { type: 'DROPDOWN', options: [{ name_en: 'Short' }] }]]);
  });
});

describe('Masters: districts', () => {
  it('searches, adds, renames, switches and deletes districts', async () => {
    const calls = mockApi();
    renderAt('/manage/masters/districts');
    await screen.findByText('Pune');
    expect(cells(row(/Satara/)).slice(1, 6)).toEqual(['Satara', 'MH-SAT', 'Maharashtra', 'Inactive', '—']);
    expect(cells(row(/MH-PUN/)).slice(1, 6)).toEqual(['Pune', 'MH-PUN', 'Maharashtra', 'Active', 'In use']);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search districts' }), 'pun');
    expect(screen.queryByText('Satara')).not.toBeInTheDocument();
    expect(screen.getByText('1 district')).toBeInTheDocument();
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search districts' }));

    await userEvent.click(screen.getByRole('button', { name: '+ Add district' }));
    let dialog = screen.getByRole('dialog', { name: 'Add a district' });
    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'Sample District');
    await userEvent.type(within(dialog).getByLabelText(/^Code/), 'mh-smp');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    await screen.findByText('District Sample District added.');

    await userEvent.click(screen.getByRole('button', { name: 'Edit Pune' }));
    dialog = screen.getByRole('dialog', { name: 'Edit Pune' });
    await userEvent.type(within(dialog).getByLabelText(/^Name/), ' City');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByText('District Pune City saved.');
    await userEvent.click(screen.getByRole('button', { name: 'Activate Satara' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Deactivate Satara' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Delete Satara' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Yes, delete' }));
    await screen.findByText('District Satara deleted.');
    expect(writes(calls)).toEqual([
      ['POST', '/manage/districts', { name: 'Sample District', code: 'MH-SMP' }],
      ['PATCH', '/manage/districts/pune', { name: 'Pune City' }],
      ['PATCH', '/manage/districts/satara', { is_active: true }],
      ['DELETE', '/manage/districts/satara', undefined],
    ]);
  });
});

describe('Masters: a view-only account', () => {
  it.each([
    ['/manage/masters/lists/CASTE', 'Maratha'],
    ['/manage/masters/technologies', 'Data Analytics'],
    ['/manage/masters/documents', 'Photo'],
    ['/manage/masters/fields', 'First Name'],
    ['/manage/masters/districts', 'Pune'],
  ])('sees %s read-only', async (path, text) => {
    const calls = mockApi({ role: 'VIEWER' });
    renderAt(path);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Activate|Deactivate) / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add|Edit|Delete|Save/ })).not.toBeInTheDocument();
    /* The fields keep the column for the links to their choices. */
    /* View is for everyone: every list keeps its Actions column. */
    expect(screen.queryAllByRole('columnheader', { name: 'Actions' })).toHaveLength(path.endsWith('/fields') ? 2 : 1);
    expect(writes(calls)).toEqual([]);
  });

  it("sees a district's technologies without being able to change them", async () => {
    mockApi({ role: 'VIEWER' });
    renderAt('/manage/masters/technologies');
    const section = await screen.findByRole('region', { name: 'District-wise technologies' });
    await userEvent.selectOptions(await within(section).findByLabelText('District'), 'satara');
    expect(within(section).getByRole('checkbox', { name: /Web Design/ })).toBeDisabled();
    expect(within(section).getByRole('checkbox', { name: /Web Design/ })).toBeChecked();
    expect(within(section).queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});
