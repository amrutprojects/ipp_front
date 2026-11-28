import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api';
import { Notice } from '../../components/ui';
import type { ListFilterOptions, Summary } from '../../types';
import { ManageShell } from './ManageLayout';
import { countOf } from './StudentFilters';

/* GET /manage/dashboard: the students of the list by the values of its filters; id null = not filled in yet. */
interface Group {
  id: string | null;
  name: string | null;
  count: number;
}
interface Checks {
  VERIFIED: number;
  NOT_VERIFIED: number;
}
export interface DashboardFigures {
  districts: Group[];
  categories: Group[];
  technologies: Group[];
  centres: Group[];
  documents: Checks;
  final: Checks;
}

const fmt = (n: number) => n.toLocaleString('en-IN');
/* Student tracking opened with one filter set (its filtersFromAddress). */
const listWith = (key: string, value: string) => `/manage?${key}=${encodeURIComponent(value)}`;

interface Row {
  label: string;
  count: number;
  /* Where the figure opens Student tracking; none = not a filter value (not filled in yet). */
  to?: string;
}

/* A card of one filter: each value with its share of all students and its count, a link to those students. */
function Breakdown({ title, rows, total, wide }: { title: string; rows: Row[]; total: number; wide?: boolean }) {
  return (
    <section className={'card dash-group' + (wide ? ' wide' : '')} aria-label={title}>
      <h3>{title}</h3>
      {rows.length ? (
        <ul className="dash-rows">
          {rows.map((r) => {
            const body = (
              <>
                <span className="dash-row-l">{r.label}</span>
                <span className="dash-row-bar" aria-hidden="true">
                  <i style={{ width: total > 0 && r.count > 0 ? `${Math.max(2, (r.count / total) * 100)}%` : '0%' }} />
                </span>
                <b>{fmt(r.count)}</b>
              </>
            );
            return (
              <li key={r.label}>
                {r.to ? (
                  <Link className="dash-row" to={r.to} title={`${r.label}: ${fmt(r.count)}, open in Student tracking`}>
                    {body}
                  </Link>
                ) : (
                  <span className="dash-row none" title={`${r.label}: ${fmt(r.count)}`}>
                    {body}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted dash-empty">No students yet.</p>
      )}
    </section>
  );
}

const groupRows = (groups: Group[], key: string): Row[] =>
  groups.map((g) =>
    g.id ? { label: g.name ?? '—', count: g.count, to: listWith(key, g.id) } : { label: 'Not filled in yet', count: g.count },
  );
const checkRows = (checks: Checks, key: string, yes: string, no: string): Row[] => [
  { label: yes, count: checks.VERIFIED, to: listWith(key, 'VERIFIED') },
  { label: no, count: checks.NOT_VERIFIED, to: listWith(key, 'NOT_VERIFIED') },
];

/*
 * The Auditor's dashboard (/manage/dashboard), the panel's start page: the students by stage (the tiles of Student
 * tracking), then by District, Category, Technology, Centre, Stage of application, Documents and Final verification.
 * Every figure opens Student tracking with that filter.
 */
export default function DashboardPage() {
  const [figures, setFigures] = useState<DashboardFigures | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [options, setOptions] = useState<ListFilterOptions | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [f, s, o] = await Promise.all([
        api<DashboardFigures>('/manage/dashboard', { realm: 'manage' }),
        api<Summary>('/manage/summary', { realm: 'manage' }),
        api<ListFilterOptions>('/manage/filters', { realm: 'manage' }),
      ]);
      setFigures(f.data);
      setSummary(s.data);
      setOptions(o.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the dashboard.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const stageRows: Row[] = (options?.stages ?? []).map((s) => ({
    label: s.label,
    count: countOf(s.code, summary) ?? 0,
    to: listWith('application_stage', s.code),
  }));

  return (
    <ManageShell wide>
      <div className="dash-page">
        <h2 className="dash-title">Auditor Dashboard</h2>
        <p className="sub dash-sub">
          The students by stage and by what their forms say. Click a figure to open those students in Student tracking.
        </p>
        {error ? (
          <Notice tone="error">
            {error}{' '}
            <button type="button" className="btn ghost sm" onClick={() => void load()}>
              Retry
            </button>
          </Notice>
        ) : !figures || !summary ? (
          <p className="muted" role="status">
            Loading the dashboard…
          </p>
        ) : (
          <>
            <nav className="stats dash-stages" aria-label="Students by stage">
              <Link className="stat dash-link" to="/manage">
                <b>{fmt(summary.total)}</b>
                <span>All students</span>
              </Link>
              {summary.stages.map((s) => (
                <Link key={s.code} className="stat dash-link" to={listWith('application_stage', s.code)}>
                  <b>{fmt(s.count)}</b>
                  <span>{s.label}</span>
                </Link>
              ))}
              <Link className="stat dash-link" to={listWith('application_stage', 'APPROVED')}>
                <b>{fmt(summary.approvals?.APPROVED ?? 0)}</b>
                <span>Final Approved Students</span>
              </Link>
            </nav>
            <div className="dash-groups">
              <Breakdown title="District" rows={groupRows(figures.districts, 'district_id')} total={summary.total} />
              <Breakdown title="Category" rows={groupRows(figures.categories, 'caste_id')} total={summary.total} />
              <Breakdown title="Technology" rows={groupRows(figures.technologies, 'technology_id')} total={summary.total} />
              <Breakdown title="Centre" rows={groupRows(figures.centres, 'centre_id')} total={summary.total} />
              <Breakdown title="Stage of application" rows={stageRows} total={summary.total} wide />
              <Breakdown
                title="Documents"
                rows={checkRows(figures.documents, 'documents', 'Approved (verified)', 'Not approved')}
                total={summary.total}
              />
              <Breakdown
                title="Final verification"
                rows={checkRows(figures.final, 'final', 'Verified', 'Not verified')}
                total={summary.total}
              />
            </div>
          </>
        )}
      </div>
    </ManageShell>
  );
}
