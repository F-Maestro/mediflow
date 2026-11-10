import type { StageConfig, RouteConfig, LabTest, Drug, Patient, RouteId, Appointment, PastVisit } from './types';

/**
 * ============================================================
 *  MEDIFLOW CUSTOMISATION FILE  (both apps read this file)
 *  - theme: colours          - stages: minutes and staff counts
 *  - routes: which stages each kind of visit uses
 *  - pricing: price list, discount rules, insurance
 *  - redFlags: words that trigger fast-track / emergency advice
 * ============================================================
 */
export const config = {
  hospital: {
    name: 'MediFlow', tagline: 'Care in motion', facility: 'Main Hospital, Nairobi',
    currency: 'KES', supportPhone: '+254 700 000 000', whatsapp: '254700000000', emergencyPhone: '999',
  },

  /** Colours. Text/background pairs are chosen to meet WCAG AA contrast (4.5:1). */
  theme: {
    primary: '#0f9d8a', primaryDark: '#0b6e61', primarySoft: '#e3f5f2',
    ink: '#12262b', inkSoft: '#4a5e64', bg: '#f3f6f7', card: '#ffffff', line: '#cfdadd',
    warn: '#d9822b', warnText: '#7a4a10', warnSoft: '#fff3e0',
    danger: '#b42f2f', dangerSoft: '#fdeaea',
    success: '#2e9e5b', successText: '#1d6b3e', successSoft: '#e6f6ec',
    dark: '#10282c',
  },

  /** Stage timing. Wait estimate = ceil(ahead / servers) x defaultServiceMinutes. */
  stages: [
    { id: 'route', defaultServiceMinutes: 1, servers: 1, demoAhead: 0, canDefer: false },
    { id: 'registration', defaultServiceMinutes: 3, servers: 1, demoAhead: 0, canDefer: false },
    { id: 'triage', defaultServiceMinutes: 3, servers: 1, demoAhead: 2, canDefer: false },       // never skippable
    { id: 'consultation', defaultServiceMinutes: 8, servers: 2, demoAhead: 2, canDefer: false }, // never skippable
    { id: 'test-review', defaultServiceMinutes: 1, servers: 1, demoAhead: 0, canDefer: false },
    { id: 'laboratory', defaultServiceMinutes: 20, servers: 2, demoAhead: 0, canDefer: true },
    { id: 'results-review', defaultServiceMinutes: 5, servers: 2, demoAhead: 1, canDefer: false },
    { id: 'pharmacy', defaultServiceMinutes: 4, servers: 1, demoAhead: 2, canDefer: true },
    { id: 'checkout', defaultServiceMinutes: 2, servers: 1, demoAhead: 0, canDefer: false },
  ] as StageConfig[],

  /** Visit types. The journey a patient sees is built from the chosen route. */
  routes: {
    'walk-in':     { id: 'walk-in',     stages: ['triage', 'consultation', 'test-review', 'laboratory', 'results-review', 'pharmacy', 'checkout'], tentative: ['laboratory', 'pharmacy'], withRegistration: true,  consult: 'general',  askComplaint: true },
    'appointment': { id: 'appointment', stages: ['triage', 'consultation', 'test-review', 'laboratory', 'results-review', 'pharmacy', 'checkout'], tentative: ['laboratory', 'pharmacy'], withRegistration: false, consult: 'general',  askComplaint: false },
    'follow-up':   { id: 'follow-up',   stages: ['triage', 'consultation', 'test-review', 'laboratory', 'results-review', 'pharmacy', 'checkout'], tentative: ['laboratory', 'pharmacy'], withRegistration: true,  consult: 'followUp', askComplaint: true },
    'results':     { id: 'results',     stages: ['consultation', 'test-review', 'laboratory', 'results-review', 'pharmacy', 'checkout'], tentative: ['laboratory', 'pharmacy'], withRegistration: false, consult: 'review',   askComplaint: false },
    'refill':      { id: 'refill',      stages: ['pharmacy', 'checkout'],                                         tentative: [],                         withRegistration: false, consult: null,       askComplaint: false },
    'pay':         { id: 'pay',         stages: ['checkout'],                                                     tentative: [],                         withRegistration: false, consult: null,       askComplaint: false },
  } as Record<RouteId, RouteConfig>,

  /** Order in which routes are offered on the "What brings you in?" screen. */
  routeOrder: ['walk-in', 'appointment', 'follow-up', 'results', 'refill', 'pay'] as RouteId[],

  registrationValidDays: 30,

  labTests: [
    { id: 'fbc', name: 'Full blood count', turnaroundMinutes: 30, price: 700 },
    { id: 'mrdt', name: 'Malaria rapid test', turnaroundMinutes: 15, price: 300 },
    { id: 'urine', name: 'Urinalysis', turnaroundMinutes: 20, price: 250 },
  ] as LabTest[],
  drugs: [
    { id: 'para', name: 'Paracetamol 500 mg', directions: '2 tablets, 3 times a day, 3 days', price: 120, inStock: true },
    { id: 'ors', name: 'Oral rehydration salts', directions: '1 sachet in 1 litre of water, as needed', price: 300, inStock: true },
    { id: 'amox', name: 'Amoxicillin 500 mg', directions: '1 capsule, 3 times a day, 5 days', price: 450, inStock: false },
  ] as Drug[],

  /** What the demo doctor recommends. Staff can change this on the Doctor desk. */
  demoOrders: { labIds: ['fbc', 'mrdt'], drugIds: ['para', 'ors'] },
  demoDiagnosis: 'Demo assessment completed. The doctor has requested the tests shown for review.',
  demoLabReport: 'SIMULATED DEMO REPORT — Workflow placeholder only; this is not a clinical result.',
  refillDrugIds: ['para'],

  /**
   * PRICING. Rules are applied in order: fee -> rule discounts -> insurance -> waivers.
   * Every change should bump `version` so statements can be audited later.
   */
  pricing: {
    version: '2026-10-v1', effectiveFrom: '2026-10-01',
    base: {
      registration: 0, triage: 250,
      consultation: { general: 1200, specialist: 2500, review: 400, followUp: 1200 },
    },
    rules: [
      { id: 'booking', routes: ['appointment'], appliesTo: ['consultation'], percentOff: 10, requiresWithinDays: 0 },
      { id: 'followup', routes: ['follow-up'], appliesTo: ['consultation'], percentOff: 100, requiresWithinDays: 14 },
    ] as { id: string; routes?: RouteId[]; appliesTo: string[]; percentOff: number; requiresWithinDays: number }[],
    insurance: {
      schemes: [{ id: 'none', percent: 0 }, { id: 'demo70', percent: 70 }],
      appliesTo: ['consultation', 'laboratory', 'pharmacy'],
    },
    /** Used for the "may rise to" part of the running estimate. */
    typicalExtras: { laboratory: 1000, pharmacy: 420 } as Record<string, number>,
    waiverReasons: ['hardship', 'referral', 'goodwill'],
  },

  waitDisplay: { rangePadding: 0.25 },

  /** Words (English / Kiswahili) that trigger emergency advice and fast-tracking. */
  redFlags: ['chest pain', 'difficulty breathing', 'cannot breathe', 'unconscious', 'severe bleeding', 'maumivu ya kifua', 'kushindwa kupumua'],

  demoMode: true,
  demoOtp: '123456',
  demoDoctor: { name: 'Dr. David Ochieng', room: 'Room 4' },
  demoPatient: {
    name: 'Amina Noor', initials: 'AN', hospitalNo: 'MF-20841', phone: '+254712345678', nationalId: '••••••42',
    dob: '1994-03-14', area: 'Kilimani, Nairobi', bloodGroup: 'O positive', allergy: 'Penicillin',
    condition: 'Mild asthma', lastVisit: '6 Oct 2026', lastVisitDaysAgo: 9, medicine: 'Salbutamol inhaler', lastBp: '118/76 mmHg',
    detailsConfirmedDaysAgo: 45, outstanding: 800,
  } as Patient,
  demoComplaint: 'Persistent headache since yesterday, moderate severity',
  demoAppointments: [
    { id: 'apt-1', clinic: 'General medicine', doctor: 'Dr. David Ochieng', day: 'Today', time: '10:30 AM', status: 'booked', today: true },
  ] as Appointment[],
  demoHistory: [
    { id: 'v-2', dateLabel: '6 Oct 2026', route: 'walk-in', total: 2250, summary: 'Malaria rapid test, consultation' },
    { id: 'v-1', dateLabel: '12 Dec 2025', route: 'appointment', total: 1680, summary: 'General consultation, urinalysis' },
  ] as PastVisit[],
  clinics: ['General medicine', 'Paediatrics', 'Women\u2019s health'],
  slotTimes: ['9:00 AM', '10:30 AM', '2:00 PM', '3:30 PM'],
};
export type MediflowConfig = typeof config;
