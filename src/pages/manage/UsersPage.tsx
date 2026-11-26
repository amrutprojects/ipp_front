import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../../api';
import { Field, fmtDate, Modal, Notice } from '../../components/ui';
import { useManage } from '../../session';
import { MANAGE_ROLE_LABEL, type ManageRole, type ManageUser } from '../../types';
import { EMAIL_RE } from '../../validation';
import { ManageShell } from './ManageLayout';
import { ConfirmDelete, DetailsDialog, FormDialog, RowActions, whenText } from './masters/shared';

/* Edit a user: name, email and role (not one's own role). PATCH /manage/users/:id. */
function EditUserDialog({ user, self, onClose, onSaved }: { user: ManageUser; self: boolean; onClose: () => void; onSaved: (u: ManageUser) => void }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<ManageRole>(user.role);
  const save = async () => {
    const body: Record<string, string> = {};
    if (name.trim() !== user.name) body.name = name.trim();
    if (email.trim().toLowerCase() !== user.email) body.email = email.trim();
    if (role !== user.role) body.role = role;
    if (!Object.keys(body).length) return onSaved(user);
    const res = await api<ManageUser>(`/manage/users/${encodeURIComponent(user.id)}`, { method: 'PATCH', realm: 'manage', body });
    onSaved(res.data);
  };
  return (
    <FormDialog
      title={`Edit ${user.name}`}
      submit="Save"
      check={() => ({
        name: !name.trim() ? 'Name is required' : name.trim().length < 2 || name.trim().length > 150 ? 'Name must be 2–150 characters' : '',
        email: !email.trim() ? 'Email is required' : email.trim().length > 254 || !EMAIL_RE.test(email.trim()) ? 'Enter a valid email address' : '',
      })}
      save={save}
      onClose={onClose}
    >
      {(errors) => (
        <div className="grid one">
          <Field id="u-name" label="Name" error={errors.name}>
            <input id="u-name" className="inp" maxLength={150} value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
          </Field>
          <Field id="u-email" label="Email" error={errors.email} hint="The user signs in with it.">
            <input id="u-email" className="inp" type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field id="u-role" label="Role" error={errors.role} hint={self ? 'You cannot change your own role.' : undefined}>
            <select id="u-role" className="inp" value={role} onChange={(e) => setRole(e.target.value as ManageRole)} disabled={self}>
              <option value="ADMIN">{MANAGE_ROLE_LABEL.ADMIN}: full access</option>
              <option value="VIEWER">{MANAGE_ROLE_LABEL.VIEWER}: view and download only</option>
            </select>
          </Field>
        </div>
      )}
    </FormDialog>
  );
}

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
  const [viewing, setViewing] = useState<ManageUser | null>(null);
  const [editing, setEditing] = useState<ManageUser | null>(null);
  const [deleting, setDeleting] = useState<ManageUser | null>(null);

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
                      {/* Not oneself: nobody deactivates or deletes their own account. */}
                      <RowActions
                        name={u.name}
                        canEdit
                        onView={() => setViewing(u)}
                        onEdit={() => {
                          setFlash('');
                          setEditing(u);
                        }}
                        onDelete={
                          self
                            ? undefined
                            : () => {
                                setFlash('');
                                setDeleting(u);
                              }
                        }
                      >
                        {self ? null : (
                          <button
                            type="button"
                            className={u.is_active ? 'btn ghost sm' : 'btn sm'}
                            onClick={() => {
                              setFlash('');
                              setToggling(u);
                            }}
                            aria-label={`${u.is_active ? 'Deactivate' : 'Activate'} ${u.name}`}
                          >
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                      </RowActions>
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
      {viewing ? (
        <DetailsDialog
          title={viewing.name}
          rows={[
            ['Name', viewing.name],
            ['Email', viewing.email],
            ['Role', `${MANAGE_ROLE_LABEL[viewing.role] ?? viewing.role}: ${viewing.role === 'ADMIN' ? 'full access' : 'view and download only'}`],
            ['Status', viewing.is_active ? 'Active: can sign in' : 'Inactive: cannot sign in'],
            ['Last login', whenText(viewing.last_login_at)],
            ['Created', whenText(viewing.created_at)],
            ['Last changed', whenText(viewing.updated_at)],
          ]}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {editing ? (
        <EditUserDialog
          user={editing}
          self={editing.id === me?.id}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setEditing(null);
            setRows((list) => list.map((r) => (r.id === updated.id ? updated : r)));
            setFlash(`${updated.name} saved.`);
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDelete
          name={deleting.name}
          note="The user is signed out at once and can no longer sign in. What they did stays recorded under their name."
          remove={async () => {
            await api(`/manage/users/${encodeURIComponent(deleting.id)}`, { method: 'DELETE', realm: 'manage' });
            setRows((list) => list.filter((r) => r.id !== deleting.id));
            setFlash(`${deleting.name} deleted.`);
            setDeleting(null);
          }}
          onClose={() => setDeleting(null)}
        />
      ) : null}
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
