import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../api';
import { Field, Notice } from '../../../components/ui';
import { useCanEdit } from '../../../session';
import type { MasterState } from '../../../types';
import { MastersShell } from '../ManageLayout';
import { ConfirmDelete, DetailsDialog, FormDialog, InUse, messageOf, RowActions, StatusBadge, ViewOnlyNotice } from './shared';

/* Add or edit a state: its name and code. */
function StateDialog({ row, onClose, onSaved }: { row: MasterState | null; onClose: () => void; onSaved: (message: string) => void }) {
  const [name, setName] = useState(row?.name ?? '');
  const [code, setCode] = useState(row?.code ?? '');
  const save = async () => {
    const typed = { name: name.trim(), code: code.trim().toUpperCase() };
    if (!row) {
      await api('/manage/states', { method: 'POST', realm: 'manage', body: typed });
      onSaved(`State ${typed.name} added.`);
      return;
    }
    /* Only what changed. */
    const body: Record<string, unknown> = {};
    if (typed.name !== row.name) body.name = typed.name;
    if (typed.code !== row.code) body.code = typed.code;
    if (Object.keys(body).length) await api(`/manage/states/${encodeURIComponent(row.id)}`, { method: 'PATCH', realm: 'manage', body });
    onSaved(`State ${typed.name} saved.`);
  };
  return (
    <FormDialog
      title={row ? `Edit ${row.name}` : 'Add a state'}
      submit={row ? 'Save' : 'Add'}
      check={() => ({
        name: !name.trim() ? 'Name is required' : '',
        code: !code.trim()
          ? 'Code is required'
          : !/^[A-Z][A-Z0-9]{1,9}$/.test(code.trim().toUpperCase())
            ? 'Code: 2–10 characters, A–Z and 0–9, starting with a letter'
            : '',
      })}
      save={save}
      onClose={onClose}
    >
      {(errors) => (
        <div className="grid one">
          <Field id="state-name" label="Name" error={errors.name}>
            <input id="state-name" className="inp" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
          </Field>
          <Field id="state-code" label="Code" error={errors.code} hint="A–Z and 0–9, starting with a letter (e.g. MH).">
            <input id="state-code" className="inp mono" maxLength={10} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </Field>
        </div>
      )}
    </FormDialog>
  );
}

/* Masters → States: the states the districts belong to. */
export default function StatesPage() {
  const canEdit = useCanEdit();
  const [rows, setRows] = useState<MasterState[] | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [editing, setEditing] = useState<MasterState | 'new' | null>(null);
  const [deleting, setDeleting] = useState<MasterState | null>(null);
  const [viewing, setViewing] = useState<MasterState | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<MasterState[]>('/manage/states', { realm: 'manage' });
      setRows(res.data);
      setError('');
    } catch (e) {
      setError(messageOf(e, 'Could not load the states'));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const changed = (message: string) => {
    setEditing(null);
    setDeleting(null);
    setDone(message);
    void load();
  };
  const setActive = async (s: MasterState, on: boolean) => {
    setDone('');
    setError('');
    try {
      await api(`/manage/states/${encodeURIComponent(s.id)}`, { method: 'PATCH', realm: 'manage', body: { is_active: on } });
      setRows((list) => list?.map((x) => (x.id === s.id ? { ...x, is_active: on } : x)) ?? null);
      setDone(`State ${s.name} set to ${on ? 'Active' : 'Inactive'}.`);
    } catch (e) {
      setError(messageOf(e, 'Could not save'));
    }
  };

  const needle = search.trim().toLowerCase();
  const shown = rows?.filter((s) => !needle || s.name.toLowerCase().includes(needle) || s.code.toLowerCase().includes(needle)) ?? [];
  return (
    <MastersShell>
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>States</h2>
        <span className="spacer" />
        {canEdit ? (
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              setDone('');
              setEditing('new');
            }}
          >
            + Add state
          </button>
        ) : null}
      </div>
      {!canEdit ? <ViewOnlyNotice /> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {done ? <Notice tone="ok">{done}</Notice> : null}
      {!rows && !error ? <div className="loading">Loading…</div> : null}
      {rows ? (
        <>
          <div className="toolbar">
            <input
              className="inp"
              type="search"
              placeholder="Search name or code"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search states"
            />
            <span className="muted">
              {shown.length} state{shown.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Districts</th>
                  <th>Status</th>
                  <th>Used</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="center muted" style={{ padding: 28 }}>
                      {needle ? 'No states match.' : 'No states yet.'}
                    </td>
                  </tr>
                ) : (
                  shown.map((s, i) => (
                    <tr key={s.id}>
                      <td>{i + 1}</td>
                      <td>
                        <b>{s.name}</b>
                      </td>
                      <td className="mono nowrap">{s.code || '—'}</td>
                      <td>{s.districts}</td>
                      <td>
                        <StatusBadge on={s.is_active} />
                      </td>
                      <td>
                        <InUse value={s.in_use} />
                      </td>
                      <td>
                        <RowActions
                          name={s.name}
                          canEdit={canEdit}
                          active={s.is_active}
                          onView={() => setViewing(s)}
                          onEdit={() => {
                            setDone('');
                            setEditing(s);
                          }}
                          onStatus={(on) => setActive(s, on)}
                          onDelete={() => {
                            setDone('');
                            setDeleting(s);
                          }}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      {viewing ? (
        <DetailsDialog
          title={viewing.name}
          rows={[
            ['Name', viewing.name],
            ['Code', viewing.code],
            ['Districts', viewing.districts],
            ['Status', viewing.is_active ? 'Active' : 'Inactive'],
            ['Used on forms', viewing.in_use ? 'Yes' : 'No'],
          ]}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {editing && canEdit ? <StateDialog row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={changed} /> : null}
      {deleting && canEdit ? (
        <ConfirmDelete
          name={deleting.name}
          note="It is no longer offered. A state that has districts cannot be deleted; switch it off instead."
          remove={async () => {
            await api(`/manage/states/${encodeURIComponent(deleting.id)}`, { method: 'DELETE', realm: 'manage' });
            changed(`State ${deleting.name} deleted.`);
          }}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </MastersShell>
  );
}
