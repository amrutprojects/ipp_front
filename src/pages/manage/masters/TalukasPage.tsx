import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type PageMeta } from '../../../api';
import { Field, Notice, useRemoteList, type RemoteList } from '../../../components/ui';
import { useCanEdit } from '../../../session';
import type { MasterDistrict, MasterTaluka } from '../../../types';
import { MastersShell } from '../ManageLayout';
import { ConfirmDelete, DetailsDialog, FormDialog, InUse, messageOf, RowActions, StatusBadge, ViewOnlyNotice } from './shared';

const LIMIT = 25;

/* Add or edit a taluka: its district (fixed while the taluka is in use), name and code. */
function TalukaDialog({
  row,
  districts,
  district,
  onClose,
  onSaved,
}: {
  /* null = add. */
  row: MasterTaluka | null;
  districts: RemoteList<MasterDistrict>;
  /* The district the list is filtered by: a new taluka's, unless another one is chosen. */
  district: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [districtId, setDistrictId] = useState(row?.district_id ?? (districts.items.some((d) => d.id === district && d.is_active) ? district : ''));
  const [name, setName] = useState(row?.name ?? '');
  const [code, setCode] = useState(row?.code ?? '');
  /* Active districts; the taluka's own one stays selectable when it is inactive. */
  const items = districts.items.filter((d) => d.is_active).map((d) => ({ id: d.id, name: d.name }));
  if (row && !items.some((d) => d.id === row.district_id))
    items.push({ id: row.district_id, name: districts.status === 'ok' ? `${row.district} (inactive)` : row.district });

  const save = async () => {
    const typed = { name: name.trim(), code: code.trim().toUpperCase() };
    if (!row) {
      await api('/manage/talukas', { method: 'POST', realm: 'manage', body: { district_id: districtId, name: typed.name, code: typed.code || undefined } });
      onSaved(`Taluka ${typed.name} added.`);
      return;
    }
    /* Only what changed. */
    const body: Record<string, unknown> = {};
    if (districtId !== row.district_id) body.district_id = districtId;
    if (typed.name !== row.name) body.name = typed.name;
    if (typed.code !== (row.code ?? '')) body.code = typed.code || null;
    if (Object.keys(body).length) await api(`/manage/talukas/${encodeURIComponent(row.id)}`, { method: 'PATCH', realm: 'manage', body });
    onSaved(`Taluka ${typed.name} saved.`);
  };
  return (
    <FormDialog
      title={row ? `Edit ${row.name}` : 'Add a taluka'}
      submit={row ? 'Save' : 'Add'}
      check={() => ({
        district_id: !districtId ? 'District is required' : '',
        name: !name.trim() ? 'Name is required' : name.trim().length < 2 || name.trim().length > 100 ? 'Name must be 2–100 characters' : '',
        code:
          code.trim() && !/^[A-Z][A-Z0-9-]{1,19}$/.test(code.trim().toUpperCase()) ? 'Code: 2–20 characters, A–Z, 0–9 and hyphen, starting with a letter' : '',
      })}
      save={save}
      onClose={onClose}
    >
      {(errors) => (
        <div className="grid one">
          <Field
            id="tal-district"
            label="District"
            error={errors.district_id ?? errors.districtId}
            hint={
              districts.status === 'error'
                ? 'Could not load the districts.'
                : row?.in_use
                  ? 'A taluka that is in use cannot be moved to another district.'
                  : undefined
            }
          >
            <select
              id="tal-district"
              className="inp"
              value={districtId}
              onChange={(e) => setDistrictId(e.target.value)}
              disabled={!!row?.in_use || districts.status === 'loading'}
              data-autofocus={districtId ? undefined : true}
            >
              {row ? null : <option value="">{districts.status === 'loading' ? 'Loading districts…' : 'Select district'}</option>}
              {items.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="tal-name" label="Name" error={errors.name}>
            <input
              id="tal-name"
              className="inp"
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-autofocus={districtId ? true : undefined}
            />
          </Field>
          <Field id="tal-code" label="Code" required={false} error={errors.code} hint="A–Z, 0–9 and hyphen; may be left blank.">
            <input id="tal-code" className="inp mono" maxLength={20} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </Field>
        </div>
      )}
    </FormDialog>
  );
}

/* Masters → Talukas: the talukas of the districts, which a center can be in (Center Master). */
export default function TalukasPage() {
  const canEdit = useCanEdit();
  const districts = useRemoteList<MasterDistrict>('/manage/districts', 'manage');
  const [rows, setRows] = useState<MasterTaluka[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [district, setDistrict] = useState('');
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'INACTIVE'>('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MasterTaluka | 'new' | null>(null);
  const [deleting, setDeleting] = useState<MasterTaluka | null>(null);
  const [viewing, setViewing] = useState<MasterTaluka | null>(null);

  /* Only the newest request's answer is shown. */
  const latest = useRef(0);
  const load = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    setError('');
    try {
      const res = await api<MasterTaluka[]>('/manage/talukas', {
        realm: 'manage',
        query: { page, limit: LIMIT, search: query || undefined, status: status || undefined, district_id: district || undefined },
      });
      if (id !== latest.current) return;
      if (res.meta && res.meta.totalPages > 0 && res.meta.page > res.meta.totalPages) {
        setPage(res.meta.totalPages);
        return;
      }
      setRows(res.data ?? []);
      setMeta(res.meta ?? null);
    } catch (e) {
      if (id === latest.current) setError(messageOf(e, 'Could not load the talukas'));
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [page, query, status, district]);
  useEffect(() => {
    void load();
  }, [load]);
  /* Search after typing stops. */
  useEffect(() => {
    if (search.trim() === query) return;
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search, query]);

  const changed = (message: string) => {
    setEditing(null);
    setDeleting(null);
    setDone(message);
    void load();
  };
  const setActive = async (r: MasterTaluka, on: boolean) => {
    setDone('');
    setError('');
    try {
      await api(`/manage/talukas/${encodeURIComponent(r.id)}`, { method: 'PATCH', realm: 'manage', body: { is_active: on } });
      setRows((list) => list.map((x) => (x.id === r.id ? { ...x, is_active: on } : x)));
      setDone(`Taluka ${r.name} set to ${on ? 'Active' : 'Inactive'}.`);
    } catch (e) {
      setError(messageOf(e, 'Could not save'));
    }
  };

  return (
    <MastersShell>
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Talukas</h2>
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
            + Add taluka
          </button>
        ) : null}
      </div>
      {!canEdit ? <ViewOnlyNotice /> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {done ? <Notice tone="ok">{done}</Notice> : null}
      <div className="toolbar">
        <input
          className="inp"
          type="search"
          placeholder="Search name, code or district"
          maxLength={100}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search talukas"
        />
        <select
          className="inp"
          style={{ maxWidth: 220 }}
          aria-label="Filter by district"
          value={district}
          onChange={(e) => {
            setDistrict(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All districts</option>
          {districts.items.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.is_active ? '' : ' (inactive)'}
            </option>
          ))}
        </select>
        <select
          className="inp"
          style={{ maxWidth: 180 }}
          aria-label="Filter by status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as '' | 'ACTIVE' | 'INACTIVE');
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <span className="muted">{meta ? `${meta.total} taluka${meta.total === 1 ? '' : 's'}` : ''}</span>
        {districts.status === 'error' ? <span className="err">Could not load the districts.</span> : null}
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Code</th>
              <th>District</th>
              <th>Status</th>
              <th>Used</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="center muted" style={{ padding: 28 }}>
                  {loading ? 'Loading…' : query || status || district ? 'No talukas match.' : 'No talukas yet.'}
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.id}>
                  <td>{(page - 1) * LIMIT + i + 1}</td>
                  <td>
                    <b>{r.name}</b>
                  </td>
                  <td className="mono nowrap">{r.code || '—'}</td>
                  <td>{r.district || '—'}</td>
                  <td>
                    <StatusBadge on={r.is_active} />
                  </td>
                  <td>
                    <InUse value={r.in_use} />
                  </td>
                  <td>
                    <RowActions
                      name={r.name}
                      canEdit={canEdit}
                      active={r.is_active}
                      onView={() => setViewing(r)}
                      onEdit={() => {
                        setDone('');
                        setEditing(r);
                      }}
                      onStatus={(on) => setActive(r, on)}
                      onDelete={() => {
                        setDone('');
                        setDeleting(r);
                      }}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {meta && meta.totalPages > 1 ? (
        <div className="pager">
          <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Previous
          </button>
          <span>
            Page {meta.page} of {meta.totalPages}
          </span>
          <button className="btn ghost sm" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>
            Next →
          </button>
        </div>
      ) : null}
      {viewing ? (
        <DetailsDialog
          title={viewing.name}
          rows={[
            ['Name', viewing.name],
            ['Code', viewing.code],
            ['District', viewing.district],
            ['Status', viewing.is_active ? 'Active' : 'Inactive'],
            ['Used on forms', typeof viewing.in_use === 'number' ? `${viewing.in_use} forms` : viewing.in_use ? 'Yes' : 'No'],
          ]}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {editing && canEdit ? (
        <TalukaDialog row={editing === 'new' ? null : editing} districts={districts} district={district} onClose={() => setEditing(null)} onSaved={changed} />
      ) : null}
      {deleting && canEdit ? (
        <ConfirmDelete
          name={deleting.name}
          note="It is no longer offered. A taluka that a center uses cannot be deleted; switch it off instead."
          remove={async () => {
            await api(`/manage/talukas/${encodeURIComponent(deleting.id)}`, { method: 'DELETE', realm: 'manage' });
            changed(`Taluka ${deleting.name} deleted.`);
          }}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </MastersShell>
  );
}
