import { config } from './config';
import type { Statement, StatementLine, VisitState, StageId } from './types';

const P = config.pricing;

function insurancePercent(s: VisitState): number {
  return P.insurance.schemes.find(x => x.id === s.insuranceId)?.percent ?? 0;
}

/** Rules first, then insurance. Returns the adjustments for one line. */
function adjust(s: VisitState, stage: StageId, gross: number) {
  const adjustments: { label: string; amount: number }[] = [];
  let running = gross;
  for (const r of P.rules) {
    if (r.routes && (!s.routeId || !r.routes.includes(s.routeId))) continue;
    if (!r.appliesTo.includes(stage)) continue;
    if (r.requiresWithinDays && s.patient.lastVisitDaysAgo > r.requiresWithinDays) continue;
    const amt = -Math.round(running * r.percentOff / 100);
    if (amt) { adjustments.push({ label: `rule:${r.id}`, amount: amt }); running += amt; }
  }
  const pct = insurancePercent(s);
  if (pct && P.insurance.appliesTo.includes(stage) && running > 0) {
    const amt = -Math.round(running * pct / 100);
    adjustments.push({ label: `insurance:${s.insuranceId}`, amount: amt }); running += amt;
  }
  return { adjustments, net: running };
}

/** Builds the itemised statement from the visit plan and approved orders. Description keys are translated by the UI. */
export function buildStatement(s: VisitState): Statement {
  if (s.serverVisitId) {
    const lines: StatementLine[] = (s.serverCharges ?? []).map((charge, index) => {
      const stage: StageId = charge.code.startsWith('triage') ? 'triage' : charge.code.startsWith('consult') ? 'consultation' : config.labTests.some(x => x.id === charge.code) ? 'laboratory' : config.drugs.some(x => x.id === charge.code) ? 'pharmacy' : 'checkout';
      const adjustment = Math.max(0, charge.adjustmentKes);
      return { key: `${charge.code}:${index}`, stage, description: charge.description, gross: charge.amountKes,
        adjustments: adjustment ? [{ label: 'insurance:server-adjustment', amount: -adjustment }] : [], net: Math.max(0, charge.amountKes - adjustment) };
    });
    return { lines, waivers: [], total: lines.reduce((sum, item) => sum + item.net, 0), version: 'server' };
  }
  const raw: Omit<StatementLine, 'adjustments' | 'net'>[] = [];
  const route = s.routeId ? config.routes[s.routeId] : null;
  const has = (st: StageId) => s.plan.includes(st) || s.deferred.includes(st);

  if (s.routeId === 'pay') {
    if (s.patient.outstanding > 0) raw.push({ key: 'line.outstanding', stage: 'checkout', description: 'line.outstanding', gross: s.patient.outstanding });
  } else if (route) {
    if (has('registration')) raw.push({ key: 'line.registration', stage: 'registration', description: 'line.registration', gross: P.base.registration });
    if (has('triage')) raw.push({ key: 'line.triage', stage: 'triage', description: 'line.triage', gross: P.base.triage });
    if (has('consultation') && route.consult) raw.push({ key: 'line.consult.' + route.consult, stage: 'consultation', description: 'line.consult.' + route.consult, gross: P.base.consultation[route.consult] });
    if (s.orders.labStatus === 'approved' && has('laboratory')) s.orders.labIds.forEach(id => { const t = config.labTests.find(x => x.id === id)!; raw.push({ key: 'lab:' + id, stage: 'laboratory', description: t.name, gross: t.price }); });
    if (s.orders.drugStatus === 'approved' && has('pharmacy')) s.orders.drugIds.forEach(id => { const d = config.drugs.find(x => x.id === id)!; raw.push({ key: 'rx:' + id, stage: 'pharmacy', description: d.name, gross: d.price }); });
  }
  const lines: StatementLine[] = raw.map(r => ({ ...r, ...adjust(s, r.stage, r.gross) }));
  const subtotal = lines.reduce((a, l) => a + l.net, 0);
  const waivers = s.waivers.map(w => ({ label: w.reason, amount: -Math.round(subtotal * w.percent / 100) }));
  const total = Math.max(0, subtotal + waivers.reduce((a, w) => a + w.amount, 0));
  return { lines, waivers, total, version: P.version };
}

/** "So far" is what is already certain; "max" adds typical extras for tests/medicines that may still be ordered. */
export function runningEstimate(s: VisitState): { soFar: number; max: number } {
  const soFar = buildStatement(s).total;
  const pct = insurancePercent(s);
  let extra = 0;
  if (s.stageIndex < s.plan.length) s.tentative.forEach(st => { if (s.plan.includes(st)) extra += (P.typicalExtras[st] ?? 0) * (1 - pct / 100); });
  return { soFar, max: Math.round(soFar + extra) };
}

/** Total for any set of lab test ids / drug ids (used on the doctor's ordering screen). */
export function ordersTotal(labIds: string[], drugIds: string[]): number {
  return labIds.reduce((a, id) => a + (config.labTests.find(t => t.id === id)?.price ?? 0), 0)
    + drugIds.reduce((a, id) => a + (config.drugs.find(d => d.id === id)?.price ?? 0), 0);
}
