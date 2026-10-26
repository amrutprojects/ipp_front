import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { AuthLayout } from '../components/AuthLayout';
import { Field, Notice, PasswordInput } from '../components/ui';
import { serverMessage, toFailure, useLang, type Failure, type Pick } from '../i18n';
import { useStudent } from '../session';
import { rememberSignupPassword } from '../signup';
import type { OtpTiming } from '../types';
import { emailIssue, mobileIssue, nameIssue, passwordIssue } from '../validation';

const EMPTY = { first_name: '', middle_name: '', last_name: '', email: '', mobile_number: '', password: '', confirm_password: '' };
type Values = typeof EMPTY;

function check(v: Values, T: Pick): Record<string, string> {
  const e: Record<string, string> = {};
  const set = (k: keyof Values, issue: string | null) => issue && (e[k] = issue);
  set('first_name', nameIssue('First name', v.first_name, 100, true, T, 'पहिले नाव'));
  set('middle_name', nameIssue('Middle name', v.middle_name, 100, false, T, 'मधले नाव'));
  set('last_name', nameIssue('Last name', v.last_name, 100, true, T, 'आडनाव'));
  set('email', emailIssue(v.email, T));
  set('mobile_number', mobileIssue(v.mobile_number, T));
  set('password', passwordIssue(v.password, T));
  if (!v.confirm_password) e.confirm_password = T('कृपया पासवर्ड पुन्हा टाका', 'Please re-enter the password');
  else if (v.password !== v.confirm_password) e.confirm_password = T('पासवर्ड जुळत नाहीत', 'Passwords do not match');
  return e;
}

export default function RegisterPage() {
  const { user } = useStudent();
  const { T } = useLang();
  const navigate = useNavigate();
  const [v, setV] = useState<Values>(EMPTY);
  /* Kept as data and turned into text when drawn, so switching language translates what is shown. */
  const [submitted, setSubmitted] = useState(false);
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/application" replace />;
  const errors = { ...(submitted ? check(v, T) : {}), ...serverFields };

  const set = (k: keyof Values) => (value: string) => {
    setV((old) => ({ ...old, [k]: value }));
    setServerFields((old) => {
      const { [k]: _gone, ...rest } = old;
      return rest;
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerFields({});
    setFailure(null);
    if (Object.keys(check(v, T)).length) return;
    setBusy(true);
    try {
      const { data } = await api<OtpTiming>('/auth/register', {
        method: 'POST',
        body: { ...v, middle_name: v.middle_name.trim() || undefined },
      });
      /* The OTP page sends the password with the OTP (kept in memory only), and starts from this timing. */
      rememberSignupPassword(data.email, v.password);
      navigate(`/verify?email=${encodeURIComponent(data.email)}`, {
        state: { expiresIn: data.otp_expires_in, resendAfter: data.resend_after, receivedAt: Date.now() },
      });
    } catch (err) {
      if (err instanceof ApiError && err.details.length) setServerFields(err.fields());
      setFailure(toFailure(err, 'SIGNUP_FAILED'));
    } finally {
      setBusy(false);
    }
  };

  const input = (
    k: keyof Values,
    label: string,
    type = 'text',
    opts: { required?: boolean; autoComplete?: string; hint?: string; autoFocus?: boolean } = {},
  ) => (
    <Field id={`reg-${k}`} label={label} error={errors[k]} required={opts.required ?? true} hint={opts.hint}>
      <input
        id={`reg-${k}`}
        className="inp"
        type={type}
        value={v[k]}
        onChange={(e) => set(k)(e.target.value)}
        aria-invalid={!!errors[k] || undefined}
        autoComplete={opts.autoComplete}
        autoFocus={opts.autoFocus}
        inputMode={k === 'mobile_number' ? 'tel' : undefined}
        maxLength={k === 'email' ? 254 : k === 'mobile_number' ? 15 : 100}
      />
    </Field>
  );

  return (
    <AuthLayout wide>
      <h1>{T('खाते तयार करा', 'Create account')}</h1>
      <p className="sub">
        {T('येथे खाते तयार करा, नंतर ', 'Create your account here, then use your ')}
        <b>{T('आपला ईमेल आयडी व पासवर्ड वापरून प्रोफाइलमध्ये लॉगिन करा', 'email ID and password to log in to your profile')}</b>
        {T(' आणि नोंदणी फॉर्म भरा.', ' and fill in the registration form.')}
      </p>
      <form onSubmit={submit} noValidate>
        {failure ? <Notice tone="error">{serverMessage(T, failure)}</Notice> : null}
        <p className="hint" style={{ margin: '0 0 10px' }}>
          <span className="req">*</span> {T('असलेली माहिती आवश्यक आहे.', 'Required field.')}
        </p>
        <div className="grid three">
          {input('first_name', T('पहिले नाव', 'First Name'), 'text', { autoComplete: 'given-name', autoFocus: true })}
          {input('middle_name', T('मधले नाव', 'Middle Name'), 'text', { required: false, autoComplete: 'additional-name' })}
          {input('last_name', T('आडनाव', 'Last Name'), 'text', { autoComplete: 'family-name' })}
        </div>
        <div className="grid mt16">
          {input('email', T('ईमेल आयडी', 'Email ID'), 'email', {
            autoComplete: 'email',
            hint: T('या ईमेलवर OTP पाठवला जाईल.', 'An OTP will be sent to this email address.'),
          })}
          {input('mobile_number', T('मोबाईल क्रमांक', 'Mobile Number'), 'tel', {
            autoComplete: 'tel',
            hint: T('१० अंकी मोबाईल क्रमांक', '10-digit mobile number'),
          })}
          <Field
            id="reg-password"
            label={T('पासवर्ड', 'Password')}
            error={errors.password}
            hint={T(
              'किमान ८ वर्ण, त्यात किमान एक इंग्रजी अक्षर (A–Z) व एक अंक (0–9).',
              'At least 8 characters, with a letter and a digit.',
            )}
          >
            <PasswordInput id="reg-password" value={v.password} onChange={set('password')} invalid={!!errors.password} autoComplete="new-password" />
          </Field>
          <Field id="reg-confirm_password" label={T('पासवर्ड पुन्हा टाका', 'Re-enter Password')} error={errors.confirm_password}>
            <PasswordInput
              id="reg-confirm_password"
              value={v.confirm_password}
              onChange={set('confirm_password')}
              invalid={!!errors.confirm_password}
              autoComplete="new-password"
            />
          </Field>
        </div>
        <div className="notice warn mt16" style={{ marginBottom: 0 }}>
          <b>{T('आपला पासवर्ड सुरक्षित ठेवा.', 'Keep your password safe.')}</b>{' '}
          {T(
            'प्रत्येक वेळी प्रोफाइलमध्ये लॉगिन करताना आपला ईमेल आयडी व हा पासवर्ड लागेल. तो कोणालाही सांगू नका.',
            'You will need your email ID and this password every time you log in to your profile. Do not share it with anyone.',
          )}
        </div>
        <button className="btn block mt16" type="submit" disabled={busy}>
          {busy ? T('खाते तयार होत आहे…', 'Creating account…') : T('खाते तयार करा', 'Create account')}
        </button>
      </form>
      <div className="sep" />
      <p className="center fs13" style={{ margin: 0 }}>
        {T('आधीच खाते आहे?', 'Already have an account?')} <Link to="/login">{T('लॉगिन करा', 'Login')}</Link>
      </p>
    </AuthLayout>
  );
}
