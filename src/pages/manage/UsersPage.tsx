import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../../api';
import { fmtDate, Modal, Notice } from '../../components/ui';
import { useManage } from '../../session';
import { MANAGE_ROLE_LABEL, type ManageUser } from '../../types';
import { ManageShell } from './ManageLayout';

/* "Activate / Deactivate this user?" — PATCH /manage/users/:id/status on Yes. */
function UserStatusDialog({ user, onClose, onDone }: { user: ManageUser; onClose: () => void; onDone: (updated: ManageUser) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const activate = !user.is_active;
  const verb = activate ? 'Activate' : 'Deactivate';

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api<ManageUser>(`/manage/users/${encodeURIComponent(user.id)}/status`, {
        method: 'PATCH',
        realm: 'manage',
        body: { is_active: activate },
      });
      onDone(res.data ?? { ...user, is_active: activate });
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not ${verb.toLowerCase()} the user`);
      setBusy(false);
    }
  };

  return (
    <Modal alert title={`${verb} ${user.name}?`} onClose={() => !busy && onClose()}>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <p>
        {activate
          ? 'The user will be able to log in to the tracking panel again.'
          : 'The user will no longer be able to log in to the tracking panel. Their follow-ups are kept.'}
      </p>
      <div className="actions">
        <button className="btn ghost" onClick={onClose} disabled={busy} data-autofocus>
          Cancel
        </button>
        <button className={activate ? 'btn' : 'btn danger'} onClick={() => void confirm()} disabled={busy}>
          {busy ? 'Saving…' : `Yes, ${verb.toLowerCase()}`}
        </button>
      </div>
    </Modal>
  );
}

/* Users of the tracking panel (admins only): who can log in, as Admin (full access) or Viewer (view and download). */
export default function UsersPage() {
  const location = useLocation();
  const { user: me } = useManage();
  const [flash, setFlash] = useState<string>(() => (location.state as { flash?: string } | null)?.flash ?? '');
  const [rows, setRows] = useState<ManageUser[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<ManageUser | null>(null);

  const latest = useRef(0);
  const load = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    setError('');
    try {
      const res = await api<ManageUser[]>('/manage/users', { realm: 'manage' });
      if (id === latest.current) setRows(res.data ?? []);
    } catch (e) {
      if (id === latest.current) setError(e instanceof Error ? e.message : 'Could not load the users');
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ManageShell wide>
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Users</h2>
        <span className="spacer" />
        <button className="btn ghost sm" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
        <Link className="btn sm" to="/manage/users/new">
          + Add user
        </Link>
      </div>
      {flash ? <Notice tone="ok">{flash}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last login</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="center muted" style={{ padding: 28 }}>
                  {loading ? 'Loading…' : 'No users yet.'}
                </td>
              </tr>
            ) : (
              rows.map((u, i) => {
                const self = u.id === me?.id;
                return (
                  <tr key={u.id}>
                    <td>{i + 1}</td>
                    <td>
                      <b>{u.name}</b>
                      {self ? <span className="muted fs13"> (you)</span> : null}
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`badge role-${u.role}`}>{MANAGE_ROLE_LABEL[u.role] ?? u.role}</span>
                    </td>
                    <td>
                      <span className={`badge ${u.is_active ? 'active' : 'inactive'}`}>{u.is_active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="nowrap">{fmtDate(u.last_login_at)}</td>
                    <td className="nowrap">{fmtDate(u.created_at)}</td>
                    <td>
                      {self ? (
                        <span className="muted fs13">—</span>
                      ) : (
                        <button
                          type="button"
                          className={u.is_active ? 'btn danger sm' : 'btn sm'}
                          onClick={() => {
                            setFlash('');
                            setToggling(u);
                          }}
                          aria-label={`${u.is_active ? 'Deactivate' : 'Activate'} ${u.name}`}
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="hint mt16">
        An Admin has full access. A Viewer can see the applicants, their documents and follow-ups and the Center Master, and can
        download files, but cannot change anything.
      </p>
      {toggling ? (
        <UserStatusDialog
          user={toggling}
          onClose={() => setToggling(null)}
          onDone={(updated) => {
            setToggling(null);
            setRows((list) => list.map((r) => (r.id === updated.id ? updated : r)));
            setFlash(updated.is_active ? `${updated.name} activated.` : `${updated.name} deactivated.`);
          }}
        />
      ) : null}
    </ManageShell>
  );
}
