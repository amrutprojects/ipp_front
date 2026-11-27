import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../api';
import { Field, Notice } from '../../../components/ui';
import { useCanEdit } from '../../../session';
import type { DocumentKind, MasterDocument } from '../../../types';
import { MastersShell } from '../ManageLayout';
import { ConfirmDelete, DetailsDialog, FormDialog, InUse, messageOf, orderIssue, RowActions, StatusBadge, ViewOnlyNotice } from './shared';

const KIND_LABEL: Record<DocumentKind, string> = { DOCUMENT: 'Document (PDF, JPG, PNG)', VIDEO: 'Video (MP4)' };

/* Add or edit one document of step 3. */
function DocumentDialog({ row, onClose, onSaved }: { row: MasterDocument | null; onClose: () => void; onSaved: (message: string) => void }) {
  const [nameEn, setNameEn] = useState(row?.name_en ?? '');
  const [nameMr, setNameMr] = useState(row?.name_mr ?? '');
  const [required, setRequired] = useState(row?.required ?? true);
  const [kind, setKind] = useState<DocumentKind>(row?.kind ?? 'DOCUMENT');
  const [order, setOrder] = useState(row ? String(row.order) : '');
  const save = async () => {
    if (!row) {
      await api('/manage/documents', {
        method: 'POST',
        realm: 'manage',
        body: {
          name_en: nameEn.trim(),
          name_mr: nameMr.trim() || undefined,
          required,
          kind,
          order: order.trim() ? Number(order) : undefined,
        },
      });
      onSaved(`${nameEn.trim()} added.`);
      return;
    }
    const body: Record<string, unknown> = {};
    if (nameEn.trim() !== row.name_en) body.name_en = nameEn.trim();
    if (nameMr.trim() !== (row.name_mr ?? '')) body.name_mr = nameMr.trim() || null;
    if (required !== row.required) body.required = required;
    if (order.trim() && Number(order) !== row.order) body.order = Number(order);
    if (Object.keys(body).length) await api(`/manage/documents/${encodeURIComponent(row.id)}`, { method: 'PATCH', realm: 'manage', body });
    onSaved(`${nameEn.trim()} saved.`);
  };
  return (
    <FormDialog
      title={row ? `Edit ${row.name_en}` : 'Add a document'}
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
          <Field id="d-name-en" label="Name (English)" error={errors.name_en}>
            <input id="d-name-en" className="inp" maxLength={150} value={nameEn} onChange={(e) => setNameEn(e.target.value)} data-autofocus />
          </Field>
          <Field id="d-name-mr" label="Name (Marathi)" required={false} error={errors.name_mr} hint="Left blank: the English name is shown in Marathi too.">
            <input id="d-name-mr" className="inp" maxLength={150} lang="mr" value={nameMr} onChange={(e) => setNameMr(e.target.value)} />
          </Field>
          {row ? null : (
            <Field id="d-kind" label="File" error={errors.kind}>
              <select id="d-kind" className="inp" value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
                {Object.entries(KIND_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <label className="check">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
            <span>Required: the form cannot be submitted without it</span>
          </label>
          <Field id="d-order" label="Order" required={false} error={errors.order} hint="Its place in the list; left blank: at the end.">
            <input id="d-order" className="inp" inputMode="numeric" style={{ maxWidth: 140 }} value={order} onChange={(e) => setOrder(e.target.value)} />
          </Field>
        </div>
      )}
    </FormDialog>
  );
}

/* Masters → Documents: what students upload in step 3, in order; required or optional, on or off. */
export default function DocumentsMasterPage() {
  const canEdit = useCanEdit();
  const [rows, setRows] = useState<MasterDocument[] | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [editing, setEditing] = useState<MasterDocument | 'new' | null>(null);
  const [deleting, setDeleting] = useState<MasterDocument | null>(null);
  const [viewing, setViewing] = useState<MasterDocument | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<MasterDocument[]>('/manage/documents', { realm: 'manage' });
      setRows([...res.data].sort((a, b) => a.order - b.order));
      setError('');
    } catch (e) {
      setError(messageOf(e, 'Could not load the documents'));
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
  const setActive = async (r: MasterDocument, on: boolean) => {
    setDone('');
    setError('');
    try {
      await api(`/manage/documents/${encodeURIComponent(r.id)}`, { method: 'PATCH', realm: 'manage', body: { is_active: on } });
      setRows((list) => list?.map((x) => (x.id === r.id ? { ...x, is_active: on } : x)) ?? null);
      setDone(`Document ${r.name_en} set to ${on ? 'Active' : 'Inactive'}.`);
    } catch (e) {
      setError(messageOf(e, 'Could not save'));
    }
  };

  return (
    <MastersShell>
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Documents</h2>
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
            + Add document
          </button>
        ) : null}
      </div>
      <p className="hint" style={{ marginTop: -4 }}>
        What students upload in step 3, in this order. A document that is switched off is no longer asked; files already uploaded stay.
      </p>
      {!canEdit ? <ViewOnlyNotice /> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {done ? <Notice tone="ok">{done}</Notice> : null}
      {!rows && !error ? <div className="loading">Loading…</div> : null}
      {rows ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Order</th>
                <th>Name (English)</th>
                <th>Name (Marathi)</th>
                <th>File</th>
                <th>Required</th>
                <th>Status</th>
                <th>Used</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="center muted" style={{ padding: 28 }}>
                    No documents yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.order}</td>
                    <td>
                      <b>{r.name_en}</b>
                    </td>
                    <td lang="mr">{r.name_mr || '—'}</td>
                    <td>{r.kind === 'VIDEO' ? 'Video' : 'Document'}</td>
                    <td>{r.required ? 'Required' : 'Optional'}</td>
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
      ) : null}
      {viewing ? (
        <DetailsDialog
          title={viewing.name_en}
          rows={[
            ['Code', viewing.code],
            ['Name (English)', viewing.name_en],
            ['Name (Marathi)', viewing.name_mr],
            ['File', viewing.kind === 'VIDEO' ? 'Video' : 'Document'],
            ['Required', viewing.required ? 'Required' : 'Optional'],
            ['Order', viewing.order],
            ['Status', viewing.is_active ? 'Active' : 'Inactive'],
            ['Comes with the program', viewing.is_system ? 'Yes' : 'No'],
            ['Used on forms', typeof viewing.in_use === 'number' ? `${viewing.in_use} forms` : viewing.in_use ? 'Yes' : 'No'],
          ]}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {editing && canEdit ? <DocumentDialog row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={changed} /> : null}
      {deleting && canEdit ? (
        <ConfirmDelete
          name={deleting.name_en}
          note="Are you sure you want to delete this document? It is no longer asked. Files already uploaded stay with their forms."
          remove={async () => {
            await api(`/manage/documents/${encodeURIComponent(deleting.id)}`, { method: 'DELETE', realm: 'manage' });
            changed(`${deleting.name_en} deleted.`);
          }}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </MastersShell>
  );
}
