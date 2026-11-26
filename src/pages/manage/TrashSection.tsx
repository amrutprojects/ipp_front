import { useCallback, useEffect, useState } from 'react';
import { api, type PageMeta } from '../../api';
import { fmtDate, Notice } from '../../components/ui';
import type { Applicant } from '../../types';
import ApprovalStageCell from './ApprovalStageCell';

export default function TrashSection({ canEdit, onRestored }: { canEdit: boolean; onRestored: () => void }) {
  const [rows, setRows] = useState<Applicant[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  useEffect(() => { const t = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 400); return () => clearTimeout(t); }, [search]);
  const load = useCallback(async (signal: { cancelled: boolean }) => {
    setLoading(true);
    setError('');
    try {
      const result = await api<Applicant[]>('/manage/applicants/trash', { realm: 'manage', query: { page, limit: 25, search: term || undefined } });
      if (signal.cancelled) return;
      if (result.meta && result.meta.page > result.meta.totalPages) { setPage(result.meta.totalPages); return; }
      setRows(result.data);
      setMeta(result.meta ?? null);
    } catch (e) { if (!signal.cancelled) setError(e instanceof Error ? e.message : 'Could not load trash.'); }
    finally { if (!signal.cancelled) setLoading(false); }
  }, [page, term]);
  useEffect(() => { const signal = { cancelled: false }; void load(signal); return () => { signal.cancelled = true; }; }, [load]);
  const restore = async (r: Applicant) => {
    setBusy(r.id); setError(''); setDone('');
    try {
      await api(`/manage/applicants/${encodeURIComponent(r.id)}/restore`, { method: 'POST', realm: 'manage' });
      setDone(`${r.name}'s record restored.`);
      onRestored();
      await load({ cancelled: false });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not restore the record.'); }
    finally { setBusy(''); }
  };
  return <section aria-label="Trash">
    <h2>Trash</h2>
    {error ? <Notice tone="error">{error}</Notice> : null}
    {done ? <Notice tone="ok">{done}</Notice> : null}
    <div className="toolbar"><input className="inp" type="search" aria-label="Search trash" placeholder="Search name, email, mobile or registration ID" value={search} onChange={(e) => setSearch(e.target.value)} /><span className="muted">{meta ? `${meta.total} records` : ''}</span></div>
    <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Student</th><th>Mobile</th><th>District</th><th>Centre</th><th>Stage</th><th>Approval stage</th><th>Registration</th><th>Account created</th>{canEdit ? <th>Actions</th> : null}</tr></thead>
      <tbody>{rows.length ? rows.map((r) => <tr key={r.id}><td><b>{r.name}</b><div className="hint">{r.email}</div></td><td>{r.mobile_number}</td><td>{r.district ?? '—'}</td><td>{r.centre ?? '—'}</td><td>{r.stage_label}</td><td><ApprovalStageCell approval={r.approval} waiting={r.stage === 'SUBMITTED'} /></td><td>{r.registration_id ?? '—'}</td><td>{fmtDate(r.account_created_at)}</td>{canEdit ? <td><button type="button" className="btn sm" aria-label={`Restore ${r.name}`} disabled={!!busy} onClick={() => void restore(r)}>{busy === r.id ? 'Restoring…' : 'Restore'}</button></td> : null}</tr>) : <tr><td colSpan={canEdit ? 9 : 8} className="center muted">{loading ? 'Loading…' : 'No records in trash.'}</td></tr>}</tbody></table></div>
    {meta && meta.totalPages > 1 ? <div className="pager"><button type="button" className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {meta.page} of {meta.totalPages}</span><button type="button" className="btn ghost sm" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next →</button></div> : null}
  </section>;
}
