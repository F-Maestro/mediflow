import { actions, backend, config, upcomingDays, type RouteId } from '@mediflow/shared';

function dayToDate(day: string) {
  const offset = Math.max(0, upcomingDays(4).indexOf(day));
  const date = new Date(); date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function timeTo24Hour(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return time;
  let hour = Number(match[1]) % 12; if (match[3].toUpperCase() === 'PM') hour += 12;
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}
async function reloadAppointments() { const result = await backend.appointments(); actions.setServerAppointments(result.appointments); }
export const visitService = {
  async bookAppointment(clinic: string, day: string, time: string): Promise<void> {
    await backend.bookAppointment({ clinic, doctor: config.demoDoctor.name, date: dayToDate(day), time: timeTo24Hour(time) });
    await reloadAppointments();
  },
  async rescheduleAppointment(id: string, day: string, time: string): Promise<void> {
    const current = (await backend.appointments()).appointments.find(item => item.id === id);
    await backend.rescheduleAppointment(id, { clinic: current?.clinic ?? config.clinics[0], doctor: current?.doctor ?? config.demoDoctor.name, date: dayToDate(day), time: timeTo24Hour(time) });
    await reloadAppointments();
  },
  async cancelAppointment(id: string): Promise<void> { await backend.cancelAppointment(id); await reloadAppointments(); },
  async startVisit(routeId: RouteId, complaint: string, appointmentId?: string) {
    const result = await backend.startVisit(routeId, complaint, appointmentId);
    const full = await backend.visit(result.visit.id); actions.setServerVisit(full.visit); return full.visit;
  },
};
