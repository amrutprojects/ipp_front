import { useState } from 'react';
import { api, ApiError } from '../../api';
import { Modal, Notice } from '../../components/ui';
import type { Centre } from '../../types';

/* "Set this centre to Active / Inactive?" — PATCH /manage/centres/:id/status on Yes. */
export default function CentreStatusDialog({
  centre,
  onClose,
  onDone,
}: {
  centre: Centre;
  onClose: () => void;
  onDone: (updated: Centre) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const activate = !centre.isActive;
  /* The status it is set to, in the words of the Status column. */
  const next = activate ? 'Active' : 'Inactive';

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api<Centre>(`/manage/centres/${centre.id}/status`, {
        method: 'PATCH',
        realm: 'manage',
        body: { isActive: activate },
      });
      onDone(res.data ?? { ...centre, isActive: activate });
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : `Could not set the center to ${next}`);
      setBusy(false);
    }
  };

  return (
    <Modal alert title={`Set ${centre.name} to ${next}?`} onClose={() => !busy && onClose()}>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <p>
        {activate
          ? 'The center will be offered to students again in the registration form.'
          : 'Students will no longer be able to choose this center in the registration form. Existing registrations are kept.'}
      </p>
      <div className="actions">
        <button className="btn ghost" onClick={onClose} disabled={busy} data-autofocus>
          Cancel
        </button>
        <button className={activate ? 'btn' : 'btn danger'} onClick={() => void confirm()} disabled={busy}>
          {busy ? 'Saving…' : `Yes, set to ${next}`}
        </button>
      </div>
    </Modal>
  );
}
