import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../api';
import { Notice } from '../../../components/ui';
import { useCanEdit } from '../../../session';
import type { DistrictTechnologies, MasterOption } from '../../../types';
import { MastersShell } from '../ManageLayout';
import MasterList from './MasterList';
import { messageOf } from './shared';

/*
 * District-wise technologies: the technologies a student of a district may choose. Nothing selected = every active
 * technology ("All technologies"). `version` changes when the technologies themselves changed.
 */
function DistrictTechnologiesSection({ version }: { version: number }) {
  const canEdit = useCanEdit();
  const [districts, setDistricts] = useState<DistrictTechnologies[] | null>(null);
  const [technologies, setTechnologies] = useState<MasterOption[]>([]);
  const [districtId, setDistrictId] = useState('');
  const [all, setAll] = useState(true);
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [issue, setIssue] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, t] = await Promise.all([
        api<DistrictTechnologies[]>('/manage/technologies/districts', { realm: 'manage' }),
        api<MasterOption[]>('/manage/masters/TECHNOLOGY', { realm: 'manage', query: { page: 1, limit: 100 } }),
      ]);
      setDistricts(d.data);
      setTechnologies(t.data);
      setError('');
    } catch (e) {
      setError(messageOf(e, 'Could not load the district-wise technologies'));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, version]);

  const district = districts?.find((d) => d.district_id === districtId);
  const choose = (id: string) => {
    const d = districts?.find((x) => x.district_id === id);
    setDistrictId(id);
    setAll(d ? d.all : true);
    setCodes(d && !d.all ? d.codes : []);
    setIssue('');
    setDone('');
  };
  const toggle = (code: string, on: boolean) => {
    setCodes((list) => (on ? [...list, code] : list.filter((x) => x !== code)));
    setIssue('');
    setDone('');
  };
  /* Active ones, plus an inactive one that is still selected. */
  const offered = technologies.filter((t) => t.is_active || codes.includes(t.value));

  const save = async () => {
    if (!district || busy) return;
    if (!all && !codes.length) return setIssue('Tick at least one technology, or choose All technologies.');
    setBusy(true);
    setError('');
    setDone('');
    const wanted = all ? [] : codes;
    try {
      await api(`/manage/technologies/districts/${encodeURIComponent(district.district_id)}`, {
        method: 'PUT',
        realm: 'manage',
        body: { codes: wanted },
      });
      setDistricts((list) => list?.map((d) => (d.district_id === district.district_id ? { ...d, all, codes: wanted } : d)) ?? null);
      setDone(`Technologies of ${district.district} saved.`);
    } catch (e) {
      setError(messageOf(e, 'Could not save the technologies'));
    } finally {
      setBusy(false);
    }
  };

  const stateOf = (d: DistrictTechnologies) => (d.all ? 'All technologies' : `${d.codes.length} selected`);
  return (
    <section className="card" aria-labelledby="district-tech-title" style={{ marginTop: 24 }}>
      <h2 id="district-tech-title">District-wise technologies</h2>
      <p className="sub">
        The technologies a student can choose depend on the student&apos;s district only. A district with nothing selected offers every active
        technology.
      </p>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {done ? <Notice tone="ok">{done}</Notice> : null}
      {!districts && !error ? <div className="loading">Loading…</div> : null}
      {districts ? (
        <>
          <div className="field" style={{ maxWidth: 420 }}>
            <label htmlFor="tech-district">District</label>
            <select id="tech-district" className="inp" value={districtId} onChange={(e) => choose(e.target.value)}>
              <option value="">Select district</option>
              {districts.map((d) => (
                <option key={d.district_id} value={d.district_id}>
                  {d.district} – {stateOf(d)}
                </option>
              ))}
            </select>
          </div>
          {district ? (
            <fieldset className="field radios" style={{ marginTop: 16 }} disabled={!canEdit}>
              <legend className="label">Technologies of {district.district}</legend>
              <div className="radio-row">
                <label className="radio">
                  <input
                    type="radio"
                    name="tech-all"
                    checked={all}
                    onChange={() => {
                      setAll(true);
                      setIssue('');
                      setDone('');
                    }}
                  />
                  All technologies
                </label>
                <label className="radio">
                  <input
                    type="radio"
                    name="tech-all"
                    checked={!all}
                    onChange={() => {
                      setAll(false);
                      setDone('');
                    }}
                  />
                  Only the ticked ones
                </label>
              </div>
              {all ? null : (
                <div className="check-list">
                  {offered.map((t) => (
                    <label key={t.value} className="check-row">
                      <input type="checkbox" checked={codes.includes(t.value)} onChange={(e) => toggle(t.value, e.target.checked)} />
                      <span>
                        <span className="mono muted fs13">{t.value}</span> {t.name_en}
                        {t.is_active ? null : <span className="muted"> (inactive)</span>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {issue ? (
                <span className="err" role="alert">
                  {issue}
                </span>
              ) : null}
            </fieldset>
          ) : null}
          {district && canEdit ? (
            <div className="actions">
              <span />
              <button type="button" className="btn" onClick={() => void save()} disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/* Masters → Technologies: the technologies themselves, and which of them each district offers. */
export default function TechnologiesPage() {
  const [version, setVersion] = useState(0);
  return (
    <MastersShell>
      <MasterList kind="TECHNOLOGY" title="Technologies" onChanged={() => setVersion((v) => v + 1)} />
      <DistrictTechnologiesSection version={version} />
    </MastersShell>
  );
}
