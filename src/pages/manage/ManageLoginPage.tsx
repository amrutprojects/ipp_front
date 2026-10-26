import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { AuthLayout } from '../../components/AuthLayout';
import { Field, Notice, PasswordInput } from '../../components/ui';
import { serverMessage, toFailure, useLang, type Failure } from '../../i18n';
import { useManage } from '../../session';

interface ManageSession {
  token: string;
  admin: { id: string; name: string; email: string };
}

export default function ManageLoginPage() {
  const { user, signIn } = useManage();
  const { T } = useLang();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  /* Kept as data and turned into text when drawn, so switching language translates what is shown. */
  const [failure, setFailure] = useState<Failure | 'missing' | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/manage" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFailure(null);
    if (!email.trim() || !password) return setFailure('missing');
    setBusy(true);
    try {
      const { data } = await api<ManageSession>('/manage/auth/login', { method: 'POST', body: { email, password } });
      signIn(data.token, data.admin);
      navigate('/manage', { replace: true });
    } catch (err) {
      setFailure(toFailure(err, 'LOGIN_FAILED'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout panel="manage">
      <h1>{T('ट्रॅकिंग पॅनेलमध्ये लॉगिन करा', 'Log in to the tracking panel')}</h1>
      <p className="sub">
        {T(
          'EDP टीमसाठी: खाते तयार होण्यापासून फॉर्म सबमिट होईपर्यंत प्रत्येक विद्यार्थ्याचा मागोवा घ्या.',
          'For the EDP programme team: track every student from account creation to submission.',
        )}
      </p>
      <form onSubmit={submit} noValidate>
        {failure ? (
          <Notice tone="error">
            {failure === 'missing' ? T('ईमेल आयडी आणि पासवर्ड आवश्यक आहेत.', 'Email ID and password are required.') : serverMessage(T, failure)}
          </Notice>
        ) : null}
        <div className="grid one">
          <Field id="m-email" label={T('ईमेल आयडी', 'Email ID')}>
            <input id="m-email" className="inp" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          <Field id="m-password" label={T('पासवर्ड', 'Password')}>
            <PasswordInput id="m-password" value={password} onChange={setPassword} autoComplete="current-password" />
          </Field>
        </div>
        <button className="btn block mt16" type="submit" disabled={busy}>
          {busy ? T('लॉगिन होत आहे…', 'Logging in…') : T('लॉगिन करा', 'Login')}
        </button>
      </form>
      <div className="sep" />
      <p className="disclaim center" style={{ margin: 0 }}>
        {T('हे पॅनेल फक्त EDP टीमसाठी आहे.', 'This panel is for the EDP programme team only.')}
      </p>
    </AuthLayout>
  );
}
