import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../../api';
import { Field } from '../../../components/ui';
import type { CustomCheck, FieldType, FieldValidation, RuleType } from '../../../types';
import { limitOf, OWN_TEXTAREA_MAX } from '../../../validation';
import {
  CHECK_LABEL,
  checksOf,
  CUSTOM_MAX,
  draftIssues,
  fitting,
  KIND_LABEL,
  LIMITS,
  newCheck,
  payloadOf,
  serverIssues,
  toDraft,
  type CheckDraft,
  type ValidationDraft,
} from './fieldChecks';
import { messageOf } from './shared';

/*
 * A field's validation while its dialog is open. `type` = the type chosen now: what does not fit it is dropped. The
 * errors are kept by box (fieldChecks.ts), so they stay with it.
 */
export function useValidation(initial: FieldValidation | null | undefined, type: FieldType) {
  const [draft, setDraft] = useState<ValidationDraft>(() => toDraft(initial, type));
  /* As it was opened. */
  const [before] = useState(() => JSON.stringify(payloadOf(draft, type)));
  const [issues, setIssues] = useState<Record<string, string>>({});
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    setDraft((d) => fitting(d, type));
    setIssues({});
  }, [type]);

  const change = (patch: (d: ValidationDraft) => ValidationDraft, ...boxes: string[]) => {
    setDraft(patch);
    setIssues((e) => (boxes.some((k) => e[k]) ? { ...e, ...Object.fromEntries(boxes.map((k) => [k, ''])) } : e));
  };
  /* Checked here first. */
  const check = (): Record<string, string> => {
    const limits = (LIMITS[type] ?? []).map(([t]) => t).filter((t) => box.current?.querySelector<HTMLInputElement>(`#val-${t}`)?.validity?.badInput);
    const found = draftIssues(draft, type, limits);
    setIssues(found);
    return found;
  };
  /* What the API refuses is shown at its box (and by the dialog, on top). */
  const sending = async <T,>(send: (validation: FieldValidation | null) => Promise<T>): Promise<T> => {
    try {
      return await send(payloadOf(draft, type));
    } catch (e) {
      if (e instanceof ApiError) setIssues(serverIssues(e.fields(), draft, type));
      throw e;
    }
  };
  /* Also when something was dropped with another type. */
  const changed = JSON.stringify(payloadOf(draft, type)) !== before;
  return { draft, issues, box, change, check, sending, changed };
}
type Validation = ReturnType<typeof useValidation>;

/* What the type itself already checks. */
const TYPE_NOTE: Partial<Record<FieldType, string>> = {
  EMAIL: 'The answer must be an email address.',
  MOBILE: 'The answer must be a 10-digit Indian mobile number.',
  URL: 'The answer must be a web address starting with http:// or https://.',
  DROPDOWN: 'The choices are the validation: only one of them is accepted.',
  RADIO: 'The choices are the validation: only one of them is accepted.',
  CHECKBOXES: 'Only the choices are accepted.',
  YES_NO: 'Only Yes or No is accepted.',
  CONSENT: 'When it is required, the box must be ticked.',
};

/* Another field of the form, to name in a check ("different from"). */
export interface OtherField {
  key: string;
  label: string;
}

function Limits({ v, type, fields }: { v: Validation; type: FieldType; fields: readonly OtherField[] }) {
  const limits = LIMITS[type];
  if (!limits) return null;
  return (
    <fieldset className="field radios">
      <legend className="label">Limits</legend>
      <div className="grid">
        {limits.map(([t, label]) => {
          const kind = limitOf(t);
          const set = (text: string) => v.change((d) => ({ ...d, limits: { ...d.limits, [t]: text } }), `rule.${t}`, `rule.${t.replace(/^min/, 'max')}`);
          if (kind === 'field') {
            const chosen = v.draft.limits[t] ?? '';
            return (
              <Field key={t} id={`val-${t}`} label={label} required={false} error={v.issues[`rule.${t}`]}>
                <select
                  id={`val-${t}`}
                  className="inp"
                  value={chosen}
                  onChange={(e) => set(e.target.value)}
                  aria-invalid={!!v.issues[`rule.${t}`] || undefined}
                >
                  <option value="">No other field</option>
                  {chosen && !fields.some((f) => f.key === chosen) ? <option value={chosen}>{chosen} (not in the form)</option> : null}
                  {fields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </Field>
            );
          }
          return (
            <Field key={t} id={`val-${t}`} label={label} required={false} error={v.issues[`rule.${t}`]}>
              <input
                id={`val-${t}`}
                className="inp"
                type={kind === 'date' || kind === 'time' ? kind : 'text'}
                inputMode={kind === 'number' ? (t.endsWith('_value') && type === 'NUMBER' ? 'text' : 'numeric') : undefined}
                autoComplete="off"
                value={v.draft.limits[t] ?? ''}
                onChange={(e) => {
                  const text = e.target.value;
                  v.change((d) => ({ ...d, limits: { ...d.limits, [t]: text } }), `rule.${t}`, `rule.${t.replace(/^min/, 'max')}`);
                }}
                aria-invalid={!!v.issues[`rule.${t}`] || undefined}
              />
            </Field>
          );
        })}
      </div>
      <span className="hint">Left empty: no limit. A field of the program starts with the checks it always had: change or clear them here.</span>
    </fieldset>
  );
}

function Checks({ v, type }: { v: Validation; type: FieldType }) {
  const checks = checksOf(type);
  if (!checks.length) return null;
  const toggle = (t: RuleType, on: boolean) =>
    v.change((d) => ({ ...d, ticked: on ? [...d.ticked, t] : d.ticked.filter((x) => x !== t) }), `rule.${t}`);
  return (
    <fieldset className="field radios">
      <legend className="label">Checks</legend>
      <div className="val-checks">
        {checks.map((t) => (
          <div key={t}>
            <label className="check-row">
              <input
                type="checkbox"
                checked={v.draft.ticked.includes(t)}
                onChange={(e) => toggle(t, e.target.checked)}
                aria-describedby={v.issues[`rule.${t}`] ? `val-${t}-err` : undefined}
              />
              {CHECK_LABEL[t]}
            </label>
            {v.issues[`rule.${t}`] ? (
              <span className="err" role="alert" id={`val-${t}-err`}>
                {' '}
                {v.issues[`rule.${t}`]}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </fieldset>
  );
}

/* One custom check: a regular expression or a JavaScript function, with its own error message. */
function CustomRow({ v, c, n, fresh, onRemove }: { v: Validation; c: CheckDraft; n: number; fresh: boolean; onRemove: () => void }) {
  const name = `Check ${n}: ${KIND_LABEL[c.kind]}`;
  const id = `val-check-${c.id}`;
  const issue = (part: string) => v.issues[`check.${c.id}.${part}`];
  const set = (part: 'source' | 'flags' | 'message_en' | 'message_mr', value: string) =>
    v.change((d) => ({ ...d, custom: d.custom.map((x) => (x.id === c.id ? { ...x, [part]: value } : x)) }), `check.${c.id}.${part}`, ...(part === 'flags' ? [`check.${c.id}.source`] : []));
  const flag = (letter: string, on: boolean) => set('flags', [...'imsu'].filter((l) => (l === letter ? on : c.flags.includes(l))).join(''));
  const js = c.kind === 'JS';
  return (
    <div className="val-check" role="group" aria-label={name}>
      <div className="row">
        <b>{name}</b>
        <span className="spacer" />
        <button type="button" className="btn ghost sm" aria-label={`Remove check ${n}`} onClick={onRemove}>
          Remove
        </button>
      </div>
      <Field
        id={`${id}-source`}
        label={js ? 'Function' : 'Expression'}
        error={issue('source')}
        hint={js ? 'It runs on the server in a safe box: no internet, no files, 0.05 seconds.' : 'The whole answer must match.'}
      >
        <textarea
          id={`${id}-source`}
          className={js ? 'inp mono val-source' : 'inp mono val-source one'}
          rows={js ? 8 : 1}
          wrap="off"
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          /* Just added: typing can start at once. */
          autoFocus={fresh}
          value={c.source}
          onChange={(e) => set('source', js ? e.target.value : e.target.value.replace(/[\r\n]+/g, ''))}
          aria-invalid={!!issue('source') || undefined}
        />
      </Field>
      {js ? null : (
        <div className="field" role="group" aria-label={`Options of check ${n}`} aria-describedby={issue('flags') ? `${id}-flags-err` : undefined}>
          <div className="radio-row">
            <label className="check-row">
              <input type="checkbox" checked={c.flags.includes('i')} onChange={(e) => flag('i', e.target.checked)} />
              Ignore capital / small letters
            </label>
            <label className="check-row">
              <input type="checkbox" checked={c.flags.includes('u')} onChange={(e) => flag('u', e.target.checked)} />
              Unicode
            </label>
          </div>
          {issue('flags') ? (
            <span className="err" role="alert" id={`${id}-flags-err`}>
              {issue('flags')}
            </span>
          ) : null}
        </div>
      )}
      <Field id={`${id}-en`} label="Error message (English)" error={issue('message_en')}>
        <input
          id={`${id}-en`}
          className="inp"
          value={c.message_en}
          onChange={(e) => set('message_en', e.target.value)}
          aria-invalid={!!issue('message_en') || undefined}
        />
      </Field>
      <Field
        id={`${id}-mr`}
        label="Error message (Marathi)"
        required={false}
        error={issue('message_mr')}
        hint="Left blank: the English message is shown in Marathi too."
      >
        <input
          id={`${id}-mr`}
          className="inp"
          lang="mr"
          value={c.message_mr}
          onChange={(e) => set('message_mr', e.target.value)}
          aria-invalid={!!issue('message_mr') || undefined}
        />
      </Field>
    </div>
  );
}

function CustomChecks({ v }: { v: Validation }) {
  const [fresh, setFresh] = useState(0);
  const add = useRef<HTMLButtonElement>(null);
  const full = v.draft.custom.length >= CUSTOM_MAX;
  const addCheck = (kind: CustomCheck['kind']) => {
    const c = newCheck(kind);
    setFresh(c.id);
    v.change((d) => ({ ...d, custom: [...d.custom, c] }), 'custom');
  };
  return (
    <fieldset className="field radios">
      <legend className="label">Custom validation</legend>
      {v.draft.custom.map((c, i) => (
        <CustomRow
          key={c.id}
          v={v}
          c={c}
          n={i + 1}
          fresh={c.id === fresh}
          onRemove={() => {
            v.change((d) => ({ ...d, custom: d.custom.filter((x) => x.id !== c.id) }), 'custom');
            /* The button that had the focus is gone. */
            requestAnimationFrame(() => add.current?.focus());
          }}
        />
      ))}
      <div className="row">
        <button type="button" ref={add} className="btn ghost sm" onClick={() => addCheck('REGEX')} disabled={full}>
          + Add regular expression
        </button>
        <button type="button" className="btn ghost sm" onClick={() => addCheck('JS')} disabled={full}>
          + Add JavaScript function
        </button>
        <span className="hint">Up to {CUSTOM_MAX}.</span>
      </div>
      {v.issues.custom ? (
        <span className="err" role="alert">
          {v.issues.custom}
        </span>
      ) : null}
    </fieldset>
  );
}

const TRY_INPUT: Partial<Record<FieldType, string>> = { DATE: 'date', TIME: 'time', MONTH: 'month' };
const TRY_HINT: Partial<Record<FieldType, string>> = {
  DROPDOWN: 'The value of a choice.',
  RADIO: 'The value of a choice.',
  CHECKBOXES: 'The values of the choices, e.g. ["Morning","Evening"].',
  YES_NO: 'Yes or No.',
  CONSENT: 'Yes, or empty for not ticked.',
};

/* Tries an answer on the server, with the validation as it is in the dialog (nothing is saved). */
function TryIt({ v, type, label }: { v: Validation; type: FieldType; label: string }) {
  const [value, setValue] = useState('');
  const [result, setResult] = useState<{ valid: boolean; messages: string[] } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /* Something changed since: the answer says nothing any more. */
  useEffect(() => {
    setResult(null);
    setError('');
  }, [v.draft, type, label, value]);

  const test = async () => {
    if (busy) return;
    setResult(null);
    setError('');
    if (Object.values(v.check()).some(Boolean)) return setError('Please correct the validation first.');
    setBusy(true);
    try {
      const res = await v.sending((validation) =>
        api<{ valid: boolean; messages: string[] }>('/manage/fields/test-validation', {
          method: 'POST',
          realm: 'manage',
          body: { label_en: label.trim() || 'The answer', type, validation: validation ?? { rules: [], custom: [] }, value },
        }),
      );
      setResult(res.data);
    } catch (e) {
      const fields = e instanceof ApiError ? e.fields() : {};
      const other = Object.entries(fields).find(([k]) => !k.startsWith('validation'))?.[1];
      setError(other ?? (Object.keys(fields).length ? 'Please correct the validation first.' : messageOf(e, 'Could not try it')));
    } finally {
      setBusy(false);
    }
  };

  const props = { id: 'val-try', className: 'inp', value, placeholder: 'An answer to try' };
  return (
    <fieldset className="field radios">
      <legend className="label">Try it</legend>
      <div className="val-try">
        <Field id="val-try" label="Answer" required={false} hint={TRY_HINT[type]}>
          {type === 'TEXTAREA' ? (
            <textarea {...props} maxLength={OWN_TEXTAREA_MAX} onChange={(e) => setValue(e.target.value)} />
          ) : (
            <input
              {...props}
              key={TRY_INPUT[type] ?? 'text'}
              type={TRY_INPUT[type] ?? 'text'}
              autoComplete="off"
              onChange={(e) => setValue(e.target.value)}
              /* Enter tries the answer instead of saving the field. */
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                void test();
              }}
            />
          )}
        </Field>
        <button type="button" className="btn ghost" onClick={() => void test()} disabled={busy}>
          {busy ? 'Testing…' : 'Test'}
        </button>
      </div>
      <div role="status" aria-live="polite">
        {result?.valid ? <span className="badge active">Accepted</span> : null}
        {result && !result.valid
          ? (result.messages.length ? result.messages : ['Not accepted']).map((m) => (
              <div key={m} className="err">
                {m}
              </div>
            ))
          : null}
        {error ? <div className="err">{error}</div> : null}
      </div>
    </fieldset>
  );
}

/* The validation of a field: limits, ready-made checks, custom checks, and a place to try an answer. */
export default function ValidationSection({
  v,
  type,
  label,
  fields = [],
}: {
  v: Validation;
  type: FieldType;
  label: string;
  /* The other fields of the form ("different from"). */
  fields?: readonly OtherField[];
}) {
  return (
    <section className="val" aria-labelledby="val-title" ref={v.box}>
      <h4 id="val-title">Validation</h4>
      {TYPE_NOTE[type] ? <p className="hint">{TYPE_NOTE[type]} Custom checks can be added.</p> : null}
      <Limits v={v} type={type} fields={fields} />
      <Checks v={v} type={type} />
      {v.issues.rules ? (
        <span className="err" role="alert">
          {v.issues.rules}
        </span>
      ) : null}
      <CustomChecks v={v} />
      <TryIt v={v} type={type} label={label} />
    </section>
  );
}
