import { Link } from 'react-router-dom';
import { fmtDate } from '../../components/ui';
import type { Approval, ApprovalEvent } from '../../types';

/* A move in words: an approval, being put into a batch (and sent to the Divisional Officer), a rejection, or changing hands. */
export function moveText(e: ApprovalEvent): string {
  if (e.action === 'REJECT') return `Rejected by ${e.from.name}`;
  if (e.action === 'MOVE') return `Moved from ${e.from.name}`;
  return e.from.stage === 'BATCH' ? 'Put into a batch' : `Approved by ${e.from.name}`;
}

/*
 * Approval stage (the list, a batch, and a student's page): after the Auditor (this panel) approves a submitted form it
 * waits for a batch; the batch goes to the Divisional Officer of its district → COEP → Head Office, or the Super Admin while
 * Head Office approval is off (all in Sarthi), each approving or rejecting. A rejection sends the student back one stage, in
 * the same batch, with the reason shown here; the last approval is final.
 * `waiting` = the form is submitted and with the Auditor; `batch` = name the student's batch (not on the batch's own page).
 */
export default function ApprovalStageCell({ approval: a, waiting, batch = true }: { approval: Approval | null; waiting: boolean; batch?: boolean }) {
  const ev = a?.last_event ?? null;
  const rejected = ev?.action === 'REJECT' ? ev : null;
  if (!a || (!a.stage && !rejected)) return <span className="muted fs13">{waiting ? 'Not approved yet' : '—'}</span>;
  const tone = !a.stage ? 'REJECTED' : a.stage === 'APPROVED' || a.stage === 'BATCH' ? a.stage : 'PENDING';
  return (
    <div className="do-cell">
      <span className={`badge do-${tone}`}>{a.stage ? a.stage_label : 'Sent back to Auditor'}</span>
      {rejected ? (
        <div className="do-reason">
          <b>Rejected by {rejected.from.name}:</b> {rejected.reason}
        </div>
      ) : null}
      {batch && a.batch ? (
        <div className="do-batch">
          Batch: <Link to={`/manage/batches/${encodeURIComponent(a.batch.id)}`}>{a.batch.name}</Link>
        </div>
      ) : null}
      {a.stage === 'APPROVED' && a.register_id ? (
        <div className="do-register">
          Student register: <b className="mono">{a.register_id}</b>
        </div>
      ) : null}
      {ev ? (
        <div className="hint">
          {rejected ? null : `${moveText(ev)}${ev.by ? ` (${ev.by})` : ''} · `}
          {fmtDate(ev.at)}
          {rejected?.by ? ` · ${rejected.by}` : ''}
        </div>
      ) : null}
    </div>
  );
}
