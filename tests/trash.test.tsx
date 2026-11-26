import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ManagePage from '../src/pages/manage/ManagePage';
import { SessionProvider } from '../src/session';

const student = { id: '11111111-1111-4111-8111-111111111111', name: 'Test Student', email: 'test@example.com', mobile_number: '9000000000', stage: 'VERIFIED', stage_label: 'Verified', account_created_at: '2026-10-24T11:30:00Z', otp_verified_at: null, basic_completed_at: null, main_completed_at: null, submitted_at: null, registration_id: null, district: null, category: null, centre: null, documents: { uploaded: 0, verified: 0 }, last_activity_at: '2026-10-24T11:30:00Z', follow_up: null, can_approve: false, can_batch: false, approval: null };
const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => localStorage.setItem('edp.manage.token', 'token'));
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

it('cancels deletion, then moves and restores the record', async () => {
  let trashed = false;
  const calls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input); const method = init?.method ?? 'GET';
    calls.push(`${method} ${url}`);
    if (url.endsWith('/manage/me')) return json({ data: { id: 'm1', name: 'Admin', email: 'admin@example.com', role: 'ADMIN' } });
    if (url.endsWith('/manage/summary')) return json({ data: { total: trashed ? 0 : 1, stages: [], follow_ups: { NONE: 1, PENDING: 0, CALLED: 0, SECOND_CALL: 0, FORM_FILLED: 0 } } });
    if (url.endsWith('/manage/filters')) return json({ data: { districts: [], categories: [], centres: [], stages: [] } });
    if (url.endsWith('/manage/settings/batch')) return json({ data: { size: 2 } });
    if (method === 'DELETE') { trashed = true; return json({ data: null }); }
    if (url.endsWith('/restore') && method === 'POST') { trashed = false; return json({ data: null }); }
    if (url.includes('/manage/applicants/trash')) return json({ data: trashed ? [student] : [], meta: { page: 1, limit: 25, total: trashed ? 1 : 0, totalPages: 1 } });
    if (url.includes('/manage/applicants?')) return json({ data: trashed ? [] : [student], meta: { page: 1, limit: 25, total: trashed ? 0 : 1, totalPages: 1 } });
    return new Response('{}', { status: 404 });
  });
  render(<MemoryRouter><SessionProvider><ManagePage /></SessionProvider></MemoryRouter>);
  await userEvent.click(await screen.findByRole('button', { name: 'Delete Test Student' }));
  let dialog = screen.getByRole('alertdialog');
  expect(within(dialog).getByText('Are you sure you want to delete this record?')).toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(calls.some((c) => c.startsWith('DELETE '))).toBe(false);
  await userEvent.click(screen.getByRole('button', { name: 'Delete Test Student' }));
  dialog = screen.getByRole('alertdialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, Delete' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Delete Test Student' })).not.toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: 'Trash' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Restore Test Student' }));
  expect(await screen.findByText("Test Student's record restored.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Active records' }));
  expect(await screen.findByRole('button', { name: 'Delete Test Student' })).toBeInTheDocument();
});
