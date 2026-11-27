import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { fmtDate, Notice } from '../../components/ui';
import { useCanEdit } from '../../session';
import type { Centre } from '../../types';
import { CENTRE_DELETE_NOTE } from './CentresPage';
import CentreStatusDialog from './CentreStatusDialog';
import { MastersShell } from './ManageLayout';
import { ConfirmDelete } from './masters/shared';

/* One centre, read-only, with Edit, Active / Inactive and Delete for an admin. */
export default function CentreDetailPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const canEdit = useCanEdit();
  const [flash, setFlash] = useState<string>(() => (location.state as { flash?: string } | null)?.flash ?? '');
  const [centre, setCentre] = useState<Centre | null>(null);
  const [error, setError] = useState('');
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let live = true;
    setCentre(null);
    setError('');
    api<Centre>(`/manage/centres/${encodeURIComponent(id)}`, { realm: 'manage' })
      .then((r) => live && setCentre(r.data))
      .catch((e: Error) => live && setError(e.message || 'Could not load the center'));
    return () => {
      live = false;
    };
  }, [id]);

  const inactive = (on: boolean | null | undefined) => (on === false ? ' (inactive)' : '');
  const rows: [string, string][] = centre
    ? [
        ['Name', centre.name],
        ['Code', centre.code],
        ['State', centre.stateName + inactive(centre.stateIsActive)],
        ['District', centre.districtName + inactive(centre.districtIsActive)],
        ['Taluka', centre.talukaName ? centre.talukaName + inactive(centre.talukaIsActive) : '—'],
        ['PIN Code', centre.pinCode ?? '—'],
        ['Address', centre.address ?? '—'],
        ['Contact Person', centre.contactPerson ?? '—'],
        ['Contact Number', centre.contactNumber ?? '—'],
        ['Email', centre.email ?? '—'],
        ['Status', centre.isActive ? 'Active' : 'Inactive'],
        ['Created', fmtDate(centre.createdAt)],
        ['Last updated', fmtDate(centre.updatedAt)],
      ]
    : [];

  return (
    <MastersShell wide={false}>
      <p className="mt8">
        <Link to="/manage/centres">← Back to Center Master</Link>
      </p>
      {flash ? <Notice tone="ok">{flash}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {!centre && !error ? <div className="loading">Loading…</div> : null}
      {centre ? (
        <section className="card">
          <div className="row">
            <h2 style={{ margin: 0 }}>{centre.name}</h2>
            <span className={`badge ${centre.isActive ? 'active' : 'inactive'}`}>{centre.isActive ? 'Active' : 'Inactive'}</span>
            <span className="spacer" />
            {canEdit ? (
              <>
                <Link className="btn ghost sm" to={`/manage/centres/${centre.id}/edit`}>
                  Edit
                </Link>
                <button
                  type="button"
                  className={centre.isActive ? 'btn danger sm' : 'btn sm'}
                  aria-label={`Make ${centre.name} ${centre.isActive ? 'inactive' : 'active'}`}
                  onClick={() => setToggling(true)}
                >
                  {centre.isActive ? 'Inactive' : 'Active'}
                </button>
                <button
                  type="button"
                  className="btn danger sm"
                  onClick={() => {
                    setFlash('');
                    setDeleting(true);
                  }}
                >
                  Delete
                </button>
              </>
            ) : null}
          </div>
          <dl className="details mt16">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v || '—'}</dd>
              </div>
            ))}
          </dl>
          {/* A centre's own technologies are no longer used: they depend on the student's district (Masters → Technologies).
          <h3 className="mt16">Allocated Technologies ({centre.technologies.length})</h3>
          {centre.technologies.length ? (
            <ul>
              {centre.technologies.map((t) => (
                <li key={t.code}>
                  <span className="mono muted">{t.code}</span> {t.name}
                  {t.usable ? null : <span className="muted"> (inactive)</span>}
                </li>
              ))}
            </ul>
          ) : (
            <Notice tone="warn">No technologies are allocated to this center; students cannot choose a technology here.</Notice>
          )}
          */}
        </section>
      ) : null}
      {toggling && centre && canEdit ? (
        <CentreStatusDialog
          centre={centre}
          onClose={() => setToggling(false)}
          onDone={(updated) => {
            setToggling(false);
            setCentre(updated);
            setFlash(updated.isActive ? 'Center set to Active.' : 'Center set to Inactive.');
          }}
        />
      ) : null}
      {deleting && centre && canEdit ? (
        <ConfirmDelete
          name={centre.name}
          note={CENTRE_DELETE_NOTE}
          remove={async () => {
            await api(`/manage/centres/${encodeURIComponent(centre.id)}`, { method: 'DELETE', realm: 'manage' });
            navigate('/manage/centres', { replace: true, state: { flash: `Center ${centre.name} deleted.` } });
          }}
          onClose={() => setDeleting(false)}
        />
      ) : null}
    </MastersShell>
  );
}
