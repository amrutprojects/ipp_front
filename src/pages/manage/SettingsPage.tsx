import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api';
import { DEFAULT_SUPPORT_MESSAGE, SupportMessage } from '../../components/SupportMessage';
import { Field, fmtDate, Notice } from '../../components/ui';
import { useCanEdit } from '../../session';
import type { SupportSettings } from '../../types';
import { supportIssues, type SupportForm } from '../../validation';
import { ManageShell } from './ManageLayout';

const toForm = (s: SupportSettings): SupportForm => ({ message: s.message ?? '', email: s.email ?? '', mobile: s.mobile ?? '' });

/*
 * Settings (/manage/settings): the support contact line students see after submitting. GET /manage/settings/support
 * for everyone; Save (PUT) for an admin only, a viewer sees the values read-only.
 */
export default function SettingsPage() {
  const canEdit = useCanEdit();
  const [saved, setSaved] = useState<SupportSettings | null>(null);
  const [form, setForm] = useState<SupportForm>({ message: '', email: '', mobile: '' });
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api<SupportSettings>('/manage/settings/support', { realm: 'manage' })
      .then((r) => {
        if (!live) return;
        setSaved(r.data);
        setForm(toForm(r.data));
      })
      .catch((e: Error) => live && setLoadError(e.message || 'Could not load the settings'));
    return () => {
      live = false;
    };
  }, []);

  const set = <K extends keyof SupportForm>(k: K, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setFlash('');
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const save = async () => {
    if (busy || !canEdit) return;
    const local = supportIssues(form);
    setErrors(local);
    setFlash('');
    if (Object.keys(local).length) {
      setFailure('Please correct the highlighted fields.');
      return;
    }
    setBusy(true);
    setFailure('');
    try {
      const res = await api<SupportSettings>('/manage/settings/support', {
        method: 'PUT',
        realm: 'manage',
        body: { message: form.message.trim(), email: form.email.trim() || null, mobile: form.mobile.trim() || null },
      });
      setSaved(res.data);
      setForm(toForm(res.data));
      setFlash('Support contact saved.');
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fields();
        if (Object.keys(fields).length) setErrors(fields);
        setFailure(err.status === 422 && Object.keys(fields).length ? 'Please correct the highlighted fields.' : err.message);
      } else setFailure('Could not save the settings');
    } finally {
      setBusy(false);
    }
  };

  const preview = { message: form.message, email: form.email.trim() || null, mobile: form.mobile.trim() || null };

  return (
    <ManageShell>
      <section className="card" aria-labelledby="settings-title">
        <h2 id="settings-title">Support contact</h2>
        <p className="sub">The contact line students see after submitting their registration.</p>
        {loadError ? <Notice tone="error">{loadError}</Notice> : null}
        {!saved && !loadError ? <div className="loading">Loading…</div> : null}
        {saved ? (
          <>
            {!canEdit ? (
              <Notice tone="info">View only: your account can see these settings but not change them.</Notice>
            ) : null}
            {flash ? <Notice tone="ok">{flash}</Notice> : null}
            {failure ? <Notice tone="error">{failure}</Notice> : null}
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <div className="grid">
                <Field
                  id="s-message"
                  label="Message"
                  wide
                  error={errors.message}
                  hint="Use {email} and {mobile} where the email and mobile number should appear."
                >
                  <textarea
                    id="s-message"
                    className="inp"
                    value={form.message}
                    maxLength={500}
                    readOnly={!canEdit}
                    onChange={(e) => set('message', e.target.value)}
                    aria-invalid={!!errors.message || undefined}
                  />
                </Field>
                <Field id="s-email" label="Email" required={false} error={errors.email}>
                  <input
                    id="s-email"
                    className="inp"
                    type="email"
                    value={form.email}
                    maxLength={254}
                    autoComplete="off"
                    readOnly={!canEdit}
                    onChange={(e) => set('email', e.target.value)}
                    aria-invalid={!!errors.email || undefined}
                  />
                </Field>
                <Field id="s-mobile" label="Mobile" required={false} error={errors.mobile}>
                  <input
                    id="s-mobile"
                    className="inp"
                    type="tel"
                    value={form.mobile}
                    maxLength={20}
                    autoComplete="off"
                    readOnly={!canEdit}
                    onChange={(e) => set('mobile', e.target.value)}
                    aria-invalid={!!errors.mobile || undefined}
                  />
                </Field>
              </div>
              <div className="mt16" role="group" aria-labelledby="s-preview-title">
                <h3 id="s-preview-title">Preview</h3>
                {preview.message.trim() ? (
                  <Notice tone="info">
                    <SupportMessage support={preview} />
                  </Notice>
                ) : (
                  <p className="hint">No message: students will not see a support contact.</p>
                )}
              </div>
              {saved.updated_at ? (
                <p className="hint">
                  Last updated {fmtDate(saved.updated_at)}
                  {saved.updated_by ? ` by ${saved.updated_by}` : ''}
                </p>
              ) : null}
              {canEdit ? (
                <div className="actions">
                  <button type="button" className="btn ghost" onClick={() => set('message', DEFAULT_SUPPORT_MESSAGE)} disabled={busy}>
                    Reset to default text
                  </button>
                  <button type="submit" className="btn" disabled={busy}>
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                </div>
              ) : null}
            </form>
          </>
        ) : null}
      </section>
    </ManageShell>
  );
}
