import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type PageMeta } from '../../../api';
import { Field, Notice } from '../../../components/ui';
import { useCanEdit } from '../../../session';
import type { MasterOption } from '../../../types';
import { ConfirmDelete, DetailsDialog, FormDialog, InUse, messageOf, orderIssue, RowActions, StatusBadge } from './shared';

const LIMIT = 25;

/* Add or edit one choice: its English and Marathi names, and its place in the list. */
function OptionDialog({
  title,
  path,
  row,
  onClose,
  onSaved,
}: {
  title: string;
  path: string;
  /* null = add. */
  row: MasterOption | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [nameEn, setNameEn] = useState(row?.name_en ?? '');
  const [nameMr, setNameMr] = useState(row?.name_mr ?? '');
  const [order, setOrder] = useState(row ? String(row.order) : '');
  const save = async () => {
    if (!row) {
      await api<MasterOption>(path, {
        method: 'POST',
        realm: 'manage',
        body: { name_en: nameEn.trim(), name_mr: nameMr.trim() || undefined, order: order.trim() ? Number(order) : undefined },
      });
      onSaved(`${nameEn.trim()} added.`);
      return;
    }
    /* Only what changed. */
    const body: Record<string, unknown> = {};
    if (nameEn.trim() !== row.name_en) body.name_en = nameEn.trim();
    if (nameMr.trim() !== (row.name_mr ?? '')) body.name_mr = nameMr.trim() || null;
    if (order.trim() && Number(order) !== row.order) body.order = Number(order);
    if (Object.keys(body).length) await api<MasterOption>(`${path}/${encodeURIComponent(row.id)}`, { method: 'PATCH', realm: 'manage', body });
    onSaved(`${nameEn.trim()} saved.`);
  };
  return (
    <FormDialog
      title={title}
      submit={row ? 'Save' : 'Add'}
      check={() => ({
        name_en: !nameEn.trim() ? 'English name is required' : nameEn.trim().length > 150 ? 'English name must be at most 150 characters' : '',
        name_mr: nameMr.trim().length > 150 ? 'Marathi name must be at most 150 characters' : '',
        order: orderIssue(order),
      })}
      save={save}
      onClose={onClose}
    >
      {(errors) => (
        <div className="grid one">
          <Field id="m-name-en" label="Name (English)" error={errors.name_en}>
            <input id="m-name-en" className="inp" maxLength={150} value={nameEn} onChange={(e) => setNameEn(e.target.value)} data-autofocus />
          </Field>
          <Field id="m-name-mr" label="Name (Marathi)" required={false} error={errors.name_mr} hint="Left blank: the English name is shown in Marathi too.">
            <input id="m-name-mr" className="inp" maxLength={150} lang="mr" value={nameMr} onChange={(e) => setNameMr(e.target.value)} />
          </Field>
          <Field id="m-order" label="Order" required={false} error={errors.order} hint="Its place in the list; left blank: at the end.">
            <input id="m-order" className="inp" inputMode="numeric" style={{ maxWidth: 140 }} value={order} onChange={(e) => setOrder(e.target.value)} />
          </Field>
        </div>
      )}
    </FormDialog>
  );
}

/*
 * One dropdown list of the masters (GET /manage/masters/:kind): search, status, pages; an admin adds, renames, orders,
 * switches on and off and deletes its choices, a viewer sees them. Also the choices of an own dropdown field (FIELD:<key>).
 */
export default function MasterList({
  kind,
  title,
  canAdd = true,
  canDelete = true,
  showCode = false,
  onChanged,
}: {
  kind: string;
  title: string;
  canAdd?: boolean;
  canDelete?: boolean;
  /* The codes too (the technologies': T01, T02, …). */
  showCode?: boolean;
  onChanged?: () => void;
}) {
  const canEdit = useCanEdit();
  const path = `/manage/masters/${encodeURIComponent(kind)}`;
  const [rows, setRows] = useState<MasterOption[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'INACTIVE'>('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [loading, setLoading] = useState(true);
  /* The dialogs: a row = edit it; 'new' = add; null = closed. */
  const [editing, setEditing] = useState<MasterOption | 'new' | null>(null);
  const [deleting, setDeleting] = useState<MasterOption | null>(null);
  const [viewing, setViewing] = useState<MasterOption | null>(null);

  const latest = useRef(0);
  const load = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    setError('');
    try {
      const res = await api<MasterOption[]>(path, {
        realm: 'manage',
        query: { page, limit: LIMIT, search: query || undefined, status: status || undefined },
      });
      if (id !== latest.current) return;
      if (res.meta && res.meta.totalPages > 0 && res.meta.page > res.meta.totalPages) {
        setPage(res.meta.totalPages);
        return;
      }
      setRows(res.data ?? []);
      setMeta(res.meta ?? null);
    } catch (e) {
      if (id === latest.current) setError(messageOf(e, 'Could not load the list'));
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [path, page, query, status]);
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
    onChanged?.();
  };
  const setActive = async (r: MasterOption, on: boolean) => {
    setDone('');
    setError('');
    try {
      await api<MasterOption>(`${path}/${encodeURIComponent(r.id)}`, { method: 'PATCH', realm: 'manage', body: { is_active: on } });
      setRows((list) => list.map((x) => (x.id === r.id ? { ...x, is_active: on } : x)));
      setDone(`Choice ${r.name_en} ${on ? 'activated' : 'deactivated'}.`);
      onChanged?.();
    } catch (e) {
      setError(messageOf(e, 'Could not save'));
    }
  };

  return (
    <section aria-label={title}>
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <span className="spacer" />
        {canEdit && canAdd ? (
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              setDone('');
              setEditing('new');
            }}
          >
            + Add
          </button>
        ) : null}
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {done ? <Notice tone="ok">{done}</Notice> : null}
      <div className="toolbar">
        <input className="inp" type="search" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label={`Search ${title}`} />
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
        <span className="muted">{meta ? `${meta.total} in the list` : ''}</span>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Order</th>
              {showCode ? <th>Code</th> : null}
              <th>Name (English)</th>
              <th>Name (Marathi)</th>
              <th>Status</th>
              <th>Used</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6 + (showCode ? 1 : 0)} className="center muted" style={{ padding: 28 }}>
                  {loading ? 'Loading…' : query || status ? 'Nothing matches.' : 'Nothing in the list yet.'}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.order}</td>
                  {showCode ? <td className="mono nowrap">{r.code || '—'}</td> : null}
                  <td>
                    <b>{r.name_en}</b>
                    {r.is_system ? <div className="hint">Built in: can be renamed and switched off, not deleted.</div> : null}
                  </td>
                  <td lang="mr">{r.name_mr || '—'}</td>
                  <td>
                    <StatusBadge on={r.is_active} />
                  </td>
                  <td>
                    <InUse value={r.in_use} />
                  </td>
                  <td>
                    <RowActions
                      name={r.name_en}
                      canEdit={canEdit}
                      active={r.is_active}
                      onView={() => setViewing(r)}
                      onEdit={() => {
                        setDone('');
                        setEditing(r);
                      }}
                      onStatus={(on) => setActive(r, on)}
                      onDelete={
                        canDelete && !r.is_system
                          ? () => {
                              setDone('');
                              setDeleting(r);
                            }
                          : undefined
                      }
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
          title={viewing.name_en}
          rows={[
            ['Code', viewing.code],
            ['Name (English)', viewing.name_en],
            ['Name (Marathi)', viewing.name_mr],
            ['Order', viewing.order],
            ['Status', viewing.is_active ? 'Active' : 'Inactive'],
            ['Comes with the program', viewing.is_system ? 'Yes: can be renamed and switched off, not deleted' : 'No'],
            ['Used on forms', typeof viewing.in_use === 'number' ? `${viewing.in_use} forms` : viewing.in_use ? 'Yes' : 'No'],
          ]}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {editing && canEdit ? (
        <OptionDialog
          title={editing === 'new' ? `Add to ${title}` : `Edit ${editing.name_en}`}
          path={path}
          row={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={changed}
        />
      ) : null}
      {deleting && canEdit ? (
        <ConfirmDelete
          name={deleting.name_en}
          note="It is no longer offered to students. Forms that already use it keep showing its name."
          remove={async () => {
            await api(`${path}/${encodeURIComponent(deleting.id)}`, { method: 'DELETE', realm: 'manage' });
            changed(`${deleting.name_en} deleted.`);
          }}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </section>
  );
}
