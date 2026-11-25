import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../api';
import { Field, Notice, useRemoteList } from '../../../components/ui';
import { useCanEdit } from '../../../session';
import type { GeoRef, MasterDistrict } from '../../../types';
import { MastersShell } from '../ManageLayout';
import { ConfirmDelete, FormDialog, InUse, messageOf, StatusSwitch, ViewOnlyNotice } from './shared';

/* Add or edit a district: its name, code and state. */
function DistrictDialog({ row, onClose, onSaved }: { row: MasterDistrict | null; onClose: () => void; onSaved: (message: string) => void }) {
  const [name, setName] = useState(row?.name ?? '');
  const [code, setCode] = useState(row?.code ?? '');
  /* null = not chosen here: a new district's default, an edited one's own. */
  const [stateId, setStateId] = useState<string | null>(null);
  const states = useRemoteList<GeoRef>('/geography/states');
  /* The edited district's state (an older API gives only its name); it stays selectable when it is inactive. */
  const own = row ? (row.state_id ?? states.items.find((s) => s.name === row.state)?.id ?? '') : '';
  const stateItems =
    row && states.status === 'ok' && !states.items.some((s) => s.id === own)
      ? [...states.items, { id: own, name: `${row.state || 'Current state'} (inactive)`, code: '' }]
      : states.items;
  const save = async () => {
    if (!row) {
      await api('/manage/districts', {
        method: 'POST',
        realm: 'manage',
        body: { name: name.trim(), code: code.trim().toUpperCase() || undefined, state_id: stateId || undefined },
      });
      onSaved(`District ${name.trim()} added.`);
      return;
    }
    const body: Record<string, unknown> = {};
    if (name.trim() !== row.name) body.name = name.trim();
    if (code.trim().toUpperCase() !== row.code) body.code = code.trim().toUpperCase();
    if (stateId !== null && stateId !== own) body.state_id = stateId;
    if (Object.keys(body).length) await api(`/manage/districts/${encodeURIComponent(row.id)}`, { method: 'PATCH', realm: 'manage', body });
    onSaved(`District ${name.trim()} saved.`);
  };
  return (
    <FormDialog
      title={row ? `Edit ${row.name}` : 'Add a district'}
      submit={row ? 'Save' : 'Add'}
      check={() => ({
        name: !name.trim() ? 'Name is required' : '',
        code: code.trim() && !/^[A-Za-z0-9-]{2,20}$/.test(code.trim()) ? 'Code: 2–20 characters, A–Z, 0–9 and hyphen' : '',
      })}
      save={save}
      onClose={onClose}
    >
      {(errors) => (
        <div className="grid one">
          <Field id="dist-name" label="Name" error={errors.name}>
            <input id="dist-name" className="inp" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
          </Field>
          <Field id="dist-code" label="Code" required={false} error={errors.code} hint="A–Z, 0–9 and hyphen; left blank: made from the name.">
            <input id="dist-code" className="inp mono" maxLength={20} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </Field>
          {/* One state (or none to choose from): the API's own. */}
          {stateItems.length > 1 ? (
            <Field id="dist-state" label="State" required={false} error={errors.state_id ?? errors.stateId}>
              <select id="dist-state" className="inp" value={stateId ?? own} onChange={(e) => setStateId(e.target.value)}>
                {row ? null : <option value="">Maharashtra (default)</option>}
                {stateItems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>
      )}
    </FormDialog>
  );
}

/* Masters → Districts: the districts the form offers. */
export default function DistrictsPage() {
  const canEdit = useCanEdit();
  const [rows, setRows] = useState<MasterDistrict[] | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'INACTIVE'>('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [editing, setEditing] = useState<MasterDistrict | 'new' | null>(null);
  const [deleting, setDeleting] = useState<MasterDistrict | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<MasterDistrict[]>('/manage/districts', { realm: 'manage' });
      setRows(res.data);
      setError('');
    } catch (e) {
      setError(messageOf(e, 'Could not load the districts'));
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
  const setActive = async (d: MasterDistrict, on: boolean) => {
    setDone('');
    setError('');
    try {
      await api(`/manage/districts/${encodeURIComponent(d.id)}`, { method: 'PATCH', realm: 'manage', body: { is_active: on } });
      setRows((list) => list?.map((x) => (x.id === d.id ? { ...x, is_active: on } : x)) ?? null);
    } catch (e) {
      setError(messageOf(e, 'Could not save'));
    }
  };

  const needle = search.trim().toLowerCase();
  const shown =
    rows?.filter(
      (d) =>
        (!needle || d.name.toLowerCase().includes(needle) || d.code.toLowerCase().includes(needle)) &&
        (!status || d.is_active === (status === 'ACTIVE')),
    ) ?? [];
  return (
    <MastersShell>
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Districts</h2>
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
            + Add district
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
              aria-label="Search districts"
            />
            <select
              className="inp"
              style={{ maxWidth: 180 }}
              aria-label="Filter by status"
              value={status}
              onChange={(e) => setStatus(e.target.value as '' | 'ACTIVE' | 'INACTIVE')}
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
            <span className="muted">
              {shown.length} district{shown.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Code</th>
                  <th>State</th>
                  <th>Status</th>
                  <th>Used</th>
                  <th>Talukas</th>
                  {canEdit ? <th>Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 8 : 7} className="center muted" style={{ padding: 28 }}>
                      {needle || status ? 'No districts match.' : 'No districts yet.'}
                    </td>
                  </tr>
                ) : (
                  shown.map((d, i) => (
                    <tr key={d.id}>
                      <td>{i + 1}</td>
                      <td>
                        <b>{d.name}</b>
                      </td>
                      <td className="mono nowrap">{d.code || '—'}</td>
                      <td>{d.state || '—'}</td>
                      <td>
                        <StatusSwitch name={d.name} on={d.is_active} canEdit={canEdit} onChange={(on) => setActive(d, on)} />
                      </td>
                      <td>
                        <InUse value={d.in_use} />
                      </td>
                      <td>{d.talukas ?? '—'}</td>
                      {canEdit ? (
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn ghost sm"
                              aria-label={`Edit ${d.name}`}
                              onClick={() => {
                                setDone('');
                                setEditing(d);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn danger sm"
                              aria-label={`Delete ${d.name}`}
                              onClick={() => {
                                setDone('');
                                setDeleting(d);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      {editing && canEdit ? <DistrictDialog row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={changed} /> : null}
      {deleting && canEdit ? (
        <ConfirmDelete
          name={deleting.name}
          note="It is no longer offered. A district that is in use cannot be deleted; switch it off instead."
          remove={async () => {
            await api(`/manage/districts/${encodeURIComponent(deleting.id)}`, { method: 'DELETE', realm: 'manage' });
            changed(`District ${deleting.name} deleted.`);
          }}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </MastersShell>
  );
}
