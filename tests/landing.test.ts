import indexHtml from '../index.html?raw';
import landingHtml from '../public/landing.html?raw';

/*
 * The site's home page is the public landing page (public/landing.html, content from Manage → CMS). "/" opens it before
 * the portal loads; every other address stays the portal.
 */
const homeScript = /<script>\s*(if \(location\.pathname === '\/'\)[^<]*)<\/script>/.exec(indexHtml)?.[1] ?? '';
const run = (pathname: string, search = '', hash = '') => {
  const replace = vi.fn();
  new Function('location', homeScript)({ pathname, search, hash, replace });
  return replace;
};

describe('the home page', () => {
  it('opens the landing page from "/", keeping the query and the anchor', () => {
    expect(homeScript).not.toBe('');
    expect(run('/', '?utm=sms', '#courses')).toHaveBeenCalledWith('/landing.html?utm=sms#courses');
  });

  it('leaves every portal address alone', () => {
    for (const path of ['/login', '/register', '/manage', '/manage/cms', '/landing.html']) expect(run(path)).not.toHaveBeenCalled();
  });

  it('is the landing page that reads the live CMS and links to the portal', () => {
    expect(landingHtml).toContain('<meta name="cms-api" content="https://ippapi.sumago.ai/api/v1/ipp">');
    expect(landingHtml).toContain("register_url: 'https://ipp.sumago.ai/register'");
    expect(landingHtml).toContain("login_url: 'https://ipp.sumago.ai/login'");
    /* Shown as "/" again once it has opened. */
    expect(landingHtml).toContain("location.pathname === '/landing.html'");
    expect(landingHtml).not.toMatch(/sarthi/i);
    expect(landingHtml).not.toContain('Employment is not guaranteed');
  });
});
