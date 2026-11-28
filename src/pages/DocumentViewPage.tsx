import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiUrl, downloadName } from '../api';

interface Shown {
  url: string;
  type: string;
  name: string;
}

const FAILED = 'This document could not be opened. Close this tab and click View again.';

/*
 * A document opened with View (the student's own, or a student's in the panel): /document/<link>, on the portal's own
 * address. The link is the permission (signed by the API, valid for 2 minutes, no session needed): the page fetches the
 * file from the API (ippapi.… in production) and shows it here, a PDF in the browser's viewer, an image or a video, with
 * its name and a Download button.
 */
export default function DocumentViewPage() {
  const { token = '' } = useParams();
  const [doc, setDoc] = useState<Shown | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    let made = '';
    document.title = 'Opening document…';
    void (async () => {
      try {
        const res = await fetch(apiUrl(`/files/${encodeURIComponent(token)}`));
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(body?.message || FAILED);
        }
        const type = (res.headers.get('Content-Type') ?? '').split(';')[0]!.trim();
        const name = downloadName(res.headers.get('Content-Disposition'), 'document');
        const blob = await res.blob();
        if (!live) return;
        made = URL.createObjectURL(type ? new Blob([blob], { type }) : blob);
        document.title = name;
        setDoc({ url: made, type, name });
      } catch (e) {
        if (!live) return;
        document.title = 'Document not available';
        setError(
          e instanceof TypeError
            ? 'Could not reach the server. Check your internet connection, then click View again.'
            : e instanceof Error && e.message
              ? e.message
              : FAILED,
        );
      }
    })();
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [token]);

  let body;
  if (error)
    body = (
      <div className="doc-view-msg" role="alert">
        {error}
      </div>
    );
  else if (!doc)
    body = (
      <div className="doc-view-msg" role="status">
        Opening document…
      </div>
    );
  else if (doc.type.startsWith('image/')) body = <img className="doc-view-img" src={doc.url} alt={doc.name} />;
  else if (doc.type.startsWith('video/')) body = <video className="doc-view-video" src={doc.url} controls aria-label={doc.name} />;
  else if (doc.type === 'application/pdf') body = <iframe className="doc-view-pdf" src={doc.url} title={doc.name} />;
  else
    body = (
      <div className="doc-view-msg">
        This file cannot be shown here.{' '}
        <a href={doc.url} download={doc.name}>
          Download it
        </a>
        .
      </div>
    );

  return (
    <div className="doc-view">
      <header className="doc-view-bar">
        <span className="doc-view-name">{doc?.name ?? (error ? 'Document' : 'Opening document…')}</span>
        {doc ? (
          <a className="btn light sm" href={doc.url} download={doc.name}>
            Download
          </a>
        ) : null}
      </header>
      <main className="doc-view-body">{body}</main>
    </div>
  );
}
