import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError, downloadFile, openFile } from '../../api';
import { ddmmyyyy, fmtDate, Notice } from '../../components/ui';
import type { Applicant, ApplicantDetail, FollowUp, Stage } from '../../types';
import { FIELD_LABELS as L, isCgpa, isDisabled } from '../../validation';
import FollowUpDialog from './FollowUpDialog';
import { ManageShell } from './ManageLayout';
import { useCanEdit } from '../../session';

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const GRADING: Record<string, string> = { PERCENTAGE: 'Percentage', CGPA: 'CGPA' };
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

/* One student of the tracking panel, read-only: the whole form, the documents and the follow-ups. */
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

  const loadHistory = useCallback(() => {
    setHistoryFailed(false);
    api<FollowUp[]>(`/manage/applicants/${encodeURIComponent(id)}/follow-ups`, { realm: 'manage' })
      .then((r) => setHistory(r.data))
      .catch(() => setHistoryFailed(true));
  }, [id]);
  useEffect(() => {
    if (detail) loadHistory();
  }, [detail, loadHistory]);

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
  const name = [form.first_name, form.last_name].filter(Boolean).join(' ') || account.name;
  const score = !form.score
    ? ''
    : isCgpa(form)
      ? `${form.score}${form.cgpa_scale ? ` / ${form.cgpa_scale}` : ''}`
      : form.grading_type === 'PERCENTAGE'
        ? `${form.score}%`
        : form.score;
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
    last_activity_at: account.last_login_at ?? account.created_at,
    follow_up: history?.[0] ?? null,
  };

  const basic: Rows = [
    [L.first_name, form.first_name],
    [L.last_name, form.last_name],
    [L.father_name, form.father_name],
    [L.mother_name, form.mother_name],
    [L.email, form.email || account.email],
    [L.date_of_birth, form.date_of_birth ? ddmmyyyy(form.date_of_birth) : ''],
    [L.gender, d.gender ?? form.gender],
    [L.marital_status, d.marital_status ?? form.marital_status],
    [L.aadhaar_number, detail.aadhaar_masked],
    [L.mobile_number, form.mobile_number || account.mobile_number],
    [L.alternate_mobile_number, form.alternate_mobile_number],
    [L.alternate_email, form.alternate_email],
    [L.religion, d.religion ?? form.religion],
    [L.caste_id, d.caste],
    [L.disability_status, form.disability_status],
    ...(isDisabled(form)
      ? ([
          [L.disability_type, form.disability_type],
          [L.disability_certificate_number, form.disability_certificate_number],
        ] as Rows)
      : []),
  ];
  const address: Rows = [
    [L.current_address, form.current_address],
    [L.permanent_address, form.permanent_address],
    [L.landmark, form.landmark],
    [L.district_id, d.district],
    [L.taluka_id, d.taluka],
    [L.pin_code, form.pin_code],
  ];
  const course: Rows = [
    [L.region_id, d.course_centre],
    [L.centre_id, d.centre],
    [L.technology, d.technology],
  ];
  const qualification: Rows = [
    [L.education_id, d.education],
    [L.qualification_name, form.qualification_name],
    [L.qualification_stream, form.qualification_stream],
    [L.qualification_board, form.qualification_board],
    [L.qualification_completed_on, form.qualification_completed_on ? ddmmyyyy(form.qualification_completed_on) : ''],
    [L.grading_type, GRADING[form.grading_type] ?? form.grading_type],
    ...(isCgpa(form) ? ([[L.cgpa_scale, form.cgpa_scale]] as Rows) : []),
    [L.score, score],
    [L.qualification_class, form.qualification_class],
  ];
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
      <section className="card">
        <div className="row">
          <h2 style={{ margin: 0 }}>{name}</h2>
          <span className={`badge ${stage}`}>{STAGE_LABEL[stage]}</span>
        </div>
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
        <div className="mt16">
          <Details rows={dates} />
        </div>
      </section>

      <Card title="Basic Details">
        <Details rows={basic} />
      </Card>
      <Card title="Address">
        <Details rows={address} />
      </Card>
      <Card title="Course & Center">
        <Details rows={course} />
      </Card>
      <Card title="Qualification">
        <Details rows={qualification} />
      </Card>
      <Card title="Documents">
        {detail.documents.some((d) => d.file) ? (
          <div className="row" style={{ marginBottom: 12 }}>
            <span className="muted fs13">
              {detail.documents.filter((d) => d.file).length} of {detail.documents.length} documents uploaded
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
      {following && canEdit ? <FollowUpDialog applicant={applicant} onClose={() => setFollowing(false)} onSaved={loadHistory} /> : null}
    </ManageShell>
  );
}
