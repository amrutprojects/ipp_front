import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { useLang } from '../i18n';
import type { HelpField } from '../types';
import { telHref } from './SupportMessage';
import { useOptions } from './ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?\d[\d ()-]{5,18}\d$/;

/* A value that is an email address or a phone number is dialable / mailable; anything else is shown as written. */
function HelpValue({ value }: { value: string }) {
  if (EMAIL_RE.test(value)) return <a href={`mailto:${value}`}>{value}</a>;
  if (PHONE_RE.test(value))
    return (
      <a href={telHref(value)} className="nowrap">
        {value}
      </a>
    );
  return <>{value}</>;
}

/*
 * The Help button in the bottom-right corner of every portal screen. Its heading, line of introduction and contact
 * details are set in the tracking panel (/manage/settings → Help button) and arrive with GET /edp/options, so nothing
 * here is hard-coded: each line is a name and its value (Contact Number, Email ID, …), up to HELP_FIELDS of them.
 * Nothing is shown while the options are loading, when an admin has switched the button off, or with no details set.
 */
export function HelpButton() {
  const { T } = useLang();
  const options = useOptions();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  /* Escape closes the panel (focus back on the button); so does a click anywhere outside it. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    };
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (e.target instanceof Node && !wrap.current?.contains(e.target)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open]);

  const help = options?.help;
  const fields: HelpField[] = (help?.fields ?? []).filter((f) => f?.label?.trim() && f?.value?.trim());
  if (!help || help.enabled === false || !fields.length) return null;

  const label = T('मदत', 'Help');
  return (
    <div className="help-fab" ref={wrap}>
      {open ? (
        <div className="help-panel" id={panelId} role="dialog" aria-labelledby={`${panelId}-title`}>
          <div className="help-panel-top">
            <h3 id={`${panelId}-title`}>{help.title?.trim() || T('मदत हवी आहे?', 'Need help?')}</h3>
            <button
              type="button"
              className="help-close"
              onClick={() => {
                setOpen(false);
                button.current?.focus();
              }}
              aria-label={T('बंद करा', 'Close')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          {help.intro?.trim() ? <p className="help-intro">{help.intro}</p> : null}
          <dl className="help-list">
            {fields.map((f, i) => (
              <Fragment key={`${f.label}-${i}`}>
                <dt>{f.label}</dt>
                <dd>
                  <HelpValue value={f.value.trim()} />
                </dd>
              </Fragment>
            ))}
          </dl>
        </div>
      ) : null}
      <button
        type="button"
        ref={button}
        className="help-btn"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.2 9.3a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.4-2.8 4" />
          <path d="M12 17.2h.01" />
        </svg>
        {label}
      </button>
    </div>
  );
}
