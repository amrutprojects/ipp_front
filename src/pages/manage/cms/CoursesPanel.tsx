import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../api';
import { Field, Notice } from '../../../components/ui';
import { ConfirmDelete, DetailsDialog, FormDialog, messageOf, orderIssue, RowActions, StatusBadge } from '../masters/shared';
import { courseName, type CmsCourse } from './cmsTypes';
import { CmsIcon, ICON_CHOICES } from './icons';

/* The tags typed as "Python, Data Science": trimmed, blanks and repeats dropped. */
const tagsOf = (typed: string) => {
  const seen = new Set<string>();
  return typed
    .split(',')
    .map((t) => t.trim().replace(/\s+/g, ' '))
    .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
};

/* Add or edit a course card of the landing page. */
function CourseDialog({ row, onClose, onSaved }: { row: CmsCourse | null; onClose: () => void; onSaved: (message: string) => void }) {
  const [title, setTitle] = useState(row?.title ?? '');
  const [shortTitle, setShortTitle] = useState(row?.short_title ?? '');
  const [description, setDescription] = useState(row?.description ?? '');
  const [icon, setIcon] = useState(row?.icon ?? 'code');
  const [tags, setTags] = useState((row?.tags ?? []).join(', '));
  const [order, setOrder] = useState(row ? String(row.display_order) : '');
  const [open, setOpen] = useState(row?.registration_open ?? true);
  const [active, setActive] = useState(row?.is_active ?? true);

  const save = async () => {
    const typed = {
      title: title.trim(),
      short_title: shortTitle.trim(),
      description: description.trim(),
      icon,
      tags: tagsOf(tags),
      registration_open: open,
      is_active: active,
      ...(order.trim() ? { display_order: Number(order.trim()) } : {}),
    };
    if (!row) {
      await api('/manage/cms/courses', { method: 'POST', realm: 'manage', body: typed });
      onSaved(`Course ${typed.title} added.`);
      return;
    }
    /* Only what changed. */
    const before: Record<string, unknown> = { ...row, short_title: row.short_title ?? '' };
    const body = Object.fromEntries(
      Object.entries(typed).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(before[k])),
    );
    if (Object.keys(body).length)
      await api(`/manage/cms/courses/${encodeURIComponent(row.id)}`, { method: 'PATCH', realm: 'manage', body });
    onSaved(`Course ${typed.title} saved.`);
  };

  return (
    <FormDialog
      title={row ? `Edit ${row.title}` : 'Add a course'}
      submit={row ? 'Save' : 'Add'}
      check={() => ({
        title: !title.trim() ? 'Title is required' : '',
        display_order: orderIssue(order),
        tags: tagsOf(tags).length > 10 ? 'At most 10 tags' : tagsOf(tags).some((t) => t.length > 40) ? 'A tag has at most 40 characters' : '',
      })}
      save={save}
      onClose={onClose}
    >
      {(errors) => (
        <div className="grid">
          <Field id="course-title" label="Title" error={errors.title} wide>
            <input id="course-title" className="inp" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} data-autofocus />
          </Field>
          <Field
            id="course-short"
            label="Short name"
            error={errors.short_title}
            required={false}
            hint="In lists (hero card, footer, FAQ). Blank = the title."
          >
            <input id="course-short" className="inp" maxLength={120} value={shortTitle} onChange={(e) => setShortTitle(e.target.value)} />
          </Field>
          <Field id="course-icon" label="Icon" error={errors.icon} required={false}>
            <span className="cms-icon-pick">
              <span className="cms-icon-preview">
                <CmsIcon name={icon} />
              </span>
              <select id="course-icon" className="inp" value={icon} onChange={(e) => setIcon(e.target.value)}>
                {ICON_CHOICES.map(([name, label]) => (
                  <option key={name} value={name}>
                    {label}
                  </option>
                ))}
              </select>
            </span>
          </Field>
          <Field id="course-description" label="Description" error={errors.description} required={false} wide>
            <textarea
              id="course-description"
              className="inp"
              rows={3}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field id="course-tags" label="Technologies (chips)" error={errors.tags} required={false} hint="Separated by commas, e.g. Python, Data Science" wide>
            <input id="course-tags" className="inp" value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
          <Field id="course-order" label="Order" error={errors.display_order} required={false} hint="Smaller first. Blank = after the others.">
            <input id="course-order" className="inp" inputMode="numeric" maxLength={5} value={order} onChange={(e) => setOrder(e.target.value)} />
          </Field>
          <div className="field cms-checks">
            <label className="check">
              <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
              <span>Registration open (the card's button opens the registration page)</span>
            </label>
            <label className="check">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              <span>Active (shown on the landing page)</span>
            </label>
          </div>
        </div>
      )}
    </FormDialog>
  );
}

/* Manage → CMS → Courses: the course cards, with View / Edit / Active-Inactive / Delete like the masters. */
export default function CoursesPanel({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<CmsCourse[] | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [editing, setEditing] = useState<CmsCourse | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CmsCourse | null>(null);
  const [viewing, setViewing] = useState<CmsCourse | null>(null);

  const load = useCallback(async () => {
    try {
      setRows((await api<CmsCourse[]>('/manage/cms/courses', { realm: 'manage' })).data);
      setError('');
    } catch (e) {
      setError(messageOf(e, 'Could not load the courses'));
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
  const patch = async (c: CmsCourse, body: Partial<CmsCourse>, message: string) => {
    setDone('');
    setError('');
    try {
      const res = await api<CmsCourse>(`/manage/cms/courses/${encodeURIComponent(c.id)}`, { method: 'PATCH', realm: 'manage', body });
      setRows((list) => list?.map((x) => (x.id === c.id ? res.data : x)) ?? null);
      setDone(message);
    } catch (e) {
      setError(messageOf(e, 'Could not save'));
    }
  };

  return (
    <section className="card" aria-labelledby="cms-courses-title">
      <div className="row" style={{ marginBottom: 8 }}>
        <h2 id="cms-courses-title" style={{ margin: 0 }}>
          Course cards
        </h2>
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
            + Add course
          </button>
        ) : null}
      </div>
      <p className="sub">Saved at once. Inactive courses are not shown anywhere on the landing page (cards, hero, footer, FAQ).</p>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {done ? <Notice tone="ok">{done}</Notice> : null}
      {!rows && !error ? <div className="loading">Loading…</div> : null}
      {rows ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Icon</th>
                <th>Course</th>
                <th>Technologies</th>
                <th>Registration</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="center muted" style={{ padding: 28 }}>
                    No courses yet.
                  </td>
                </tr>
              ) : (
                rows.map((c, i) => (
                  <tr key={c.id}>
                    <td>{i + 1}</td>
                    <td>
                      <span className="cms-icon-preview">
                        <CmsIcon name={c.icon} />
                      </span>
                    </td>
                    <td>
                      <b>{c.title}</b>
                      {c.short_title ? <div className="muted">{c.short_title}</div> : null}
                    </td>
                    <td className="cms-tags">{c.tags.join(', ') || '—'}</td>
                    <td>
                      <span className={`badge ${c.registration_open ? 'active' : 'inactive'}`}>{c.registration_open ? 'Open' : 'Closed'}</span>
                    </td>
                    <td>
                      <StatusBadge on={c.is_active} />
                    </td>
                    <td>
                      <RowActions
                        name={c.title}
                        canEdit={canEdit}
                        active={c.is_active}
                        onView={() => setViewing(c)}
                        onEdit={() => {
                          setDone('');
                          setEditing(c);
                        }}
                        onStatus={(on) => patch(c, { is_active: on }, `Course ${c.title} set to ${on ? 'Active' : 'Inactive'}.`)}
                        onDelete={() => {
                          setDone('');
                          setDeleting(c);
                        }}
                      >
                        {canEdit ? (
                          <button
                            type="button"
                            className="btn ghost sm"
                            aria-label={`${c.registration_open ? 'Close' : 'Open'} registration for ${c.title}`}
                            onClick={() =>
                              void patch(
                                c,
                                { registration_open: !c.registration_open },
                                `Registration for ${c.title} ${c.registration_open ? 'closed' : 'opened'}.`,
                              )
                            }
                          >
                            {c.registration_open ? 'Close registration' : 'Open registration'}
                          </button>
                        ) : null}
                      </RowActions>
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
          title={viewing.title}
          rows={[
            ['Title', viewing.title],
            ['Short name', viewing.short_title],
            ['Shown in lists as', courseName(viewing)],
            ['Description', viewing.description],
            ['Icon', <CmsIcon key="icon" name={viewing.icon} />],
            ['Technologies', viewing.tags.join(', ')],
            ['Registration', viewing.registration_open ? 'Open' : 'Closed'],
            ['Order', viewing.display_order],
            ['Status', viewing.is_active ? 'Active' : 'Inactive'],
          ]}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {editing && canEdit ? <CourseDialog row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={changed} /> : null}
      {deleting && canEdit ? (
        <ConfirmDelete
          name={deleting.title}
          note="It disappears from the landing page. To show it again later, set it to Inactive instead."
          remove={async () => {
            await api(`/manage/cms/courses/${encodeURIComponent(deleting.id)}`, { method: 'DELETE', realm: 'manage' });
            changed(`Course ${deleting.title} deleted.`);
          }}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </section>
  );
}
