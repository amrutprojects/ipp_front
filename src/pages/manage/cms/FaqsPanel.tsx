import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../api';
import { Field, Notice } from '../../../components/ui';
import { ConfirmDelete, DetailsDialog, FormDialog, messageOf, orderIssue, RowActions, StatusBadge } from '../masters/shared';
import type { AnswerKind, CmsFaq } from './cmsTypes';

const KIND_LABEL: Record<AnswerKind, string> = { TEXT: 'Written answer', COURSES: 'List of the active courses' };
const shortText = (v: string, max = 90) => (v.length > max ? `${v.slice(0, max - 1)}…` : v);

/* Add or edit a question of the landing page. */
function FaqDialog({ row, onClose, onSaved }: { row: CmsFaq | null; onClose: () => void; onSaved: (message: string) => void }) {
  const [question, setQuestion] = useState(row?.question ?? '');
  const [kind, setKind] = useState<AnswerKind>(row?.answer_kind ?? 'TEXT');
  const [answer, setAnswer] = useState(row?.answer ?? '');
  const [order, setOrder] = useState(row ? String(row.display_order) : '');
  const [active, setActive] = useState(row?.is_active ?? true);

  const save = async () => {
    const typed = {
      question: question.trim(),
      answer_kind: kind,
      answer: answer.trim(),
      is_active: active,
      ...(order.trim() ? { display_order: Number(order.trim()) } : {}),
    };
    if (!row) {
      await api('/manage/cms/faqs', { method: 'POST', realm: 'manage', body: typed });
      onSaved('Question added.');
      return;
    }
    const before: Record<string, unknown> = { ...row };
    const body = Object.fromEntries(Object.entries(typed).filter(([k, v]) => v !== before[k]));
    if (Object.keys(body).length) await api(`/manage/cms/faqs/${encodeURIComponent(row.id)}`, { method: 'PATCH', realm: 'manage', body });
    onSaved('Question saved.');
  };

  return (
    <FormDialog
      title={row ? 'Edit question' : 'Add a question'}
      submit={row ? 'Save' : 'Add'}
      check={() => ({
        question: !question.trim() ? 'Question is required' : '',
        answer: kind === 'TEXT' && !answer.trim() ? 'Answer is required' : '',
        display_order: orderIssue(order),
      })}
      save={save}
      onClose={onClose}
    >
      {(errors) => (
        <div className="grid one">
          <Field id="faq-question" label="Question" error={errors.question}>
            <input id="faq-question" className="inp" maxLength={300} value={question} onChange={(e) => setQuestion(e.target.value)} data-autofocus />
          </Field>
          <Field id="faq-kind" label="Answer" error={errors.answer_kind}>
            <select id="faq-kind" className="inp" value={kind} onChange={(e) => setKind(e.target.value as AnswerKind)}>
              <option value="TEXT">{KIND_LABEL.TEXT}</option>
              <option value="COURSES">{KIND_LABEL.COURSES}</option>
            </select>
          </Field>
          <Field
            id="faq-answer"
            label={kind === 'COURSES' ? 'Text before the list' : 'Answer text'}
            error={errors.answer}
            required={kind === 'TEXT'}
            hint={
              kind === 'COURSES'
                ? 'The page lists the short names of the active courses under this text, without counting them.'
                : 'Web addresses in the answer become links.'
            }
          >
            <textarea id="faq-answer" className="inp" rows={4} maxLength={2000} value={answer} onChange={(e) => setAnswer(e.target.value)} />
          </Field>
          <Field id="faq-order" label="Order" error={errors.display_order} required={false} hint="Smaller first. Blank = after the others.">
            <input id="faq-order" className="inp" inputMode="numeric" maxLength={5} value={order} onChange={(e) => setOrder(e.target.value)} />
          </Field>
          <label className="check">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>Active (shown on the landing page)</span>
          </label>
        </div>
      )}
    </FormDialog>
  );
}

/* Manage → CMS → FAQs: the questions, with View / Edit / Active-Inactive / Delete like the masters. */
export default function FaqsPanel({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<CmsFaq[] | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [editing, setEditing] = useState<CmsFaq | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CmsFaq | null>(null);
  const [viewing, setViewing] = useState<CmsFaq | null>(null);

  const load = useCallback(async () => {
    try {
      setRows((await api<CmsFaq[]>('/manage/cms/faqs', { realm: 'manage' })).data);
      setError('');
    } catch (e) {
      setError(messageOf(e, 'Could not load the questions'));
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
  const setActive = async (f: CmsFaq, on: boolean) => {
    setDone('');
    setError('');
    try {
      const res = await api<CmsFaq>(`/manage/cms/faqs/${encodeURIComponent(f.id)}`, { method: 'PATCH', realm: 'manage', body: { is_active: on } });
      setRows((list) => list?.map((x) => (x.id === f.id ? res.data : x)) ?? null);
      setDone(`Question set to ${on ? 'Active' : 'Inactive'}.`);
    } catch (e) {
      setError(messageOf(e, 'Could not save'));
    }
  };

  return (
    <section className="card" aria-labelledby="cms-faqs-title">
      <div className="row" style={{ marginBottom: 8 }}>
        <h2 id="cms-faqs-title" style={{ margin: 0 }}>
          Questions
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
            + Add question
          </button>
        ) : null}
      </div>
      <p className="sub">Saved at once. Inactive questions are not shown on the landing page.</p>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {done ? <Notice tone="ok">{done}</Notice> : null}
      {!rows && !error ? <div className="loading">Loading…</div> : null}
      {rows ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Question</th>
                <th>Answer</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="center muted" style={{ padding: 28 }}>
                    No questions yet.
                  </td>
                </tr>
              ) : (
                rows.map((f, i) => (
                  <tr key={f.id}>
                    <td>{i + 1}</td>
                    <td>
                      <b>{f.question}</b>
                    </td>
                    <td className="muted">
                      {f.answer_kind === 'COURSES' ? (
                        <>
                          <span className="badge">List of active courses</span> {shortText(f.answer, 60)}
                        </>
                      ) : (
                        shortText(f.answer)
                      )}
                    </td>
                    <td>
                      <StatusBadge on={f.is_active} />
                    </td>
                    <td>
                      <RowActions
                        name={f.question}
                        canEdit={canEdit}
                        active={f.is_active}
                        onView={() => setViewing(f)}
                        onEdit={() => {
                          setDone('');
                          setEditing(f);
                        }}
                        onStatus={(on) => setActive(f, on)}
                        onDelete={() => {
                          setDone('');
                          setDeleting(f);
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
          title="Question"
          rows={[
            ['Question', viewing.question],
            ['Answer', KIND_LABEL[viewing.answer_kind]],
            [viewing.answer_kind === 'COURSES' ? 'Text before the list' : 'Answer text', viewing.answer],
            ['Order', viewing.display_order],
            ['Status', viewing.is_active ? 'Active' : 'Inactive'],
          ]}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {editing && canEdit ? <FaqDialog row={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={changed} /> : null}
      {deleting && canEdit ? (
        <ConfirmDelete
          name="this question"
          note={`"${deleting.question}" disappears from the landing page. To show it again later, set it to Inactive instead.`}
          remove={async () => {
            await api(`/manage/cms/faqs/${encodeURIComponent(deleting.id)}`, { method: 'DELETE', realm: 'manage' });
            changed('Question deleted.');
          }}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </section>
  );
}
