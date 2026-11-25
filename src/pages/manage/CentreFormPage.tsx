import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api';
import { Field, Notice, useRemoteList } from '../../components/ui';
import type { Centre, GeoRef } from '../../types';
import { centreIssues, type CentreForm } from '../../validation';
import { MastersShell } from './ManageLayout';

const EMPTY: CentreForm = {
  name: '',
  code: '',
  stateId: '',
  districtId: '',
  talukaId: '',
  address: '',
  pinCode: '',
  contactPerson: '',
  contactNumber: '',
  email: '',
};
const fromCentre = (c: Centre): CentreForm => ({
  name: c.name,
  code: c.code,
  stateId: c.stateId,
  districtId: c.districtId,
  talukaId: c.talukaId ?? '',
  address: c.address ?? '',
  pinCode: c.pinCode ?? '',
  contactPerson: c.contactPerson ?? '',
  contactNumber: c.contactNumber ?? '',
  email: c.email ?? '',
});
/* A centre's own technologies are no longer asked: they depend on the student's district (Masters → Technologies). */
// const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/* Add (/manage/centres/new) or edit (/manage/centres/:id/edit) a centre. */
export default function CentreFormPage() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const [centre, setCentre] = useState<Centre | null>(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState<CentreForm>(EMPTY);
  // const [technologyCodes, setTechnologyCodes] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let live = true;
    api<Centre>(`/manage/centres/${encodeURIComponent(id)}`, { realm: 'manage' })
      .then((r) => {
        if (!live) return;
        setCentre(r.data);
        setForm(fromCentre(r.data));
        // setTechnologyCodes(r.data.technologies.map((t) => t.code));
      })
      .catch((e: Error) => live && setLoadError(e.message || 'Could not load the center'));
    return () => {
      live = false;
    };
  }, [id]);

  const states = useRemoteList<GeoRef>('/geography/states');
  const districts = useRemoteList<GeoRef>(form.stateId ? `/geography/states/${encodeURIComponent(form.stateId)}/districts` : null);
  const talukas = useRemoteList<GeoRef>(form.districtId ? `/geography/districts/${encodeURIComponent(form.districtId)}/talukas` : null);
  // const technologyOptions = useRemoteList<TechnologyOption>('/manage/technology-options', 'manage');
  //
  // /* The allocatable technologies, plus any already allocated that can no longer be (marked inactive). */
  // const technologyRows = useMemo(() => {
  //   const rows = technologyOptions.items.map((t) => ({ ...t, usable: true }));
  //   for (const t of centre?.technologies ?? []) if (!rows.some((r) => r.code === t.code)) rows.push({ ...t, usable: false });
  //   return rows;
  // }, [technologyOptions.items, centre]);

  const set = (k: keyof CentreForm) => (v: string) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === 'stateId') {
        next.districtId = '';
        next.talukaId = '';
      }
      if (k === 'districtId') next.talukaId = '';
      return next;
    });
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };
  // const toggleTechnology = (code: string, on: boolean) => {
  //   setTechnologyCodes((codes) => (on ? [...codes, code] : codes.filter((x) => x !== code)));
  //   setErrors((e) => ({ ...e, technologyCodes: '' }));
  // };

  /* A saved state / district / taluka that is no longer active still shows as chosen. */
  const withCurrent = (items: GeoRef[], idValue: string, name: string | null | undefined) =>
    idValue && name && !items.some((x) => x.id === idValue) ? [...items, { id: idValue, name: `${name} (inactive)`, code: '' }] : items;
  const stateItems = withCurrent(states.items, form.stateId, centre?.stateId === form.stateId ? centre?.stateName : null);
  const districtItems = withCurrent(districts.items, form.districtId, centre?.districtId === form.districtId ? centre?.districtName : null);
  const talukaItems = withCurrent(talukas.items, form.talukaId, centre?.talukaId === form.talukaId ? centre?.talukaName : null);

  const save = async () => {
    const local = centreIssues(form);
    setErrors(local);
    if (Object.keys(local).length) {
      setFailure('Please correct the highlighted fields.');
      return;
    }
    setBusy(true);
    setFailure('');
    const blank = (v: string) => (v.trim() ? v.trim() : editing ? null : undefined);
    const body: Record<string, unknown> = {
      stateId: form.stateId || undefined,
      districtId: form.districtId,
      talukaId: form.talukaId || (editing ? null : undefined),
      name: form.name.trim().replace(/\s+/g, ' '),
      code: form.code.trim().toUpperCase(),
      address: blank(form.address),
      pinCode: blank(form.pinCode),
      contactPerson: blank(form.contactPerson),
      contactNumber: blank(form.contactNumber),
      email: blank(form.email),
    };
    // /* On edit, technologyCodes replaces the allocation: sent only when it was changed. */
    // if (!editing || !sameSet(technologyCodes, centre?.technologies.map((t) => t.code) ?? [])) body.technologyCodes = technologyCodes;
    if (!editing) body.isActive = isActive;
    try {
      const res = await api<Centre>(editing ? `/manage/centres/${encodeURIComponent(id!)}` : '/manage/centres', {
        method: editing ? 'PATCH' : 'POST',
        realm: 'manage',
        body,
      });
      navigate(`/manage/centres/${res.data.id}`, { state: { flash: editing ? 'Center updated.' : 'Center created.' } });
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError) {
        const fields = err.fields();
        if (Object.keys(fields).length) setErrors(fields);
        setFailure(err.status === 422 && Object.keys(fields).length ? 'Please correct the highlighted fields.' : err.message);
      } else setFailure('Could not save the center');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const f = (k: keyof CentreForm, label: string, control: ReactNode, opts: { required?: boolean; wide?: boolean; hint?: ReactNode } = {}) => (
    <Field id={`c-${k}`} label={label} error={errors[k]} required={opts.required ?? false} wide={opts.wide} hint={opts.hint}>
      {control}
    </Field>
  );
  const text = (k: keyof CentreForm, extra: Record<string, unknown> = {}) => (
    <input
      id={`c-${k}`}
      className="inp"
      value={form[k]}
      onChange={(e) => set(k)(e.target.value)}
      aria-invalid={!!errors[k] || undefined}
      {...extra}
    />
  );
  const select = (k: keyof CentreForm, items: GeoRef[], placeholder: string, disabled = false) => (
    <select
      id={`c-${k}`}
      className="inp"
      value={form[k]}
      onChange={(e) => set(k)(e.target.value)}
      aria-invalid={!!errors[k] || undefined}
      disabled={disabled}
    >
      <option value="">{placeholder}</option>
      {items.map((x) => (
        <option key={x.id} value={x.id}>
          {x.name}
        </option>
      ))}
    </select>
  );

  const title = editing ? `Edit center${centre ? ` – ${centre.name}` : ''}` : 'Add center';
  const ready = !editing || !!centre;

  return (
    <MastersShell wide={false}>
      <p className="mt8">
        <Link to={editing ? `/manage/centres/${id}` : '/manage/centres'}>← {editing ? 'Back to the center' : 'Back to Center Master'}</Link>
      </p>
      {loadError ? <Notice tone="error">{loadError}</Notice> : null}
      {!ready && !loadError ? <div className="loading">Loading…</div> : null}
      {ready ? (
        <section className="card" aria-labelledby="centre-form-title">
          <h2 id="centre-form-title">{title}</h2>
          <p className="sub">Fields marked * are mandatory.</p>
          {failure ? <Notice tone="error">{failure}</Notice> : null}
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="grid">
              {f('name', 'Center Name', text('name', { maxLength: 150 }), { required: true })}
              {f(
                'code',
                'Code',
                text('code', {
                  maxLength: 20,
                  className: 'inp mono',
                  onChange: (e: ChangeEvent<HTMLInputElement>) => set('code')(e.target.value.toUpperCase()),
                }),
                { required: true, hint: 'A–Z, 0–9 and hyphen, starting with a letter (e.g. PUN-01).' },
              )}
              {f(
                'stateId',
                'State',
                select('stateId', stateItems, states.status === 'loading' ? 'Loading states…' : 'Select state', states.status === 'loading'),
                { required: true, hint: states.status === 'error' ? 'Could not load the states.' : undefined },
              )}
              {f(
                'districtId',
                'District',
                select(
                  'districtId',
                  districtItems,
                  !form.stateId ? 'Select a state first' : districts.status === 'loading' ? 'Loading districts…' : 'Select district',
                  !form.stateId || districts.status === 'loading',
                ),
                {
                  required: true,
                  hint:
                    districts.status === 'error'
                      ? 'Could not load the districts.'
                      : form.stateId && districts.status === 'ok' && !districtItems.length
                        ? 'No districts in this state.'
                        : undefined,
                },
              )}
              {f(
                'talukaId',
                'Taluka',
                select(
                  'talukaId',
                  talukaItems,
                  !form.districtId ? 'Select a district first' : talukas.status === 'loading' ? 'Loading talukas…' : 'Select taluka (optional)',
                  !form.districtId || talukas.status === 'loading',
                ),
                {
                  hint:
                    talukas.status === 'error'
                      ? 'Could not load the talukas.'
                      : form.districtId && talukas.status === 'ok' && !talukaItems.length
                        ? 'No talukas in this district.'
                        : undefined,
                },
              )}
              {f(
                'pinCode',
                'PIN Code',
                text('pinCode', {
                  inputMode: 'numeric',
                  maxLength: 6,
                  onChange: (e: ChangeEvent<HTMLInputElement>) => set('pinCode')(e.target.value.replace(/\D/g, '').slice(0, 6)),
                }),
              )}
              {f(
                'address',
                'Address',
                <textarea
                  id="c-address"
                  className="inp"
                  maxLength={300}
                  value={form.address}
                  onChange={(e) => set('address')(e.target.value)}
                  aria-invalid={!!errors.address || undefined}
                />,
                { wide: true },
              )}
              {f('contactPerson', 'Contact Person', text('contactPerson', { maxLength: 120 }))}
              {f('contactNumber', 'Contact Number', text('contactNumber', { type: 'tel', maxLength: 20 }))}
              {f('email', 'Email', text('email', { type: 'email', maxLength: 254 }))}
              {!editing ? (
                <div className="field">
                  <label htmlFor="c-isActive">Status</label>
                  <select id="c-isActive" className="inp" value={isActive ? 'true' : 'false'} onChange={(e) => setIsActive(e.target.value === 'true')}>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              ) : null}
              {/* A centre's own technologies are no longer asked: they depend on the student's district.
              <fieldset className="field wide radios" aria-describedby={errors.technologyCodes ? 'c-technologyCodes-err' : 'c-technologyCodes-hint'}>
                <legend className="label">Allocated Technologies ({technologyCodes.length} selected)</legend>
                {technologyOptions.status === 'loading' ? (
                  <div className="hint">Loading technologies…</div>
                ) : technologyOptions.status === 'error' ? (
                  <Notice tone="error">Could not load the technologies.</Notice>
                ) : technologyRows.length === 0 ? (
                  <div className="hint">No technologies are available.</div>
                ) : (
                  <div className="check-list">
                    {technologyRows.map((t) => (
                      <label key={t.code} className="check-row">
                        <input
                          type="checkbox"
                          checked={technologyCodes.includes(t.code)}
                          disabled={!t.usable && !technologyCodes.includes(t.code)}
                          onChange={(e) => toggleTechnology(t.code, e.target.checked)}
                        />
                        <span>
                          <span className="mono muted fs13">{t.code}</span> {t.name}
                          {t.usable ? null : <span className="muted"> (inactive)</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                {errors.technologyCodes ? (
                  <span className="err" role="alert" id="c-technologyCodes-err">
                    {errors.technologyCodes}
                  </span>
                ) : (
                  <span className="hint" id="c-technologyCodes-hint">
                    Students choosing this center can pick only these technologies. Inactive technologies can be removed but not added.
                  </span>
                )}
              </fieldset>
              */}
            </div>
            <div className="actions">
              <Link className="btn ghost" to={editing ? `/manage/centres/${id}` : '/manage/centres'}>
                Cancel
              </Link>
              <button type="submit" className="btn" disabled={busy}>
                {busy ? 'Saving…' : editing ? 'Save changes' : 'Create center'}
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </MastersShell>
  );
}
