import type { ReactNode } from 'react';
import { useLang } from '../i18n';
import { BrandMark, ORGANISATION, PROGRAM, useOptions } from './ui';

/*
 * The sign-in screens' frame, in the AMRUT admin panel's sign-in design: the programme on a warm panel at the left
 * (headline, documents to keep ready, key facts), the form on white at the right with the मराठी / English toggle.
 * The form comes first in the page (screen readers and phones reach it first); CSS puts the panel on the left on wide
 * screens. Each page's own title is the h1. `panel` = 'student' for the portal, 'manage' for the tracking panel.
 */
export function AuthLayout({ children, wide, panel = 'student' }: { children: ReactNode; wide?: boolean; panel?: 'student' | 'manage' }) {
  const { T } = useLang();
  const options = useOptions();
  /* Tolerates a partial response: the panel is informational and must never break the form beside it. */
  const docs = options?.document_types ?? [];
  const tracks = options?.tracks?.length;
  const mandatory = docs.filter((d) => d.is_mandatory).length;
  const byLine = T('सुमागो इन्फोटेक प्रा. लि. द्वारे', `by ${ORGANISATION}`);

  return (
    <div className="auth">
      <main className="auth-r">
        {/* Phones show the form before the programme panel, so the programme is named above the form. */}
        <div className="auth-mobile-brand" aria-hidden="true">
          <BrandMark />
          <div>
            <b>{PROGRAM}</b>
            <span>{byLine}</span>
          </div>
        </div>
        <div className={wide ? 'auth-box wide' : 'auth-box'}>
          <div className="auth-top">
            <LangToggle />
          </div>
          {children}
        </div>
      </main>

      <aside className="auth-l" aria-label={T('कार्यक्रमाची माहिती', 'About the programme')}>
        <div className="auth-brand">
          <BrandMark />
          <div>
            <b>{PROGRAM}</b>
            <span>{byLine}</span>
          </div>
        </div>

        <div className="auth-hero">
          <h2>
            {panel === 'manage'
              ? T('प्रत्येक विद्यार्थ्याचा प्रवास — एकाच ठिकाणी.', "Every student's progress — in one place.")
              : T('खाते तयार करा, फॉर्म भरा — एकाच पोर्टलवर.', 'Create your account, fill in your form — one portal.')}
          </h2>
          <p>
            {panel === 'manage'
              ? T(
                  'खाते तयार झाले, OTP पडताळला, टप्पे १ व २ भरले, फॉर्म सबमिट झाला — प्रत्येक विद्यार्थी कुठपर्यंत पोहोचला ते पहा आणि थांबलेल्यांशी संपर्क साधा.',
                  'Account created, OTP verified, steps 1 and 2 filled, form submitted — see how far each student got and follow up with those who stopped.',
                )
              : T(
                  'उद्योजकता विकास कार्यक्रमासाठी ऑनलाइन नोंदणी: मोबाईल OTP ने खाते पडताळा, तीन टप्प्यांत फॉर्म भरा, कागदपत्रे अपलोड करा आणि आपल्या अर्जाची माहिती कधीही पहा.',
                  'Online registration for the Entrepreneurship Development Program: verify your account with a mobile OTP, fill in the form in three steps, upload your documents and see your application any time.',
                )}
          </p>
          <div className="mode-tags">
            <span className="mode-tag mode-off">{T('३ टप्प्यांचा ऑनलाइन फॉर्म', '3-STEP ONLINE FORM')}</span>
            <span className="mode-tag mode-on">{T('मोबाईल OTP पडताळणी', 'MOBILE OTP VERIFIED')}</span>
          </div>
        </div>

        {panel === 'student' && docs.length ? (
          <section className="auth-docs" aria-labelledby="auth-docs-title">
            <h3 id="auth-docs-title">{T('ही कागदपत्रे तयार ठेवा', 'Keep these documents ready')}</h3>
            <ul className="doc-chips">
              {docs.map((d) => (
                <li key={d.code} className={d.is_mandatory ? '' : 'opt'}>
                  {d.name}
                  {d.is_mandatory ? <span aria-hidden="true"> *</span> : null}
                  {d.is_mandatory ? null : <span className="sr-only"> ({T('लागू असल्यास', 'if applicable')})</span>}
                </li>
              ))}
            </ul>
            <p>
              {T(
                '* आवश्यक; ठिपक्यांची किनार = लागू असल्यास. PDF, JPG, JPEG किंवा PNG स्वरूपातील स्कॅन प्रती, प्रत्येकी ५ MB पर्यंत.',
                '* Mandatory; dashed outline = if applicable. Scanned copies in PDF, JPG, JPEG or PNG format, each up to 5 MB.',
              )}
            </p>
          </section>
        ) : null}

        <div className="auth-stat">
          <div>
            <b>3</b>
            <span>{T('फॉर्मचे टप्पे', 'Steps in the form')}</span>
          </div>
          <div>
            <b>{tracks ?? '—'}</b>
            <span>{T('तंत्रज्ञान अभ्यासक्रम', 'Technology tracks')}</span>
          </div>
          <div>
            <b>{docs.length ? mandatory : '—'}</b>
            <span>{T('आवश्यक कागदपत्रे', 'Mandatory documents')}</span>
          </div>
          <div>
            <b>1</b>
            <span>{T('एकदाच अंतिम सबमिशन', 'Final submission, once')}</span>
          </div>
        </div>
        <div className="auth-foot">
          © {new Date().getFullYear()} {PROGRAM} · {ORGANISATION}
        </div>
      </aside>
    </div>
  );
}

export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="lang-toggle" role="group" aria-label="Language / भाषा">
      <button type="button" className={lang === 'mr' ? 'on' : ''} aria-pressed={lang === 'mr'} onClick={() => setLang('mr')} lang="mr">
        मराठी
      </button>
      <button type="button" className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')} lang="en">
        English
      </button>
    </div>
  );
}
