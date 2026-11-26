import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../../../api';
import { Modal, Notice } from '../../../components/ui';

/* What to say about a failed request. */
export const messageOf = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/* An order typed in a form: '' = left to the API; NaN-safe ("" or a whole number ≥ 0). */
export const orderIssue = (v: string) => (v.trim() && !/^\d{1,5}$/.test(v.trim()) ? 'Order must be a whole number' : '');

/* On a master's page, for a view-only account. */
export function ViewOnlyNotice() {
  return <Notice tone="info">View only: your account can see the masters but not change them.</Notice>;
}

/* Active / Inactive as a switch; a view-only account (or a row that cannot be switched, `why`) sees the state. */
export function StatusSwitch({ name, on, canEdit, onChange }: { name: string; on: boolean; canEdit: boolean; onChange: (on: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  if (!canEdit) return <span className={`badge ${on ? 'active' : 'inactive'}`}>{on ? 'Active' : 'Inactive'}</span>;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${name}: active`}
      className={on ? 'switch on' : 'switch'}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void onChange(!on).finally(() => setBusy(false));
      }}
    >
      <span className="switch-track" aria-hidden="true" />
      {on ? 'Active' : 'Inactive'}
    </button>
  );
}

/* Active / Inactive, as read. */
export function StatusBadge({ on }: { on: boolean }) {
  return <span className={`badge ${on ? 'active' : 'inactive'}`}>{on ? 'Active' : 'Inactive'}</span>;
}

/*
 * The actions of a row: View for everyone; Edit, Activate / Deactivate and Delete for an ADMIN. An action left out is not
 * offered (a row that cannot be deleted has no Delete); `children` are a row's own ones (Choices, Restore …).
 */
export function RowActions({
  name,
  canEdit,
  active,
  onView,
  onEdit,
  onStatus,
  onDelete,
  children,
}: {
  name: string;
  canEdit: boolean;
  active?: boolean;
  onView?: () => void;
  onEdit?: () => void;
  /* Switches the row on or off. */
  onStatus?: (on: boolean) => Promise<void>;
  onDelete?: () => void;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const verb = active ? 'Deactivate' : 'Activate';
  return (
    <div className="row-actions">
      {onView ? (
        <button type="button" className="btn ghost sm" aria-label={`View ${name}`} onClick={onView}>
          View
        </button>
      ) : null}
      {canEdit && onEdit ? (
        <button type="button" className="btn ghost sm" aria-label={`Edit ${name}`} onClick={onEdit}>
          Edit
        </button>
      ) : null}
      {canEdit && onStatus && active !== undefined ? (
        <button
          type="button"
          className={active ? 'btn ghost sm' : 'btn sm'}
          aria-label={`${verb} ${name}`}
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onStatus(!active).finally(() => setBusy(false));
          }}
        >
          {verb}
        </button>
      ) : null}
      {children}
      {canEdit && onDelete ? (
        <button type="button" className="btn danger sm" aria-label={`Delete ${name}`} onClick={onDelete}>
          Delete
        </button>
      ) : null}
    </div>
  );
}

/* A row's details, read only (View). A value left empty shows "—". */
export function DetailsDialog({ title, rows, onClose }: { title: string; rows: readonly (readonly [label: string, value: ReactNode])[]; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <dl className="details">
        {rows.map(([label, value]) => (
          <div key={label} className="details-row">
            <dt>{label}</dt>
            <dd>{value === null || value === undefined || value === '' ? '—' : value}</dd>
          </div>
        ))}
      </dl>
      <div className="actions">
        <button type="button" className="btn ghost" onClick={onClose} data-autofocus>
          Close
        </button>
      </div>
    </Modal>
  );
}

/* A date and time as people read it (dd/mm/yyyy, hh:mm); '' = none. */
export const whenText = (v: string | null | undefined) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}, ${two(d.getHours())}:${two(d.getMinutes())}`;
};

/* Used on forms already sent: shown beside a row, so nobody deletes it unaware. */
export function InUse({ value }: { value: boolean | number }) {
  if (!value) return <span className="muted">—</span>;
  return <span className="badge">{typeof value === 'number' ? `Used on ${value} form${value === 1 ? '' : 's'}` : 'In use'}</span>;
}

/* A dialog with a form: checked here first; what the API refuses is shown at its field, or on top. */
export function FormDialog({
  title,
  submit,
  check,
  save,
  onClose,
  children,
}: {
  title: string;
  /* The button, e.g. "Save". */
  submit: string;
  check: () => Record<string, string>;
  /* Saves; on success the dialog is closed by its owner. */
  save: () => Promise<void>;
  onClose: () => void;
  children: (errors: Record<string, string>) => ReactNode;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  /* In a long dialog: what is wrong is brought into view. */
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (failure || Object.values(errors).some(Boolean)) box.current?.querySelector('.notice.error, .err')?.scrollIntoView?.({ block: 'nearest' });
  }, [errors, failure]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const local = Object.fromEntries(Object.entries(check()).filter(([, v]) => v));
    setErrors(local);
    setFailure('');
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      await save();
    } catch (err) {
      const fields = err instanceof ApiError ? err.fields() : {};
      setErrors(fields);
      setFailure(
        err instanceof ApiError && err.status === 422 && Object.keys(fields).length
          ? `Please correct: ${Object.values(fields).join(' ')}`
          : messageOf(err, 'Could not save'),
      );
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={() => !busy && onClose()}>
      <div ref={box}>
        {failure ? <Notice tone="error">{failure}</Notice> : null}
        <form onSubmit={(e) => void onSubmit(e)} noValidate>
          {children(errors)}
          <div className="actions">
            <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={busy}>
              {busy ? 'Saving…' : submit}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

/* "Delete …?" — deletes on Yes; what the API refuses is shown in the dialog. */
export function ConfirmDelete({
  name,
  note,
  remove,
  onClose,
}: {
  name: string;
  note: string;
  /* Deletes; on success the dialog is closed by its owner. */
  remove: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await remove();
    } catch (e) {
      setError(messageOf(e, 'Could not delete'));
      setBusy(false);
    }
  };
  return (
    <Modal alert title={`Delete ${name}?`} onClose={() => !busy && onClose()}>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <p>{note}</p>
      <div className="actions">
        <button className="btn ghost" onClick={onClose} disabled={busy} data-autofocus>
          Cancel
        </button>
        <button className="btn danger" onClick={() => void confirm()} disabled={busy}>
          {busy ? 'Deleting…' : 'Yes, delete'}
        </button>
      </div>
    </Modal>
  );
}
