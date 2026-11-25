import { useCallback, useEffect, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { api } from '../../../api';
import { Notice } from '../../../components/ui';
import { useCanEdit } from '../../../session';
import type { MasterKind } from '../../../types';
import { MastersShell } from '../ManageLayout';
import MasterList from './MasterList';
import { messageOf } from './shared';

/*
 * Masters → Dropdown lists (/manage/masters/lists/:kind): every list the form's dropdowns offer, one at a time. The
 * technologies have their own page (they also depend on the district).
 */
export default function ListsPage() {
  const { kind } = useParams();
  const canEdit = useCanEdit();
  const [kinds, setKinds] = useState<MasterKind[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api<MasterKind[]>('/manage/masters', { realm: 'manage' });
      setKinds(res.data.filter((k) => k.kind !== 'TECHNOLOGY'));
      setError('');
    } catch (e) {
      setError(messageOf(e, 'Could not load the lists'));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const current = kinds?.find((k) => k.kind === kind) ?? (kind ? undefined : kinds?.[0]);
  return (
    <MastersShell>
      {!canEdit ? <Notice tone="info">View only: your account can see the masters but not change them.</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {!kinds && !error ? <div className="loading">Loading…</div> : null}
      {kinds ? (
        <div className="masters-cols">
          <nav className="kind-nav" aria-label="Dropdown lists">
            {kinds.map((k) => (
              <NavLink key={k.kind} to={`/manage/masters/lists/${encodeURIComponent(k.kind)}`} className={k === current ? 'active' : ''}>
                {k.name}
                <span className="hint">
                  {k.active} of {k.count} active
                </span>
              </NavLink>
            ))}
          </nav>
          {current ? (
            <MasterList
              key={current.kind}
              kind={current.kind}
              title={current.name}
              canAdd={current.can_add}
              canDelete={current.can_delete}
              onChanged={() => void load()}
            />
          ) : (
            <Notice tone="warn">There is no such list.</Notice>
          )}
        </div>
      ) : null}
    </MastersShell>
  );
}
