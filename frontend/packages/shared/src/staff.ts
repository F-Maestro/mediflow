import { config } from './config';
import type { StageId, VisitState } from './types';
import { estimateWait, stageCfg } from './engine';
import { currentStage } from './store';

export type StaffRole = { id: string; stage: StageId };
export const staffRoles: StaffRole[] = [
  { id: 'registrar', stage: 'registration' }, { id: 'nurse', stage: 'triage' }, { id: 'doctor', stage: 'consultation' },
  { id: 'lab', stage: 'laboratory' }, { id: 'pharmacist', stage: 'pharmacy' }, { id: 'cashier', stage: 'checkout' },
];
const names = ['Mary Wanjiku', 'John Otieno', 'Fatuma Hassan', 'Peter Kamau', 'Grace Achieng', 'Brian Mutua'];
export interface QueueRow { name: string; detail: string; isYou: boolean; }

/** Demo queue for a stage: the sample patient plus the others ahead of them. */
export function staffQueue(stage: StageId, s: VisitState): { rows: QueueRow[]; load: number; waitMinutes: number } {
  const c = stageCfg(stage);
  const labFollowUp = stage === 'laboratory' && currentStage(s) === 'results-review' && s.labs.some(order => !order.report.trim());
  const youHere = currentStage(s) === stage || labFollowUp;
  const others = youHere ? (labFollowUp ? 0 : s.ahead) : config.stages.find(x => x.id === stage)!.demoAhead;
  const rows: QueueRow[] = [];
  for (let i = 0; i < others; i++) rows.push({ name: names[(i + stage.length) % names.length], detail: `#${i + 1}`, isYou: false });
  if (youHere) rows.push({ name: s.patient.name, detail: `${s.patient.hospitalNo}${s.fastTrack ? ' · FAST-TRACK' : ''}${s.redFlag ? ' · RED FLAG' : ''}`, isYou: true });
  return { rows, load: rows.length, waitMinutes: estimateWait(rows.length, c.servers, c.defaultServiceMinutes) };
}
