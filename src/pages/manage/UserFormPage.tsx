import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../api';
import { Field, Notice, PasswordInput } from '../../components/ui';
import type { ManageRole, ManageUser } from '../../types';
import { manageUserIssues, type ManageUserForm } from '../../validation';
import { ManageShell } from './ManageLayout';

const ROLES: { value: ManageRole; label: string }[] = [
  { value: 'VIEWER', label: 'Viewer – can only view and download' },
  { value: 'ADMIN', label: 'Admin – full access' },
];

/* Add user (/manage/users/new): POST /manage/users, then back to Users. */
export default function UserFormPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<ManageUserForm>({ name: '', email: '', password: '', role: 'VIEWER' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof ManageUserForm>(k: K, v: ManageUserForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const save = async () => {
    if (busy) return;
    const local = manageUserIssues(form);
    setErrors(local);
    if (Object.keys(local).length) {
      setFailure('Please correct the highlighted fields.');
      return;
    }
    setBusy(true);
    setFailure('');
    try {
      const res = await api<ManageUser>('/manage/users', {
        method: 'POST',
        realm: 'manage',
        body: { name: form.name.trim(), email: form.email.trim(), password: form.password, role: form.role },
      });
      navigate('/manage/users', { state: { flash: `User ${res.data?.name ?? form.name.trim()} added.` } });
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError) {
        const fields = err.fields();
        if (Object.keys(fields).length) setErrors(fields);
        setFailure(err.status === 422 && Object.keys(fields).length ? 'Please correct the highlighted fields.' : err.message);
      } else setFailure('Could not add the user');
    }
  };

  return (
    <ManageShell>
      <p className="mt8">
        <Link to="/manage/users">← Back to Users</Link>
      </p>
      <section className="card" aria-labelledby="user-form-title">
        <h2 id="user-form-title">Add user</h2>
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
            <Field id="u-name" label="Name" error={errors.name}>
              <input
                id="u-name"
                className="inp"
                value={form.name}
                maxLength={150}
                autoComplete="off"
                onChange={(e) => set('name', e.target.value)}
                aria-invalid={!!errors.name || undefined}
              />
            </Field>
            <Field id="u-email" label="Email" error={errors.email}>
              <input
                id="u-email"
                className="inp"
                type="email"
                value={form.email}
                maxLength={254}
                autoComplete="off"
                onChange={(e) => set('email', e.target.value)}
                aria-invalid={!!errors.email || undefined}
              />
            </Field>
            <Field id="u-password" label="Password" error={errors.password} hint="8–72 characters, with at least one letter and one digit.">
              <PasswordInput
                id="u-password"
                value={form.password}
                onChange={(v) => set('password', v)}
                invalid={!!errors.password}
                autoComplete="new-password"
              />
            </Field>
            <fieldset className="field radios" aria-describedby={errors.role ? 'u-role-err' : undefined}>
              <legend className="label">
                Role <span className="req">*</span>
              </legend>
              <div className="radio-row">
                {ROLES.map((r) => (
                  <label key={r.value} className="radio">
                    <input
                      type="radio"
                      name="u-role"
                      value={r.value}
                      checked={form.role === r.value}
                      onChange={() => set('role', r.value)}
                    />
                    {r.label}
                  </label>
                ))}
              </div>
              {errors.role ? (
                <span className="err" role="alert" id="u-role-err">
                  {errors.role}
                </span>
              ) : null}
            </fieldset>
          </div>
          <div className="actions">
            <Link className="btn ghost" to="/manage/users">
              Cancel
            </Link>
            <button type="submit" className="btn" disabled={busy}>
              {busy ? 'Adding…' : 'Add user'}
            </button>
          </div>
        </form>
      </section>
    </ManageShell>
  );
}
