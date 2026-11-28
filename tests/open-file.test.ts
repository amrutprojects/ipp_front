/*
 * A document opens from its short-lived link on the API. In production the portal (ipp.…) and the API (ippapi.…) are two
 * domains: the link must be opened on the API's, never on the portal's (where it is only the portal page again).
 */
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function openWith(base: string | undefined) {
  vi.resetModules();
  if (base) vi.stubEnv('VITE_API_BASE_URL', base);
  const { openFile } = await import('../src/api');
  const tab = { document: null, location: { replace: vi.fn() }, close: vi.fn() };
  vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
  const fetched: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    fetched.push(String(input));
    return json(200, { data: { url: '/api/v1/edp/files/token-photo', expires_at: '2026-11-28T10:02:00Z' } });
  });
  await openFile('/application/documents/PHOTO/file', 'student');
  return { tab, fetched };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('opening a document', () => {
  it('opens the link on the API domain when the API is on another domain', async () => {
    const { tab, fetched } = await openWith('https://ippapi.example.test/api/v1');
    expect(fetched).toEqual(['https://ippapi.example.test/api/v1/edp/application/documents/PHOTO/link']);
    expect(tab.location.replace).toHaveBeenCalledWith('https://ippapi.example.test/api/v1/edp/files/token-photo');
  });

  it('opens it on this domain when the API is reached through it (/api/v1)', async () => {
    const { tab } = await openWith(undefined);
    expect(tab.location.replace).toHaveBeenCalledWith(`${window.location.origin}/api/v1/edp/files/token-photo`);
  });
});
