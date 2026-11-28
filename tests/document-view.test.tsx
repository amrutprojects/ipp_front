import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';

/* /document/<link>: the document fetched from the API by its link and shown on the portal's own address. */
const file = (type: string, name: string) =>
  new Response(new Blob(['%PDF-1.4']), {
    status: 200,
    headers: { 'Content-Type': type, 'Content-Disposition': `inline; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}` },
  });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function mockFile(answer: () => Response) {
  const fetched: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    fetched.push(url);
    return url.endsWith('/files/tok.sig') ? answer() : json(404, { message: 'not mocked' });
  });
  return fetched;
}
const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:doc');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe('the document page', () => {
  it('shows a PDF with its name and a Download button, without a sign-in', async () => {
    const fetched = mockFile(() => file('application/pdf', 'Caste certificate.pdf'));
    renderAt('/document/tok.sig');
    expect(await screen.findByTitle('Caste certificate.pdf')).toHaveAttribute('src', 'blob:doc');
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('download', 'Caste certificate.pdf');
    expect(document.title).toBe('Caste certificate.pdf');
    expect(fetched.some((u) => u.endsWith('/edp/files/tok.sig'))).toBe(true);
  });

  it('shows an image', async () => {
    mockFile(() => file('image/jpeg', 'photo.jpg'));
    renderAt('/document/tok.sig');
    expect(await screen.findByRole('img', { name: 'photo.jpg' })).toHaveAttribute('src', 'blob:doc');
  });

  it('says so when the link has expired', async () => {
    mockFile(() => json(404, { message: 'This link has expired or the document is no longer there. Open it again from the page.' }));
    renderAt('/document/tok.sig');
    expect(await screen.findByRole('alert')).toHaveTextContent('This link has expired');
    expect(screen.queryByRole('link', { name: 'Download' })).not.toBeInTheDocument();
  });
});
