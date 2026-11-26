import { useEffect, useRef, useState } from 'react';
import { apiAll } from '../../api';
import { Field } from '../../components/ui';
import { DELIVERY_MODE_LABEL, type DeliveryMode, type MasterOption, type TechnologyOption } from '../../types';
import { isPlanDate, planIssues, plusMonths, type BatchPlan } from './batchPlan';

/* The active technologies, for a batch's technology; null = not loaded. */
export function useTechnologies(wanted: boolean) {
  const [technologies, setTechnologies] = useState<TechnologyOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    let latest = 0;
    const load = () => {
      const request = ++latest;
      apiAll<MasterOption>('/manage/masters/TECHNOLOGY', { realm: 'manage', query: { status: 'ACTIVE' } })
        .then((rows) => {
          if (live && request === latest) {
            setTechnologies(rows.filter((t) => t.is_active).map((t) => ({ id: t.id, code: t.code, name: t.name_en })));
            setFailed(false);
          }
        })
        .catch(() => { if (live && request === latest) { setTechnologies(null); setFailed(true); } });
    };
    load();
    window.addEventListener('focus', load);
    return () => {
      live = false;
      window.removeEventListener('focus', load);
    };
  }, [wanted]);
  return { technologies, failed };
}

/* What is wrong with the plan in this form, whose boxes are named `${id}-start` and `${id}-end`. */
export function checkPlan(form: HTMLFormElement, id: string, plan: BatchPlan, technologies: TechnologyOption[] | null): Record<string, string> {
  const half = (name: string) => !!(form.elements.namedItem(name) as HTMLInputElement | null)?.validity?.badInput;
  const errors = planIssues(plan, { start_date: half(`${id}-start`), end_date: half(`${id}-end`) });
  if (!technologies?.some((t) => t.id === plan.technology)) errors.technology = 'Please select a technology.';
  return errors;
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
}: {
  id: string;
  value: BatchPlan;
  onChange: (plan: BatchPlan) => void;
  errors: Record<string, string>;
  technologies: TechnologyOption[] | null;
  /* The technologies could not be loaded. */
  failed: boolean;
}) {
  const filled = useRef('');
  const setStart = (start_date: string) => {
    const next = { ...value, start_date };
    if (isPlanDate(start_date) && (!value.end_date || value.end_date === filled.current)) next.end_date = filled.current = plusMonths(start_date, 3);
    onChange(next);
  };

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
        error={errors.technology}
        hint={failed ? 'Could not load the technologies.' : 'From Masters → Technologies (active ones).'}
      >
        <select
          id={`${id}-technology`}
          className="inp"
          value={value.technology}
          onChange={(e) => onChange({ ...value, technology: e.target.value })}
          disabled={!technologies || failed}
          required
          aria-invalid={!!errors.technology || undefined}
        >
          <option value="" disabled>{technologies || failed ? 'Select technology' : 'Loading…'}</option>
          {(technologies ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.code})
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}
