import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { api, ApiError, panelChangeCount, type Realm } from '../api';
import { docName, useLang } from '../i18n';
import type { Options } from '../types';

export const PROGRAM = '3 MONTH INTERNSHIP PLACEMENT PROGRAM';
export const ORGANISATION = 'Sumago Infotech Pvt. Ltd.';

/* The official Sumago Infotech logo on a white tile (public/sumago-logo.svg, from sumagoinfotech.com). */
export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <img src="/sumago-logo.svg" alt="" width="34" height="34" />
    </span>
  );
}

export function Header({ right }: { right?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="topbar-in">
        <BrandMark />
        <div className="brand">
          <h1>{PROGRAM}</h1>
          <p>by {ORGANISATION}</p>
        </div>
        {right ? <div className="topbar-user">{right}</div> : null}
      </div>
    </header>
  );
}

export function Field({
  id,
  label,
  error,
  hint,
  required = true,
  wide,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  /* The control (the one child) is described by its error, else its hint, and says whether it is required. */
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        'aria-required': required || undefined,
      })
    : children;
  return (
    <div className={wide ? 'field wide' : 'field'}>
      <label htmlFor={id}>
        {label} {required ? <span className="req">*</span> : null}
      </label>
      {/* The box and its note together: in a form whose rows line up (styles.css .grid.aligned) they share one row. */}
      <div className="field-body">
        {control}
        {error ? (
          <span className="err" role="alert" id={`${id}-err`}>
            {error}
          </span>
        ) : hint ? (
          <span className="hint" id={`${id}-hint`}>
            {hint}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* Password with an eye button that shows / hides it (as the AMRUT admin panel's sign-in). */
export function PasswordInput(props: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  autoComplete: string;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
  /*
   * Typed by the user every time (a final confirmation): no browser or password manager fills it in. Read-only until the
   * user clicks or tabs into it (browsers do not fill a read-only field), and marked as not a saved password.
   */
  noFill?: boolean;
}) {
  const { T } = useLang();
  const [show, setShow] = useState(false);
  const [armed, setArmed] = useState(!props.noFill);
  /* The label says what the button does next; no aria-pressed as well, which would contradict it. */
  const label = show ? T('पासवर्ड लपवा', 'Hide password') : T('पासवर्ड दाखवा', 'Show password');
  return (
    <div className="pw-wrap">
      <input
        id={props.id}
        className="inp"
        type={show ? 'text' : 'password'}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        aria-invalid={props.invalid || undefined}
        aria-describedby={props['aria-describedby']}
        aria-required={props['aria-required']}
        autoComplete={props.noFill ? 'new-password' : props.autoComplete}
        name={props.noFill ? `${props.id}-confirm` : undefined}
        readOnly={!armed}
        onFocus={() => setArmed(true)}
        data-lpignore={props.noFill ? 'true' : undefined}
        data-1p-ignore={props.noFill ? 'true' : undefined}
        maxLength={72}
      />
      <button type="button" className="pw-toggle" onClick={() => setShow(!show)} aria-label={label} title={label}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {show ? <line x1="3" y1="3" x2="21" y2="21" /> : null}
        </svg>
      </button>
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'info' | 'warn' | 'ok' | 'error'; children: ReactNode }) {
  return (
    /* Errors interrupt (alert); confirmations are announced politely (status). */
    <div className={`notice ${tone}`} role={tone === 'error' ? 'alert' : tone === 'ok' ? 'status' : undefined}>
      {children}
    </div>
  );
}

/*
 * The form's fields, dropdown values and document types as the masters are now (GET /edp/options). Kept for a short while
 * and shared by every part of the page; asked again when a page that uses them opens, and when the student comes back to the
 * tab, so a change in Masters → Form fields reaches a form that is already open. An answer that changed nothing keeps the
 * same object: nothing is drawn again.
 */
export const OPTIONS_FRESH_MS = 15_000;
let optionsKept: { at: number; changes: number; text: string; value: Options } | null = null;
let optionsAsked: Promise<Options> | null = null;
const optionsListeners = new Set<(o: Options) => void>();
export function loadOptions(maxAgeMs = OPTIONS_FRESH_MS): Promise<Options> {
  const fresh = optionsKept && optionsKept.changes === panelChangeCount() && Date.now() - optionsKept.at < maxAgeMs;
  if (fresh) return Promise.resolve(optionsKept!.value);
  optionsAsked ??= api<Options>('/options')
    .then((r) => {
      const text = JSON.stringify(r.data);
      const at = { at: Date.now(), changes: panelChangeCount() };
      if (optionsKept?.text === text) {
        Object.assign(optionsKept, at);
        return optionsKept.value;
      }
      optionsKept = { ...at, text, value: r.data };
      for (const tell of optionsListeners) tell(r.data);
      return r.data;
    })
    .finally(() => {
      optionsAsked = null;
    });
  return optionsAsked;
}
export function useOptions(): Options | null {
  const [options, setOptions] = useState<Options | null>(() => optionsKept?.value ?? null);
  useEffect(() => {
    let live = true;
    const show = (o: Options) => {
      if (live) setOptions(o);
    };
    optionsListeners.add(show);
    const ask = () => void loadOptions().then(show, () => undefined);
    const back = () => {
      if (document.visibilityState === 'visible') ask();
    };
    ask();
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => {
      live = false;
      optionsListeners.delete(show);
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('focus', back);
    };
  }, []);
  return options;
}

/*
 * A list that depends on an earlier choice (a district's talukas, a centre's technologies), loaded from `path`; null =
 * nothing chosen yet. Only the answer for the newest path is kept: a slow answer for an earlier choice is ignored.
 * `path` in the result says which choice the items belong to.
 */
export interface RemoteList<T> {
  path: string | null;
  items: T[];
  status: 'idle' | 'loading' | 'ok' | 'error';
  error: ApiError | null;
}
export function useRemoteList<T>(path: string | null, realm?: Realm): RemoteList<T> {
  const [state, setState] = useState<RemoteList<T>>({ path: null, items: [], status: 'idle', error: null });
  const seq = useRef(0);
  useEffect(() => {
    const id = ++seq.current;
    if (!path) {
      setState({ path, items: [], status: 'idle', error: null });
      return;
    }
    setState({ path, items: [], status: 'loading', error: null });
    api<T[]>(path, { realm })
      .then((r) => id === seq.current && setState({ path, items: r.data ?? [], status: 'ok', error: null }))
      .catch((e: unknown) => {
        if (id !== seq.current) return;
        setState({ path, items: [], status: 'error', error: e instanceof ApiError ? e : new ApiError('Could not load the list', 0) });
      });
  }, [path, realm]);
  /* Until the effect has run for a new path, the old items do not belong to it. */
  return state.path === path ? state : { path, items: [], status: path ? 'loading' : 'idle', error: null };
}

/* Shown at the foot of every portal page: the documents to keep ready (the active document types). */
export function DocumentsReady() {
  const options = useOptions();
  const { lang } = useLang();
  if (!options?.document_types.length) return null;
  return (
    <aside className="docs-ready" aria-labelledby="docs-ready-title">
      <h4 id="docs-ready-title">Keep these documents ready</h4>
      <ol>
        {options.document_types.map((d) => (
          <li key={d.code}>
            {docName(d, lang)}
            {d.is_mandatory ? <span className="req"> *</span> : /optional/i.test(docName(d, lang)) ? null : <span className="muted"> (optional)</span>}
          </li>
        ))}
      </ol>
      <p className="hint mt8">* Mandatory. Scanned copies in PDF, JPG, JPEG or PNG format, each up to 5 MB.</p>
    </aside>
  );
}

export function Footer() {
  return (
    <footer className="site-foot">
      © {new Date().getFullYear()} {PROGRAM} · {ORGANISATION}
    </footer>
  );
}

/* Open dialogs, newest last: Escape and the focus trap act on the top one only (a confirmation can sit on a preview). */
const openDialogs: symbol[] = [];
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/*
 * A dialog: focus moves into it when it opens (to the element marked data-autofocus, else the dialog) and back where it
 * was when it closes; Tab stays inside it. `alert` = a yes/no question (role alertdialog); `wide` = a large preview.
 * `closeLabel` adds a ✕ in the corner that closes it, named by the caller (so each page names it in its own language).
 */
export function Modal({
  title,
  children,
  onClose,
  alert,
  wide,
  closeLabel,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  alert?: boolean;
  wide?: boolean;
  closeLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const me = Symbol('dialog');
    openDialogs.push(me);
    const before = document.activeElement as HTMLElement | null;
    const box = ref.current;
    (box?.querySelector<HTMLElement>('[data-autofocus]') ?? box)?.focus();
    const isTop = () => openDialogs[openDialogs.length - 1] === me;
    const onKey = (e: KeyboardEvent) => {
      if (!isTop() || !box) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current();
      } else if (e.key === 'Tab') {
        const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)];
        /* While a request runs the buttons are disabled and focus may have dropped to the page: bring it back in. */
        if (!items.length || !box.contains(document.activeElement)) {
          e.preventDefault();
          (items[0] ?? box).focus();
          return;
        }
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && (document.activeElement === first || document.activeElement === box)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    /* Focus never stays on the page behind the top dialog (e.g. a disabled button losing focus, or a script). */
    const onFocusIn = (e: FocusEvent) => {
      if (isTop() && box && e.target instanceof Node && !box.contains(e.target)) box.focus();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocusIn);
      openDialogs.splice(openDialogs.indexOf(me), 1);
      /* Back to where the user was, if that is still on the page; else the next dialog down, if any. */
      if (before && document.contains(before)) before.focus();
    };
  }, []);
  return (
    /*
     * A click outside the dialog does not close it: a text selected with the mouse that ends outside (or any slip of the
     * mouse) would lose what was typed. It closes by its own buttons (Cancel, Close, ✕), Escape, or when it is done.
     */
    <div className="backdrop">
      <div
        ref={ref}
        className={wide ? 'modal wide' : 'modal'}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {closeLabel ? (
          <button type="button" className="modal-x" onClick={() => close.current()} aria-label={closeLabel} title={closeLabel}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        ) : null}
        <h3 id={titleId}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export const fmtDate = (iso: string | null | undefined, withTime = true) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
      })
    : '—';

export const ddmmyyyy = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || '—';
};
