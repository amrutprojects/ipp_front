import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { AuthLayout } from '../components/AuthLayout';
import { Field, Notice, PasswordInput } from '../components/ui';
import { serverMessage, toFailure, useLang, type Failure, type Pick } from '../i18n';
import { useStudent } from '../session';
import { rememberSignupPassword } from '../signup';
import type { Session } from '../types';
import { emailIssue } from '../validation';

function check(email: string, password: string, T: Pick): Record<string, string> {
  const e: Record<string, string> = {};
  const emailErr = emailIssue(email, T);
  if (emailErr) e.email = emailErr;
  if (!password) e.password = T('पासवर्ड आवश्यक आहे', 'Password is required');
  return e;
}

export default function LoginPage() {
  const { user, signIn } = useStudent();
  const { T } = useLang();
  const navigate = useNavigate();
  /* After a password reset: the account's email and a "password changed" message. */
  const arrived = (useLocation().state ?? {}) as { passwordChanged?: boolean; email?: string };
  const [email, setEmail] = useState(arrived.email ?? '');
  const [password, setPassword] = useState('');
  /* Kept as data and turned into text when drawn, so switching language translates what is shown. */
  const [submitted, setSubmitted] = useState(false);
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/application" replace />;
  const errors = { ...(submitted ? check(email, password, T) : {}), ...serverFields };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerFields({});
    setFailure(null);
    if (Object.keys(check(email, password, T)).length) return;
    setBusy(true);
    try {
      const { data } = await api<Session>('/auth/login', { method: 'POST', body: { email, password } });
      signIn(data.token, data.account);
      navigate('/application', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
        /* The OTP page sends this (correct) password with the OTP. */
        rememberSignupPassword(email, password);
        navigate(`/verify?email=${encodeURIComponent(email.trim().toLowerCase())}`, { state: { notice: toFailure(err, 'LOGIN_FAILED') } });
        return;
      }
      if (err instanceof ApiError && err.details.length) setServerFields(err.fields());
      setFailure(toFailure(err, 'LOGIN_FAILED'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <h1>{T('विद्यार्थी लॉगिन', 'Student login')}</h1>
      <p className="sub">
        {T(
          'आपला फॉर्म भरण्यासाठी किंवा पाहण्यासाठी खात्याचा ईमेल आयडी व पासवर्ड वापरा.',
          'Log in with the email ID and password of your account to fill in or view your registration form.',
        )}
      </p>
      <form onSubmit={submit} noValidate>
        {failure ? (
          <Notice tone="error">{serverMessage(T, failure)}</Notice>
        ) : arrived.passwordChanged ? (
          <Notice tone="ok">
            {T('आपला पासवर्ड बदलला आहे. कृपया नवीन पासवर्डने लॉगिन करा.', 'Your password has been changed. Please log in with your new password.')}
          </Notice>
        ) : null}
        <div className="grid one">
          <Field id="login-email" label={T('ईमेल आयडी', 'Email ID')} error={errors.email}>
            <input
              id="login-email"
              className="inp"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setServerFields(({ email: _e, ...rest }) => rest);
              }}
              aria-invalid={!!errors.email || undefined}
              autoFocus
            />
          </Field>
          <Field id="login-password" label={T('पासवर्ड', 'Password')} error={errors.password}>
            <PasswordInput
              id="login-password"
              value={password}
              onChange={(v) => {
                setPassword(v);
                setServerFields(({ password: _p, ...rest }) => rest);
              }}
              invalid={!!errors.password}
              autoComplete="current-password"
            />
          </Field>
        </div>
        <p className="forgot-row">
          <Link to="/forgot-password" state={{ email: email.trim().toLowerCase() }}>
            {T('पासवर्ड विसरलात?', 'Forgot password?')}
          </Link>
        </p>
        <button className="btn block mt16" type="submit" disabled={busy}>
          {busy ? T('लॉगिन होत आहे…', 'Logging in…') : T('लॉगिन करा', 'Login')}
        </button>
      </form>
      <div className="sep" />
      <p className="center fs13" style={{ margin: 0 }}>
        {T('कार्यक्रमात नवीन आहात?', 'New to the programme?')} <Link to="/register">{T('खाते तयार करा', 'Create an account')}</Link>
      </p>
      <p className="disclaim center mt16">{T('आपला पासवर्ड कोणालाही सांगू नका.', 'Never share your password with anyone.')}</p>
    </AuthLayout>
  );
}
