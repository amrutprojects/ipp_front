import type { ApplicationStage, FilterChoice, ListFilterOptions, Stage, Summary, VerifiedFilter } from '../../types';

/* What the list is filtered by; '' = all. The summary tiles also set `stage` (SUBMITTED = submitted, at any approval stage). */
export interface ListFilters {
  name: string;
  district_id: string;
  caste_id: string;
  stage: ApplicationStage | Stage | '';
  documents: VerifiedFilter | '';
  mobile: string;
  centre_id: string;
  final: VerifiedFilter | '';
}
export const NO_FILTERS: ListFilters = {
  name: '',
  district_id: '',
  caste_id: '',
  stage: '',
  documents: '',
  mobile: '',
  centre_id: '',
  final: '',
};

const VERIFIED: { value: VerifiedFilter; label: string }[] = [
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'NOT_VERIFIED', label: 'Not verified' },
];
const choices = (list: FilterChoice[] | undefined) => (list ?? []).map((c) => ({ value: c.id, label: c.name }));

/* How many students are at a stage of application, where the summary says. */
function countOf(code: string, summary: Summary | null): number | undefined {
  const approvals = summary?.approvals as Record<string, number> | undefined;
  if (code === 'AUDITOR') return approvals?.AWAITING;
  return (summary?.counts as Record<string, number> | undefined)?.[code] ?? approvals?.[code];
}

function Choice({
  label,
  all,
  value,
  options,
  onChange,
}: {
  label: string;
  all: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label>
      {label}
      <select className="inp" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/*
 * The list's filters, in the order every student list of the program has them. District, category, stage and centre are
 * chosen from GET /manage/filters; name and mobile match a part (the page applies them once typing stops).
 */
export default function StudentFilters({
  value,
  options,
  failed,
  summary,
  onChange,
  onClear,
}: {
  value: ListFilters;
  /* null = not loaded (yet); `failed` = they could not be. */
  options: ListFilterOptions | null;
  failed: boolean;
  summary: Summary | null;
  onChange: (patch: Partial<ListFilters>) => void;
  onClear: () => void;
}) {
  const stages: { code: string; label: string }[] = [...(options?.stages ?? [])];
  /* A tile's stage that is not among the choices (Submitted covers several): shown as chosen while it is on. */
  const tile = summary?.stages.find((s) => s.code === value.stage);
  if (tile && !stages.some((s) => s.code === tile.code)) stages.push(tile);

  return (
    <div className="filters" role="group" aria-label="Filters">
      <div className="filters-grid">
        <label>
          Name
          <input
            className="inp"
            type="search"
            maxLength={100}
            autoComplete="off"
            value={value.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </label>
        <Choice
          label="District"
          all="All districts"
          value={value.district_id}
          options={choices(options?.districts)}
          onChange={(v) => onChange({ district_id: v })}
        />
        <Choice
          label="Category"
          all="All categories"
          value={value.caste_id}
          options={choices(options?.categories)}
          onChange={(v) => onChange({ caste_id: v })}
        />
        <Choice
          label="Stage of application"
          all="All stages"
          value={value.stage}
          options={stages.map((s) => {
            const n = countOf(s.code, summary);
            return { value: s.code, label: n === undefined ? s.label : `${s.label} (${n})` };
          })}
          onChange={(v) => onChange({ stage: v as ListFilters['stage'] })}
        />
        <Choice
          label="Documents"
          all="All"
          value={value.documents}
          options={VERIFIED}
          onChange={(v) => onChange({ documents: v as ListFilters['documents'] })}
        />
        <label>
          Mobile no.
          {/* Digits only; of a pasted +91 number, the last ten. */}
          <input
            className="inp"
            type="search"
            inputMode="numeric"
            autoComplete="off"
            value={value.mobile}
            onChange={(e) => onChange({ mobile: e.target.value.replace(/\D/g, '').slice(-10) })}
          />
        </label>
        <Choice
          label="Centre"
          all="All centres"
          value={value.centre_id}
          options={choices(options?.centres)}
          onChange={(v) => onChange({ centre_id: v })}
        />
        <Choice
          label="Final verification"
          all="All"
          value={value.final}
          options={VERIFIED}
          onChange={(v) => onChange({ final: v as ListFilters['final'] })}
        />
        {failed ? <span className="err">Could not load the filter choices. Choose Refresh to try again.</span> : null}
      </div>
      <button type="button" className="btn ghost sm" onClick={onClear}>
        Clear filters
      </button>
    </div>
  );
}
