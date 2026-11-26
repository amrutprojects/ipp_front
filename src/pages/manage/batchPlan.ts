import { ddmmyyyy } from '../../components/ui';
import { DELIVERY_MODE_LABEL, type Batch, type DeliveryMode } from '../../types';
import { realDate } from '../../validation';

/* When and how a batch is held, as its form has it: '' = not given. */
export interface BatchPlan {
  start_date: string;
  end_date: string;
  delivery_mode: DeliveryMode;
  technology: string;
}
export const NO_PLAN: BatchPlan = { start_date: '', end_date: '', delivery_mode: 'OFFLINE', technology: '' };
/* A batch's plan; what an older API leaves out is empty. */
export const planOf = (b: Batch): BatchPlan => ({
  start_date: b.start_date ?? '',
  end_date: b.end_date ?? '',
  delivery_mode: b.delivery_mode ?? NO_PLAN.delivery_mode,
  technology: b.technology?.id ?? '',
});

/* A real day of a year that can be meant: a year typed with two digits reads as 0026. */
export const isPlanDate = (v: string) => realDate(v) && v >= '2000-01-01' && v <= '2100-12-31';

/* The same day `months` later, or the last day of that month (30 November + 3 = 28 or 29 February). */
export function plusMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

/* What is wrong with the dates; `half` = a date box that is only half filled in (it reads as empty). */
export function planIssues(p: BatchPlan, half: { start_date?: boolean; end_date?: boolean } = {}): Record<string, string> {
  const e: Record<string, string> = {};
  if (half.start_date || (p.start_date && !isPlanDate(p.start_date))) e.start_date = 'Enter a valid start date';
  if (p.start_date && !e.start_date && p.end_date && p.end_date <= p.start_date) e.end_date = 'End date must be after the start date';
  else if (half.end_date || (p.end_date && !isPlanDate(p.end_date))) e.end_date = 'Enter a valid end date';
  return e;
}

/* For a new batch: only what is given. Offline is the API's own default, so it is not sent (an older API takes no mode). */
export const planBody = (p: BatchPlan) => ({
  start_date: p.start_date || undefined,
  end_date: p.end_date || undefined,
  delivery_mode: p.delivery_mode === NO_PLAN.delivery_mode ? undefined : p.delivery_mode,
  technology: p.technology || undefined,
});
/* For a saved one: only what changed; null clears a date. */
export function planChanges(p: BatchPlan, saved: BatchPlan): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const k of ['start_date', 'end_date', 'technology'] as const) if (p[k] !== saved[k]) body[k] = p[k] || null;
  if (p.delivery_mode !== saved.delivery_mode) body.delivery_mode = p.delivery_mode;
  return body;
}

/* How a batch's plan is read. */
export function batchDates(b: Batch): string {
  if (b.start_date && b.end_date) return `${ddmmyyyy(b.start_date)} – ${ddmmyyyy(b.end_date)}`;
  if (b.start_date) return `From ${ddmmyyyy(b.start_date)}`;
  return b.end_date ? `Until ${ddmmyyyy(b.end_date)}` : '—';
}
export const deliveryLabel = (b: Batch) => (b.delivery_mode ? (DELIVERY_MODE_LABEL[b.delivery_mode] ?? b.delivery_mode) : '—');
export const technologyLabel = (b: Batch) => (b.technology ? `${b.technology.name} (${b.technology.code})` : '—');

/* "2 of 30 students chose another center"; '' when none did. */
export const otherCentreText = (other: number | undefined, students: number) =>
  other ? `${other} of ${students} student${students === 1 ? '' : 's'} chose another center` : '';
