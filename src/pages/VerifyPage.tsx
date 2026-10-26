import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { AuthLayout } from '../components/AuthLayout';
import { Field, Notice, PasswordInput } from '../components/ui';
import { serverMessage, toFailure, useLang, type Failure } from '../i18n';
import { useStudent } from '../session';
import { forgetSignupPassword, signupPasswordFor } from '../signup';
import type { OtpTiming, Session } from '../types';

/*
 * Seconds left until `deadline` (ms). Re-renders 4 times a second and reads the clock on each render, so a deadline just
 * set shows its full time (5:00, not 5:01) and a passed one shows 0 at once.
 */
function useSecondsLeft(deadline: number) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/* API answers after which the page asks for the server's timing again (its countdowns may be off). */
const OTP_STATE_CODES = new Set(['OTP_EXPIRED', 'OTP_NOT_PENDING', 'OTP_TOO_MANY_ATTEMPTS', 'OTP_RESEND_TOO_SOON']);

/* What the screen says, as data (translated when drawn, so switching language translates it too). */
type Info = { kind: 'sent' } | { kind: 'resent' } | { kind: 'notice'; failure: Failure };
type Problem = { kind: 'format' } | { kind: 'password' } | { kind: 'expired' } | { kind: 'server'; failure: Failure };

export default function VerifyPage() {
  const { user, signIn } = useStudent();
  const { T } = useLang();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const email = params.get('email') ?? '';
  /*
   * The sign-up's timing (receivedAt: when the API sent it), else the defaults (the OTP lasts 5 minutes, a new one once
   * it has expired). Straight after the sign-up that is the server's timing; otherwise (a reload, a Back, a login) the
   * page asks the server (otp-status), as it cannot know when the OTP was sent.
   */
  const state = (location.state ?? {}) as { expiresIn?: number; resendAfter?: number; receivedAt?: number; notice?: Failure };
  const [fresh] = useState(() => typeof state.receivedAt === 'number' && Date.now() - state.receivedAt < 10_000);
  const base = state.receivedAt ?? Date.now();
  const [deadline, setDeadline] = useState(() => base + (state.expiresIn ?? 300) * 1000);
  const [resendAt, setResendAt] = useState(() => base + (state.resendAfter ?? 300) * 1000);
  /* The countdowns follow the server's timing (only then may the page call the OTP expired by itself). */
  const [synced, setSynced] = useState(fresh);
  const left = useSecondsLeft(deadline);
  const resendLeft = useSecondsLeft(resendAt);
  const [otp, setOtp] = useState('');
  /* The password chosen at sign-up goes with the OTP; asked for when this page does not have it (e.g. after a reload). */
  const [password, setPassword] = useState(() => signupPasswordFor(email) ?? '');
  const [askPassword, setAskPassword] = useState(() => !signupPasswordFor(email));
  const [problem, setProblem] = useState<Problem | null>(null);
  const [info, setInfo] = useState<Info>(state.notice ? { kind: 'notice', failure: state.notice } : { kind: 'sent' });
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  const applyTiming = useCallback((t: Pick<OtpTiming, 'otp_expires_in' | 'resend_after'>) => {
    if (typeof t?.otp_expires_in !== 'number' || typeof t.resend_after !== 'number') return;
    setDeadline(Date.now() + t.otp_expires_in * 1000);
    setResendAt(Date.now() + t.resend_after * 1000);
    setSynced(true);
  }, []);
  /* Asks the server how long the OTP still works and when a new one can be asked for. */
  const sync = useCallback(async () => {
    try {
      const { data } = await api<OtpTiming>('/auth/otp-status', { method: 'POST', body: { email } });
      applyTiming(data);
    } catch (err) {
      /* No such account, or already verified: say so (the countdowns then mean nothing). */
      if (err instanceof ApiError && (err.status === 404 || err.status === 409))
        setProblem({ kind: 'server', failure: toFailure(err, 'VERIFY_FAILED') });
    }
  }, [email, applyTiming]);
  useEffect(() => {
    if (email && !user && !fresh) void sync();
  }, [email, user, fresh, sync]);

  if (user) return <Navigate to="/application" replace />;
  if (!email) return <Navigate to="/register" replace />;

  const expired = left === 0;
  /* Resend opens when the OTP expires (the default), or earlier if the API allows it. */
  const resendAtExpiry = resendAt >= deadline - 1000;
  const expiredText = T('OTP ची मुदत संपली आहे. कृपया नवीन OTP मागवा.', 'OTP has expired. Please request a new OTP.');
  const infoText =
    info.kind === 'notice'
      ? serverMessage(T, info.failure)
      : info.kind === 'resent'
        ? T(`${email} वर नवीन OTP पाठवला आहे.`, `A new OTP has been sent to ${email}.`)
        : T(`${email} वर ६ अंकी OTP पाठवला आहे.`, `We have sent a 6-digit OTP to ${email}.`);
  const problemText = !problem
    ? ''
    : problem.kind === 'format'
      ? T('६ अंकी OTP टाका', 'Enter the 6-digit OTP')
      : problem.kind === 'password'
        ? T('खाते तयार करताना निवडलेला पासवर्ड टाका', 'Enter the password you chose when creating the account')
        : problem.kind === 'expired'
        ? expiredText
        : serverMessage(T, problem.failure);

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    if (!/^\d{6}$/.test(otp)) return setProblem({ kind: 'format' });
    if (expired && synced) return setProblem({ kind: 'expired' });
    if (!password) return setProblem({ kind: 'password' });
    setBusy(true);
    try {
      const { data } = await api<Session>('/auth/verify-otp', { method: 'POST', body: { email, otp, password } });
      forgetSignupPassword();
      signIn(data.token, data.account);
      navigate('/application', { replace: true, state: { welcome: true } });
    } catch (err) {
      setProblem({ kind: 'server', failure: toFailure(err, 'VERIFY_FAILED') });
      /* Not the sign-up's password (mistyped, or the sign-up was made again): ask for it. */
      if (err instanceof ApiError && err.code === 'SIGNUP_PASSWORD_MISMATCH') {
        forgetSignupPassword();
        setPassword('');
        setAskPassword(true);
      }
      /* Expired per the API: offer a new OTP now. On any OTP answer, follow the server's timing again. */
      if (err instanceof ApiError && err.code === 'OTP_EXPIRED') {
        setDeadline(0);
        setResendAt(0);
      }
      if (err instanceof ApiError && OTP_STATE_CODES.has(err.code ?? '')) void sync();
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setProblem(null);
    setResending(true);
    try {
      const { data } = await api<OtpTiming>('/auth/resend-otp', { method: 'POST', body: { email } });
      applyTiming(data);
      setOtp('');
      setInfo({ kind: 'resent' });
    } catch (err) {
      setProblem({ kind: 'server', failure: toFailure(err, 'RESEND_FAILED') });
      if (err instanceof ApiError && OTP_STATE_CODES.has(err.code ?? '')) void sync();
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout>
      <h1>{T('आपला ईमेल पडताळा', 'Verify your email')}</h1>
      <p className="sub">
        {T(
          'ENTREPRENEURSHIP DEVELOPMENT PROGRAM कडून आलेल्या ईमेलमधील OTP टाका. पडताळणीनंतर आपले खाते तयार होईल.',
          'Enter the OTP from the email sent by ENTREPRENEURSHIP DEVELOPMENT PROGRAM. Your account is created once it is verified.',
        )}
      </p>
      <form onSubmit={verify} noValidate>
        <Notice tone="info">{infoText}</Notice>
        {problem ? <Notice tone="error">{problemText}</Notice> : null}
        <Field id="otp" label="OTP" hint={T('ईमेलमधील ६ अंकी OTP टाका.', 'Enter the 6-digit code from the email.')}>
          <input
            id="otp"
            className="inp otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            autoFocus
          />
        </Field>
        {askPassword ? (
          <div className="mt8">
            <Field
              id="otp-password"
              label={T('पासवर्ड', 'Password')}
              hint={T('खाते तयार करताना निवडलेला पासवर्ड.', 'The password you chose when creating the account.')}
            >
              <PasswordInput id="otp-password" value={password} onChange={setPassword} autoComplete="current-password" />
            </Field>
          </div>
        ) : null}
        {/* The ticking clock is not a live region (it would be read out every second); expiry is announced once, below. */}
        <p className="mt8 fs13">
          {expired ? (
            <span className="timer expired">{expiredText}</span>
          ) : (
            <>
              {T('OTP ची उरलेली मुदत:', 'OTP expires in')} <span className="timer">{clock(left)}</span>
            </>
          )}
        </p>
        <span className="sr-only" aria-live="polite">
          {expired ? expiredText : ''}
        </span>
        {/* Still clickable after expiry: trying an expired OTP says so. */}
        <button className="btn block mt16" type="submit" disabled={busy}>
          {busy ? T('पडताळणी होत आहे…', 'Verifying…') : T('पडताळा व खाते तयार करा', 'Verify & create account')}
        </button>
        {/* A new OTP replaces the current one; by default it can be asked for only once the current one has expired. */}
        <button type="button" className="btn ghost block mt8" onClick={() => void resend()} disabled={resendLeft > 0 || resending}>
          {resending
            ? T('पाठवत आहे…', 'Sending…')
            : resendLeft === 0
              ? T('OTP पुन्हा पाठवा', 'Resend OTP')
              : T(`${clock(resendLeft)} नंतर OTP पुन्हा पाठवता येईल`, `Resend OTP in ${clock(resendLeft)}`)}
        </button>
        {expired ? null : resendLeft > 0 ? (
          <p className="hint center mt8">
            {resendAtExpiry
              ? T(
                  'ईमेल मिळाला नाही? स्पॅम फोल्डर तपासा. या OTP ची मुदत संपल्यानंतर नवीन OTP मागवता येईल.',
                  'Email not received? Check the spam folder. A new OTP can be requested once this one expires.',
                )
              : T('ईमेल मिळाला नाही? स्पॅम फोल्डर तपासा.', 'Email not received? Check the spam folder.')}
          </p>
        ) : (
          <p className="hint center mt8">
            {T(
              'ईमेल मिळाला नाही? स्पॅम फोल्डर तपासा किंवा OTP पुन्हा पाठवा (आधीचा OTP मग चालणार नाही).',
              'Email not received? Check the spam folder, or resend the OTP (the earlier one then stops working).',
            )}
          </p>
        )}
      </form>
      <div className="sep" />
      <p className="center fs13 muted" style={{ margin: 0 }}>
        {T('ईमेल चुकीचा आहे?', 'Wrong email?')} <Link to="/register">{T('खाते पुन्हा तयार करा', 'Create the account again')}</Link>
      </p>
    </AuthLayout>
  );
}
