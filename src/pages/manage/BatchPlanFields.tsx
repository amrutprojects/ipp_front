import { useEffect, useRef, useState } from 'react';
import { apiAll } from '../../api';
import { Field } from '../../components/ui';
import { DELIVERY_MODE_LABEL, type Batch, type DeliveryMode, type MasterOption, type TechnologyOption } from '../../types';
import { isPlanDate, planIssues, plusMonths, type BatchPlan } from './batchPlan';

/* The active technologies, for a batch's technology; null = not loaded. */
export function useTechnologies(wanted: boolean) {
  const [technologies, setTechnologies] = useState<TechnologyOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    apiAll<MasterOption>('/manage/masters/TECHNOLOGY', { realm: 'manage', query: { status: 'ACTIVE' } })
      .then((rows) => live && setTechnologies(rows.filter((t) => t.is_active).map((t) => ({ code: t.code, name: t.name_en }))))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [wanted]);
  return { technologies, failed };
}

/* What is wrong with the plan in this form, whose boxes are named `${id}-start` and `${id}-end`. */
export function checkPlan(form: HTMLFormElement, id: string, plan: BatchPlan): Record<string, string> {
  const half = (name: string) => !!(form.elements.namedItem(name) as HTMLInputElement | null)?.validity?.badInput;
  return planIssues(plan, { start_date: half(`${id}-start`), end_date: half(`${id}-end`) });
}

/*
 * A batch's dates, delivery mode and technology (Create batch, and Batch details of the batch page). Choosing the start
 * date fills an empty end date with three months later; that one follows the start date until it is changed by hand.
 */
export default function BatchPlanFields({
  id,
  value,
  onChange,
  errors,
  technologies,
  failed,
  saved,
}: {
  id: string;
  value: BatchPlan;
  onChange: (plan: BatchPlan) => void;
  errors: Record<string, string>;
  technologies: TechnologyOption[] | null;
  /* The technologies could not be loaded. */
  failed: boolean;
  /* The batch as saved: its technology stays selectable when it is inactive now. */
  saved?: Batch;
}) {
  const filled = useRef('');
  const setStart = (start_date: string) => {
    const next = { ...value, start_date };
    if (isPlanDate(start_date) && (!value.end_date || value.end_date === filled.current)) next.end_date = filled.current = plusMonths(start_date, 3);
    onChange(next);
  };
  const own = saved?.technology;
  const items = [...(technologies ?? [])];
  if (own && !items.some((t) => t.code === own.code)) items.push(technologies ? { ...own, name: `${own.name} (inactive)` } : own);

  return (
    <>
      <Field id={`${id}-start`} label="Start date" required={false} error={errors.start_date}>
        <input
          id={`${id}-start`}
          className="inp"
          type="date"
          value={value.start_date}
          onChange={(e) => setStart(e.target.value)}
          aria-invalid={!!errors.start_date || undefined}
        />
      </Field>
      <Field id={`${id}-end`} label="End date" required={false} error={errors.end_date}>
        <input
          id={`${id}-end`}
          className="inp"
          type="date"
          value={value.end_date}
          onChange={(e) => onChange({ ...value, end_date: e.target.value })}
          aria-invalid={!!errors.end_date || undefined}
        />
      </Field>
      <Field id={`${id}-mode`} label="Delivery mode" error={errors.delivery_mode}>
        <select
          id={`${id}-mode`}
          className="inp"
          value={value.delivery_mode}
          onChange={(e) => onChange({ ...value, delivery_mode: e.target.value as DeliveryMode })}
        >
          {Object.entries(DELIVERY_MODE_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        id={`${id}-technology`}
        label="Technology"
        required={false}
        error={errors.technology}
        hint={failed ? 'Could not load the technologies.' : 'From Masters → Technologies (active ones).'}
      >
        <select
          id={`${id}-technology`}
          className="inp"
          value={value.technology}
          onChange={(e) => onChange({ ...value, technology: e.target.value })}
          disabled={!technologies && !failed}
        >
          <option value="">{technologies || failed ? 'Select technology (optional)' : 'Loading…'}</option>
          {items.map((t) => (
            <option key={t.code} value={t.code}>
              {t.name} ({t.code})
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}
