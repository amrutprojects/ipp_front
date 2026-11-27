import { useEffect, useMemo, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { api, ApiError } from '../../../api';
import { fmtDate, Notice } from '../../../components/ui';
import { useCanEdit } from '../../../session';
import { ManageShell } from '../ManageLayout';
import { messageOf } from '../masters/shared';
import type { Doc, LandingDoc } from './cmsTypes';
import CoursesPanel from './CoursesPanel';
import FaqsPanel from './FaqsPanel';
import { Fields } from './fields';
import LogoCard from './LogoCard';
import { CMS_TABS, partsOf, type CmsTab } from './sections';

/*
 * Manage → CMS (/manage/cms/:tab): everything the public landing page shows. The texts, links, buttons and switches of
 * all tabs are one document: edited across tabs, then saved together with "Save changes" (a VIEWER reads it). Courses,
 * questions and the logo are saved as soon as they change. The page reads what is saved within a minute.
 */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/* An API error key of the document (content.hero.title_line1) as the form keys it (hero.title_line1). */
const formKey = (k: string) => k.replace(/^content\./, '');
const touches = (tab: CmsTab, key: string) => partsOf(tab).some((p) => key === p || key.startsWith(`${p}.`));

export default function CmsPage() {
  const canEdit = useCanEdit();
  const { tab: tabKey } = useParams();
  const tab = CMS_TABS.find((t) => t.key === tabKey) ?? CMS_TABS[0]!;
  const [saved, setSaved] = useState<LandingDoc | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api<LandingDoc>('/manage/cms/landing', { realm: 'manage' })
      .then((r) => {
        if (!live) return;
        setSaved(r.data);
        setDoc(r.data.content);
      })
      .catch((e: unknown) => live && setLoadError(messageOf(e, 'Could not load the landing page')));
    return () => {
      live = false;
    };
  }, []);

  const dirty = !!saved && !!doc && !same(doc, saved.content);
  /* Leaving the page (reload, closing the tab) with unsaved texts asks first. */
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const changedTabs = useMemo(
    () => new Set(saved && doc ? CMS_TABS.filter((t) => partsOf(t).some((p) => !same(doc[p], saved.content[p]))).map((t) => t.key) : []),
    [doc, saved],
  );
  const wrongTabs = useMemo(
    () => new Set(CMS_TABS.filter((t) => Object.keys(errors).some((k) => errors[k] && touches(t, k))).map((t) => t.key)),
    [errors],
  );

  const edit = (next: Doc) => {
    setDoc(next);
    setDone('');
  };
  const save = async () => {
    if (!doc || busy) return;
    setBusy(true);
    setFailure('');
    setDone('');
    try {
      const res = await api<LandingDoc>('/manage/cms/landing', { method: 'PUT', realm: 'manage', body: { content: doc } });
      setSaved(res.data);
      setDoc(res.data.content);
      setErrors({});
      setDone('Landing page saved. The page shows the changes within a minute.');
    } catch (e) {
      const fields = e instanceof ApiError ? Object.fromEntries(Object.entries(e.fields()).map(([k, v]) => [formKey(k), v])) : {};
      setErrors(fields);
      const where = CMS_TABS.filter((t) => Object.keys(fields).some((k) => touches(t, k))).map((t) => t.label);
      setFailure(
        e instanceof ApiError && e.status === 422 && where.length
          ? `Not saved: please correct the highlighted boxes on ${where.join(', ')}.`
          : messageOf(e, 'Could not save the landing page'),
      );
    } finally {
      setBusy(false);
    }
  };
  const discard = () => {
    if (!saved) return;
    setDoc(saved.content);
    setErrors({});
    setFailure('');
    setDone('');
  };
  const restoreTab = () => {
    if (!saved || !doc) return;
    setDoc({ ...doc, ...Object.fromEntries(partsOf(tab).map((p) => [p, saved.defaults[p] ?? null])) });
    setDone(`Default texts of ${tab.label} put back. Save changes to keep them.`);
  };
  const landingUrl = typeof doc?.links === 'object' && doc.links && !Array.isArray(doc.links) ? doc.links.landing_url : '';

  return (
    <ManageShell wide>
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Landing page</h2>
        <span className="spacer" />
        {typeof landingUrl === 'string' && /^https?:\/\//.test(landingUrl) ? (
          <a className="btn ghost sm" href={landingUrl} target="_blank" rel="noopener noreferrer">
            Preview the page ↗
          </a>
        ) : null}
      </div>
      <nav className="masters-nav cms-tabs" aria-label="Landing page sections">
        {CMS_TABS.map((t) => (
          <NavLink key={t.key} to={`/manage/cms/${t.key}`} className={() => (t.key === tab.key ? 'active' : '')}>
            {t.label}
            {wrongTabs.has(t.key) ? (
              <span className="cms-dot wrong" title="Needs a correction" aria-label="(needs a correction)" />
            ) : changedTabs.has(t.key) ? (
              <span className="cms-dot" title="Unsaved changes" aria-label="(unsaved changes)" />
            ) : null}
          </NavLink>
        ))}
      </nav>
      {!canEdit ? <Notice tone="info">View only: your account can see the landing page content but not change it.</Notice> : null}
      {loadError ? <Notice tone="error">{loadError}</Notice> : null}
      {!saved && !loadError ? <div className="loading">Loading…</div> : null}
      {saved && doc ? (
        <>
          {canEdit ? (
            <div className="cms-savebar" role="region" aria-label="Save the landing page">
              <span className={dirty ? 'cms-state dirty' : 'cms-state'}>
                {dirty
                  ? 'Unsaved changes'
                  : saved.updated_at
                    ? `Saved ${fmtDate(saved.updated_at)}${saved.updated_by ? ` by ${saved.updated_by}` : ''}`
                    : 'Not saved yet: the page uses its default texts'}
              </span>
              <span className="spacer" />
              <button type="button" className="btn ghost sm" onClick={restoreTab} disabled={busy}>
                Default texts for this tab
              </button>
              <button type="button" className="btn ghost sm" onClick={discard} disabled={!dirty || busy}>
                Discard changes
              </button>
              <button type="button" className="btn sm" onClick={() => void save()} disabled={!dirty || busy}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          ) : null}
          {failure ? <Notice tone="error">{failure}</Notice> : null}
          {done ? <Notice tone="ok">{done}</Notice> : null}
          <section className="card" aria-labelledby="cms-tab-title">
            <h2 id="cms-tab-title">{tab.label}</h2>
            <p className="sub">{tab.intro}</p>
            {tab.extra === 'logo' ? (
              <div className="grid cms-grid" style={{ marginBottom: 14 }}>
                <LogoCard
                  logo={saved.logo}
                  canEdit={canEdit}
                  onChange={(logo, message) => {
                    setSaved((s) => (s ? { ...s, logo } : s));
                    setDone(message);
                  }}
                />
              </div>
            ) : null}
            <Fields defs={tab.defs} value={doc} onChange={edit} path="" errors={errors} readOnly={!canEdit} />
          </section>
          {tab.extra === 'courses' ? <CoursesPanel canEdit={canEdit} /> : null}
          {tab.extra === 'faqs' ? <FaqsPanel canEdit={canEdit} /> : null}
        </>
      ) : null}
    </ManageShell>
  );
}
