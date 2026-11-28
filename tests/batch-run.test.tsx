import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BatchRunCell, BatchRunHistory } from '../src/pages/manage/BatchRun';
import type { Batch, BatchDetail, BatchMember, BatchRun } from '../src/types';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const NOT_STARTED: BatchRun = { status: 'NOT_STARTED', ready: true, started_at: null, started_by: null, ended_at: null, ended_by: null };
const batchOf = (run: BatchRun, over: Partial<Batch> = {}): Batch => ({
  id: 'b1',
  code: 'IPP-B-0001',
  name: 'Nashik Batch 1',
  start_date: '2026-12-01',
  end_date: '2027-02-28',
  centre: { id: 'c1', name: 'Nashik Center', code: 'NC-1' },
  district: { id: 'd1', name: 'Nashik' },
  students: 2,
  size: 2,
  stages: { AUDITOR: 0, DIVISION: 0, COEP: 0, HEAD_OFFICE: 0, ADMIN: 0, APPROVED: 2 },
  rejected: 0,
  created_at: '2026-11-26T04:15:00Z',
  created_by: 'Auditor',
  updated_at: '2026-11-26T04:15:00Z',
  updated_by: 'Auditor',
  run,
  ...over,
});
const member = (name: string, final: boolean): BatchMember => ({
  id: name,
  name,
  email: `${name}@example.test`,
  mobile_number: '9000000000',
  registration_id: `IPP-${name}`,
  register_id: null,
  district: 'Nashik',
  category: null,
  centre: 'Nashik Center',
  documents_verified: true,
  final_verified: final,
  approval: null,
});

function mockApi(answer: (url: string, body: unknown) => Response) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    if (method === 'GET' && url.endsWith('/manage/batches/b1')) {
      const detail: BatchDetail = { ...batchOf(NOT_STARTED), members: [member('Asha', true), member('Ravi', true)] };
      return json(200, { data: detail });
    }
    return answer(url, body);
  });
  return calls;
}

beforeEach(() => localStorage.setItem('edp.manage.token', 'manage-token'));
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('batch status (Batches, a batch page)', () => {
  it('is Not started while some students are not final approved, with no button', () => {
    render(
      <BatchRunCell
        batch={batchOf(
          { ...NOT_STARTED, ready: false },
          { stages: { AUDITOR: 0, DIVISION: 1, COEP: 0, HEAD_OFFICE: 0, ADMIN: 0, APPROVED: 1 } },
        )}
        canEdit
        onChanged={() => {}}
      />,
    );
    expect(screen.getByText('Not started')).toBeInTheDocument();
    expect(screen.getByText('Starts once all 2 students are final approved (1 now)')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is Ready to start with the planned dates once all are final approved; a viewer gets no button', () => {
    const { rerender } = render(<BatchRunCell batch={batchOf(NOT_STARTED)} canEdit onChanged={() => {}} />);
    expect(screen.getByText('Ready to start')).toBeInTheDocument();
    expect(screen.getByText('Planned 01/12/2026 – 28/02/2027')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start batch' })).toBeInTheDocument();
    rerender(<BatchRunCell batch={batchOf(NOT_STARTED)} canEdit={false} onChanged={() => {}} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is Ongoing with when it started, and Ended with both', () => {
    const started = { started_at: '2026-11-28T04:30:00Z', started_by: 'Program Auditor' };
    const { rerender } = render(
      <BatchRunCell batch={batchOf({ ...NOT_STARTED, status: 'ONGOING', ...started })} canEdit onChanged={() => {}} />,
    );
    expect(screen.getByText('Ongoing')).toBeInTheDocument();
    expect(screen.getByText(/^Started .* · Program Auditor$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End batch' })).toBeInTheDocument();
    rerender(
      <BatchRunCell
        batch={batchOf({ ...NOT_STARTED, status: 'ENDED', ...started, ended_at: '2027-02-28T11:30:00Z', ended_by: 'Program Auditor' })}
        canEdit
        onChanged={() => {}}
      />,
    );
    expect(screen.getByText('Ended')).toBeInTheDocument();
    expect(screen.getByText(/^Ended .* · Program Auditor$/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('starting a batch', () => {
  it('asks "are you sure" with the students and their status; No goes back', async () => {
    mockApi(() => json(404, {}));
    render(<BatchRunCell batch={batchOf(NOT_STARTED)} canEdit onChanged={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start batch' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Start batch IPP-B-0001?' });
    expect(within(dialog).getByText(/Are you sure you want to start/)).toBeInTheDocument();
    expect(await within(dialog).findByRole('cell', { name: 'Asha' })).toBeInTheDocument();
    expect(within(dialog).getAllByText('Final approved')).toHaveLength(2);
    await userEvent.click(within(dialog).getByRole('button', { name: 'No' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('then asks the e-mail, password and start date and time, shows a wrong password, and starts', async () => {
    let wrong = true;
    const calls = mockApi(() =>
      wrong
        ? json(422, {
            message: 'Validation failed',
            error: { code: 'VALIDATION_ERROR', details: [{ field: 'body.password', message: 'The email or password is not right.' }] },
          })
        : json(200, {
            data: { ...batchOf({ ...NOT_STARTED, status: 'ONGOING', started_at: '2026-11-28T04:30:00Z' }), members: [], runs: [] },
          }),
    );
    const onChanged = vi.fn();
    render(<BatchRunCell batch={batchOf(NOT_STARTED)} canEdit onChanged={onChanged} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start batch' }));
    await screen.findByRole('cell', { name: 'Asha' });
    await userEvent.click(screen.getByRole('button', { name: 'Yes, continue' }));
    expect(screen.getByRole('alertdialog', { name: 'Start batch: please confirm' })).toBeInTheDocument();

    const dialog = () => screen.getByRole('alertdialog');
    /* Nothing is sent without them. */
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Start batch' }));
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/^Email/), 'auditor@example.test');
    await userEvent.type(screen.getByLabelText(/^Password/), 'wrong');
    const at = screen.getByLabelText(/^Start date and time/) as HTMLInputElement;
    await userEvent.clear(at);
    await userEvent.type(at, '2026-11-28T10:00');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Start batch' }));
    expect(await screen.findByText('The email or password is not right.')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).toBe('');

    wrong = false;
    await userEvent.type(screen.getByLabelText(/^Password/), 'Right-Pass1');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Start batch' }));
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
    const sent = calls.filter((c) => c.method === 'POST');
    expect(sent.map((c) => c.url.replace(/^.*\/manage/, '/manage'))).toEqual(['/manage/batches/b1/start', '/manage/batches/b1/start']);
    expect(sent[1]!.body).toEqual({
      email: 'auditor@example.test',
      password: 'Right-Pass1',
      at: new Date('2026-11-28T10:00').toISOString(),
    });
  });

  it('leaves the e-mail and password to be typed: nothing fills them in', async () => {
    mockApi(() => json(404, {}));
    render(<BatchRunCell batch={batchOf(NOT_STARTED)} canEdit onChanged={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start batch' }));
    await screen.findByRole('cell', { name: 'Asha' });
    await userEvent.click(screen.getByRole('button', { name: 'Yes, continue' }));
    const email = screen.getByLabelText(/^Email/) as HTMLInputElement;
    const password = screen.getByLabelText(/^Password/) as HTMLInputElement;
    /* Empty, not a saved login, and read-only until the user goes into them (no browser fills a read-only field). */
    expect([email.value, password.value]).toEqual(['', '']);
    expect([email.autocomplete, password.autocomplete]).toEqual(['off', 'new-password']);
    expect([email.readOnly, password.readOnly]).toEqual([true, true]);
    expect(document.activeElement).not.toBe(email);
    await userEvent.type(email, 'auditor@example.test');
    await userEvent.type(password, 'Typed-Pass1');
    expect([email.value, password.value]).toEqual(['auditor@example.test', 'Typed-Pass1']);
  });

  it('ends an ongoing batch the same way', async () => {
    const calls = mockApi(() => json(200, { data: { ...batchOf({ ...NOT_STARTED, status: 'ENDED' }), members: [], runs: [] } }));
    const onChanged = vi.fn();
    render(
      <BatchRunCell
        batch={batchOf({ ...NOT_STARTED, status: 'ONGOING', started_at: '2026-11-28T04:30:00Z' })}
        canEdit
        onChanged={onChanged}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'End batch' }));
    expect(screen.getByRole('alertdialog', { name: 'End batch IPP-B-0001?' })).toBeInTheDocument();
    await screen.findByRole('cell', { name: 'Asha' });
    await userEvent.click(screen.getByRole('button', { name: 'Yes, continue' }));
    await userEvent.type(screen.getByLabelText(/^Email/), 'auditor@example.test');
    await userEvent.type(screen.getByLabelText(/^Password/), 'Right-Pass1');
    expect(screen.getByLabelText(/^End date and time/)).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'End batch' }));
    await vi.waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(calls.find((c) => c.method === 'POST')!.url).toMatch(/\/manage\/batches\/b1\/end$/);
  });
});

describe('start and end history', () => {
  it('lists every start and end with its date and time and who gave it', () => {
    render(
      <BatchRunHistory
        runs={[
          { action: 'START', at: '2026-11-28T04:30:00Z', by: 'Program Auditor', recorded_at: '2026-11-28T04:31:00Z' },
          { action: 'END', at: '2027-02-28T11:30:00Z', by: 'Program Auditor', recorded_at: '2027-02-28T11:31:00Z' },
        ]}
      />,
    );
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0]!.textContent)).toEqual(['Batch started', 'Batch ended']);
    expect(rows.every((r) => r.textContent?.includes('Program Auditor'))).toBe(true);
  });

  it('says when the batch has not started yet', () => {
    render(<BatchRunHistory runs={[]} />);
    expect(screen.getByText('Not started yet.')).toBeInTheDocument();
  });
});
