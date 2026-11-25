import type { Applicant } from '../../types';

/* A student ticked for a new batch, as kept while the list is paged or filtered. */
export interface BatchPick {
  id: string;
  name: string;
  registration_id: string | null;
  district_id: string | null;
  district: string;
}

export const toPick = (r: Applicant): BatchPick => ({
  id: r.id,
  name: r.name,
  registration_id: r.registration_id,
  district_id: r.district_id,
  district: r.district ?? '—',
});

/*
 * Why a student who waits for a batch cannot be ticked now; null = can be (or is). A batch has exactly `size` students
 * (null = not loaded), all of one district. `show` = said in the row, not only on the checkbox.
 */
export function pickBlocked(r: Applicant, picks: BatchPick[], size: number | null): { reason: string; show: boolean } | null {
  if (picks.some((p) => p.id === r.id)) return null;
  if (size === null) return { reason: 'The batch size is not loaded', show: false };
  if (!r.district_id) return { reason: 'The form has no district', show: true };
  if (picks.length && picks[0]!.district_id !== r.district_id) return { reason: `A batch has one district: ${picks[0]!.district}`, show: true };
  if (picks.length >= size) return { reason: `${size} of ${size} are selected`, show: false };
  return null;
}

/* The picks with every student of these rows who can be added, in order (the first one's district, up to the batch size). */
export function addPicks(rows: Applicant[], picks: BatchPick[], size: number | null): BatchPick[] {
  return rows.reduce(
    (all, r) => (r.can_batch && !all.some((p) => p.id === r.id) && !pickBlocked(r, all, size) ? [...all, toPick(r)] : all),
    picks,
  );
}
