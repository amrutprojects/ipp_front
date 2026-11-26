import { useState } from 'react';
import { api } from '../../api';
import { Modal, Notice } from '../../components/ui';
import type { Applicant } from '../../types';

export default function DeleteRecordDialog({ applicant, onClose, onDone }: { applicant: Applicant; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`/manage/applicants/${encodeURIComponent(applicant.id)}`, { method: 'DELETE', realm: 'manage' });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the record.');
      setBusy(false);
    }
  };
  return <Modal alert title="Delete record" onClose={() => { if (!busy) onClose(); }}>
    <p>Are you sure you want to delete this record?</p>
    <p><b>{applicant.name}</b></p>
    {error ? <Notice tone="error">{error}</Notice> : null}
    <div className="row">
      <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
      <button type="button" className="btn" onClick={() => void confirm()} disabled={busy}>{busy ? 'Deleting…' : 'Yes, Delete'}</button>
    </div>
  </Modal>;
}
