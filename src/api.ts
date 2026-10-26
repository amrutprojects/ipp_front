/*
 * The EDP endpoints of amrut-kalash-api (/api/v1/edp). Two separate sign-ins, each a bearer token kept in this browser:
 * the student portal and the /manage tracking panel. Neither is an Amrut admin panel session.
 */
const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || '/api/v1';

export type Realm = 'student' | 'manage';
const TOKEN_KEY: Record<Realm, string> = { student: 'edp.token', manage: 'edp.manage.token' };

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
export const tokens = {
  get: (realm: Realm) => storage()?.getItem(TOKEN_KEY[realm]) ?? null,
  set: (realm: Realm, token: string) => storage()?.setItem(TOKEN_KEY[realm], token),
  clear: (realm: Realm) => storage()?.removeItem(TOKEN_KEY[realm]),
};

export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details: FieldError[] = [],
  ) {
    super(message);
  }
  /* Field errors keyed by the bare field name: body.first_name → first_name, files.PHOTO → files.PHOTO. */
  fields(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const d of this.details) {
      const key = d.field.replace(/^body\.(data\.)?/, '');
      out[key] ??= d.message;
    }
    return out;
  }
}

/* Called when a request comes back 401: the stored token has expired or was rejected. */
const unauthorizedHandlers: Record<Realm, (() => void) | null> = { student: null, manage: null };
export const onUnauthorized = (realm: Realm, fn: (() => void) | null) => {
  unauthorizedHandlers[realm] = fn;
};

interface Options {
  method?: string;
  body?: unknown;
  realm?: Realm;
  query?: Record<string, string | number | undefined>;
}

export async function api<T>(path: string, opts: Options = {}): Promise<{ data: T; meta?: PageMeta; message: string }> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = opts.realm ? tokens.get(opts.realm) : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const qs = opts.query
    ? '?' +
      new URLSearchParams(
        Object.entries(opts.query)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : '';
  let res: Response;
  try {
    res = await fetch(`${BASE}/edp${path}${qs}`, { method: opts.method ?? 'GET', headers, body });
  } catch {
    throw new ApiError('Could not reach the server. Check your internet connection and try again.', 0, 'NETWORK');
  }
  const json = (await res.json().catch(() => null)) as {
    message?: string;
    data?: T;
    meta?: PageMeta;
    error?: { code?: string; details?: FieldError[] };
  } | null;
  if (!res.ok) {
    /* Also without a token: another tab may have signed out (e.g. after a password reset) while this one still shows a page. */
    if (res.status === 401 && opts.realm) {
      tokens.clear(opts.realm);
      unauthorizedHandlers[opts.realm]?.();
    }
    throw new ApiError(json?.message ?? `Request failed (${res.status})`, res.status, json?.error?.code, json?.error?.details ?? []);
  }
  return { data: json?.data as T, meta: json?.meta, message: json?.message ?? '' };
}

/* An authenticated file (the student's own document), opened in a new tab. */
export async function openFile(path: string, realm: Realm): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const res = await fetch(`${BASE}/edp${path}`, { headers: { Authorization: `Bearer ${tokens.get(realm) ?? ''}` } });
    if (!res.ok) throw new Error('Could not open the file');
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    tab?.close();
    throw e;
  }
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
