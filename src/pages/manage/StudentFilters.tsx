import { APPLICATION_STAGES, type ApplicationStage, type FilterChoice, type ListFilterOptions, type Stage, type Summary, type VerifiedFilter } from '../../types';

/* What the list is filtered by; '' = all. The summary tiles also set `stage` (SUBMITTED = submitted, at any approval stage). */
export interface ListFilters {
  name: string;
  district_id: string;
  caste_id: string;
  technology_id: string;
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
  technology_id: '',
  stage: '',
  documents: '',
  mobile: '',
  centre_id: '',
  final: '',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHECKS: readonly string[] = ['VERIFIED', 'NOT_VERIFIED'];

/*
 * The filters a link opens the list with (the Dashboard's figures, Batches): ?application_stage= (or SUBMITTED, the
 * Form submitted tile), ?district_id=, ?caste_id=, ?technology_id=, ?centre_id=, ?documents=, ?final=. A value the list
 * does not offer is left out.
 */
export function filtersFromAddress(params: URLSearchParams): ListFilters {
  const id = (key: string) => (UUID.test(params.get(key) ?? '') ? params.get(key)! : '');
  const check = (key: string) => (CHECKS.includes(params.get(key) ?? '') ? (params.get(key) as VerifiedFilter) : '');
  const stage = params.get('application_stage') ?? '';
  return {
    ...NO_FILTERS,
    stage: stage === 'SUBMITTED' || (APPLICATION_STAGES as readonly string[]).includes(stage) ? (stage as ApplicationStage | Stage) : '',
    district_id: id('district_id'),
    caste_id: id('caste_id'),
    technology_id: id('technology_id'),
    centre_id: id('centre_id'),
    documents: check('documents'),
    final: check('final'),
  };
}

const VERIFIED: { value: VerifiedFilter; label: string }[] = [
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'NOT_VERIFIED', label: 'Not verified' },
];
const choices = (list: FilterChoice[] | undefined) => (list ?? []).map((c) => ({ value: c.id, label: c.name }));

/* How many students are at a stage of application, where the summary says. */
export function countOf(code: string, summary: Summary | null): number | undefined {
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
 * The list's filters, in the order every student list of the program has them. District, category, technology, centre and
 * stage are chosen from GET /manage/filters; name and mobile match a part (the page applies them once typing stops).
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
          label="Technology"
          all="All technologies"
          value={value.technology_id}
          options={choices(options?.technologies)}
          onChange={(v) => onChange({ technology_id: v })}
        />
        <Choice
          label="Centre"
          all="All centres"
          value={value.centre_id}
          options={choices(options?.centres)}
          onChange={(v) => onChange({ centre_id: v })}
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
