import type { Applicant } from '../../types';

/* A student ticked for a new batch, as kept while the list is paged or filtered. */
export interface BatchPick {
  id: string;
  name: string;
  registration_id: string | null;
  district_id: string | null;
  district: string;
  /* The center chosen in the form; its id is null from an older API. */
  centre: string | null;
  centre_id: string | null;
}

export const toPick = (r: Applicant): BatchPick => ({
  id: r.id,
  name: r.name,
  registration_id: r.registration_id,
  district_id: r.district_id,
  district: r.district ?? '—',
  centre: r.centre,
  centre_id: r.centre_id ?? null,
});

/* How many of these students chose another center than this one (told by the id, else by the name). */
export const choseOther = (picks: BatchPick[], centre: { id: string; name: string }) => {
  const plain = (name: string) => name.trim().toLowerCase();
  return picks.filter((p) => (p.centre_id ? p.centre_id !== centre.id : p.centre && plain(p.centre) !== plain(centre.name))).length;
};

/* What a batch must be: exactly `size` students (null = not loaded), all of one district (or without one, if not required). */
export interface BatchRules {
  size: number | null;
  districtRequired: boolean;
}

/* The district of the picks; null = none of them has one. */
export const pickedDistrict = (picks: BatchPick[]): string | null => picks.find((p) => p.district_id)?.district ?? null;

/*
 * Why a student who waits for a batch cannot be ticked now; null = can be (or is). `show` = said in the row, not only on the
 * checkbox.
 */
export function pickBlocked(r: Applicant, picks: BatchPick[], { size, districtRequired }: BatchRules): { reason: string; show: boolean } | null {
  if (picks.some((p) => p.id === r.id)) return null;
  if (size === null) return { reason: 'The batch size is not loaded', show: false };
  if (!r.district_id && districtRequired) return { reason: 'The form has no district', show: true };
  if (r.district_id && picks.some((p) => p.district_id && p.district_id !== r.district_id))
    return { reason: `A batch has one district: ${pickedDistrict(picks)}`, show: true };
  if (picks.length >= size) return { reason: `${size} of ${size} are selected`, show: false };
  return null;
}

/* The picks with every student of these rows who can be added, in order (the first one's district, up to the batch size). */
export function addPicks(rows: Applicant[], picks: BatchPick[], rules: BatchRules): BatchPick[] {
  return rows.reduce(
    (all, r) => (r.can_batch && !all.some((p) => p.id === r.id) && !pickBlocked(r, all, rules) ? [...all, toPick(r)] : all),
    picks,
  );
}
