export type StageId = 'registration' | 'route' | 'triage' | 'consultation' | 'test-review' | 'laboratory' | 'results-review' | 'pharmacy' | 'checkout';
export type RouteId = 'walk-in' | 'appointment' | 'follow-up' | 'results' | 'refill' | 'pay';
export type Lang = 'en' | 'sw';
export type ConsultKind = 'general' | 'specialist' | 'review' | 'followUp';

export interface StageConfig {
  id: StageId;
  defaultServiceMinutes: number;   // minutes when the queue is empty
  servers: number;                 // staff serving this stage
  demoAhead: number;               // demo: patients ahead when you arrive
  canDefer: boolean;               // patient may choose "do this later"
}
export interface RouteConfig {
  id: RouteId;
  stages: StageId[];               // stages after the always-first "route" step
  tentative: StageId[];            // stages that only happen if the doctor orders them
  withRegistration: boolean;       // show registration unless details are recent
  consult: ConsultKind | null;     // which consultation fee applies
  askComplaint: boolean;
}
export interface LabTest { id: string; name: string; turnaroundMinutes: number; price: number; }
export interface Drug { id: string; name: string; directions: string; price: number; inStock: boolean; stockKnown?: boolean; }

export interface Patient {
  name: string; initials: string; hospitalNo: string; phone: string; nationalId: string;
  dob: string; area: string; bloodGroup: string; allergy: string; condition: string;
  lastVisit: string; lastVisitDaysAgo: number; medicine: string; lastBp: string;
  detailsConfirmedDaysAgo: number; outstanding: number;
}
export interface Appointment { id: string; clinic: string; doctor: string; day: string; time: string; status: 'booked' | 'cancelled' | 'completed'; today: boolean; }
export interface PastVisit { id: string; dateLabel: string; route: RouteId; total: number; summary: string; }
/** Measurements recorded by clinical staff during triage. Missing values stay null. */
export interface VitalReading { id: string; recordedAt: string; bloodPressureSystolic: number | null; bloodPressureDiastolic: number | null; heartRate: number | null; weightKg: number | null; temperatureC: number | null; }
export interface HistoryRequest { id: string; requestedAt: string; note: string; status: 'requested' | 'processing' | 'fulfilled' | 'declined' | 'local-demo'; }
export interface ClinicalNote { id: string; createdAt: string; author: string; text: string; }
export interface StaffMessage { id: string; createdAt: string; author: string; text: string; }

export interface LabOrder { test: LabTest; minutesLeft: number; report: string; }
export type OrderStatus = 'pending' | 'proposed' | 'approved';
export interface Orders { labIds: string[]; drugIds: string[]; labStatus: OrderStatus; drugStatus: OrderStatus; }
export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed';
export interface Waiver { percent: number; reason: string; by: string; }
export interface TimelineEvent { kind: 'signedIn' | 'done' | 'skipped' | 'deferred' | 'called' | 'fast' | 'paid' | 'checkedIn'; stage?: StageId; at: string; }
export interface SkippedStage { stage: StageId; reason: 'booked' | 'recent' | 'noLabs' | 'noRx' | 'deferred'; }
export interface Notice { id: string; key: string; }

export interface StatementLine {
  key: string; stage: StageId; description: string; gross: number;
  adjustments: { label: string; amount: number }[]; net: number;
}
export interface Statement { lines: StatementLine[]; waivers: { label: string; amount: number }[]; total: number; version: string; }

export interface VisitState {
  hydrated: boolean;
  lang: Lang;
  signedIn: boolean;
  accountRole?: string;
  patient: Patient;
  insuranceId: string;
  notifyPref: 'push+sms' | 'sms';
  appointments: Appointment[];
  history: PastVisit[];
  vitalReadings?: VitalReading[];
  serverVisitId?: string;
  serverWaitMinutes?: number;
  serverCharges?: Array<{ code: string; description: string; amountKes: number; adjustmentKes: number; status: string }>;
  catalogTests?: LabTest[];
  catalogDrugs?: Drug[];
  // ---- current visit ----
  routeId: RouteId | null;
  plan: StageId[];
  tentative: StageId[];
  skipped: SkippedStage[];
  deferred: StageId[];
  stageIndex: number;
  ahead: number;
  complaint: string;
  diagnosis: string;
  labNotificationRequested: boolean;
  labNotificationSent: boolean;
  symptomOnset: string;
  symptomSeverity: number;
  symptomDetails: string;
  historyRequests: HistoryRequest[];
  clinicalNotes: ClinicalNote[];
  staffMessages: StaffMessage[];
  redFlag: boolean;
  fastTrack: boolean;
  called: boolean;
  checkInMethod: 'qr' | 'desk' | null;
  orders: Orders;
  labs: LabOrder[];
  prescriptions: Drug[];
  payment: PaymentStatus;
  payMethod: 'mpesa' | 'cash' | null;
  mpesaReceipt: string | null;
  demoFailNext: boolean;
  waivers: Waiver[];
  timeline: TimelineEvent[];
  notices: Notice[];
  lateNoticeSent: boolean;
  feedback: number | null;
  clock: number;
}
