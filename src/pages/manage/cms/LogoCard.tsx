import { useState } from 'react';
import { api, apiUrl } from '../../../api';
import { Notice } from '../../../components/ui';
import { ConfirmDelete, messageOf } from '../masters/shared';
import type { LandingDoc } from './cmsTypes';

type Logo = LandingDoc['logo'];
const MAX_BYTES = 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

/*
 * The landing page's logo: uploaded and removed at once (not with the page's Save). Without a logo the page shows its title
 * text (Site & links → Title text) beside a graduation-cap mark.
 */
export default function LogoCard({ logo, canEdit, onChange }: { logo: Logo; canEdit: boolean; onChange: (logo: Logo, message: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  const upload = async () => {
    if (!file) return setError('Choose an image first.');
    if (!TYPES.includes(file.type)) return setError('The logo must be a PNG, JPG, WebP or SVG image.');
    if (file.size > MAX_BYTES) return setError('The logo must be at most 1 MB.');
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const res = await api<NonNullable<Logo>>('/manage/cms/landing/logo', { method: 'PUT', realm: 'manage', body: fd });
      setFile(null);
      setInputKey((k) => k + 1);
      onChange(res.data, 'Logo saved. The landing page shows it within a minute.');
    } catch (e) {
      setError(messageOf(e, 'Could not upload the logo'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset className="cms-box wide">
      <legend>Logo</legend>
      <div className="cms-logo">
        <div className="cms-logo-preview">
          {logo ? (
            <img src={apiUrl(`${logo.path}?v=${encodeURIComponent(logo.version)}`)} alt="Current logo of the landing page" />
          ) : (
            <span className="muted">No logo: the page shows the title text.</span>
          )}
        </div>
        <div className="cms-logo-tools">
          {logo ? (
            <p className="hint">
              {logo.mime_type.replace('image/', '').replace('+xml', '').toUpperCase()}, {Math.max(1, Math.round(logo.size_bytes / 1024))} KB
            </p>
          ) : null}
          {canEdit ? (
            <>
              <label className="sr-only" htmlFor="cms-logo-file">
                Logo image
              </label>
              <input
                key={inputKey}
                id="cms-logo-file"
                type="file"
                accept={TYPES.join(',')}
                onChange={(e) => {
                  setError('');
                  setFile(e.target.files?.[0] ?? null);
                }}
              />
              <p className="hint">PNG, JPG, WebP or SVG, at most 1 MB. A wide logo about 60 pixels high looks best.</p>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="btn sm" disabled={!file || busy} onClick={() => void upload()}>
                  {busy ? 'Uploading…' : logo ? 'Replace logo' : 'Upload logo'}
                </button>
                {logo ? (
                  <button type="button" className="btn danger sm" disabled={busy} onClick={() => setRemoving(true)}>
                    Remove logo
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
        </div>
      </div>
      {removing ? (
        <ConfirmDelete
          name="the logo"
          note="The landing page shows its title text instead. You can upload a logo again at any time."
          remove={async () => {
            await api('/manage/cms/landing/logo', { method: 'DELETE', realm: 'manage' });
            setRemoving(false);
            onChange(null, 'Logo removed: the landing page shows its title text.');
          }}
          onClose={() => setRemoving(false)}
        />
      ) : null}
    </fieldset>
  );
}
