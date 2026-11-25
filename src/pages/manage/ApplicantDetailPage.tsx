import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, ApiError, downloadFile, openFile } from '../../api';
import { kb } from '../../components/DocumentField';
import { fmtDate, Notice } from '../../components/ui';
import { fallbackView, viewRows } from '../../form';
import { MAIN_FIELDS, type Applicant, type ApplicantDetail, type DocumentCheckSaved, type FollowUp, type FormEdit, type Stage } from '../../types';
import ApprovalHistory from './ApprovalHistory';
import ApprovalStageCell from './ApprovalStageCell';
import ApproveDialog from './ApproveDialog';
import FollowUpDialog from './FollowUpDialog';
import { ManageShell } from './ManageLayout';
import { useCanEdit } from '../../session';

/* The cards of the form, whichever step a field is asked in. */
const ADDRESS = new Set(['current_address', 'permanent_address', 'landmark', 'district_id', 'taluka', 'pin_code']);
const COURSE = new Set(['region_id', 'centre_id', 'technology']);
const QUALIFICATION = new Set<string>(MAIN_FIELDS);
const CARDS = ['Basic Details', 'Address', 'Course & Center', 'Qualification', 'Additional details'] as const;
function cardOf(r: { key: string; custom: boolean }): (typeof CARDS)[number] {
  if (r.custom) return 'Additional details';
  if (ADDRESS.has(r.key)) return 'Address';
  if (COURSE.has(r.key)) return 'Course & Center';
  return QUALIFICATION.has(r.key) ? 'Qualification' : 'Basic Details';
}
const STAGE_LABEL: Record<Stage, string> = {
  OTP_PENDING: 'OTP pending',
  VERIFIED: 'OTP verified',
  BASIC_DONE: 'Step 1 filled (Basic Details)',
  MAIN_DONE: 'Step 2 filled (Main Form)',
  SUBMITTED: 'Submitted',
};

/* How far the student got, as in the list. */
function stageOf(d: ApplicantDetail): Stage {
  if (d.status === 'SUBMITTED' || d.steps.submitted_at) return 'SUBMITTED';
  if (d.steps.main_completed_at) return 'MAIN_DONE';
  if (d.steps.basic_completed_at) return 'BASIC_DONE';
  return d.account.email_verified_at ? 'VERIFIED' : 'OTP_PENDING';
}

type Rows = [string, string | null | undefined][];
function Details({ rows }: { rows: Rows }) {
  return (
    <dl className="details">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card" aria-label={title}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

type Doc = ApplicantDetail['documents'][number];

/*
 * One uploaded document's verification: whether it is verified, by whom and when, and for an admin Verify / Undo — POST
 * /manage/applicants/:id/documents/:docType/verify. The form can be approved once every uploaded document is verified.
 */
function DocumentCheckCell({
  accountId,
  doc,
  editable,
  onSaved,
}: {
  accountId: string;
  doc: Doc;
  editable: boolean;
  onSaved: (saved: DocumentCheckSaved) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const verified = !!doc.verified?.verified;

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api<DocumentCheckSaved>(
        `/manage/applicants/${encodeURIComponent(accountId)}/documents/${encodeURIComponent(doc.code)}/verify`,
        { method: 'POST', realm: 'manage', body: { verified: !verified } },
      );
      onSaved(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="doc-check">
      <span aria-live="polite">
        <span className={verified ? 'badge active' : 'badge'}>{verified ? 'Verified' : 'Not verified'}</span>
        {verified && doc.verified?.at ? (
          <span className="hint doc-check-by">
            {doc.verified.by ? `${doc.verified.by} · ` : ''}
            {fmtDate(doc.verified.at)}
          </span>
        ) : null}
      </span>
      {editable ? (
        <button
          type="button"
          className={verified ? 'btn ghost sm' : 'btn sm'}
          aria-label={`${verified ? 'Undo the verification of' : 'Verify'} ${doc.name}`}
          onClick={() => void save()}
          disabled={busy}
        >
          {busy ? 'Saving…' : verified ? 'Undo' : 'Verify'}
        </button>
      ) : null}
      {error ? (
        <span className="err" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/* What the Auditor changed on the submitted form: when, who, and each field from → to. */
function Changes({ edits }: { edits: FormEdit[] }) {
  return (
    <div className="fu-history approval-history">
      <ol>
        {edits.map((e, i) => (
          <li key={`${e.at}-${i}`}>
            <div className="hint">
              {fmtDate(e.at)}
              {e.by ? ` · ${e.by}` : ''}
            </div>
            <ul className="change-list">
              {e.changes.map((c) => (
                <li key={c.key}>
                  <b>{c.label}:</b> {c.from ? <span className="change-from">{c.from}</span> : '—'} → {c.to || '—'}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

/*
 * One student of the tracking panel: the whole form under the fields' current names, the approvals and changes, the
 * documents (each verified here) and the follow-ups; an admin approves the form and opens Edit form from here.
 */
const EyeIcon = () => (
  <svg className="btn-icon" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
    <path
      d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
);
const DownloadIcon = () => (
  <svg className="btn-icon" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
    <path d="M12 3.5v11M7 10l5 5 5-5M4.5 20h15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function ApplicantDetailPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const [flash, setFlash] = useState<string>(() => (location.state as { flash?: string } | null)?.flash ?? '');
  const [approving, setApproving] = useState(false);
  const [detail, setDetail] = useState<ApplicantDetail | null>(null);
  const [error, setError] = useState('');
  const [fileError, setFileError] = useState('');
  const [zipping, setZipping] = useState(false);
  const [history, setHistory] = useState<FollowUp[] | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [following, setFollowing] = useState(false);
  const canEdit = useCanEdit();

  useEffect(() => {
    let live = true;
    setDetail(null);
    setError('');
    api<ApplicantDetail>(`/manage/applicants/${encodeURIComponent(id)}`, { realm: 'manage' })
      .then((r) => live && setDetail(r.data))
      .catch((e: Error) => {
        if (!live) return;
        setError(e instanceof ApiError && e.status === 404 ? 'This student was not found.' : e.message || 'Could not load the student');
      });
    return () => {
      live = false;
    };
  }, [id]);

  /* The student as it stands now, e.g. after an approval; not onto another student's page opened meanwhile. */
  const reload = async () => {
    try {
      const res = await api<ApplicantDetail>(`/manage/applicants/${encodeURIComponent(id)}`, { realm: 'manage' });
      setDetail((cur) => (cur?.account.id === res.data.account.id ? res.data : cur));
    } catch {
      /* what is shown stays */
    }
  };

  const loadHistory = useCallback(() => {
    setHistoryFailed(false);
    api<FollowUp[]>(`/manage/applicants/${encodeURIComponent(id)}/follow-ups`, { realm: 'manage' })
      .then((r) => setHistory(r.data))
      .catch(() => setHistoryFailed(true));
  }, [id]);
  const loaded = !!detail;
  useEffect(() => {
    if (loaded) loadHistory();
  }, [loaded, loadHistory]);

  const back = (
    <p className="mt8">
      <Link to="/manage">← Back to Applicants</Link>
    </p>
  );
  if (!detail)
    return (
      <ManageShell>
        {back}
        {error ? <Notice tone="error">{error}</Notice> : <div className="loading">Loading…</div>}
      </ManageShell>
    );

  const { account, form, display: d, steps, registration: reg } = detail;
  const stage = stageOf(detail);
  const submitted = stage === 'SUBMITTED';
  const name = [form.first_name, form.last_name].filter(Boolean).join(' ') || account.name;
  const uploaded = detail.documents.filter((x) => x.file);
  const verified = uploaded.filter((x) => x.verified?.verified);
  const allVerified = uploaded.length > 0 && verified.length === uploaded.length;
  /* With the Auditor: can be approved once every uploaded document is verified. */
  const withAuditor = submitted && !detail.approval?.stage;
  /* What the follow-up dialog needs to know about the student (it is shared with the list). */
  const applicant: Applicant = {
    id: account.id,
    name: account.name || name,
    email: account.email,
    mobile_number: account.mobile_number,
    stage,
    stage_label: STAGE_LABEL[stage],
    account_created_at: account.created_at,
    otp_verified_at: account.email_verified_at,
    last_login_at: account.last_login_at,
    basic_completed_at: steps.basic_completed_at,
    main_completed_at: steps.main_completed_at,
    submitted_at: steps.submitted_at,
    registration_id: reg?.registration_id ?? null,
    registration_number: reg?.registration_number ?? null,
    district_id: form.district_id || null,
    district: d.district ?? null,
    category: d.caste ?? null,
    centre: d.centre ?? null,
    documents: { uploaded: uploaded.length, verified: verified.length },
    documents_verified: allVerified,
    final_verified: detail.approval?.stage === 'APPROVED',
    last_activity_at: account.last_login_at ?? account.created_at,
    follow_up: history?.[0] ?? null,
    can_approve: withAuditor && allVerified,
    /* Batches are made from the list. */
    can_batch: false,
    approval: detail.approval ?? null,
  };

  /* The form under the fields' current names (an empty email or mobile: the account's). */
  const rows = viewRows(detail.view_fields ?? fallbackView(form, d, detail.aadhaar_masked), 'en').map((r) =>
    r.text ? r : { ...r, text: r.key === 'email' ? account.email : r.key === 'mobile_number' ? account.mobile_number : '' },
  );
  const dates: Rows = [
    ['Account created', fmtDate(account.created_at)],
    ['OTP verified', fmtDate(account.email_verified_at)],
    ['Last login', fmtDate(account.last_login_at)],
    ['Step 1 completed', fmtDate(steps.basic_completed_at)],
    ['Step 2 completed', fmtDate(steps.main_completed_at)],
    ['Submitted', fmtDate(steps.submitted_at)],
  ];

  return (
    <ManageShell>
      {back}
      {flash ? <Notice tone="ok">{flash}</Notice> : null}
      <section className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>{name}</h2>
          <span className={`badge ${stage}`}>{STAGE_LABEL[stage]}</span>
          <span className="spacer" />
          {canEdit && detail.can_edit ? (
            <Link className="btn ghost sm" to={`/manage/applicants/${encodeURIComponent(account.id)}/edit`}>
              Edit form
            </Link>
          ) : null}
          {canEdit && withAuditor ? (
            <button
              type="button"
              className={allVerified ? 'btn sm' : 'btn sm locked'}
              disabled={!allVerified}
              aria-describedby={allVerified ? undefined : 'approve-why'}
              onClick={() => {
                setFlash('');
                setApproving(true);
              }}
            >
              Approve
            </button>
          ) : null}
        </div>
        {canEdit && withAuditor && !allVerified ? (
          <p className="approve-why" id="approve-why">
            {uploaded.length
              ? `First verify all documents, then approve (${verified.length} of ${uploaded.length} verified).`
              : 'No document is uploaded yet, so the form cannot be approved.'}
          </p>
        ) : null}
        <p className="sub" style={{ margin: '4px 0 0' }}>
          {reg ? (
            <>
              Registration ID <b className="mono">{reg.registration_id}</b>
              {reg.registration_number ? (
                <>
                  {' '}
                  · Registration Number <b className="mono">{reg.registration_number}</b>
                </>
              ) : null}
            </>
          ) : (
            'Not submitted yet'
          )}
        </p>
        <p className="hint" style={{ margin: '4px 0 0' }}>
          <a href={`tel:${account.mobile_number}`}>{account.mobile_number}</a> · <a href={`mailto:${account.email}`}>{account.email}</a>
        </p>
        {submitted ? (
          <div className="approval-state" role="group" aria-label="Approval stage">
            <b>Approval stage</b>
            <ApprovalStageCell approval={detail.approval ?? null} waiting />
          </div>
        ) : null}
        <div className="mt16">
          <Details rows={dates} />
        </div>
      </section>

      {submitted ? (
        <Card title="Approval history">
          <ApprovalHistory events={detail.history ?? []} />
        </Card>
      ) : null}
      {submitted && detail.edits?.length ? (
        <Card title="Changes">
          <Changes edits={detail.edits} />
        </Card>
      ) : null}
      {CARDS.map((title) => {
        const lines = rows.filter((r) => cardOf(r) === title);
        return lines.length ? (
          <Card key={title} title={title}>
            <Details rows={lines.map((r) => [r.label, r.text])} />
          </Card>
        ) : null;
      })}
      <Card title="Documents">
        {detail.documents.some((d) => d.file) ? (
          <div className="row" style={{ marginBottom: 12 }}>
            {submitted ? (
              <b aria-live="polite">
                {verified.length} of {uploaded.length} documents verified
              </b>
            ) : null}
            <span className="muted fs13">
              {uploaded.length} of {detail.documents.length} documents uploaded
            </span>
            <span className="spacer" />
            <button
              type="button"
              className="btn sm"
              disabled={zipping}
              onClick={() => {
                setFileError('');
                setZipping(true);
                void downloadFile(`/manage/applicants/${encodeURIComponent(account.id)}/documents.zip`, 'manage', 'documents.zip')
                  .catch(() => setFileError('Could not download the documents.'))
                  .finally(() => setZipping(false));
              }}
            >
              <DownloadIcon />
              {zipping ? 'Preparing ZIP…' : 'Download all documents (ZIP)'}
            </button>
          </div>
        ) : null}
        {fileError ? <Notice tone="error">{fileError}</Notice> : null}
        <div className="tbl-wrap">
          <table className="tbl docs-tbl">
            <thead>
              <tr>
                <th>Document</th>
                <th>File</th>
                <th>Uploaded</th>
                {submitted ? <th>Verification</th> : null}
                <th className="doc-actions-cell">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {detail.documents.map((doc) => (
                <tr key={doc.code}>
                  <td>
                    {doc.name}
                    {doc.required ? <span className="req"> *</span> : null}
                  </td>
                  <td>
                    {doc.file ? (
                      <>
                        {doc.file.original_name} <span className="muted">({kb(doc.file.size_bytes)})</span>
                      </>
                    ) : (
                      <span className="muted">Not uploaded</span>
                    )}
                  </td>
                  <td className="nowrap">{doc.file ? fmtDate(doc.file.uploaded_at) : '—'}</td>
                  {submitted ? (
                    <td>
                      {doc.file ? (
                        <DocumentCheckCell
                          accountId={account.id}
                          doc={doc}
                          editable={canEdit && detail.approval?.stage !== 'APPROVED'}
                          onSaved={(saved) =>
                            setDetail((cur) =>
                              cur?.account.id === account.id
                                ? {
                                    ...cur,
                                    documents: cur.documents.map((x) =>
                                      x.code === doc.code ? { ...x, verified: { verified: saved.verified, at: saved.at, by: saved.by } } : x,
                                    ),
                                  }
                                : cur,
                            )
                          }
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                  ) : null}
                  <td className="doc-actions-cell">
                    {doc.file ? (
                      <div className="file-actions">
                        <button
                          type="button"
                          className="btn ghost sm"
                          aria-label={`View ${doc.name}`}
                          onClick={() => {
                            setFileError('');
                            void openFile(
                              `/manage/applicants/${encodeURIComponent(account.id)}/documents/${encodeURIComponent(doc.code)}/file`,
                              'manage',
                            ).catch(() => setFileError(`Could not open ${doc.name}.`));
                          }}
                        >
                          <EyeIcon />
                          View
                        </button>
                        <button
                          type="button"
                          className="btn sm"
                          aria-label={`Download ${doc.name}`}
                          onClick={() => {
                            setFileError('');
                            void downloadFile(
                              `/manage/applicants/${encodeURIComponent(account.id)}/documents/${encodeURIComponent(doc.code)}/file?download=1`,
                              'manage',
                              doc.file!.original_name,
                            ).catch(() => setFileError(`Could not download ${doc.name}.`));
                          }}
                        >
                          <DownloadIcon />
                          Download
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint mt8">* Mandatory.</p>
      </Card>
      <Card title="Follow-ups">
        {canEdit ? (
          <div className="row">
            <span className="spacer" />
            <button type="button" className="btn sm" onClick={() => setFollowing(true)}>
              Add follow-up
            </button>
          </div>
        ) : null}
        {history === null && historyFailed ? (
          <p className="err">Could not load the follow-ups.</p>
        ) : history === null ? (
          <p className="muted">Loading…</p>
        ) : history.length === 0 ? (
          <p className="muted">No follow-up recorded yet.</p>
        ) : (
          <div className="fu-history" style={{ marginTop: 12 }}>
          <ol>
            {history.map((f, i) => (
              <li key={`${f.at}-${i}`}>
                <div className="row">
                  <span className={`badge fu-${f.status}`}>{f.status_label}</span>
                  <span className="hint">
                    {fmtDate(f.at)}
                    {f.by ? ` · ${f.by}` : ''}
                  </span>
                </div>
                {f.note ? <p className="fu-note-full">{f.note}</p> : null}
              </li>
            ))}
          </ol>
          </div>
        )}
      </Card>
      {approving && canEdit ? (
        <ApproveDialog
          target={{ kind: 'one', applicant }}
          onClose={() => setApproving(false)}
          onDone={(message) => {
            setApproving(false);
            setFlash(message);
            void reload();
          }}
        />
      ) : null}
      {following && canEdit ? <FollowUpDialog applicant={applicant} onClose={() => setFollowing(false)} onSaved={loadHistory} /> : null}
    </ManageShell>
  );
}
