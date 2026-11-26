import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type PageMeta } from '../../api';
import { fmtDate, Footer, Notice } from '../../components/ui';
import {
  APPLICATION_STAGES,
  FOLLOW_UP_STATUS,
  type Applicant,
  type ApplicationStage,
  type FollowUpStatus,
  type ListFilterOptions,
  type Summary,
} from '../../types';
import { useCanEdit } from '../../session';
import ApprovalStageCell from './ApprovalStageCell';
import ApproveDialog, { type ApproveTarget } from './ApproveDialog';
import { addPicks, isBatch, pickBlocked, pickedDistrict, sizeFor, toPick, type BatchPick } from './batchPicks';
import CreateBatchDialog, { useBatchSize } from './CreateBatchDialog';
import FollowUpDialog from './FollowUpDialog';
import { ManageHeader, ManageNav } from './ManageLayout';
import TrashSection from './TrashSection';
import DeleteRecordDialog from './DeleteRecordDialog';
import StudentFilters, { NO_FILTERS, type ListFilters } from './StudentFilters';

const LIMIT = 25;
/* What is typed into the search and the text filters, as applied (once typing stops). */
const NO_TEXT = { search: '', name: '', mobile: '' };

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
  const [trash, setTrash] = useState(false);
  const [deleting, setDeleting] = useState<Applicant | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<Applicant[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  /* ?application_stage=BATCH (from Batches) opens the list on that stage. */
  const [params] = useSearchParams();
  const [filters, setFilters] = useState<ListFilters>(() => {
    const v = params.get('application_stage') as ApplicationStage | null;
    return v && APPLICATION_STAGES.includes(v) ? { ...NO_FILTERS, stage: v } : NO_FILTERS;
  });
  /* The choices of the filters; null = not loaded. */
  const [options, setOptions] = useState<ListFilterOptions | null>(null);
  const [optionsFailed, setOptionsFailed] = useState(false);
  const [followUp, setFollowUp] = useState<FollowUpStatus | 'NONE' | ''>('');
  const [following, setFollowing] = useState<Applicant | null>(null);
  /* The form(s) being approved (one row, or the ticked rows); null = no dialog. */
  const [approving, setApproving] = useState<ApproveTarget | null>(null);
  /* Ticked rows (account ids) for "Approve selected": only submitted forms not approved yet, on the page shown. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /* Students ticked for a new batch (approved, waiting for one): kept while the list is paged or filtered. */
  const [picks, setPicks] = useState<BatchPick[]>([]);
  const [batching, setBatching] = useState(false);
  const { size: defaultSize, sizes, districtRequired, failed: batchSizeFailed, reload: reloadBatchSize } = useBatchSize(canEdit);
  const batchRules = { size: defaultSize, sizes, districtRequired };
  /* Of the district of the picks; the default before the first one. */
  const batchSize = sizeFor(picks, batchRules);
  const batchReady = isBatch(picks, batchRules);
  const [done, setDone] = useState('');
  const [search, setSearch] = useState('');
  const [text, setText] = useState(NO_TEXT);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const { stage, district_id, caste_id, documents, centre_id, final } = filters;

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
            /* The Submitted tile covers every approval stage; all other stages are stages of application. */
            stage: stage === 'SUBMITTED' ? stage : undefined,
            application_stage: stage === 'SUBMITTED' ? undefined : stage || undefined,
            name: text.name || undefined,
            district_id: district_id || undefined,
            caste_id: caste_id || undefined,
            documents: documents || undefined,
            mobile: text.mobile || undefined,
            centre_id: centre_id || undefined,
            final: final || undefined,
            follow_up: followUp || undefined,
            search: text.search || undefined,
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
      setSelected((prev) => new Set(list.data.filter((r) => r.can_approve && prev.has(r.id)).map((r) => r.id)));
      /* Of the batch ticks, only a student seen to be no longer waiting for a batch is dropped. */
      setPicks((prev) => prev.filter((p) => list.data.find((r) => r.id === p.id)?.can_batch !== false));
      setMeta(list.meta ?? null);
    } catch (e) {
      if (id === latest.current) setError(e instanceof Error ? e.message : 'Could not load the list');
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [page, stage, district_id, caste_id, documents, centre_id, final, followUp, text]);
  /* A row has one checkbox: for a form the Auditor can approve, or for one that waits for a batch. */
  const approvable = rows.filter((r) => r.can_approve);
  const selectedRows = approvable.filter((r) => selected.has(r.id));
  const picked = new Set(picks.map((p) => p.id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const togglePick = (r: Applicant) => setPicks((prev) => (prev.some((p) => p.id === r.id) ? prev.filter((p) => p.id !== r.id) : [...prev, toPick(r)]));
  /* Why a student who waits for a batch cannot be ticked now. */
  const blocked = (r: Applicant) => (canEdit && r.can_batch ? pickBlocked(r, picks, batchRules) : null);
  /* The checkbox in the heading: the forms to approve; on a page without any, the students waiting for a batch. */
  const headFor = approvable.length ? 'approve' : 'batch';
  const withPage = addPicks(rows, picks, batchRules);
  const pickedHere = rows.some((r) => picked.has(r.id));
  const allTicked = headFor === 'approve' ? selectedRows.length === approvable.length : pickedHere && withPage.length === picks.length;
  const toggleAll = () => {
    if (headFor === 'approve') setSelected(allTicked ? new Set() : new Set(approvable.map((r) => r.id)));
    else setPicks(allTicked ? picks.filter((p) => !rows.some((r) => r.id === p.id)) : withPage);
  };
  const headLabel =
    headFor === 'approve' ? 'Select every form on this page that can be approved' : 'Select the students on this page for a batch (one district)';
  useEffect(() => {
    void load();
  }, [load]);
  const loadOptions = useCallback(async () => {
    setOptionsFailed(false);
    try {
      const res = await api<ListFilterOptions>('/manage/filters', { realm: 'manage' });
      setOptions(res.data);
    } catch {
      setOptionsFailed(true);
    }
  }, []);
  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);
  /* Search, name and mobile: applied after typing stops. */
  useEffect(() => {
    const next = { search: search.trim(), name: filters.name.trim(), mobile: filters.mobile };
    if (next.search === text.search && next.name === text.name && next.mobile === text.mobile) return;
    const t = setTimeout(() => {
      setText(next);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search, filters.name, filters.mobile, text]);
  const changeFilters = (patch: Partial<ListFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    /* The text filters go back to page 1 once they are applied. */
    if (!('name' in patch) && !('mobile' in patch)) setPage(1);
  };
  /* Everything that narrows the list, the search and the follow-up filter included. */
  const clearFilters = () => {
    setFilters(NO_FILTERS);
    setFollowUp('');
    setSearch('');
    setText(NO_TEXT);
    setPage(1);
  };

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
          <button type="button" className={trash ? 'btn ghost sm' : 'btn sm'} aria-pressed={!trash} onClick={() => setTrash(false)}>Active records</button>
          <button type="button" className={trash ? 'btn sm' : 'btn ghost sm'} aria-pressed={trash} onClick={() => setTrash(true)}>Trash</button>
        </div>
        {trash ? <TrashSection canEdit={canEdit} onRestored={() => void load()} /> : <>
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
            <>
              <button
                className="btn ghost sm"
                aria-pressed={stage === 'BATCH'}
                onClick={() => changeFilters({ stage: stage === 'BATCH' ? '' : 'BATCH' })}
                title="Show the approved students who wait for a batch"
              >
                Waiting for a batch{summary?.approvals?.BATCH === undefined ? '' : ` (${summary.approvals.BATCH})`}
              </button>
              <button
                className="btn sm"
                onClick={() => {
                  setDone('');
                  setBatching(true);
                }}
                disabled={!batchReady}
                title={
                  batchSize === null
                    ? 'The batch size is not loaded'
                    : `Select exactly ${batchSize} student${batchSize === 1 ? '' : 's'} of one district who wait${batchSize === 1 ? 's' : ''} for a batch`
                }
              >
                Create batch ({picks.length}
                {batchSize === null ? '' : ` of ${batchSize}`})
              </button>
            </>
          ) : null}
          <button
            className="btn ghost sm"
            onClick={() => {
              void load();
              if (!options) void loadOptions();
              reloadBatchSize();
            }}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {canEdit && batchSizeFailed ? (
          <Notice tone="warn">Could not load the batch size, so no batch can be created. Choose Refresh to try again.</Notice>
        ) : null}
        {canEdit && picks.length ? (
          <div className="batch-bar" role="group" aria-label="Selected for a batch">
            <span aria-live="polite">
              <b>
                {picks.length} of {batchSize ?? '…'} selected
              </b>{' '}
              {batchSize === null
                ? null
                : batchReady
                  ? '– ready: choose Create batch.'
                  : picks.length < batchSize
                    ? `– select ${batchSize - picks.length} more.`
                    : `– unselect ${picks.length - batchSize}.`}
            </span>
            <span className="hint">
              A batch has one district: {pickedDistrict(picks) ?? 'the one of its centre'}
              {pickedDistrict(picks) && batchSize !== defaultSize ? ` (its own batch size: ${batchSize})` : ''}
            </span>
            <span className="spacer" />
            <button type="button" className="link-btn" onClick={() => setPicks([])}>
              Clear selection
            </button>
          </div>
        ) : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        {done ? <Notice tone="ok">{done}</Notice> : null}
        {summary ? (
          <div className="stats" role="group" aria-label="Filter by stage">
            <button className={stage === '' ? 'stat on' : 'stat'} onClick={() => changeFilters({ stage: '' })}>
              <b>{summary.total}</b>
              <span>All students</span>
            </button>
            {summary.stages.map((s) => (
              <button
                key={s.code}
                className={stage === s.code ? 'stat on' : 'stat'}
                onClick={() => changeFilters({ stage: s.code })}
                aria-pressed={stage === s.code}
              >
                <b>{s.count}</b>
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        ) : null}
        <StudentFilters
          value={filters}
          options={options}
          failed={optionsFailed}
          summary={summary}
          onChange={changeFilters}
          onClear={clearFilters}
        />
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
                      aria-label={headLabel}
                      title={headLabel}
                      checked={allTicked}
                      disabled={headFor === 'batch' && !pickedHere && withPage.length === picks.length}
                      onChange={toggleAll}
                    />
                  </th>
                ) : null}
                <th>#</th>
                <th>Student</th>
                <th>Mobile</th>
                <th>Details</th>
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
                  <td colSpan={canEdit ? 15 : 14} className="center muted" style={{ padding: 28 }}>
                    {loading ? 'Loading…' : 'No students match.'}
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={r.id} className={selected.has(r.id) || picked.has(r.id) ? 'row-selected' : undefined}>
                    {canEdit ? (
                      <td className="sel-cell">
                        {r.can_approve ? (
                          <input
                            type="checkbox"
                            aria-label={`Select ${r.name}'s form for approval`}
                            checked={selected.has(r.id)}
                            onChange={() => toggle(r.id)}
                          />
                        ) : r.can_batch ? (
                          <input
                            type="checkbox"
                            aria-label={`Select ${r.name} for a batch`}
                            title={blocked(r)?.reason}
                            checked={picked.has(r.id)}
                            disabled={!!blocked(r)}
                            onChange={() => togglePick(r)}
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
                      <dl className="row-facts">
                        <dt>District</dt>
                        <dd>{r.district ?? '—'}</dd>
                        <dt>Category</dt>
                        <dd>{r.category ?? '—'}</dd>
                        <dt>Centre</dt>
                        <dd>{r.centre ?? '—'}</dd>
                        <dt>Documents</dt>
                        <dd>
                          {r.documents?.uploaded ? (
                            <span className={r.documents.verified === r.documents.uploaded ? 'badge active' : 'badge'}>
                              {r.documents.verified}/{r.documents.uploaded} verified
                            </span>
                          ) : (
                            '—'
                          )}
                        </dd>
                      </dl>
                    </td>
                    <td>
                      <span className={`badge ${r.stage}`}>{r.stage_label}</span>
                    </td>
                    <td>
                      <ApprovalStageCell approval={r.approval} waiting={r.stage === 'SUBMITTED'} />
                      {(r as typeof r & { returned_at?: string | null }).returned_at ? (
                        <div className="mt8">
                          <span className="badge do-REJECTED">Sent back to the candidate</span>
                        </div>
                      ) : null}
                      {blocked(r)?.show ? <div className="hint">{blocked(r)!.reason}</div> : null}
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
                        {canEdit ? <button type="button" className="btn ghost sm" aria-label={`Delete ${r.name}`} onClick={() => setDeleting(r)}>Delete</button> : null}
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
                        ) : canEdit && r.stage === 'SUBMITTED' && !r.approval?.stage ? (
                          /* With the Auditor, but not every uploaded document is verified: Approve is there, and locked. */
                          <div className="approve-locked">
                            <button
                              type="button"
                              className="btn sm locked"
                              disabled
                              aria-label={`Approve ${r.name}'s form`}
                              aria-describedby={`verify-first-${r.id}`}
                            >
                              Approve
                            </button>
                            <Link
                              id={`verify-first-${r.id}`}
                              className="verify-first"
                              to={`/manage/applicants/${encodeURIComponent(r.id)}`}
                              aria-label={`Verify the documents of ${r.name} first`}
                            >
                              First verify all documents, then approve
                            </Link>
                          </div>
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
          Open a student with View to see the full form, documents and approvals. Students who stopped at a step can be contacted from this
          list; record each call with the follow-up icon.
        </p>
        </>}
      </main>
      {deleting ? <DeleteRecordDialog applicant={deleting} onClose={() => setDeleting(null)} onDone={() => { setPicks((prev) => prev.filter((p) => p.id !== deleting.id)); setSelected((prev) => { const next = new Set(prev); next.delete(deleting.id); return next; }); setDeleting(null); setDone('Record moved to trash.'); void load(); }} /> : null}
      {following ? (
        <FollowUpDialog applicant={following} onClose={closeFollowUp} onSaved={() => void load()} readOnly={!canEdit} />
      ) : null}
      {batching && picks.length ? (
        <CreateBatchDialog
          students={picks}
          rules={batchRules}
          onClose={(refused) => {
            setBatching(false);
            /* Refused (e.g. a student is no longer waiting for a batch): the list shows how things stand now. */
            if (refused) {
              void load();
              reloadBatchSize();
            }
          }}
          onDone={(message) => {
            setBatching(false);
            setPicks([]);
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

