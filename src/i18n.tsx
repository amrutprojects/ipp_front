import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError } from './api';

/* मराठी / English for the sign-in screens (the toggle the AMRUT admin panel's sign-in has). Remembered in this browser. */
export type Lang = 'mr' | 'en';
const KEY = 'edp.lang';

function initial(): Lang {
  try {
    return localStorage.getItem(KEY) === 'mr' ? 'mr' : 'en';
  } catch {
    return 'en';
  }
}

export type Pick = (mr: string, en: string) => string;
interface LangState {
  lang: Lang;
  mr: boolean;
  setLang: (l: Lang) => void;
  /* T('मराठी', 'English') → the text in the current language. */
  T: Pick;
}
const LangCtx = createContext<LangState | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* not remembered: fine */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo<LangState>(() => ({ lang, mr: lang === 'mr', setLang, T: (m, e) => (lang === 'mr' ? m : e) }), [lang, setLang]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

/* Outside a provider (e.g. a component test) the text is English. */
const FALLBACK: LangState = { lang: 'en', mr: false, setLang: () => undefined, T: (_m, e) => e };
export const useLang = () => useContext(LangCtx) ?? FALLBACK;

/*
 * A failed request as data, not text, so the screen shows it in whichever language is chosen when it is drawn (switching
 * language afterwards translates it too). `code` is the API's error code, or one of the local codes below.
 */
export interface Failure {
  code?: string;
  status: number;
  message: string;
}
export const toFailure = (err: unknown, fallbackCode: string): Failure =>
  err instanceof ApiError ? { code: err.code, status: err.status, message: err.message } : { code: fallbackCode, status: 0, message: '' };

/* Messages the sign-in screens show, matched on the error code or status; anything else is shown as the server sent it. */
export function serverMessage(T: Pick, f: Failure): string {
  const { code, status, message } = f;
  switch (code) {
    case 'OTP_INCORRECT':
      return T('चुकीचा OTP', 'Incorrect OTP');
    case 'OTP_EXPIRED':
      return T('OTP ची मुदत संपली आहे. कृपया नवीन OTP मागवा.', 'OTP has expired. Please request a new OTP.');
    case 'OTP_TOO_MANY_ATTEMPTS':
      return T(
        'खूप चुकीचे प्रयत्न झाले. सध्याच्या OTP ची मुदत संपल्यानंतर नवीन OTP मागवा.',
        'Too many incorrect attempts. Please request a new OTP when the current one expires.',
      );
    case 'OTP_NOT_PENDING':
      return T('या खात्यासाठी कोणताही OTP प्रलंबित नाही. कृपया नवीन OTP मागवा.', message);
    case 'OTP_RESEND_TOO_SOON':
      return T('नवीन OTP मागवण्यापूर्वी थोडा वेळ थांबा. आधी पाठवलेल्या OTP साठी SMS तपासा.', message);
    case 'EMAIL_NOT_VERIFIED':
      return T('आपला मोबाईल क्रमांक अद्याप पडताळलेला नाही. SMS ने पाठवलेला OTP टाका.', message);
    case 'EMAIL_UNAVAILABLE':
      return T('सध्या ईमेल पाठवता आला नाही. काही मिनिटांनी पुन्हा प्रयत्न करा.', message);
    case 'SMS_UNAVAILABLE':
      return T('सध्या OTP SMS पाठवता आला नाही. काही मिनिटांनी पुन्हा प्रयत्न करा.', message);
    case 'SIGNUP_PASSWORD_MISMATCH':
      return T(
        'हा खाते तयार करताना निवडलेला पासवर्ड नाही. तोच पासवर्ड टाका किंवा खाते पुन्हा तयार करा.',
        'This is not the password chosen when the account was created. Enter that password, or create the account again.',
      );
    case 'EMAIL_NOT_REGISTERED':
      return T('हा ईमेल आयडी नोंदणीकृत नाही. कृपया आपला ईमेल आयडी तपासा.', 'This email ID is not registered. Kindly check your email ID.');
    case 'RESET_TOO_SOON':
      return T('पासवर्ड बदलण्याची लिंक नुकतीच पाठवली आहे. कृपया ईमेल तपासा किंवा थोड्या वेळाने पुन्हा प्रयत्न करा.', message);
    case 'RESET_LINK_INVALID':
      return T(
        'ही पासवर्ड बदलण्याची लिंक वैध नाही किंवा आधीच वापरली गेली आहे. कृपया नवीन लिंक मागवा.',
        'This password reset link is not valid or has already been used. Please request a new link.',
      );
    case 'RESET_LINK_EXPIRED':
      return T('या पासवर्ड बदलण्याच्या लिंकची मुदत संपली आहे. कृपया नवीन लिंक मागवा.', 'This password reset link has expired. Please request a new link.');
    case 'RATE_LIMITED':
      return T('खूप प्रयत्न झाले. थोड्या वेळाने पुन्हा प्रयत्न करा.', 'Too many attempts. Please try again later.');
    case 'NETWORK':
      return T('सर्व्हरशी संपर्क होऊ शकला नाही. इंटरनेट कनेक्शन तपासा व पुन्हा प्रयत्न करा.', message);
    /* Local codes (no response from the API to show). */
    case 'LOGIN_FAILED':
      return T('लॉगिन अयशस्वी झाले', 'Login failed');
    case 'SIGNUP_FAILED':
      return T('खाते तयार करता आले नाही', 'Could not create the account');
    case 'VERIFY_FAILED':
      return T('पडताळणी अयशस्वी झाली', 'Verification failed');
    case 'RESEND_FAILED':
      return T('नवीन OTP पाठवता आला नाही', 'Could not send a new OTP');
    case 'FORGOT_FAILED':
      return T('लिंक पाठवता आली नाही', 'Could not send the link');
    case 'RESET_FAILED':
      return T('पासवर्ड बदलता आला नाही', 'Could not change the password');
  }
  if (status === 401) return T('ईमेल किंवा पासवर्ड चुकीचा आहे.', message);
  if (status === 403) return T('हे खाते बंद केले आहे. कृपया कार्यक्रम कार्यालयाशी संपर्क साधा.', message);
  if (status === 404) return T('या ईमेलचे खाते सापडले नाही. कृपया खाते तयार करा.', message);
  if (status === 409 && /already verified/i.test(message)) return T('हा ईमेल आधीच पडताळलेला आहे. कृपया लॉगिन करा.', message);
  if (status === 409 && /just registered/i.test(message)) return T('हा ईमेल नुकताच नोंदवला गेला आहे. आपल्या मोबाईलवर पाठवलेला OTP टाका.', message);
  if (status === 409 && /already exists/i.test(message)) return T('या ईमेलचे खाते आधीच अस्तित्वात आहे. कृपया लॉगिन करा.', message);
  return message;
}
