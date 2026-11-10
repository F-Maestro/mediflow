import { config } from './config';
import type { StageId, VisitState } from './types';

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Estimated wait = ceil(n / c) x m + r  (n ahead, c staff serving, m median service minutes, r remaining). */
export function estimateWait(ahead: number, servers: number, medianMinutes: number, remaining = 0): number {
  if (ahead <= 0) return 0;
  return Math.ceil(ahead / Math.max(1, servers)) * medianMinutes + remaining;
}

/** "5-8" style range, so we never promise false precision. Returns '' when there is no wait. */
export function waitRange(minutes: number, pad = config.waitDisplay.rangePadding): string {
  if (minutes <= 0) return '';
  const lo = Math.max(1, Math.floor(minutes * (1 - pad)));
  const hi = Math.max(lo, Math.ceil(minutes * (1 + pad)));
  return lo === hi ? `${lo}` : `${lo}\u2013${hi}`;
}

export const stageCfg = (id: StageId) => config.stages.find(s => s.id === id)!;

/** Minutes a stage is likely to take including waiting, for the "about N min" estimate on route cards. */
export function stageMinutes(id: StageId): number {
  const st = stageCfg(id);
  if (id === 'test-review') return 1;
  if (id === 'laboratory') return Math.round(config.labTests.reduce((a, t) => a + t.turnaroundMinutes, 0) / config.labTests.length);
  if (id === 'results-review') return estimateWait(st.demoAhead, st.servers, st.defaultServiceMinutes) + st.defaultServiceMinutes;
  return estimateWait(st.demoAhead, st.servers, st.defaultServiceMinutes) + st.defaultServiceMinutes;
}
export function planMinutes(stages: StageId[]): number {
  return stages.reduce((a, s) => a + stageMinutes(s), 0);
}

export function money(n: number): string {
  const neg = n < 0;
  return `${neg ? '-' : ''}${config.hospital.currency} ${Math.abs(Math.round(n)).toLocaleString('en-KE')}`;
}

export function clockLabel(minutesSinceArrival: number, startHour = 9, startMinute = 0): string {
  const total = startHour * 60 + startMinute + minutesSinceArrival;
  const h = Math.floor(total / 60) % 24, m = total % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export const PHONE_RE = /^(\+?254|0)[17]\d{8}$/;
export function validPhone(p: string): boolean { return PHONE_RE.test(p.replace(/\s+/g, '')); }

export function hasRedFlag(text: string): boolean {
  const t = text.toLowerCase();
  return config.redFlags.some(f => t.includes(f));
}

export type StepStatus = 'done' | 'now' | 'todo' | 'maybe' | 'later';
export interface StepItem { id: StageId; status: StepStatus; }
/** Items for the progress tracker. "maybe" = only if the doctor orders it; "later" = deferred by the patient. */
export function stepItems(s: VisitState): StepItem[] {
  const items: StepItem[] = s.plan.map((id, i) => ({
    id,
    status: i < s.stageIndex ? 'done' : i === s.stageIndex ? 'now' : s.tentative.includes(id) ? 'maybe' : 'todo',
  }));
  s.deferred.forEach(id => items.push({ id, status: 'later' }));
  return items;
}
