import { fmtDate } from '../../components/ui';
import type { ApprovalEvent } from '../../types';
import { moveText } from './ApprovalStageCell';

/* Where a move took the student. */
function sentTo(e: ApprovalEvent): string {
  if (e.action === 'REJECT') return `sent back to ${e.to.name}`;
  if (e.to.stage === 'BATCH') return 'waiting for a batch';
  return e.to.stage === 'APPROVED' ? 'finally approved' : `sent to ${e.to.name}`;
}

/* A student's whole approval history, newest first: who approved or rejected at which stage, when, and the reason. */
export default function ApprovalHistory({ events }: { events: ApprovalEvent[] }) {
  if (!events.length) return <p className="muted">No approval or rejection yet.</p>;
  return (
    <div className="fu-history approval-history">
      <ol>
        {events.map((e, i) => (
          <li key={`${e.at}-${i}`}>
            <div className="row">
              <span className={`badge do-${e.action === 'REJECT' ? 'REJECTED' : 'APPROVED'}`}>{moveText(e)}</span>
              <span className="fs13">{sentTo(e)}</span>
              <span className="hint">
                {fmtDate(e.at)}
                {e.by ? ` · ${e.by}` : ''}
              </span>
            </div>
            {e.reason ? <p className="fu-note-full">Reason: {e.reason}</p> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
