import { useSyncExternalStore } from 'react';
import { config } from './config';
import { estimateWait, clockLabel, hasRedFlag, validPhone, stageCfg } from './engine';
import { buildStatement } from './pricing';
import { tr } from './i18n';
import type { VisitState, StageId, RouteId, Lang, Orders, Drug, TimelineEvent, Patient } from './types';
import type { ApiVisit } from './api';

const CANON: StageId[] = ['route', 'registration', 'triage', 'consultation', 'test-review', 'laboratory', 'results-review', 'pharmacy', 'checkout'];
const sortPlan = (p: StageId[]) => [...p].sort((a, b) => CANON.indexOf(a) - CANON.indexOf(b));

function freshVisit(): Partial<VisitState> {
  return {
    routeId: null, plan: ['route'], tentative: [], skipped: [], deferred: [], stageIndex: 0, ahead: 0, vitalReadings: [],
    complaint: config.demoComplaint, diagnosis: '', labNotificationRequested: false, labNotificationSent: false, symptomOnset: '', symptomSeverity: 3, symptomDetails: '',
    historyRequests: [], clinicalNotes: [], staffMessages: [],
    redFlag: false, fastTrack: false, called: false, checkInMethod: null,
    orders: { labIds: [], drugIds: [], labStatus: 'pending', drugStatus: 'pending' }, labs: [], prescriptions: [],
    payment: 'unpaid', payMethod: null, mpesaReceipt: null, demoFailNext: false, waivers: [],
    timeline: [], notices: [], lateNoticeSent: false, feedback: null, clock: 0,
  };
}
function fresh(lang: Lang = 'en'): VisitState {
  return {
    hydrated: false, lang, signedIn: false, patient: { ...config.demoPatient }, insuranceId: 'none', notifyPref: 'push+sms',
    appointments: config.demoAppointments.map(a => ({ ...a })), history: config.demoHistory.map(h => ({ ...h })),
    ...(freshVisit() as object),
  } as VisitState;
}

// ---------------- storage (injected by each app) ----------------
export interface StorageAdapter { getItem(k: string): Promise<string | null> | string | null; setItem(k: string, v: string): Promise<void> | void; }
const KEY = 'mediflow.state.v2';
let storage: StorageAdapter | null = null;
export const configureStorage = (a: StorageAdapter) => { storage = a; };

type Listener = () => void;
let state: VisitState = fresh();
const listeners = new Set<Listener>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const undoStack: VisitState[] = [];

function commit(next: VisitState) {
  state = next;
  listeners.forEach(l => l());
  if (storage && state.hydrated) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { storage!.setItem(KEY, JSON.stringify({ v: 2, state })); } catch { /* ignore */ } }, 80);
  }
}
const patch = (p: Partial<VisitState>) => commit({ ...state, ...p });
const ev = (kind: TimelineEvent['kind'], stage?: StageId): TimelineEvent => ({ kind, stage, at: clockLabel(state.clock) });

export async function hydrate(): Promise<void> {
  if (state.hydrated) return;
  let next = state;
  try {
    const raw = storage ? await storage.getItem(KEY) : null;
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.v === 2) {
        next = { ...fresh(), ...saved.state };
        if (!saved.state.orders?.labStatus || !saved.state.orders?.drugStatus) {
          const old = saved.state.orders ?? { labIds: [], drugIds: [], status: 'pending' };
          const openBeforePharmacy = !['pharmacy', 'checkout'].includes(saved.state.plan?.[saved.state.stageIndex]);
          next.orders = {
            labIds: old.labIds ?? [], drugIds: openBeforePharmacy ? [] : old.drugIds ?? [],
            labStatus: old.labStatus ?? old.status ?? 'pending',
            drugStatus: openBeforePharmacy ? 'pending' : old.drugStatus ?? old.status ?? 'pending',
          };
          if (openBeforePharmacy && next.plan.includes('consultation') && !next.plan.includes('results-review')) {
            const insertAt = next.plan.indexOf('laboratory') >= 0 ? next.plan.indexOf('laboratory') + 1 : next.plan.indexOf('consultation') + 1;
            next.plan = [...next.plan.slice(0, insertAt), 'results-review', ...next.plan.slice(insertAt)];
          }
        }
        next.labs = (next.labs ?? []).map(order => ({ ...order, report: order.report ?? '' }));
        if (next.plan.includes('consultation') && !next.plan.includes('test-review')) {
          const insertAt = next.plan.indexOf('consultation') + 1;
          next.plan = [...next.plan.slice(0, insertAt), 'test-review', ...next.plan.slice(insertAt)];
          if (next.stageIndex >= insertAt) next.stageIndex += 1;
        }
        next.diagnosis = next.diagnosis ?? '';
        next.labNotificationRequested = next.labNotificationRequested ?? false;
        next.labNotificationSent = next.labNotificationSent ?? false;
      }
    }
  } catch { /* start fresh */ }
  commit({ ...next, hydrated: true });
}

// ---------------- selectors ----------------
export const currentStage = (s: VisitState = state): StageId | undefined => s.plan[s.stageIndex];
export const isClosed = (s: VisitState = state) => s.stageIndex >= s.plan.length;
export const labMinutesLeft = (s: VisitState = state) => Math.max(0, ...s.labs.map(o => o.minutesLeft), 0);
export function waitFor(s: VisitState = state): number {
  if (s.serverVisitId) return s.serverWaitMinutes ?? 0;
  const id = currentStage(s); if (!id) return 0;
  const c = stageCfg(id);
  return estimateWait(s.ahead, c.servers, c.defaultServiceMinutes);
}
export function canAdvance(s: VisitState = state): boolean {
  const id = currentStage(s); if (!id) return false;
  switch (id) {
    case 'route': return s.routeId !== null;
    case 'registration': return true;
    case 'consultation': return s.ahead === 0 && (s.diagnosis.trim().length > 0 || s.orders.labStatus === 'proposed') && ['proposed', 'approved'].includes(s.orders.labStatus);
    case 'test-review': return s.orders.labStatus === 'approved';
    case 'laboratory': return labMinutesLeft(s) === 0 && s.labs.length > 0;
    case 'results-review': return s.ahead === 0 && s.orders.drugStatus === 'approved';
    case 'checkout': return s.payment === 'paid' || buildStatement(s).total === 0;
    default: return s.ahead === 0;
  }
}
export const canUndo = () => undoStack.length > 0;
export const canDeferStage = (s: VisitState = state) => { const id = currentStage(s); return !!id && stageCfg(id).canDefer; };
export { buildStatement };

// ---------------- plan building ----------------
function buildPlan(s: VisitState, routeId: RouteId) {
  const r = config.routes[routeId];
  let plan: StageId[] = ['route', ...r.stages];
  const skipped = [] as VisitState['skipped'];
  if (r.withRegistration) {
    if (s.patient.detailsConfirmedDaysAgo <= config.registrationValidDays) skipped.push({ stage: 'registration', reason: 'recent' });
    else plan = sortPlan([...plan, 'registration']);
  } else if (routeId === 'appointment' || routeId === 'results') {
    skipped.push({ stage: 'registration', reason: 'booked' });
  }
  return { plan, skipped, tentative: r.tentative.filter(t => plan.includes(t)) };
}

/** After the first consultation, send approved tests to the lab and hold the pharmacy step for review. */
function resolveTests(s: VisitState): Pick<VisitState, 'plan' | 'skipped' | 'tentative'> {
  let plan = [...s.plan]; const skipped = [...s.skipped];
  const hasTests = s.orders.labStatus === 'approved' && s.orders.labIds.length > 0;
  if (hasTests && !plan.includes('laboratory')) plan = sortPlan([...plan, 'laboratory']);
  if (!hasTests && plan.includes('laboratory')) { plan = plan.filter(x => x !== 'laboratory'); skipped.push({ stage: 'laboratory', reason: 'noLabs' }); }
  if (!plan.includes('results-review')) plan = sortPlan([...plan, 'results-review']);
  plan = plan.filter(x => x !== 'pharmacy');
  return { plan, skipped, tentative: [] };
}

/** After reviewing the lab report, only the prescribed medicines proceed to pharmacy. */
function resolveMedication(s: VisitState): Pick<VisitState, 'plan' | 'skipped' | 'tentative'> {
  let plan = [...s.plan]; const skipped = [...s.skipped];
  const hasDrugs = s.orders.drugStatus === 'approved' && s.orders.drugIds.length > 0;
  if (hasDrugs && !plan.includes('pharmacy')) plan = sortPlan([...plan, 'pharmacy']);
  if (!hasDrugs && plan.includes('pharmacy')) { plan = plan.filter(x => x !== 'pharmacy'); skipped.push({ stage: 'pharmacy', reason: 'noRx' }); }
  return { plan, skipped, tentative: [] };
}

function enter(s: VisitState, next: StageId | undefined): Partial<VisitState> {
  if (!next) return { ahead: 0 };
  const p: Partial<VisitState> = { ahead: next === 'consultation' && s.fastTrack ? 0 : stageCfg(next).demoAhead };
  if (next === 'laboratory') p.labs = s.orders.labIds.map(id => { const test = config.labTests.find(t => t.id === id)!; return { test, minutesLeft: test.turnaroundMinutes, report: '' }; });
  if (next === 'pharmacy') p.prescriptions = s.orders.drugIds.map(id => config.drugs.find(d => d.id === id)!) as Drug[];
  return p;
}

function snapshot() { undoStack.push(state); if (undoStack.length > 10) undoStack.shift(); }
let payToken = 0;
const rid = () => Math.random().toString(36).slice(2, 7);

// ---------------- actions ----------------
export const actions = {
  // session & settings
  setLang(lang: Lang) { patch({ lang }); },
  signIn() { if (!state.signedIn) patch({ signedIn: true, timeline: state.timeline.length ? state.timeline : [ev('signedIn')] }); },
  /** Replace local sample identity with the authenticated server profile; do not persist clinical data in the browser store. */
  setServerIdentity(user: { id: string; role: string; name: string; hospitalNumber: string | null; profile: Record<string, unknown> | null }) {
    const profile = user.profile ?? {};
    const freshState = fresh(state.lang);
    const name = user.name || 'Patient';
    const phone = typeof profile.phone === 'string' ? profile.phone : '';
    freshState.hydrated = true; freshState.signedIn = true; freshState.accountRole = user.role;
    freshState.patient = { ...freshState.patient, name, initials: name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase(), hospitalNo: user.hospitalNumber ?? '', phone,
      nationalId: typeof profile.nationalId === 'string' ? profile.nationalId : '', dob: typeof profile.dob === 'string' ? profile.dob : '', area: typeof profile.area === 'string' ? profile.area : '',
      bloodGroup: typeof profile.bloodGroup === 'string' ? profile.bloodGroup : 'Not recorded', allergy: Array.isArray(profile.allergies) ? profile.allergies.join(', ') || 'Not recorded' : 'Not recorded',
      condition: Array.isArray(profile.conditions) ? profile.conditions.join(', ') || 'None reported' : 'None reported', medicine: Array.isArray(profile.currentMedication) ? profile.currentMedication.join(', ') || 'None reported' : 'None reported',
      lastVisit: 'No visit recorded', lastVisitDaysAgo: 9999, lastBp: 'Not recorded', detailsConfirmedDaysAgo: 9999, outstanding: 0 };
    if (profile.notifyPref === 'sms' || profile.notifyPref === 'push+sms') freshState.notifyPref = profile.notifyPref;
    freshState.appointments = []; freshState.history = []; freshState.timeline = [ev('signedIn')]; undoStack.length = 0; payToken++; commit(freshState);
  },
  setServerAppointments(items: Array<{ id: string; clinic: string; doctor: string; scheduledAt: string; status: string }>) {
    const appointments = items.map(item => { const d = new Date(item.scheduledAt); return { id: item.id, clinic: item.clinic, doctor: item.doctor,
      day: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }), time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
      status: item.status === 'cancelled' ? 'cancelled' as const : item.status === 'completed' ? 'completed' as const : 'booked' as const,
      today: d.toDateString() === new Date().toDateString() }; });
    patch({ appointments });
  },
  setServerHistory(items: ApiVisit[]) {
    patch({ history: items.filter(item => item.status === 'completed').map(item => ({ id: item.id, dateLabel: new Date(item.completedAt ?? item.createdAt).toLocaleDateString(), route: item.routeId as RouteId, total: (item.charges ?? []).reduce((sum, c) => sum + c.amountKes - c.adjustmentKes, 0), summary: item.diagnosis || item.complaint || 'Visit completed' })) });
  },
  setServerTrends(items: Array<Record<string, unknown>>) {
    patch({ vitalReadings: items.map(item => ({ id: String(item.id), recordedAt: String(item.measuredAt), bloodPressureSystolic: typeof item.bloodPressureSystolic === 'number' ? item.bloodPressureSystolic : null,
      bloodPressureDiastolic: typeof item.bloodPressureDiastolic === 'number' ? item.bloodPressureDiastolic : null, heartRate: typeof item.heartRate === 'number' ? item.heartRate : null,
      weightKg: typeof item.weightKg === 'number' ? item.weightKg : null, temperatureC: typeof item.temperatureC === 'number' ? item.temperatureC : null })) });
  },
  setServerCatalog(items: Array<{ code: string; name: string; kind: string; priceKes: number; inventoryQuantity: number }>) {
    patch({ catalogTests: items.filter(x => x.kind === 'lab').map(x => ({ id: x.code, name: x.name, price: x.priceKes, turnaroundMinutes: config.labTests.find(y => y.id === x.code)?.turnaroundMinutes ?? 20 })),
      catalogDrugs: items.filter(x => x.kind === 'medicine').map(x => ({ id: x.code, name: x.name, price: x.priceKes, directions: 'Directions are provided on the doctor’s prescription.', inStock: x.inventoryQuantity > 0, stockKnown: true })) });
  },
  setServerHistoryRequests(items: Array<{ id: string; note: string; status: string; createdAt: string }>) {
    patch({ historyRequests: items.map(item => ({ id: item.id, note: item.note, status: item.status as 'requested' | 'processing' | 'fulfilled' | 'declined', requestedAt: new Date(item.createdAt).toLocaleString() })) });
  },
  setServerVisit(visit: ApiVisit | null) {
    if (!visit) { patch({ serverVisitId: undefined, serverWaitMinutes: 0, routeId: null, plan: ['route'], stageIndex: 0, ahead: 0, orders: { labIds: [], drugIds: [], labStatus: 'pending', drugStatus: 'pending' }, labs: [], prescriptions: [], serverCharges: [] }); return; }
    const routeId = visit.routeId as RouteId;
    const orders = visit.orders ?? [];
    const labs = orders.filter(item => item.kind === 'lab' && item.status !== 'declined');
    const meds = orders.filter(item => item.kind === 'medicine' && item.status !== 'declined');
    const plan = ['route', ...config.routes[routeId].stages.filter(stage => stage !== 'laboratory' || labs.length > 0).filter(stage => stage !== 'pharmacy' || meds.some(item => item.status !== 'proposed'))] as StageId[];
    const stageIndex = visit.status === 'completed' ? plan.length : Math.max(0, plan.indexOf(visit.stage as StageId));
    const labStatus = labs.some(item => item.status === 'proposed') ? 'proposed' : labs.length ? 'approved' : (visit.stage === 'test-review' ? 'pending' : 'approved');
    const drugStatus = meds.some(item => item.status === 'proposed') ? 'proposed' : meds.length ? 'approved' : (visit.stage === 'results-review' ? 'pending' : 'approved');
    const catalogTest = (id: string, name: string, price: number) => ({ id, name, turnaroundMinutes: config.labTests.find(x => x.id === id)?.turnaroundMinutes ?? 20, price });
    const labOrders = labs.map(item => ({ test: catalogTest(item.code, item.name, item.priceKes), minutesLeft: 0, report: item.result ?? '' }));
    const drugOrders = meds.map(item => ({ id: item.code, name: item.name, directions: item.directions ?? 'Directions were not provided by the prescriber.', price: item.priceKes, inStock: (item.inventoryQuantity ?? 0) >= item.quantity, stockKnown: true }));
    patch({ serverVisitId: visit.id, serverWaitMinutes: visit.queue?.estimatedWaitMinutes ?? 0, routeId, plan, stageIndex, ahead: visit.queue?.ahead ?? 0, called: visit.queue?.called ?? false, complaint: visit.complaint, diagnosis: visit.diagnosis,
      orders: { labIds: labs.map(item => item.code), drugIds: meds.map(item => item.code), labStatus, drugStatus }, labs: labOrders,
      prescriptions: visit.stage === 'pharmacy' ? drugOrders : [], serverCharges: visit.charges ?? [], payment: (visit.charges ?? []).every(c => c.status === 'paid' || c.status === 'waived') && visit.charges?.length ? 'paid' : 'unpaid' });
  },
  /** Creates a browser-local demo profile. A real account must be created through a backend. */
  registerPatient(input: { name: string; phone: string; nationalId: string; dob: string; area: string }): string | null {
    const name = input.name.trim(); const phone = input.phone.trim(); const nationalId = input.nationalId.trim(); const area = input.area.trim();
    const birthDate = new Date(`${input.dob}T00:00:00`);
    const today = new Date(); today.setHours(23, 59, 59, 999);
    if (name.length < 3) return 'err.regName';
    if (!validPhone(phone)) return 'err.phone';
    if (nationalId.length < 5) return 'err.regId';
    if (!input.dob || !Number.isFinite(birthDate.getTime()) || birthDate > today) return 'err.regDob';
    if (area.length < 2) return 'err.area';
    const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
    const patient: Patient = {
      name, initials, hospitalNo: 'DEMO-' + rid().toUpperCase(), phone: phone.replace(/\s+/g, ''), nationalId,
      dob: input.dob, area, bloodGroup: 'Not recorded', allergy: 'Not recorded', condition: 'None reported',
      lastVisit: 'First visit', lastVisitDaysAgo: 9999, medicine: 'None reported', lastBp: 'Not recorded',
      detailsConfirmedDaysAgo: config.registrationValidDays + 1, outstanding: 0,
    };
    const next = fresh(state.lang);
    next.hydrated = true; next.signedIn = true; next.patient = patient; next.history = []; next.appointments = [];
    next.timeline = [{ kind: 'signedIn', at: clockLabel(0) }];
    undoStack.length = 0; payToken++; commit(next);
    return null;
  },
  signOut() { patch({ signedIn: false }); },
  setInsurance(insuranceId: string) { patch({ insuranceId }); },
  setNotifyPref(notifyPref: 'push+sms' | 'sms') { patch({ notifyPref }); },
  /** Returns an error key, or null when saved. */
  updateDetails(phone: string, area: string): string | null {
    if (!validPhone(phone)) return 'err.phone';
    if (area.trim().length < 2) return 'err.area';
    patch({ patient: { ...state.patient, phone: phone.replace(/\s+/g, ''), area: area.trim(), detailsConfirmedDaysAgo: 0 } });
    return null;
  },
  dismissNotice(id: string) { patch({ notices: state.notices.filter(n => n.id !== id) }); },
  setFeedback(n: number) { patch({ feedback: n }); },
  toggleFailNext() { patch({ demoFailNext: !state.demoFailNext }); },

  // route choice builds the personalised journey
  chooseRoute(routeId: RouteId, method: 'qr' | 'desk' | null = null) {
    const { plan, skipped, tentative } = buildPlan(state, routeId);
    const orders: Orders = routeId === 'refill' ? { labIds: [], drugIds: config.refillDrugIds, labStatus: 'approved', drugStatus: 'approved' } : { labIds: [], drugIds: [], labStatus: 'pending', drugStatus: 'pending' };
    const redFlag = hasRedFlag(state.complaint) && config.routes[routeId].askComplaint;
    patch({ routeId, plan, skipped, tentative, orders, diagnosis: '', labNotificationRequested: false, labNotificationSent: false, checkInMethod: method, redFlag, fastTrack: false, stageIndex: 0,
      timeline: method ? [...state.timeline, ev('checkedIn')] : state.timeline });
  },
  setComplaint(complaint: string) { patch({ complaint, redFlag: !!state.routeId && config.routes[state.routeId].askComplaint && hasRedFlag(complaint) }); },
  setSymptomIntake(symptomOnset: string, symptomSeverity: number, symptomDetails: string) {
    patch({ symptomOnset: symptomOnset.slice(0, 80), symptomSeverity: Math.max(1, Math.min(10, symptomSeverity)), symptomDetails: symptomDetails.slice(0, 1000) });
  },
  /** Save a triage measurement set locally; missing values are omitted, never inferred. */
  recordVitals(input: { bloodPressureSystolic?: number | null; bloodPressureDiastolic?: number | null; heartRate?: number | null; weightKg?: number | null; temperatureC?: number | null }) {
    const finite = (value: number | null | undefined, min: number, max: number) => value == null || !Number.isFinite(value) || value < min || value > max ? null : value;
    const systolic = finite(input.bloodPressureSystolic, 50, 300);
    const diastolic = finite(input.bloodPressureDiastolic, 30, 200);
    const validBloodPressure = systolic !== null && diastolic !== null;
    const reading = { id: 'vital-' + rid(), recordedAt: new Date().toISOString(), bloodPressureSystolic: validBloodPressure ? systolic : null, bloodPressureDiastolic: validBloodPressure ? diastolic : null,
      heartRate: finite(input.heartRate, 20, 250), weightKg: finite(input.weightKg, 1, 500), temperatureC: finite(input.temperatureC, 30, 45) };
    if (Object.values(reading).slice(2).every(value => value === null)) return false;
    patch({ vitalReadings: [...(state.vitalReadings ?? []), reading], patient: { ...state.patient, lastBp: systolic !== null && diastolic !== null ? `${systolic}/${diastolic} mmHg` : state.patient.lastBp } });
    return true;
  },
  /** Demo-only record: this is not transmitted to a hospital or backend. */
  requestMedicalHistory(note = '') {
    const request = { id: 'hist-' + rid(), requestedAt: new Date().toLocaleString(), note: note.trim().slice(0, 300), status: 'local-demo' as const };
    patch({ historyRequests: [request, ...state.historyRequests] });
  },
  addClinicalNote(text: string) {
    const clean = text.trim().slice(0, 2000);
    if (!clean) return;
    patch({ clinicalNotes: [{ id: 'note-' + rid(), createdAt: new Date().toLocaleString(), author: config.demoDoctor.name, text: clean }, ...state.clinicalNotes] });
  },
  sendStaffMessage(text: string) {
    const clean = text.trim().slice(0, 500);
    if (!clean) return;
    patch({ staffMessages: [...state.staffMessages, { id: 'msg-' + rid(), createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), author: config.demoDoctor.name, text: clean }] });
  },

  advance() {
    if (!canAdvance()) return;
    snapshot();
    const done = currentStage()!;
    let s: VisitState = { ...state, timeline: [...state.timeline, ev('done', done)] };
    if (done === 'registration') s.patient = { ...s.patient, detailsConfirmedDaysAgo: 0 };
    if (done === 'triage' && s.redFlag) { s.fastTrack = true; s.timeline = [...s.timeline, ev('fast')]; }
    if (done === 'test-review') Object.assign(s, resolveTests(s));
    if (done === 'results-review') Object.assign(s, resolveMedication(s));
    s.stageIndex = s.stageIndex + 1;
    s.called = false;
    Object.assign(s, enter(s, s.plan[s.stageIndex]));
    if (s.stageIndex >= s.plan.length) {            // visit closed
      const total = buildStatement(s).total;
      s.history = [{ id: 'v-' + rid(), dateLabel: 'Today', route: s.routeId!, total, summary: s.timeline.length + ' steps' }, ...s.history];
      if (s.routeId === 'pay') s.patient = { ...s.patient, outstanding: 0 };
    }
    commit(s);
  },

  /** Patient chooses to do lab/pharmacy later. Never allowed for triage, consultation or checkout. */
  defer() {
    const id = currentStage();
    if (!id || !stageCfg(id).canDefer) return;
    snapshot();
    const deferringLabResults = id === 'laboratory';
    let plan = state.plan.filter((stage, i) => i !== state.stageIndex && !(deferringLabResults && stage === 'results-review'));
    const skipped = [...state.skipped];
    if (deferringLabResults && plan.includes('pharmacy')) { plan = plan.filter(stage => stage !== 'pharmacy'); skipped.push({ stage: 'pharmacy', reason: 'noRx' }); }
    const next = plan[state.stageIndex];
    const deferred: StageId[] = deferringLabResults ? [...state.deferred, 'laboratory'] : [...state.deferred, id];
    const timeline = [...state.timeline, ev('deferred', id)];
    commit({ ...state, plan, skipped, deferred, timeline, labNotificationRequested: false, ...enter({ ...state, plan }, next) } as VisitState);
  },

  tick(minutes = 5) {
    const id = currentStage();
    let ahead = state.ahead;
    if (id && ahead > 0) { const c = stageCfg(id); ahead = Math.max(0, ahead - c.servers * Math.ceil(minutes / c.defaultServiceMinutes)); }
    const labs = state.labs.map(o => ({ ...o, minutesLeft: Math.max(0, o.minutesLeft - minutes) }));
    const timeline = [...state.timeline];
    let notices = state.notices; let lateNoticeSent = state.lateNoticeSent;
    if (id && state.ahead > 0 && ahead === 0 && ['triage', 'consultation', 'results-review', 'pharmacy'].includes(id)) timeline.push(ev('called', id));
    if (id === 'consultation' && state.ahead > 0 && !lateNoticeSent) { notices = [...notices, { id: rid(), key: 'notice.late' }]; lateNoticeSent = true; }
    commit({ ...state, clock: state.clock + minutes, ahead, labs, timeline, notices, lateNoticeSent, called: ahead === 0 && state.ahead > 0 ? true : state.called });
    // In the local demo, the doctor records an assessment and test plan at consultation.
    if (id === 'consultation' && ahead === 0 && state.orders.labStatus === 'pending')
      actions.submitDiagnosis(config.demoDiagnosis, config.demoOrders.labIds);
    // After the lab report is available, the demo doctor proposes medicines at review.
    if (id === 'results-review' && ahead === 0 && state.orders.drugStatus === 'pending')
      actions.proposeDrugs(config.demoOrders.drugIds);
  },

  // Doctor completes the assessment and sends the test plan to the patient for review.
  submitDiagnosis(diagnosis: string, labIds: string[]) {
    const cleanDiagnosis = diagnosis.trim().slice(0, 2000);
    if (currentStage() !== 'consultation' || state.ahead > 0 || !cleanDiagnosis) return false;
    patch({ diagnosis: cleanDiagnosis, orders: { ...state.orders, labIds, drugIds: [], labStatus: labIds.length ? 'proposed' : 'approved', drugStatus: 'pending' } });
    return true;
  },
  approveTests(declinedLab: string[] = []) {
    if (currentStage() !== 'test-review' || state.orders.labStatus !== 'proposed') return;
    patch({ orders: { ...state.orders, labIds: state.orders.labIds.filter(i => !declinedLab.includes(i)), labStatus: 'approved' } });
  },
  /** Lab staff enter reported values after processing; blank reports cannot be released to the doctor. */
  setLabReport(testId: string, report: string) {
    if (!['laboratory', 'results-review'].includes(currentStage() ?? '') || labMinutesLeft() > 0 || !state.labs.some(o => o.test.id === testId)) return;
    const labs = state.labs.map(order => order.test.id === testId ? { ...order, report: report.slice(0, 2000) } : order);
    const ready = labs.length > 0 && labs.every(order => order.report.trim());
    const shouldNotify = ready && state.labNotificationRequested;
    const notices = shouldNotify ? [...state.notices, { id: rid(), key: 'notice.labReady' }] : state.notices;
    patch({ labs, labNotificationRequested: shouldNotify ? false : state.labNotificationRequested, labNotificationSent: shouldNotify || state.labNotificationSent, notices });
  },
  requestLabNotification() {
    if (!['laboratory', 'results-review'].includes(currentStage() ?? '')) return;
    if (state.labNotificationRequested || state.labNotificationSent) return;
    const ready = labMinutesLeft() === 0 && state.labs.length > 0 && state.labs.every(order => order.report.trim());
    if (ready) {
      patch({ labNotificationRequested: false, labNotificationSent: true, notices: [...state.notices, { id: rid(), key: 'notice.labReady' }] });
      return;
    }
    patch({ labNotificationRequested: true });
  },
  /** One-click synthetic completion for the local walkthrough; never use as a clinical report. */
  simulateDemoLabCompletion() {
    if (!config.demoMode || !['laboratory', 'results-review'].includes(currentStage() ?? '') || state.labs.length === 0) return;
    const labs = state.labs.map(order => ({ ...order, minutesLeft: 0, report: order.report.trim() ? order.report : config.demoLabReport }));
    const notify = state.labNotificationRequested;
    const notices = notify ? [...state.notices, { id: rid(), key: 'notice.labReady' }] : state.notices;
    patch({ labs, labNotificationRequested: false, labNotificationSent: notify || state.labNotificationSent, notices });
  },
  // Medication recommendations are made only from the post-lab doctor review step.
  proposeDrugs(drugIds: string[]) {
    if (currentStage() !== 'results-review' || state.ahead > 0) return;
    // A consultation that ordered tests must have every lab report recorded before
    // the doctor can send a medication recommendation to the patient.
    if (state.orders.labIds.length > 0 && (state.labs.length !== state.orders.labIds.length || state.labs.some(lab => !lab.report.trim()))) return;
    patch({ orders: { ...state.orders, drugIds, drugStatus: drugIds.length ? 'proposed' : 'approved' } });
  },
  approveDrugs(declinedDrug: string[] = []) {
    if (currentStage() !== 'results-review' || state.orders.drugStatus !== 'proposed') return;
    patch({ orders: { ...state.orders, drugIds: state.orders.drugIds.filter(i => !declinedDrug.includes(i)), drugStatus: 'approved' } });
  },

  // payment
  payMpesa() {
    if (state.payment === 'pending' || state.payment === 'paid') return;
    const token = ++payToken;
    patch({ payment: 'pending', payMethod: 'mpesa' });
    setTimeout(() => {
      if (token !== payToken || state.payment !== 'pending') return;
      if (state.demoFailNext) { patch({ payment: 'failed', demoFailNext: false }); return; }
      patch({ payment: 'paid', mpesaReceipt: 'MP' + Math.random().toString(36).slice(2, 9).toUpperCase(), timeline: [...state.timeline, ev('paid', 'checkout')] });
    }, 2500);
  },
  cancelPayment() { payToken++; patch({ payment: 'unpaid', payMethod: null }); },
  recordCash() { payToken++; patch({ payment: 'paid', payMethod: 'cash', mpesaReceipt: 'CASH-' + rid().toUpperCase(), timeline: [...state.timeline, ev('paid', 'checkout')] }); },
  /** Staff-authorised only: patients cannot waive charges. */
  waive(percent: number, reason: string, by: string) { patch({ waivers: [{ percent, reason, by }] }); },

  // staff tools
  callNext() {
    if (state.ahead > 0) patch({ ahead: state.ahead - 1 });
    else if (!state.called) patch({ called: true, timeline: [...state.timeline, ev('called', currentStage())] });
  },
  undo() {
    const prev = undoStack.pop();
    if (prev) commit({ ...prev, lang: state.lang, hydrated: true, signedIn: state.signedIn, appointments: state.appointments });
  },

  // appointments
  bookAppointment(clinic: string, day: string, time: string) {
    patch({ appointments: [...state.appointments, { id: 'apt-' + rid(), clinic, doctor: config.demoDoctor.name, day, time, status: 'booked', today: false }] });
  },
  rescheduleAppointment(id: string, day: string, time: string) {
    patch({ appointments: state.appointments.map(a => a.id === id ? { ...a, day, time, today: false } : a) });
  },
  cancelAppointment(id: string) { patch({ appointments: state.appointments.map(a => a.id === id ? { ...a, status: 'cancelled' } : a) }); },

  newVisit() { patch({ ...(freshVisit() as object) } as Partial<VisitState>); undoStack.length = 0; },
  restartDemo() { payToken++; undoStack.length = 0; commit({ ...fresh(state.lang), hydrated: true, signedIn: state.signedIn }); },
};

export const getState = () => state;
const subscribe = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** React hook used by both apps. T translates a key in the patient's chosen language. */
export function useVisit() {
  const s = useSyncExternalStore(subscribe, getState, getState);
  const T = (key: string, vars?: Record<string, string | number>) => tr(s.lang, key, vars);
  return { state: s, actions, T };
}

/** Upcoming days for booking (real dates, no timezone maths). */
export function upcomingDays(count = 4): string[] {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i + 1);
    return i === 0 ? 'Tomorrow' : `${names[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
  });
}
