import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type PageMeta } from '../../api';
import { fmtDate, Notice } from '../../components/ui';
import type { Batch, BatchPlace } from '../../types';
import { ManageShell } from './ManageLayout';

const LIMIT = 25;

/* Where a batch's students can be, in the order it is told; Sent back = to the Auditor. */
const PLACES: [BatchPlace, string][] = [
  ['DIVISION', 'Divisional Officer'],
  ['COEP', 'COEP'],
  ['HEAD_OFFICE', 'Head Office'],
  ['ADMIN', 'Admin'],
  ['APPROVED', 'Final approved'],
  ['AUDITOR', 'Sent back'],
];
/* "Divisional Officer 2 · COEP 27 · Sent back 1" (also used by the batch page). */
export const batchPlaces = (b: Batch) =>
  PLACES.filter(([code]) => b.stages[code])
    .map(([code, label]) => `${label} ${b.stages[code]}`)
    .join(' · ') || '—';

/*
 * Batches (/manage/batches): groups of students of one district, at a Center Master centre, that go through the approval
 * stages together. A batch is created from the Applicants list (select students waiting for a batch → Create batch) and is
 * viewed, or its name and centre changed, here.
 */
export default function BatchesPage() {
  const [rows, setRows] = useState<Batch[]>([]);
  const [meta, setMeta] = useState<(PageMeta & { size?: number }) | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const latest = useRef(0);
  const load = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    setError('');
    try {
      const res = await api<Batch[]>('/manage/batches', { realm: 'manage', query: { page, limit: LIMIT, search: query || undefined } });
      if (id !== latest.current) return;
      setRows(res.data);
      setMeta((res.meta as PageMeta & { size?: number }) ?? null);
    } catch (e) {
      if (id === latest.current) setError(e instanceof Error ? e.message : 'Could not load the batches');
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [page, query]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <ManageShell wide>
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Batches</h2>
        <span className="spacer" />
        <button className="btn ghost sm" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <p className="hint" style={{ marginTop: -4 }}>
        To create a batch, select students in <Link to="/manage?application_stage=BATCH">Applicants (waiting for a batch)</Link> and choose
        Create batch.
        {meta?.size ? ` A batch has exactly ${meta.size} student${meta.size === 1 ? '' : 's'} of one district (Settings → Batch size).` : ''}
      </p>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="toolbar">
        <input
          className="inp"
          type="search"
          placeholder="Search batch or centre"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search batches"
        />
        <span className="muted">{meta ? `${meta.total} batch${meta.total === 1 ? '' : 'es'}` : ''}</span>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Batch</th>
              <th>District</th>
              <th>Centre</th>
              <th>Students</th>
              <th>Where it is now</th>
              <th>Rejected</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="center muted" style={{ padding: 28 }}>
                  {loading ? 'Loading…' : query ? 'No batches match.' : 'No batches yet.'}
                </td>
              </tr>
            ) : (
              rows.map((b, i) => (
                <tr key={b.id}>
                  <td>{(page - 1) * LIMIT + i + 1}</td>
                  <td>
                    <b>{b.name}</b>
                  </td>
                  <td>{b.district?.name ?? '—'}</td>
                  <td>
                    {b.centre.name ?? '—'}
                    {b.centre.code ? <div className="hint mono">{b.centre.code}</div> : null}
                  </td>
                  <td>{b.students}</td>
                  <td>{batchPlaces(b)}</td>
                  <td>{b.rejected ? <span className="badge do-REJECTED">{b.rejected}</span> : '—'}</td>
                  <td className="nowrap">
                    {fmtDate(b.created_at)}
                    {b.created_by ? <div className="hint">{b.created_by}</div> : null}
                  </td>
                  <td>
                    <Link className="btn ghost sm" to={`/manage/batches/${encodeURIComponent(b.id)}`} aria-label={`View ${b.name}`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {meta && meta.totalPages > 1 ? (
        <div className="pager">
          <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Previous
          </button>
          <span>
            Page {meta.page} of {meta.totalPages}
          </span>
          <button className="btn ghost sm" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>
            Next →
          </button>
        </div>
      ) : null}
    </ManageShell>
  );
}
