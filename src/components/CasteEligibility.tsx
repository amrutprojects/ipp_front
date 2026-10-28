import { useEffect, useState } from 'react';
import { useLang } from '../i18n';
import { loadOptions, Notice } from './ui';

/*
 * Eligibility, shown before the login and the create-account forms: the programme is open to the castes of the Caste
 * master (the same list as the form's Caste dropdown, GET /edp/options). The candidate ticks the confirmation and
 * proceeds to the form; the confirmation is shared by both pages and remembered for the browser session (tab).
 */
const CASTE_CONFIRMED_KEY = 'edp.casteConfirmed';
export function rememberedConfirmation(): boolean {
  try {
    return sessionStorage.getItem(CASTE_CONFIRMED_KEY) === '1';
  } catch {
    return false;
  }
}
export function rememberConfirmation(on: boolean) {
  try {
    if (on) sessionStorage.setItem(CASTE_CONFIRMED_KEY, '1');
    else sessionStorage.removeItem(CASTE_CONFIRMED_KEY);
  } catch {
    /* Storage unavailable (private mode): the checkbox is simply asked again next time. */
  }
}

export function CasteEligibility({ proceedLabel, onConfirm }: { proceedLabel: string; onConfirm: () => void }) {
  const { T } = useLang();
  const [castes, setCastes] = useState<{ id: string; name: string }[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [search, setSearch] = useState('');
  const load = () => {
    setFailed(false);
    loadOptions()
      .then((o) => setCastes(o.castes ?? []))
      .catch(() => setFailed(true));
  };
  useEffect(load, []);
  const needle = search.trim().toLowerCase();
  const shown = (castes ?? []).filter((c) => !needle || c.name.toLowerCase().includes(needle));

  return (
    <section className="eligibility" aria-labelledby="eligibility-title">
      <div className="eligibility-head">
        <h1 id="eligibility-title">{T('पात्रता', 'Eligibility')}</h1>
        {castes?.length ? (
          <span className="badge eligibility-count">
            {castes.length} {T('जाती', castes.length === 1 ? 'caste' : 'castes')}
          </span>
        ) : null}
      </div>
      <p className="sub">
        {T(
          'हा कार्यक्रम खालील जातींतील उमेदवारांसाठी आहे. फॉर्म भरण्यापूर्वी कृपया यादी तपासा.',
          'This programme is open to candidates of the following castes. Please check the list before you fill in the form.',
        )}
      </p>
      {failed ? (
        <Notice tone="error">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>{T('जातींची यादी लोड करता आली नाही.', 'The list of castes could not be loaded.')}</span>
            <button type="button" className="btn ghost sm" onClick={load}>
              {T('पुन्हा प्रयत्न करा', 'Try again')}
            </button>
          </div>
        </Notice>
      ) : !castes ? (
        <div className="caste-panel" role="status">
          <span className="hint">{T('यादी लोड होत आहे…', 'Loading the list…')}</span>
        </div>
      ) : castes.length === 0 ? (
        <Notice tone="warn">{T('सध्या कोणतीही जात उपलब्ध नाही.', 'No castes are available at the moment.')}</Notice>
      ) : (
        <>
          <div className="caste-panel">
            {castes.length > 8 ? (
              <input
                type="search"
                className="inp caste-search"
                placeholder={T('आपली जात शोधा', 'Find your caste')}
                aria-label={T('आपली जात शोधा', 'Find your caste')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            ) : null}
            <ul className="caste-chips" aria-label={T('पात्र जाती', 'Eligible castes')}>
              {shown.map((c) => (
                <li key={c.id} className="caste-chip">
                  {c.name}
                </li>
              ))}
            </ul>
            {needle && !shown.length ? (
              <p className="hint center" role="status">
                {T('या नावाची जात यादीत नाही.', 'No caste in the list matches this name.')}
              </p>
            ) : null}
          </div>
          <label className={`eligibility-confirm${confirmed ? ' on' : ''}`}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>
              {T('मी वरील यादीतील एका जातीचा / जातीची आहे.', 'I belong to one of the castes listed above.')} <span className="req">*</span>
            </span>
          </label>
          <button type="button" className="btn block mt16" disabled={!confirmed} onClick={onConfirm}>
            {proceedLabel}
          </button>
          {!confirmed ? (
            <p className="hint center mt8">{T('पुढे जाण्यासाठी वरील बॉक्स निवडा.', 'Tick the box above to proceed.')}</p>
          ) : null}
        </>
      )}
    </section>
  );
}

/* Above the login / create-account form: the confirmation given, and a way back to the list. */
export function EligibilityConfirmed({ onChange }: { onChange: () => void }) {
  const { T } = useLang();
  return (
    <div className="eligibility-ok">
      <span aria-hidden="true">✓</span>
      <span>{T('आपली जात पात्र यादीत असल्याची आपण पुष्टी केली आहे.', 'You confirmed that your caste is in the eligible list.')}</span>
      <button
        type="button"
        className="link-btn"
        onClick={() => {
          rememberConfirmation(false);
          onChange();
        }}
      >
        {T('बदला', 'Change')}
      </button>
    </div>
  );
}
