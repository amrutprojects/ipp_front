import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api';
import { fmtDate, Notice } from '../../components/ui';
import { useCanEdit } from '../../session';
import type { LinkItem, LinkStatus } from '../../types';

/* What a message tells Sarthi. */
const KIND: Record<LinkItem['kind'], string> = {
  BATCH: 'New batch',
  BATCH_UPDATE: 'Batch changed',
  RESUBMIT: 'Approved again',
  UPDATE: 'Form or documents corrected',
};

function state(s: LinkStatus): { tone: string; text: string } {
  if (!s.enabled) return { tone: 'inactive', text: 'Off' };
  if (!s.configured) return { tone: 'inactive', text: 'Not set up' };
  return { tone: 'active', text: 'On' };
}

/*
 * Settings → Sarthi connection (GET /manage/link): the officers (Divisional Officer, COEP, Head Office, Super Admin) decide in
 * Sarthi, a system of its own. Whether the connection is on (set on the server), and what is not sent yet and why; an ADMIN
 * account can have it tried again and test the connection. An older API has no such thing: nothing is shown.
 */
export default function LinkSection() {
  const canEdit = useCanEdit();
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      setStatus((await api<LinkStatus>('/manage/link', { realm: 'manage' })).data);
      setError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
      else setError(e instanceof Error ? e.message : 'Could not load the connection');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (name: string, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(name);
    setDone('');
    setError('');
    setTest(null);
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'It did not work');
    } finally {
      setBusy('');
    }
  };
  const retry = (name: string, body: object) =>
    act(name, async () => {
      const res = await api<{ retried: number }>('/manage/link/retry', { method: 'POST', realm: 'manage', body });
      setDone(res.message ?? 'It will be sent again.');
      await load();
    });

  if (missing) return null;
  const s = status && state(status);
  return (
    <section className="card" aria-labelledby="link-title">
      <h2 id="link-title">Sarthi connection</h2>
      <p className="sub">
        Batches go to Sarthi, where the Divisional Officer, COEP and Head Office or Super Admin decide; their decisions come back by
        themselves. The connection is switched on on the server.
      </p>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {done ? <Notice tone="ok">{done}</Notice> : null}
      {test ? <Notice tone={test.ok ? 'ok' : 'error'}>{test.message}</Notice> : null}
      {!status && !error ? <div className="loading">Loading…</div> : null}
      {status && s ? (
        <>
          <dl className="details">
            <div>
              <dt>Connection</dt>
              <dd>
                <span className={`badge ${s.tone}`}>{s.text}</span>
                {status.host ? ` ${status.host}` : ''}
              </dd>
            </div>
            <div>
              <dt>Waiting to be sent</dt>
              <dd>{status.pending}</dd>
            </div>
            <div>
              <dt>Not sent</dt>
              <dd>{status.failed ? <span className="badge do-REJECTED">{status.failed}</span> : '0'}</dd>
            </div>
            <div>
              <dt>Last sent</dt>
              <dd>{status.last_sent_at ? fmtDate(status.last_sent_at) : '—'}</dd>
            </div>
            <div>
              <dt>Last decision received</dt>
              <dd>{status.last_received_at ? fmtDate(status.last_received_at) : '—'}</dd>
            </div>
          </dl>
          {status.items.length ? (
            <div className="tbl-wrap mt16">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>What</th>
                    <th>Batch</th>
                    <th>Status</th>
                    <th>Since</th>
                    {canEdit ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {status.items.map((m) => (
                    <tr key={m.id}>
                      <td>
                        {KIND[m.kind] ?? m.kind}
                        {m.student ? (
                          <div className="hint">
                            <Link to={`/manage/applicants/${encodeURIComponent(m.student.id)}`}>{m.student.name}</Link>
                            {m.student.registration_id ? ` · ${m.student.registration_id}` : ''}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <Link to={`/manage/batches/${encodeURIComponent(m.batch.id)}`}>{m.batch.name}</Link>
                        <div className="hint mono">{m.batch.code}</div>
                      </td>
                      <td>
                        <span className={`badge do-${m.status === 'FAILED' ? 'REJECTED' : 'PENDING'}`}>
                          {m.status === 'FAILED' ? 'Not sent' : 'Waiting'}
                        </span>
                        {m.error ? <div className="hint">{m.error}</div> : null}
                        {m.status === 'PENDING' && m.attempts ? (
                          <div className="hint">
                            Tried {m.attempts} time{m.attempts === 1 ? '' : 's'}; next at {fmtDate(m.next_attempt_at)}
                          </div>
                        ) : null}
                      </td>
                      <td className="nowrap">{fmtDate(m.created_at)}</td>
                      {canEdit ? (
                        <td>
                          <button
                            type="button"
                            className="btn ghost sm"
                            disabled={!!busy}
                            aria-label={`Retry: ${KIND[m.kind] ?? m.kind}, ${m.student?.name ?? m.batch.name}`}
                            onClick={() => void retry(m.id, { ids: [m.id] })}
                          >
                            {busy === m.id ? 'Sending…' : 'Retry'}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {status.items.length < status.pending + status.failed ? (
            <p className="hint">The first {status.items.length} of {status.pending + status.failed} are shown.</p>
          ) : null}
          <div className="actions">
            <button type="button" className="btn ghost" disabled={!!busy} onClick={() => void act('refresh', load)}>
              Refresh
            </button>
            {canEdit ? (
              <>
                {status.items.length ? (
                  <button type="button" className="btn ghost" disabled={!!busy} onClick={() => void retry('all', {})}>
                    {busy === 'all' ? 'Sending…' : 'Retry all'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn"
                  disabled={!!busy}
                  onClick={() =>
                    void act('test', async () =>
                      setTest((await api<{ ok: boolean; message: string }>('/manage/link/test', { method: 'POST', realm: 'manage', body: {} })).data),
                    )
                  }
                >
                  {busy === 'test' ? 'Testing…' : 'Test connection'}
                </button>
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
