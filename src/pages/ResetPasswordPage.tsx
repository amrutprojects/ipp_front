import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { AuthLayout } from '../components/AuthLayout';
import { Field, Notice, PasswordInput } from '../components/ui';
import { serverMessage, toFailure, useLang, type Failure, type Pick } from '../i18n';
import { useStudent } from '../session';
import { passwordIssue } from '../validation';

const EMPTY = { password: '', confirm_password: '' };
type Values = typeof EMPTY;
/* bad: the link cannot be used (ask for a new one); retry: the check itself failed (network, busy server), try again. */
type LinkState =
  | { kind: 'checking' }
  | { kind: 'ready'; email: string }
  | { kind: 'bad'; failure: Failure }
  | { kind: 'retry'; failure: Failure };
const isLinkProblem = (err: unknown) =>
  err instanceof ApiError && (err.code === 'RESET_LINK_INVALID' || err.code === 'RESET_LINK_EXPIRED' || err.status === 422);

function check(v: Values, T: Pick): Record<string, string> {
  const e: Record<string, string> = {};
  const issue = passwordIssue(v.password, T);
  if (issue) e.password = issue;
  if (!v.confirm_password) e.confirm_password = T('कृपया पासवर्ड पुन्हा टाका', 'Please re-enter the password');
  else if (v.password !== v.confirm_password) e.confirm_password = T('पासवर्ड जुळत नाहीत', 'Passwords do not match');
  return e;
}

/*
 * The page the emailed reset link opens (/reset-password?token=…): checks the link first, then takes the new password
 * twice. On success the student is signed out everywhere and goes to the login with a "password changed" message.
 */
export default function ResetPasswordPage() {
  const { T } = useLang();
  const { user, signOut } = useStudent();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  /*
   * The token is taken from the address once and then kept out of it (in the history entry's state, so a reload still
   * works): it is enough to change the password, so it should not stay in the address bar or the browser history list.
   */
  const [token] = useState(() => params.get('token') ?? ((location.state ?? {}) as { token?: string }).token ?? '');
  useEffect(() => {
    if (params.has('token')) navigate('/reset-password', { replace: true, state: { token } });
  }, [params, navigate, token]);
  const [link, setLink] = useState<LinkState>({ kind: 'checking' });
  const [attempt, setAttempt] = useState(0);
  const [v, setV] = useState<Values>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setLink({ kind: 'bad', failure: { code: 'RESET_LINK_INVALID', status: 400, message: '' } });
      return;
    }
    let live = true;
    setLink({ kind: 'checking' });
    api<{ email: string }>('/auth/reset-password/check', { method: 'POST', body: { token } })
      .then(({ data }) => live && setLink({ kind: 'ready', email: data.email }))
      .catch(
        (err) =>
          live && setLink({ kind: isLinkProblem(err) ? 'bad' : 'retry', failure: toFailure(err, isLinkProblem(err) ? 'RESET_LINK_INVALID' : 'RESET_FAILED') }),
      );
    return () => {
      live = false;
    };
  }, [token, attempt]);

  const errors = { ...(submitted ? check(v, T) : {}), ...serverFields };
  const set = (k: keyof Values) => (value: string) => {
    setV((old) => ({ ...old, [k]: value }));
    setServerFields(({ [k]: _gone, ...rest }) => rest);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerFields({});
    setFailure(null);
    if (Object.keys(check(v, T)).length) return;
    setBusy(true);
    try {
      const { data } = await api<{ email: string }>('/auth/reset-password', { method: 'POST', body: { token, ...v } });
      /* Every session of the account was signed out by the change, this browser's too. */
      if (user) signOut();
      navigate('/login', { replace: true, state: { passwordChanged: true, email: data.email } });
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'RESET_LINK_INVALID' || err.code === 'RESET_LINK_EXPIRED'))
        return setLink({ kind: 'bad', failure: toFailure(err, 'RESET_LINK_INVALID') });
      if (err instanceof ApiError && err.details.length) setServerFields(err.fields());
      setFailure(toFailure(err, 'RESET_FAILED'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <h1>{T('नवीन पासवर्ड सेट करा', 'Set a new password')}</h1>
      {link.kind === 'checking' ? (
        <p className="sub">{T('लिंक तपासत आहे…', 'Checking the link…')}</p>
      ) : link.kind === 'bad' ? (
        <>
          <Notice tone="error">{serverMessage(T, link.failure)}</Notice>
          <Link className="btn block mt16" to="/forgot-password">
            {T('नवीन लिंक मागवा', 'Request a new link')}
          </Link>
        </>
      ) : link.kind === 'retry' ? (
        <>
          <Notice tone="error">{serverMessage(T, link.failure)}</Notice>
          <button type="button" className="btn block mt16" onClick={() => setAttempt((n) => n + 1)}>
            {T('पुन्हा प्रयत्न करा', 'Try again')}
          </button>
        </>
      ) : (
        <>
          <p className="sub">
            {T(`${link.email} या खात्यासाठी नवीन पासवर्ड टाका.`, `Enter a new password for the account ${link.email}.`)}
          </p>
          <form onSubmit={submit} noValidate>
            {failure ? <Notice tone="error">{serverMessage(T, failure)}</Notice> : null}
            {/* Lets a password manager save the new password under the right account. */}
            <input type="email" name="username" autoComplete="username" value={link.email} readOnly hidden />
            <div className="grid one">
              <Field
                id="reset-password"
                label={T('नवीन पासवर्ड', 'New Password')}
                error={errors.password}
                hint={T(
                  'किमान ८ वर्ण, त्यात किमान एक इंग्रजी अक्षर (A–Z) व एक अंक (0–9).',
                  'At least 8 characters, with a letter and a digit.',
                )}
              >
                <PasswordInput
                  id="reset-password"
                  value={v.password}
                  onChange={set('password')}
                  invalid={!!errors.password}
                  autoComplete="new-password"
                />
              </Field>
              <Field id="reset-confirm_password" label={T('नवीन पासवर्ड पुन्हा टाका', 'Re-enter New Password')} error={errors.confirm_password}>
                <PasswordInput
                  id="reset-confirm_password"
                  value={v.confirm_password}
                  onChange={set('confirm_password')}
                  invalid={!!errors.confirm_password}
                  autoComplete="new-password"
                />
              </Field>
            </div>
            <button className="btn block mt16" type="submit" disabled={busy}>
              {busy ? T('सेव्ह होत आहे…', 'Saving…') : T('पासवर्ड सेव्ह करा', 'Save password')}
            </button>
          </form>
        </>
      )}
      <div className="sep" />
      <p className="center fs13" style={{ margin: 0 }}>
        <Link to="/login">{T('लॉगिनवर परत जा', 'Back to login')}</Link>
      </p>
    </AuthLayout>
  );
}
