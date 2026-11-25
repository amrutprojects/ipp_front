import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type PageMeta } from '../../api';
import { fmtDate, Footer, Notice } from '../../components/ui';
import {
  APPROVAL_FILTER_LABEL,
  FOLLOW_UP_STATUS,
  type Applicant,
  type ApprovalFilter,
  type FollowUpStatus,
  type Stage,
  type Summary,
} from '../../types';
import { useCanEdit } from '../../session';
import ApproveDialog, { type ApproveTarget } from './ApproveDialog';
import CreateBatchDialog from './CreateBatchDialog';
import FollowUpDialog from './FollowUpDialog';
import { ManageHeader, ManageNav } from './ManageLayout';

const LIMIT = 25;

/*
 * Approval stage: after the Auditor (this panel) approves a submitted form, Divisional Officer → COEP → Head Office
 * (Admin Panel → Student Approval Stages) each approve or reject it. A rejection sends the student back one stage,
 * with the reason shown here; Head Office's approval is final (student register, then a batch).
 */
function ApprovalStageCell({ r }: { r: Applicant }) {
  const a = r.approval;
  const ev = a?.last_event ?? null;
  const returned = ev?.action === 'REJECT' ? ev : null;
  if (!a?.stage) {
    if (returned)
      return (
        <div className="do-cell">
          <span className="badge do-REJECTED">Sent back to Auditor</span>
          <div className="do-reason">
            <b>{returned.from.name}:</b> {returned.reason}
          </div>
          <div className="hint">
            {fmtDate(returned.at)}
            {returned.by ? ` · ${returned.by}` : ''}
          </div>
        </div>
      );
    return <span className="muted fs13">{r.can_approve ? 'Not approved yet' : '—'}</span>;
  }
  return (
    <div className="do-cell">
      <span className={`badge do-${a.stage === 'APPROVED' ? 'APPROVED' : 'PENDING'}`}>{a.stage_label}</span>
      {returned ? (
        <div className="do-reason">
          <b>Sent back by {returned.from.name}:</b> {returned.reason}
        </div>
      ) : null}
      {a.stage === 'APPROVED' ? (
        <>
          {a.register_id ? (
            <div className="do-register">
              Student register: <b className="mono">{a.register_id}</b>
            </div>
          ) : null}
          <div className={a.batch ? 'do-register' : 'hint'}>
            {a.batch ? (
              <>
                Batch: <Link to={`/manage/batches/${encodeURIComponent(a.batch.id)}`}>{a.batch.name}</Link>
              </>
            ) : (
              'Not in a batch yet'
            )}
          </div>
        </>
      ) : null}
      {ev ? (
        <div className="hint">
          {ev.action === 'APPROVE' ? `Approved by ${ev.from.name}` : `Returned by ${ev.from.name}`}
          {ev.by ? ` (${ev.by})` : ''} · {fmtDate(ev.at)}
        </div>
      ) : null}
    </div>
  );
}

/* A row that can be ticked: the Auditor can approve it, or it is finally approved and in no batch. */
const selectable = (r: Applicant) => r.can_approve || !!r.can_batch;

/* A phone with an arrow: "follow up this student". */
function FollowUpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
      <path d="M15 3h6v6" />
      <path d="M21 3l-7 7" />
    </svg>
  );
}

/* The EDP tracking panel: every portal account and how far it got (account → OTP → step 1 → step 2 → submitted). */
export default function ManagePage() {
  const canEdit = useCanEdit();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<Applicant[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [stage, setStage] = useState<Stage | ''>('');
  const [followUp, setFollowUp] = useState<FollowUpStatus | 'NONE' | ''>('');
  /* ?approval=UNBATCHED (from Batches) opens the list on that filter. */
  const [params] = useSearchParams();
  const [approval, setApproval] = useState<ApprovalFilter | ''>(() => {
    const v = params.get('approval');
    return v && v in APPROVAL_FILTER_LABEL ? (v as ApprovalFilter) : '';
  });
  const [following, setFollowing] = useState<Applicant | null>(null);
  /* The form(s) being approved (one row, or the ticked rows); null = no dialog. */
  const [approving, setApproving] = useState<ApproveTarget | null>(null);
  /* The finally approved students ticked for a new batch; null = no dialog. */
  const [batching, setBatching] = useState<Applicant[] | null>(null);
  /* Ticked rows (account ids) for "Approve selected": only submitted forms not approved yet, on the page shown. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [done, setDone] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  /* Only the newest request's answer is shown (a quicker filter change can overtake an older request). */
  const latest = useRef(0);
  const load = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    setError('');
    try {
      const [s, list] = await Promise.all([
        api<Summary>('/manage/summary', { realm: 'manage' }),
        api<Applicant[]>('/manage/applicants', {
          realm: 'manage',
          query: {
            page,
            limit: LIMIT,
            stage: stage || undefined,
            follow_up: followUp || undefined,
            approval: approval || undefined,
            search: query || undefined,
          },
        }),
      ]);
      if (id !== latest.current) return;
      /* The page emptied (e.g. its last student left the filter after a follow-up): go to the new last page. */
      if (list.meta && list.meta.page > list.meta.totalPages) {
        setPage(list.meta.totalPages);
        return;
      }
      setSummary(s.data);
      setRows(list.data);
      /* Keep only ticks still on this page and still waiting for approval. */
      setSelected((prev) => new Set(list.data.filter((r) => selectable(r) && prev.has(r.id)).map((r) => r.id)));
      setMeta(list.meta ?? null);
    } catch (e) {
      if (id === latest.current) setError(e instanceof Error ? e.message : 'Could not load the list');
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [page, stage, followUp, approval, query]);
  /* Tickable: a form the Auditor can approve, or a finally approved one in no batch (for Create batch). */
  const tickable = rows.filter(selectable);
  const ticked = tickable.filter((r) => selected.has(r.id));
  const selectedRows = ticked.filter((r) => r.can_approve);
  const batchRows = ticked.filter((r) => r.can_batch);
  const allTicked = tickable.length > 0 && ticked.length === tickable.length;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

  /*
   * Closing the dialog returns focus to the row's icon. If a filtered list no longer holds that student, focus goes to the
   * icon now in the same place, else to the filter, instead of the top of the page.
   */
  const filterRef = useRef<HTMLSelectElement>(null);
  const closeFollowUp = () => {
    const index = rows.findIndex((r) => r.id === following?.id);
    setFollowing(null);
    requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      const icons = document.querySelectorAll<HTMLButtonElement>('.tbl .icon-btn');
      (icons[Math.min(Math.max(index, 0), icons.length - 1)] ?? filterRef.current)?.focus();
    });
  };

  return (
    <>
      <ManageHeader />
      <main className="page" style={{ maxWidth: 1640 }}>
        <ManageNav />
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Student tracking</h2>
          <span className="spacer" />
          {canEdit ? (
            <button
              className="btn sm"
              onClick={() => {
                setDone('');
                setApproving({ kind: 'selected', applicants: selectedRows });
              }}
              disabled={!selectedRows.length}
              title={selectedRows.length ? 'Approve the ticked forms' : 'Tick submitted forms in the list to approve them together'}
            >
              Approve selected ({selectedRows.length})
            </button>
          ) : null}
          {canEdit ? (
            <button
              className="btn sm"
              onClick={() => {
                setDone('');
                setBatching(batchRows);
              }}
              disabled={!batchRows.length}
              title={batchRows.length ? 'Put the ticked finally approved students into a new batch' : 'Tick finally approved students (not in a batch) to create a batch'}
            >
              Create batch ({batchRows.length})
            </button>
          ) : null}
          <button className="btn ghost sm" onClick={() => void load()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {done ? <Notice tone="ok">{done}</Notice> : null}
        {summary ? (
          <div className="stats" role="group" aria-label="Filter by stage">
            <button
              className={stage === '' ? 'stat on' : 'stat'}
              onClick={() => {
                setStage('');
                setPage(1);
              }}
            >
              <b>{summary.total}</b>
              <span>All students</span>
            </button>
            {summary.stages.map((s) => (
              <button
                key={s.code}
                className={stage === s.code ? 'stat on' : 'stat'}
                onClick={() => {
                  setStage(s.code);
                  setPage(1);
                }}
                aria-pressed={stage === s.code}
              >
                <b>{s.count}</b>
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="toolbar">
          <input
            className="inp"
            type="search"
            placeholder="Search name, email, mobile or registration ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search"
          />
          <select
            ref={filterRef}
            className="inp"
            style={{ maxWidth: 260 }}
            aria-label="Filter by follow-up"
            value={followUp}
            onChange={(e) => {
              setFollowUp(e.target.value as FollowUpStatus | 'NONE' | '');
              setPage(1);
            }}
          >
            <option value="">All follow-ups</option>
            <option value="NONE">Not followed up yet{summary ? ` (${summary.follow_ups.NONE})` : ''}</option>
            {Object.entries(FOLLOW_UP_STATUS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
                {summary ? ` (${summary.follow_ups[code as FollowUpStatus]})` : ''}
              </option>
            ))}
          </select>
          <select
            className="inp"
            style={{ maxWidth: 280 }}
            aria-label="Filter by approval"
            value={approval}
            onChange={(e) => {
              setApproval(e.target.value as ApprovalFilter | '');
              setPage(1);
            }}
          >
            <option value="">All approval statuses</option>
            {Object.entries(APPROVAL_FILTER_LABEL).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
                {summary?.approvals ? ` (${summary.approvals[code as ApprovalFilter]})` : ''}
              </option>
            ))}
          </select>
          <span className="muted">{meta ? `${meta.total} student${meta.total === 1 ? '' : 's'}` : ''}</span>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                {canEdit ? (
                  <th className="sel-cell">
                    <input
                      type="checkbox"
                      aria-label="Select every form on this page that can be approved or batched"
                      title="Select every form on this page that can be approved, or put into a batch"
                      checked={allTicked}
                      disabled={!tickable.length}
                      onChange={() => setSelected(allTicked ? new Set() : new Set(tickable.map((r) => r.id)))}
                    />
                  </th>
                ) : null}
                <th>#</th>
                <th>Student</th>
                <th>Mobile</th>
                <th>Stage</th>
                <th>Approval stage</th>
                <th>Account created</th>
                <th>OTP verified</th>
                <th>Step 1</th>
                <th>Step 2</th>
                <th>Submitted</th>
                <th>Registration</th>
                <th>Last activity</th>
                <th className="sticky-end">Follow-up</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 14 : 13} className="center muted" style={{ padding: 28 }}>
                    {loading ? 'Loading…' : 'No students match.'}
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={r.id} className={selected.has(r.id) ? 'row-selected' : undefined}>
                    {canEdit ? (
                      <td className="sel-cell">
                        {selectable(r) ? (
                          <input
                            type="checkbox"
                            aria-label={r.can_approve ? `Select ${r.name}'s form for approval` : `Select ${r.name} for a batch`}
                            checked={selected.has(r.id)}
                            onChange={() => toggle(r.id)}
                          />
                        ) : null}
                      </td>
                    ) : null}
                    <td>{(page - 1) * LIMIT + i + 1}</td>
                    <td>
                      <b>{r.name}</b>
                      <div className="hint">{r.email}</div>
                    </td>
                    <td className="nowrap">{r.mobile_number}</td>
                    <td>
                      <span className={`badge ${r.stage}`}>{r.stage_label}</span>
                    </td>
                    <td>
                      <ApprovalStageCell r={r} />
                    </td>
                    <td className="nowrap">{fmtDate(r.account_created_at)}</td>
                    <td className="nowrap">{fmtDate(r.otp_verified_at)}</td>
                    <td className="nowrap">{fmtDate(r.basic_completed_at)}</td>
                    <td className="nowrap">{fmtDate(r.main_completed_at)}</td>
                    <td className="nowrap">
                      {fmtDate(r.submitted_at)}
                    </td>
                    <td className="nowrap mono">{r.registration_id ?? '—'}</td>
                    <td className="nowrap">{fmtDate(r.last_activity_at)}</td>
                    <td className="sticky-end">
                      <div className="fu-cell">
                        <Link className="btn ghost sm" to={`/manage/applicants/${encodeURIComponent(r.id)}`} aria-label={`View ${r.name}`}>
                          View
                        </Link>
                        {canEdit && r.can_approve ? (
                          <button
                            type="button"
                            className="btn sm"
                            onClick={() => {
                              setDone('');
                              setApproving({ kind: 'one', applicant: r });
                            }}
                            aria-label={`Approve ${r.name}'s form`}
                          >
                            Approve
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => setFollowing(r)}
                          aria-label={`Follow-up: ${r.name}`}
                          title={canEdit ? 'Add a follow-up' : 'Follow-up history'}
                        >
                          <FollowUpIcon />
                        </button>
                        {r.follow_up ? (
                          <div className="fu-latest">
                            <span className={`badge fu-${r.follow_up.status}`}>{r.follow_up.status_label}</span>
                            {r.follow_up.note ? (
                              <div className="fu-note" title={r.follow_up.note}>
                                {r.follow_up.note}
                              </div>
                            ) : null}
                            <div className="hint">{fmtDate(r.follow_up.at)}</div>
                          </div>
                        ) : (
                          <span className="muted fs13">Not followed up</span>
                        )}
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
          Open a student with View to see the full form and documents. Students who stopped at a step can be contacted from this list;
          record each call with the follow-up icon.
        </p>
      </main>
      {following ? (
        <FollowUpDialog applicant={following} onClose={closeFollowUp} onSaved={() => void load()} readOnly={!canEdit} />
      ) : null}
      {batching ? (
        <CreateBatchDialog
          students={batching}
          onClose={() => setBatching(null)}
          onDone={(message) => {
            setBatching(null);
            setSelected(new Set());
            setDone(message);
            void load();
          }}
        />
      ) : null}
      {approving ? (
        <ApproveDialog
          target={approving}
          onClose={() => setApproving(null)}
          onDone={(message) => {
            setApproving(null);
            setSelected(new Set());
            setDone(message);
            void load();
          }}
        />
      ) : null}
      <Footer />
    </>
  );
}
