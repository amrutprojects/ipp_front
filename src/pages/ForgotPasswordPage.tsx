import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { AuthLayout } from '../components/AuthLayout';
import { Field, Notice } from '../components/ui';
import { serverMessage, toFailure, useLang, type Failure } from '../i18n';
import { emailIssue } from '../validation';

interface LinkSent {
  email: string;
  link_valid_minutes: number;
  resend_after: number;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/*
 * Forgot password: emails a link to set a new password to the account's email ID (registered email IDs only; for any
 * other the API says it is not registered). Another link can be asked for after a minute.
 */
export default function ForgotPasswordPage() {
  const { T } = useLang();
  const location = useLocation();
  const [email, setEmail] = useState(((location.state ?? {}) as { email?: string }).email ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<(LinkSent & { againAt: number }) | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!sent) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [sent]);
  const wait = sent ? Math.max(0, Math.ceil((sent.againAt - now) / 1000)) : 0;
  const error = submitted ? emailIssue(email, T) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setFailure(null);
    setSent(null);
    if (emailIssue(email, T)) return;
    setBusy(true);
    try {
      const { data } = await api<LinkSent>('/auth/forgot-password', { method: 'POST', body: { email } });
      setSent({ ...data, againAt: Date.now() + data.resend_after * 1000 });
      setNow(Date.now());
    } catch (err) {
      setFailure(toFailure(err, 'FORGOT_FAILED'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <h1>{T('पासवर्ड विसरलात?', 'Forgot password?')}</h1>
      <p className="sub">
        {T(
          'आपल्या खात्याचा ईमेल आयडी टाका. नवीन पासवर्ड सेट करण्याची लिंक त्या ईमेलवर पाठवली जाईल.',
          'Enter the email ID of your account. We will send a link to set a new password to that email.',
        )}
      </p>
      <form onSubmit={submit} noValidate>
        {failure ? <Notice tone="error">{serverMessage(T, failure)}</Notice> : null}
        {sent ? (
          <Notice tone="ok">
            {T(
              `${sent.email} वर पासवर्ड बदलण्याची लिंक पाठवली आहे. ती ${sent.link_valid_minutes} मिनिटांसाठी वैध आहे. ईमेल दिसत नसल्यास स्पॅम फोल्डर तपासा.`,
              `A password reset link has been sent to ${sent.email}. The link is valid for ${sent.link_valid_minutes} minutes. If you do not see the email, check the spam folder.`,
            )}
          </Notice>
        ) : null}
        <Field id="forgot-email" label={T('ईमेल आयडी', 'Email ID')} error={error ?? undefined}>
          <input
            id="forgot-email"
            className="inp"
            type="email"
            autoComplete="email"
            maxLength={254}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (failure?.code === 'EMAIL_NOT_REGISTERED') setFailure(null);
            }}
            aria-invalid={!!error || failure?.code === 'EMAIL_NOT_REGISTERED' || undefined}
            autoFocus
          />
        </Field>
        <button className="btn block mt16" type="submit" disabled={busy || wait > 0}>
          {busy
            ? T('पाठवत आहे…', 'Sending…')
            : !sent
              ? T('पासवर्ड बदलण्याची लिंक पाठवा', 'Send password reset link')
              : wait > 0
                ? T(`${clock(wait)} नंतर लिंक पुन्हा पाठवता येईल`, `Send the link again in ${clock(wait)}`)
                : T('लिंक पुन्हा पाठवा', 'Send the link again')}
        </button>
      </form>
      <div className="sep" />
      <p className="center fs13" style={{ margin: 0 }}>
        {T('पासवर्ड आठवला?', 'Remembered your password?')} <Link to="/login">{T('लॉगिनवर परत जा', 'Back to login')}</Link>
      </p>
    </AuthLayout>
  );
}
