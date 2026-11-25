/*
 * The program's former short name is not shown anywhere: no screen, error, title, download name or README text says it, in
 * English or Marathi. Comments, API paths (/edp), storage keys (edp.…) and env names (EDP_…) keep it.
 */
const raw = import.meta.glob(['../src/**/*.{ts,tsx}', '../index.html', '../README.md'], { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;
const withoutComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Wording', () => {
  it('reads the source files, the page and the README', () => {
    expect(Object.keys(raw)).toEqual(expect.arrayContaining(['../index.html', '../README.md', '../src/App.tsx', '../src/pages/LoginPage.tsx']));
  });

  it.each(Object.entries(raw))('%s does not show the former name', (file, source) => {
    const text = file.endsWith('.md') ? source : withoutComments(source);
    expect(text).not.toMatch(/\bEDP(?!_)\b/);
    expect(text).not.toMatch(/edp@|edp\.sumago|ENTREPRENEURSHIP|Entrepreneurship/);
    expect(text).not.toMatch(/ईडीपी|इडीपी|उद्योजकता/);
  });
});
