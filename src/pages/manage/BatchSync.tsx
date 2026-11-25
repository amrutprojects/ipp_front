import { useState } from 'react';
import { api } from '../../api';
import { fmtDate } from '../../components/ui';
import { useCanEdit } from '../../session';
import type { Batch } from '../../types';

/*
 * Whether Sarthi, where the officers decide, has a batch as it is now (GET /manage/batches → sync). One that is not sent
 * says why; an ADMIN account can have it tried again at once. Nothing from an older API.
 */
export default function BatchSync({ batch, onRetried }: { batch: Batch; onRetried: () => void }) {
  const canEdit = useCanEdit();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sync = batch.sync;
  if (!sync) return null;

  const retry = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api('/manage/link/retry', { method: 'POST', realm: 'manage', body: { batch_id: batch.id } });
      onRetried();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not try it again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="batch-sync">
      {sync.status === 'SENT' ? (
        <span className="hint">Sent to Sarthi{sync.sent_at ? ` · ${fmtDate(sync.sent_at)}` : ''}</span>
      ) : (
        <>
          <span className={`badge do-${sync.status === 'FAILED' ? 'REJECTED' : 'PENDING'}`}>
            {sync.status === 'FAILED' ? 'Not sent to Sarthi' : 'Waiting to be sent to Sarthi'}
          </span>
          {sync.error ? <div className="hint">{sync.error}</div> : null}
          {canEdit ? (
            <button
              type="button"
              className="link-btn"
              onClick={() => void retry()}
              disabled={busy}
              aria-label={`Send ${batch.name} to Sarthi again`}
            >
              {busy ? 'Sending…' : 'Retry'}
            </button>
          ) : null}
        </>
      )}
      {error ? (
        <div className="err" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
