import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type PageMeta } from '../../api';
import { fmtDate, Notice } from '../../components/ui';
import type { Batch } from '../../types';
import { ManageShell } from './ManageLayout';

const LIMIT = 25;

/*
 * Batches (/manage/batches): groups of finally approved students (Head Office approved) at a Center Master centre.
 * A batch is created from the Applicants list (tick finally approved students → Create batch) and viewed or edited here.
 */
export default function BatchesPage() {
  const [rows, setRows] = useState<Batch[]>([]);
  const [meta, setMeta] = useState<(PageMeta & { max_size?: number }) | null>(null);
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
      setMeta((res.meta as PageMeta & { max_size?: number }) ?? null);
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
        To create a batch, tick finally approved students in{' '}
        <Link to="/manage?approval=UNBATCHED">Applicants (Final approved – not in a batch)</Link> and choose Create batch.
        {meta?.max_size ? ` A batch holds at most ${meta.max_size} students (Settings → Batch size).` : ''}
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
              <th>Centre</th>
              <th>Students</th>
              <th>Created</th>
              <th>Last changed</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="center muted" style={{ padding: 28 }}>
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
                  <td>
                    {b.centre.name ?? '—'}
                    {b.centre.code ? <div className="hint mono">{b.centre.code}</div> : null}
                  </td>
                  <td>
                    {b.students}
                    {meta?.max_size ? <span className="hint"> / {meta.max_size}</span> : null}
                  </td>
                  <td className="nowrap">
                    {fmtDate(b.created_at)}
                    {b.created_by ? <div className="hint">{b.created_by}</div> : null}
                  </td>
                  <td className="nowrap">
                    {fmtDate(b.updated_at)}
                    {b.updated_by ? <div className="hint">{b.updated_by}</div> : null}
                  </td>
                  <td>
                    <Link className="btn ghost sm" to={`/manage/batches/${encodeURIComponent(b.id)}`} aria-label={`View ${b.name}`}>
                      View / edit
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
