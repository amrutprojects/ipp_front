import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, type PageMeta } from '../../api';
import { Notice } from '../../components/ui';
import { useCanEdit } from '../../session';
import type { Centre } from '../../types';
import CentreStatusDialog from './CentreStatusDialog';
import { ManageShell } from './ManageLayout';

const LIMIT = 25;

/* Technologies of a row: the first few names, then "+N more". */
function technologySummary(c: Centre): string {
  if (!c.technologies.length) return '—';
  const names = c.technologies.map((x) => (x.usable ? x.name : `${x.name} (inactive)`));
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3} more` : names.join(', ');
}

/* Center Master list: search, status filter, pages; view / edit / activate / deactivate. No delete here. */
export default function CentresPage() {
  const location = useLocation();
  const canEdit = useCanEdit();
  const [flash] = useState<string>(() => (location.state as { flash?: string } | null)?.flash ?? '');
  const [rows, setRows] = useState<Centre[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<Centre | null>(null);

  /* Only the newest request's answer is shown. */
  const latest = useRef(0);
  const load = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    setError('');
    try {
      const res = await api<Centre[]>('/manage/centres', {
        realm: 'manage',
        query: { page, limit: LIMIT, search: query || undefined, isActive: status || undefined },
      });
      if (id !== latest.current) return;
      if (res.meta && res.meta.totalPages > 0 && res.meta.page > res.meta.totalPages) {
        setPage(res.meta.totalPages);
        return;
      }
      setRows(res.data ?? []);
      setMeta(res.meta ?? null);
    } catch (e) {
      if (id === latest.current) setError(e instanceof Error ? e.message : 'Could not load the centers');
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [page, query, status]);
  useEffect(() => {
    void load();
  }, [load]);
  /* Search after typing stops. */
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
        <h2 style={{ margin: 0 }}>Center Master</h2>
        <span className="spacer" />
        <button className="btn ghost sm" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
        {canEdit ? (
          <Link className="btn sm" to="/manage/centres/new">
            + Add center
          </Link>
        ) : null}
      </div>
      {flash ? <Notice tone="ok">{flash}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="toolbar">
        <input
          className="inp"
          type="search"
          placeholder="Search name, code or district"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search centers"
        />
        <select
          className="inp"
          style={{ maxWidth: 200 }}
          aria-label="Filter by status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as '' | 'true' | 'false');
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <span className="muted">{meta ? `${meta.total} center${meta.total === 1 ? '' : 's'}` : ''}</span>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Code</th>
              <th>District</th>
              <th>Technologies</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="center muted" style={{ padding: 28 }}>
                  {loading ? 'Loading…' : 'No centers match.'}
                </td>
              </tr>
            ) : (
              rows.map((c, i) => (
                <tr key={c.id}>
                  <td>{(page - 1) * LIMIT + i + 1}</td>
                  <td>
                    <b>{c.name}</b>
                  </td>
                  <td className="mono nowrap">{c.code}</td>
                  <td>{c.districtName}</td>
                  <td className="fs13">{technologySummary(c)}</td>
                  <td>
                    <span className={`badge ${c.isActive ? 'active' : 'inactive'}`}>{c.isActive ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link className="btn ghost sm" to={`/manage/centres/${c.id}`} aria-label={`View ${c.name}`}>
                        View
                      </Link>
                      {canEdit ? (
                        <>
                          <Link className="btn ghost sm" to={`/manage/centres/${c.id}/edit`} aria-label={`Edit ${c.name}`}>
                            Edit
                          </Link>
                          <button
                            type="button"
                            className={c.isActive ? 'btn danger sm' : 'btn sm'}
                            onClick={() => setToggling(c)}
                            aria-label={`${c.isActive ? 'Deactivate' : 'Activate'} ${c.name}`}
                          >
                            {c.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </>
                      ) : null}
                    </div>
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
      <p className="hint mt16">
        Centers are shared with the Amrut admin panel (Center Master). Only active centers, with their active technologies, are offered
        to students in the registration form.
      </p>
      {toggling && canEdit ? (
        <CentreStatusDialog
          centre={toggling}
          onClose={() => setToggling(null)}
          onDone={() => {
            setToggling(null);
            void load();
          }}
        />
      ) : null}
    </ManageShell>
  );
}
