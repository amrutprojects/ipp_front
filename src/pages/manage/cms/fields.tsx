import type { ReactNode } from 'react';
import { Field } from '../../../components/ui';
import { CTA_ACTIONS, SECTIONS, type Doc, type Json } from './cmsTypes';
import { CmsIcon, ICON_CHOICES } from './icons';

/*
 * The CMS forms are described, not hand-written: each section of the landing page is a list of these definitions
 * (sections.tsx), drawn by <Fields>. A box's path in the document (hero.primary.label, hero.stats.2.icon) is also its id
 * and the key of its error, the same key the API uses in a 422 (body.content.hero.primary.label).
 */
type Choices = readonly (readonly [value: string, label: string])[];
export type Def =
  | { kind: 'text'; key: string; label: string; max: number; hint?: string }
  | { kind: 'textarea'; key: string; label: string; max: number; hint?: string; rows?: number }
  | { kind: 'toggle'; key: string; label: string }
  | { kind: 'number'; key: string; label: string; min: number; max: number; hint?: string }
  | { kind: 'icon'; key: string; label: string }
  | { kind: 'select'; key: string; label: string; options: Choices }
  /* A button: shown or not, its text, and where it goes. */
  | { kind: 'cta'; key: string; label: string }
  /* A list of texts (paragraphs, chips). */
  | { kind: 'strings'; key: string; label: string; item: string; max: number; itemMax: number; multiline?: boolean; hint?: string }
  /* A list of items, each a small form; `title` = the key whose text names an item. */
  | { kind: 'list'; key: string; label: string; item: string; max: number; fields: Def[]; title?: string; blank: Doc; hint?: string }
  | { kind: 'group'; key: string; label: string; fields: Def[]; hint?: string }
  /* A nested part drawn without a frame of its own (a whole section of the page on its tab). */
  | { kind: 'part'; key: string; fields: Def[] };

interface Common {
  path: string;
  errors: Record<string, string>;
  readOnly: boolean;
}

const join = (path: string, key: string | number) => (path ? `${path}.${key}` : String(key));
const idOf = (path: string) => `cms-${path.replace(/[^A-Za-z0-9]+/g, '-')}`;
const str = (v: Json | undefined) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v));
const isDoc = (v: Json | undefined): v is Doc => typeof v === 'object' && v !== null && !Array.isArray(v);
/* Any error at this path or below it (a list shows that one of its items needs a look). */
const errorBelow = (errors: Record<string, string>, path: string) =>
  Object.keys(errors).some((k) => errors[k] && (k === path || k.startsWith(`${path}.`)));

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/* The boxes of one part of the document. */
export function Fields({ defs, value, onChange, path, errors, readOnly }: Common & { defs: Def[]; value: Doc; onChange: (next: Doc) => void }) {
  return (
    <div className="grid cms-grid">
      {defs.map((def) => (
        <One
          key={def.key}
          def={def}
          value={value[def.key]}
          set={(v) => onChange({ ...value, [def.key]: v })}
          path={join(path, def.key)}
          errors={errors}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}

/* Up, Down and Remove of an item of a list. */
function ItemTools({ name, index, count, onMove, onRemove }: { name: string; index: number; count: number; onMove: (to: number) => void; onRemove: () => void }) {
  return (
    <span className="cms-item-tools">
      <button type="button" className="btn ghost sm" aria-label={`Move ${name} up`} disabled={index === 0} onClick={() => onMove(index - 1)}>
        ↑
      </button>
      <button
        type="button"
        className="btn ghost sm"
        aria-label={`Move ${name} down`}
        disabled={index === count - 1}
        onClick={() => onMove(index + 1)}
      >
        ↓
      </button>
      <button type="button" className="btn danger sm" aria-label={`Remove ${name}`} onClick={onRemove}>
        Remove
      </button>
    </span>
  );
}

function Box({ label, hint, wide = true, invalid, children }: { label: string; hint?: string; wide?: boolean; invalid?: boolean; children: ReactNode }) {
  return (
    <fieldset className={`cms-box${wide ? ' wide' : ''}${invalid ? ' invalid' : ''}`}>
      <legend>{label}</legend>
      {hint ? <p className="hint cms-box-hint">{hint}</p> : null}
      {children}
    </fieldset>
  );
}

function One({ def, value, set, path, errors, readOnly }: Common & { def: Def; value: Json | undefined; set: (v: Json) => void }) {
  const id = idOf(path);
  const error = errors[path];
  switch (def.kind) {
    case 'text':
      return (
        <Field id={id} label={def.label} error={error} hint={def.hint} required={false}>
          <input
            id={id}
            className="inp"
            maxLength={def.max}
            value={str(value)}
            disabled={readOnly}
            aria-invalid={error ? true : undefined}
            onChange={(e) => set(e.target.value)}
          />
        </Field>
      );
    case 'textarea':
      return (
        <Field id={id} label={def.label} error={error} hint={def.hint} required={false} wide>
          <textarea
            id={id}
            className="inp"
            rows={def.rows ?? 3}
            maxLength={def.max}
            value={str(value)}
            disabled={readOnly}
            aria-invalid={error ? true : undefined}
            onChange={(e) => set(e.target.value)}
          />
        </Field>
      );
    case 'toggle':
      return (
        <label className="check cms-toggle">
          <input type="checkbox" id={id} checked={value === true} disabled={readOnly} onChange={(e) => set(e.target.checked)} />
          <span>{def.label}</span>
        </label>
      );
    case 'number':
      return (
        <Field id={id} label={def.label} error={error} hint={def.hint} required={false}>
          <input
            id={id}
            className="inp"
            type="number"
            min={def.min}
            max={def.max}
            value={typeof value === 'number' ? value : ''}
            disabled={readOnly}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value));
              set(Number.isFinite(n) ? Math.min(def.max, Math.max(def.min, n)) : def.min);
            }}
          />
        </Field>
      );
    case 'icon':
      return (
        <Field id={id} label={def.label} error={error} required={false}>
          <span className="cms-icon-pick">
            <span className="cms-icon-preview">
              <CmsIcon name={str(value)} />
            </span>
            <select id={id} className="inp" value={str(value)} disabled={readOnly} onChange={(e) => set(e.target.value)}>
              {ICON_CHOICES.map(([name, label]) => (
                <option key={name} value={name}>
                  {label}
                </option>
              ))}
            </select>
          </span>
        </Field>
      );
    case 'select':
      return (
        <Field id={id} label={def.label} error={error} required={false}>
          <select id={id} className="inp" value={str(value)} disabled={readOnly} onChange={(e) => set(e.target.value)}>
            {def.options.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      );
    case 'cta': {
      const cta = isDoc(value) ? value : {};
      const defs: Def[] = [
        { kind: 'toggle', key: 'enabled', label: 'Show this button' },
        { kind: 'text', key: 'label', label: 'Button text', max: 60 },
        { kind: 'select', key: 'action', label: 'Goes to', options: CTA_ACTIONS },
        ...(cta.action === 'url'
          ? [{ kind: 'text', key: 'url', label: 'Web address', max: 500, hint: 'A full address, e.g. https://ipp.sumago.ai/register' } as Def]
          : []),
        ...(cta.action === 'section' ? [{ kind: 'select', key: 'section', label: 'Section', options: SECTIONS } as Def] : []),
      ];
      return (
        <Box label={def.label} invalid={errorBelow(errors, path)}>
          <Fields defs={defs} value={cta} onChange={set} path={path} errors={errors} readOnly={readOnly} />
        </Box>
      );
    }
    case 'part':
      return (
        <div className="wide">
          <Fields defs={def.fields} value={isDoc(value) ? value : {}} onChange={set} path={path} errors={errors} readOnly={readOnly} />
        </div>
      );
    case 'group':
      return (
        <Box label={def.label} hint={def.hint} invalid={errorBelow(errors, path)}>
          <Fields defs={def.fields} value={isDoc(value) ? value : {}} onChange={set} path={path} errors={errors} readOnly={readOnly} />
        </Box>
      );
    case 'strings': {
      const list = Array.isArray(value) ? value.map(str) : [];
      return (
        <Box label={def.label} hint={def.hint} invalid={errorBelow(errors, path)}>
          {list.length === 0 ? <p className="muted cms-empty">None yet.</p> : null}
          {list.map((text, i) => {
            const itemPath = join(path, i);
            const itemId = idOf(itemPath);
            const name = `${def.item} ${i + 1}`;
            const edit = (v: string) => set(list.map((x, j) => (j === i ? v : x)));
            return (
              <div key={i} className="cms-string">
                <label className="sr-only" htmlFor={itemId}>
                  {name}
                </label>
                {def.multiline ? (
                  <textarea id={itemId} className="inp" rows={3} maxLength={def.itemMax} value={text} disabled={readOnly} onChange={(e) => edit(e.target.value)} />
                ) : (
                  <input id={itemId} className="inp" maxLength={def.itemMax} value={text} disabled={readOnly} onChange={(e) => edit(e.target.value)} />
                )}
                {!readOnly ? (
                  <ItemTools
                    name={name}
                    index={i}
                    count={list.length}
                    onMove={(to) => set(move(list, i, to))}
                    onRemove={() => set(list.filter((_, j) => j !== i))}
                  />
                ) : null}
                {errors[itemPath] ? <span className="err">{errors[itemPath]}</span> : null}
              </div>
            );
          })}
          {!readOnly ? (
            <button type="button" className="btn ghost sm" disabled={list.length >= def.max} onClick={() => set([...list, ''])}>
              + Add {def.item.toLowerCase()}
            </button>
          ) : null}
        </Box>
      );
    }
    case 'list': {
      const list = Array.isArray(value) ? value.filter(isDoc) : [];
      return (
        <Box label={def.label} hint={def.hint} invalid={errorBelow(errors, path)}>
          {list.length === 0 ? <p className="muted cms-empty">None yet.</p> : null}
          {list.map((item, i) => {
            const name = `${def.item} ${i + 1}`;
            const title = def.title ? str(item[def.title]) : '';
            return (
              <div key={i} className={`cms-item${item.enabled === false ? ' off' : ''}`}>
                <div className="cms-item-head">
                  <b>{name}</b>
                  {title ? <span className="muted cms-item-title">{title}</span> : null}
                  {item.enabled === false ? <span className="badge inactive">Hidden</span> : null}
                  <span className="spacer" />
                  {!readOnly ? (
                    <ItemTools
                      name={name}
                      index={i}
                      count={list.length}
                      onMove={(to) => set(move(list, i, to))}
                      onRemove={() => set(list.filter((_, j) => j !== i))}
                    />
                  ) : null}
                </div>
                <Fields
                  defs={def.fields}
                  value={item}
                  onChange={(next) => set(list.map((x, j) => (j === i ? next : x)))}
                  path={join(path, i)}
                  errors={errors}
                  readOnly={readOnly}
                />
              </div>
            );
          })}
          {!readOnly ? (
            <button
              type="button"
              className="btn ghost sm"
              disabled={list.length >= def.max}
              onClick={() => set([...list, JSON.parse(JSON.stringify(def.blank)) as Doc])}
            >
              + Add {def.item.toLowerCase()}
            </button>
          ) : null}
        </Box>
      );
    }
  }
}
