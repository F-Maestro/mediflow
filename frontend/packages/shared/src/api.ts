/** Thin, typed-enough client for the MediFlow API. Clinical state stays on the server. */
export type ApiSession = { accessToken: string; tokenType: 'Bearer'; expiresInSeconds: number; user: { id: string; role: string; hospitalNumber?: string } };
export type ApiError = Error & { status?: number; code?: string };

let apiBaseUrl = 'http://127.0.0.1:4000/api/v1';
let accessToken: string | null = null;
let tokenStore: { get(): Promise<string | null>; set(value: string | null): Promise<void> } | null = null;

export function configureApi(options: { baseUrl?: string; tokenStore?: typeof tokenStore }) {
  if (options.baseUrl) apiBaseUrl = options.baseUrl.replace(/\/$/, '').replace(/\/api\/v1$/, '') + '/api/v1';
  if (options.tokenStore) tokenStore = options.tokenStore;
}
export async function restoreApiSession() { accessToken = await tokenStore?.get() ?? null; return accessToken; }
export async function setApiToken(token: string | null) { accessToken = token; await tokenStore?.set(token); }
export const hasApiToken = () => !!accessToken;

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(`${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`, { ...init, headers, cache: 'no-store' });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) await setApiToken(null);
    const error = new Error(body?.error?.message ?? `Request failed (${response.status})`) as ApiError;
    error.status = response.status; error.code = body?.error?.code; throw error;
  }
  return body as T;
}
const post = <T = unknown>(path: string, body?: unknown, headers?: Record<string, string>) => api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body), headers });

export const backend = {
  requestOtp: (phone: string, purpose: 'login' | 'registration' | 'phone-change' | 'password-reset') => post<{ challengeId: string; expiresInSeconds: number }>('/auth/otp/request', { phone, purpose }),
  verifyOtp: (phone: string, challengeId: string, code: string, purpose: 'login' | 'staff-login' = 'login') => post<ApiSession>('/auth/otp/verify', { phone, challengeId, code, purpose }),
  passwordLogin: (phone: string, password: string, accountType: 'patient' | 'staff') => post<ApiSession | { requiresOtp: true; challengeId: string; expiresInSeconds: number }>('/auth/password/login', { phone, password, accountType }),
  resetPassword: (input: { phone: string; challengeId: string; code: string; password: string }) => post<{ changed: true }>('/auth/password/reset', input),
  register: (input: { phone: string; challengeId: string; code: string; password: string; name: string; dob: string; area: string; nationalId: string }) => post<ApiSession & { hospitalNumber: string }>('/auth/register', input),
  me: () => api<{ id: string; role: string; name: string; hospitalNumber: string | null; profile: Record<string, unknown> | null }>('/auth/me'),
  logout: () => post<void>('/auth/logout'),
  appointments: () => api<{ appointments: Array<{ id: string; clinic: string; doctor: string; scheduledAt: string; localDateTime?: string; status: string }> }>('/appointments'),
  changePhone: (phone: string, challengeId: string, code: string) => post<{ phone: string }>('/auth/phone-change', { phone, challengeId, code }),
  updateProfile: (area: string, notifyPref?: 'push+sms' | 'sms') => api<{ profile: Record<string, unknown> }>('/profile', { method: 'PATCH', body: JSON.stringify({ area, notifyPref }) }),
  historyRequests: () => api<{ requests: Array<{ id: string; note: string; status: string; createdAt: string }> }>('/history-requests'),
  requestMedicalHistory: (note: string) => post('/history-requests', { note }),
  catalog: () => api<{ items: Array<{ code: string; name: string; kind: string; priceKes: number; inventoryQuantity: number }> }>('/catalog'),
  bookAppointment: (input: { clinic: string; doctor: string; date: string; time: string }) => post<{ appointment: { id: string; status: string; scheduledAt: string } }>('/appointments', input),
  rescheduleAppointment: (id: string, input: { clinic: string; doctor: string; date: string; time: string }) => post(`/appointments/${id}/reschedule`, input),
  cancelAppointment: (id: string) => post<void>(`/appointments/${id}/cancel`),
  visits: () => api<{ visits: ApiVisit[] }>('/visits'),
  visit: (id: string) => api<{ visit: ApiVisit }>(`/visits/${id}`),
  startVisit: (routeId: string, complaint: string, appointmentId?: string) => post<{ visit: { id: string; stage: string; routeId: string } }>('/visits', { routeId, complaint, ...(appointmentId ? { appointmentId } : {}) }),
  approveTests: (id: string, approvedCodes: string[]) => post(`/visits/${id}/tests/approve`, { approvedCodes }),
  approveMedicines: (id: string, approvedCodes: string[]) => post(`/visits/${id}/prescriptions/approve`, { approvedCodes }),
  completeFreeVisit: (id: string) => post(`/visits/${id}/complete-free`),
  vitals: (id: string) => api<{ readings: Array<Record<string, unknown>> }>(`/visits/${id}/vitals`),
  trends: () => api<{ period: string; readings: Array<Record<string, unknown>> }>('/health-trends'),
  queueOverview: () => api<{ updatedAt: string; stages: Array<Record<string, unknown>> }>('/queue'),
  queue: (stage: string) => api<{ stage: string; waiting: number; patients: ApiQueuePatient[] }>(`/queue/${stage}`),
  callNext: (stage: string) => post<{ visitId: string; patientId: string }>(`/queue/${stage}/call-next`),
  chart: (patientId: string) => api<ApiPatientChart>(`/patients/${patientId}/chart`),
  staffVisit: (visitId: string) => api<{ visit: ApiStaffVisit }>(`/staff/visits/${visitId}`),
  clinicalNotes: (visitId: string) => api<{ notes: Array<{ id: string; author: string; note: string; createdAt: string }> }>(`/staff/visits/${visitId}/notes`),
  addClinicalNote: (visitId: string, note: string) => post(`/staff/visits/${visitId}/notes`, { note }),
  teamMessages: (visitId?: string) => api<{ messages: Array<{ id: string; visitId?: string | null; sender: string; senderId: string; message: string; createdAt: string }> }>(`/team/messages${visitId ? `?visitId=${encodeURIComponent(visitId)}` : ''}`),
  sendTeamMessage: (message: string, visitId?: string) => post('/team/messages', { message, ...(visitId ? { visitId } : {}) }),
  recordTriage: (visitId: string, vitals: Record<string, number | null>) => post(`/visits/${visitId}/triage`, vitals),
  consultation: (visitId: string, diagnosis: string, labCodes: string[]) => post(`/visits/${visitId}/consultation`, { diagnosis, labCodes }),
  labResult: (visitId: string, orderId: string, result: string) => post(`/visits/${visitId}/lab-orders/${orderId}/result`, { result }),
  prescriptions: (visitId: string, medicines: Array<{ code: string; directions: string }>) => post(`/visits/${visitId}/prescriptions`, { medicines }),
  dispense: (visitId: string) => post(`/visits/${visitId}/dispense`),
  addStock: (code: string, quantity: number, reason: string) => post(`/catalog/${encodeURIComponent(code)}/stock`, { quantity, reason }),
  waiver: (visitId: string, percent: number, reason: string) => post(`/visits/${visitId}/waivers`, { percent, reason }),
  cashPayment: (visitId: string, receiptReference?: string) => post('/payments/cash', { visitId, receiptReference }),
  paymentIntent: (visitId: string, idempotencyKey: string) => post<{ paymentId: string; status: string; amountKes: number; provider?: string; message?: string }>('/payments/stk-push', { visitId }, { 'Idempotency-Key': idempotencyKey }),
  payment: (id: string) => api<{ payment: { status: string; mpesa_receipt?: string | null; amount_kes: number } }>(`/payments/${id}`),
  mockCompletePayment: (id: string) => post(`/payments/${id}/mock-complete`),
  supportMessages: () => api<{ messages: Array<Record<string, unknown>> }>('/support/messages'),
  sendSupportMessage: (message: string, consentToWhatsApp = false) => post('/support/messages', { message, consentToWhatsApp }),
  supportThreads: () => api<{ threads: Array<{ id: string; patientId: string; patientName: string; hospitalNumber: string; lastMessage: string; updatedAt: string }> }>('/support/threads'),
  supportThreadMessages: (id: string) => api<{ messages: Array<{ id: string; senderId: string | null; direction: string; message: string; createdAt: string }> }>(`/support/threads/${id}/messages`),
  replySupportThread: (id: string, message: string) => post(`/support/threads/${id}/reply`, { message }),
};

export type ApiVisit = { id: string; routeId: string; status: string; stage: string; complaint: string; diagnosis: string; createdAt: string; completedAt?: string | null; queue?: { ahead: number; called: boolean; enteredAt: string; estimatedWaitMinutes?: number }; orders?: Array<{ id: string; code: string; name: string; kind: string; quantity: number; status: string; priceKes: number; inventoryQuantity?: number; directions?: string | null; result?: string | null }>; charges?: Array<{ code: string; description: string; amountKes: number; adjustmentKes: number; status: string }> };
export type ApiQueuePatient = { visitId: string; patientId: string; hospitalNumber: string; name: string; complaint: string; called: boolean; position: number; enteredAt: string };
export type ApiPatientChart = { patient: { id: string; name: string; hospitalNumber: string; profile: Record<string, unknown> }; visits: ApiVisit[]; vitals: Array<Record<string, unknown>> };
export type ApiStaffVisit = ApiVisit & { patientId: string; patientName: string; hospitalNumber: string; queue?: { called: boolean; enteredAt: string } };
