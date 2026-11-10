import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { config, useVisit, upcomingDays, money, validPhone, backend, actions as storeActions } from '@mediflow/shared';
import { Btn, Card, Chip, Eyebrow, Field, H1, LinkBtn, Muted, Note, s, t } from './ui';

function SlotPicker({ onPick, label }: { onPick: (d: string, tm: string) => Promise<void>; label: string }) {
  const { T } = useVisit(); const days = upcomingDays(4); const [day, setDay] = useState(days[0]); const [time, setTime] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async () => { if (!time || busy) return; setBusy(true); setError(null); try { await onPick(day, time); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the appointment.'); } finally { setBusy(false); } };
  return (<View><Eyebrow>{T('appt.pickDay')}</Eyebrow><View style={s.wrap}>{days.map(d => <Chip key={d} label={d} on={day === d} onPress={() => setDay(d)} />)}</View>
    <View style={{ height: 12 }} /><Eyebrow>{T('appt.pickTime')}</Eyebrow><View style={s.wrap}>{config.slotTimes.map(x => <Chip key={x} label={x} on={time === x} onPress={() => setTime(x)} />)}</View>
    {error ? <Note tone="danger">{error}</Note> : null}<Btn label={busy ? 'Saving…' : label} disabled={!time || busy} onPress={() => void submit()} /></View>);
}
function localDate(day: string) { const date = new Date(); date.setDate(date.getDate() + Math.max(0, upcomingDays(4).indexOf(day))); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
function time24(time: string) { const m = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i); if (!m) return time; let h = Number(m[1]) % 12; if (m[3].toUpperCase() === 'PM') h += 12; return `${String(h).padStart(2,'0')}:${m[2]}`; }
async function reloadAppointments() { const data = await backend.appointments(); storeActions.setServerAppointments(data.appointments); }
export function Appointments({ goToday }: { goToday: () => void }) {
  const { state: S, actions, T } = useVisit();
  const [mode, setMode] = useState<'list' | 'book' | { resched: string } | { cancel: string }>('list'); const [clinic, setClinic] = useState(config.clinics[0]);
  const upcoming = S.appointments.filter(a => a.status === 'booked'); const nCancelled = S.appointments.length - upcoming.length;
  if (mode === 'book') return (<ScrollView contentContainerStyle={{ padding: 16 }}><Card><H1>{T('appt.book')}</H1><Eyebrow>{T('appt.clinic')}</Eyebrow>
    <View style={s.wrap}>{config.clinics.map(c => <Chip key={c} label={c} on={clinic === c} onPress={() => setClinic(c)} />)}</View>
    <SlotPicker label={T('appt.confirm')} onPick={async (d, tm) => { await backend.bookAppointment({ clinic, doctor: config.demoDoctor.name, date: localDate(d), time: time24(tm) }); await reloadAppointments(); setMode('list'); }} /><LinkBtn label={'← ' + T('btn.back')} onPress={() => setMode('list')} /></Card></ScrollView>);
  if (typeof mode === 'object' && 'resched' in mode) return (<ScrollView contentContainerStyle={{ padding: 16 }}><Card><H1>{T('appt.reschedule')}</H1>
    <SlotPicker label={T('appt.confirm')} onPick={async (d, tm) => { const current = (await backend.appointments()).appointments.find(x => x.id === mode.resched); await backend.rescheduleAppointment(mode.resched, { clinic: current?.clinic ?? config.clinics[0], doctor: current?.doctor ?? config.demoDoctor.name, date: localDate(d), time: time24(tm) }); await reloadAppointments(); setMode('list'); }} /><LinkBtn label={'← ' + T('btn.back')} onPress={() => setMode('list')} /></Card></ScrollView>);
  return (<ScrollView contentContainerStyle={{ padding: 16 }}><H1>{T('tab.appts')}</H1><Btn label={T('appt.book')} onPress={() => setMode('book')} />
    {upcoming.length === 0 && <Note>{T('appt.none')}</Note>}
    {upcoming.map(a => (<View key={a.id} style={{ marginTop: 12 }}><Card><Text style={{ fontWeight: '800', color: t.ink }}>{a.day}, {a.time}</Text><Text style={s.muted}>{a.clinic} · {a.doctor}</Text>
      {typeof mode === 'object' && 'cancel' in mode && mode.cancel === a.id ? (<Note tone="warn">{T('appt.cancelAsk')}</Note>) : null}
      {typeof mode === 'object' && 'cancel' in mode && mode.cancel === a.id ? (<View><Btn kind="danger" label={T('appt.cancelYes')} onPress={() => { void backend.cancelAppointment(a.id).then(reloadAppointments).then(() => setMode('list')); }} /><Btn kind="ghost" label={T('appt.cancelNo')} onPress={() => setMode('list')} /></View>) : (<View>
        {a.today && <Btn label={T('appt.checkin')} onPress={() => { actions.chooseRoute('appointment', 'desk'); goToday(); }} />}
        <Btn kind="ghost" label={T('appt.reschedule')} onPress={() => setMode({ resched: a.id })} /><Btn kind="ghost" label={T('btn.cancel')} onPress={() => setMode({ cancel: a.id })} /></View>)}</Card></View>))}
    {nCancelled > 0 && <Muted>{T('appt.cancelled', { n: nCancelled })}</Muted>}</ScrollView>);
}
export function Records({ onProfile }: { onProfile?: () => void } = {}) {
  const { state: S, actions, T } = useVisit();
  const [requestNote, setRequestNote] = useState('');
  const [requestBusy, setRequestBusy] = useState(false); const [requestError, setRequestError] = useState<string | null>(null);
  const requestHistory = async () => { if (requestBusy) return; setRequestBusy(true); setRequestError(null); try { await backend.requestMedicalHistory(requestNote); actions.setServerHistoryRequests((await backend.historyRequests()).requests); setRequestNote(''); } catch (e) { setRequestError(e instanceof Error ? e.message : 'Could not request your records.'); } finally { setRequestBusy(false); } };
  return (<ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled"><H1>{T('nav.records')}</H1>
    <Card><Eyebrow>{T('tab.records')}</Eyebrow><Text style={s.h2}>{T('rec.historyTitle')}</Text><Muted>{T('rec.historySub')}</Muted>
      <Field label={T('rec.historyReason')} value={requestNote} onChangeText={setRequestNote} placeholder={T('rec.historyPlaceholder')} multiline />
      {requestError ? <Note tone="danger">{requestError}</Note> : null}<Btn label={requestBusy ? 'Sending…' : T('rec.historyRequest')} disabled={requestBusy} onPress={() => void requestHistory()} />
      {S.historyRequests.length > 0 && <><Eyebrow>{T('rec.localRequests')}</Eyebrow>{S.historyRequests.map(request => <View key={request.id} style={{ paddingVertical: 9, borderTopWidth: 1, borderTopColor: t.line }}><Text style={{ color: t.ink, fontWeight: '700' }}>{request.note || T('rec.historyCopy')}</Text><Text style={s.muted}>{request.requestedAt} · {request.status}</Text></View>)}</>}
    </Card>
    {onProfile && <Btn kind="ghost" label={T('privacy.profileAction')} onPress={onProfile} />}
    {S.patient.outstanding > 0 && <Note tone="warn">{T('rec.outstanding', { amt: money(S.patient.outstanding) })}</Note>}<Eyebrow>{T('rec.visits')}</Eyebrow>
    {S.history.map(h => <Card key={h.id}><View style={s.rowBetween}><Text style={{ fontWeight: '800', color: t.ink }}>{h.dateLabel}</Text><Text style={{ fontWeight: '800', color: t.ink }}>{money(h.total)}</Text></View><Text style={s.muted}>{T(`route.${h.route}.title`)} · {h.summary}</Text></Card>)}</ScrollView>);
}
export function Profile() {
  const { state: S, actions, T } = useVisit();
  const [phone, setPhone] = useState(S.patient.phone); const [area, setArea] = useState(S.patient.area);
  const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<{ phone?: string; area?: string }>({});
  const [phoneChallenge, setPhoneChallenge] = useState(''); const [phoneCode, setPhoneCode] = useState(''); const [busy, setBusy] = useState(false);
  const verifyPhone = async () => { setBusy(true); setMsg(null); try { const result = await backend.requestOtp(phone, 'phone-change'); setPhoneChallenge(result.challengeId); setMsg(`Verification code sent to ${phone}.`); } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not send a verification code.'); } finally { setBusy(false); } };
  const save = async () => { if (!validPhone(phone) || area.trim().length < 2 || (phone !== S.patient.phone && (!phoneChallenge || phoneCode.length !== 6))) { setErr({ phone: !validPhone(phone) ? T('err.phone') : phone !== S.patient.phone && !phoneChallenge ? 'Verify the new phone number before saving it.' : undefined, area: area.trim().length < 2 ? T('err.area') : undefined }); setMsg(null); return; } try { if (phone !== S.patient.phone) await backend.changePhone(phone, phoneChallenge, phoneCode); await backend.updateProfile(area, S.notifyPref); actions.updateDetails(phone, area); setPhoneChallenge(''); setPhoneCode(''); setErr({}); setMsg(T('prof.saved')); } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save your profile.'); } };
  const updateNotify = async (value: 'push+sms' | 'sms') => { try { await backend.updateProfile(S.patient.area, value); actions.setNotifyPref(value); } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not update notification preference.'); } };
  return (<ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled"><Card><H1>{T('tab.profile')}</H1><Muted>{S.patient.name} · {S.patient.hospitalNo}</Muted>
    <Field label={T('f.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" error={err.phone} />{phone !== S.patient.phone && <><Btn kind="ghost" label={busy ? 'Sending…' : 'Verify new phone number'} disabled={busy} onPress={() => void verifyPhone()} />{phoneChallenge ? <Field label="Verification code" value={phoneCode} onChangeText={value => setPhoneCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} /> : null}</>}<Field label={T('f.area')} value={area} onChangeText={setArea} error={err.area} />
    <Btn label={T('btn.save')} onPress={save} />{msg && <Note tone="ok">{msg}</Note>}
    <Eyebrow>{T('prof.insurance')}</Eyebrow><Note tone="warn">Insurance pricing is not connected to a payer yet; this choice will not change your bill.</Note>
    <Eyebrow>{T('prof.notify')}</Eyebrow><View style={s.wrap}><Chip label={T('prof.pushSms')} on={S.notifyPref === 'push+sms'} onPress={() => void updateNotify('push+sms')} /><Chip label={T('prof.smsOnly')} on={S.notifyPref === 'sms'} onPress={() => void updateNotify('sms')} /></View></Card></ScrollView>);
}
