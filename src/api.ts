/*
 * The EDP endpoints of sarthi-api (/api/v1/edp). Two separate sign-ins, each a bearer token kept in this browser:
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

/*
 * How many changes the panel has made in this tab: kept copies of what the masters define (the form's options) are asked for
 * again after one, so the form drawn next is the one just set up.
 */
let panelChanges = 0;
export const panelChangeCount = () => panelChanges;

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
  if (opts.realm === 'manage' && (opts.method ?? 'GET') !== 'GET') panelChanges++;
  return { data: json?.data as T, meta: json?.meta, message: json?.message ?? '' };
}

/* Every row of a paged list, 100 at a time until meta.totalPages. */
export async function apiAll<T>(path: string, opts: Pick<Options, 'realm' | 'query'> = {}): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; ; page++) {
    const res = await api<T[]>(path, { ...opts, query: { page, limit: 100, ...opts.query } });
    all.push(...(res.data ?? []));
    if (!res.data?.length || page >= (res.meta?.totalPages ?? 1)) return all;
  }
}

/* The tab a document opens in: opened at once (a click may open a tab, a later promise may not), saying what it waits for. */
function openingTab(): Window | null {
  const tab = window.open('', '_blank');
  try {
    if (tab?.document?.body) {
      tab.document.title = 'Opening document…';
      tab.document.body.style.cssText =
        'margin:0;height:100vh;display:grid;place-items:center;font:15px system-ui,-apple-system,Segoe UI,sans-serif;color:#555;background:#fafafa';
      tab.document.body.textContent = 'Opening document…';
    }
  } catch {
    /* It still opens the document. */
  }
  return tab;
}

/*
 * An authenticated document (the student's own, or one of a student for the panel), opened in a new tab. `path` is its
 * …/documents/:docType/file address: the page asks for a short-lived link to it (…/link, with the session) and the tab goes
 * there, so the browser shows the document as it arrives instead of a blank tab until the page has fetched all of it.
 */
export async function openFile(path: string, realm: Realm): Promise<void> {
  const tab = openingTab();
  try {
    const { data } = await api<{ url: string }>(path.replace(/\/file$/, '/link'), { realm });
    const url = new URL(data.url, window.location.origin).href;
    if (tab) tab.location.replace(url);
    else window.open(url, '_blank', 'noopener');
  } catch (e) {
    tab?.close();
    throw e;
  }
}

/* The file name a download response gives (Content-Disposition filename*, else filename), or the fallback. */
export function downloadName(disposition: string | null, fallback: string): string {
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition ?? '');
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* fall through to the plain name */
    }
  }
  return /filename="([^"]+)"/i.exec(disposition ?? '')?.[1] ?? fallback;
}

/* Downloads a file with the realm's token and saves it under the name the server gives. */
export async function downloadFile(path: string, realm: Realm, fallbackName: string): Promise<void> {
  const res = await fetch(`${BASE}/edp${path}`, { headers: { Authorization: `Bearer ${tokens.get(realm) ?? ''}` } });
  if (!res.ok) throw new Error('Could not download the file');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = downloadName(res.headers.get('Content-Disposition'), fallbackName);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
