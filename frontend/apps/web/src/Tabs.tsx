import { useRef, useState } from 'react';
import { config, useVisit, upcomingDays, money, validPhone, backend } from '@mediflow/shared';
import { Btn, ConfirmDialog, EmptyState, ErrorState, Field, Note, PageHeader, StatusBadge } from './ui';
import { visitService } from './services/visitService';

function SlotPicker({ onPick, label }: { onPick: (day: string, time: string) => Promise<void>; label: string }) {
  const { T } = useVisit();
  const days = upcomingDays(4);
  const [day, setDay] = useState(days[0]);
  const [time, setTime] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const submit = async () => {
    if (!time || lock.current) return;
    lock.current = true;
    setSaving(true);
    try { setError(null); await onPick(day, time); }
    catch { setError('We could not save this appointment. Please try again.'); }
    finally { lock.current = false; setSaving(false); }
  };
  return (<div>
    <p className="eyebrow">{T('appt.pickDay')}</p>
    <div className="chips" role="radiogroup" aria-label={T('appt.pickDay')}>{days.map(d => <button key={d} role="radio" aria-checked={day === d} className={`chip big ${day === d ? 'sel' : ''}`} onClick={() => setDay(d)}>{d}</button>)}</div>
    <p className="eyebrow" style={{ marginTop: 12 }}>{T('appt.pickTime')}</p>
    <div className="chips" role="radiogroup" aria-label={T('appt.pickTime')}>{config.slotTimes.map(t => <button key={t} role="radio" aria-checked={time === t} className={`chip big ${time === t ? 'sel' : ''}`} onClick={() => setTime(t)}>{t}</button>)}</div>
    {error && <ErrorState title={error} />}
    <Btn disabled={!time || saving} aria-busy={saving} onClick={submit}>{saving ? `${label}…` : label}</Btn>
  </div>);
}

export function Appointments({ goToday }: { goToday: () => void }) {
  const { state: s, actions, T } = useVisit();
  const [mode, setMode] = useState<'list' | 'book' | { resched: string } | { cancel: string }>('list');
  const [clinic, setClinic] = useState(config.clinics[0]);
  const [savingCancel, setSavingCancel] = useState(false);
  const cancelLock = useRef(false);
  const [listView, setListView] = useState<'upcoming' | 'cancelled'>('upcoming');
  const [query, setQuery] = useState('');
  const upcoming = s.appointments.filter(a => a.status === 'booked');
  const cancelled = s.appointments.filter(a => a.status === 'cancelled');
  const source = listView === 'upcoming' ? upcoming : cancelled;
  const needle = query.trim().toLocaleLowerCase();
  const visibleAppointments = source.filter(a => !needle || `${a.day} ${a.time} ${a.clinic} ${a.doctor}`.toLocaleLowerCase().includes(needle));

  if (mode === 'book') return (
    <div className="page card"><PageHeader title={T('appt.book')} />
      <label htmlFor="clinic">{T('appt.clinic')}</label>
      <select id="clinic" className="field" value={clinic} onChange={e => setClinic(e.target.value)}>{config.clinics.map(c => <option key={c}>{c}</option>)}</select>
      <SlotPicker label={T('appt.confirm')} onPick={async (d, t) => { await visitService.bookAppointment(clinic, d, t); setMode('list'); }} />
      <button className="link" onClick={() => setMode('list')}>← {T('btn.back')}</button></div>);
  if (typeof mode === 'object' && 'resched' in mode) return (
    <div className="page card"><PageHeader title={T('appt.reschedule')} />
      <SlotPicker label={T('appt.confirm')} onPick={async (d, t) => { await visitService.rescheduleAppointment(mode.resched, d, t); setMode('list'); }} />
      <button className="link" onClick={() => setMode('list')}>← {T('btn.back')}</button></div>);

  const cancelAppointment = async (id: string) => {
    if (cancelLock.current) return;
    cancelLock.current = true; setSavingCancel(true);
    try { await visitService.cancelAppointment(id); setMode('list'); }
    finally { cancelLock.current = false; setSavingCancel(false); }
  };

  return (
    <div className="page">
      <PageHeader title={T('tab.appts')} description={T('appt.subtitle')} action={<Btn className="inline" onClick={() => setMode('book')}>{T('appt.book')}</Btn>} />
      <div className="appointment-tools">
        <div className="segmented-tabs" role="tablist" aria-label={T('tab.appts')}>
          <button role="tab" aria-selected={listView === 'upcoming'} className={listView === 'upcoming' ? 'on' : ''} onClick={() => setListView('upcoming')}>{T('appt.upcoming')} <span>{upcoming.length}</span></button>
          <button role="tab" aria-selected={listView === 'cancelled'} className={listView === 'cancelled' ? 'on' : ''} onClick={() => setListView('cancelled')}>{T('appt.cancelledTab')} <span>{cancelled.length}</span></button>
        </div>
        <label className="appointment-search" htmlFor="appointment-search">{T('appt.search')}</label>
        <input id="appointment-search" className="field" type="search" placeholder={T('appt.search')} value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      {visibleAppointments.length === 0 && <EmptyState
        title={query ? T('appt.noMatch') : listView === 'upcoming' ? T('appt.none') : T('appt.noneCancelled')}
        description={query ? T('appt.searchHint') : listView === 'upcoming' ? T('appt.emptyUpcoming') : undefined}
        action={!query && listView === 'upcoming' ? <Btn className="inline" onClick={() => setMode('book')}>{T('appt.book')}</Btn> : undefined}
      />}
      {visibleAppointments.map(a => (
        <article className={`card appointment-card ${a.status === 'cancelled' ? 'is-cancelled' : ''}`} key={a.id}>
          <div className="appointment-date"><span>{a.day}</span><strong>{a.time}</strong></div>
          <div className="appointment-details"><div className="appointment-heading"><div><h2>{a.clinic}</h2><p className="muted">{a.doctor}</p></div><StatusBadge label={a.status === 'booked' ? T('appt.confirmed') : T('appt.cancelledStatus')} tone={a.status === 'booked' ? 'ok' : 'warn'} /></div>
            {a.status === 'booked' && <div className="row2 appointment-actions">
              {a.today && <Btn className="inline" onClick={() => { actions.chooseRoute('appointment', 'desk'); goToday(); }}>{T('appt.checkin')}</Btn>}
              <Btn kind="ghost" className="inline" onClick={() => setMode({ resched: a.id })}>{T('appt.reschedule')}</Btn>
              <Btn kind="ghost" className="inline" onClick={() => setMode({ cancel: a.id })}>{T('btn.cancel')}</Btn>
            </div>}
          </div>
        </article>
      ))}
      {typeof mode === 'object' && 'cancel' in mode && <ConfirmDialog title={T('appt.cancelAsk')} confirmLabel={savingCancel ? 'Cancelling…' : T('appt.cancelYes')} cancelLabel={T('appt.cancelNo')} danger busy={savingCancel} onCancel={() => { if (!cancelLock.current) setMode('list'); }} onConfirm={() => void cancelAppointment(mode.cancel)} />}
    </div>
  );
}

export function Records() {
  const { state: s, actions, T } = useVisit();
  const [requestNote, setRequestNote] = useState('');
  const [requestBusy, setRequestBusy] = useState(false); const [requestError, setRequestError] = useState<string | null>(null);
  const requestHistory = async () => { if (requestBusy) return; setRequestBusy(true); setRequestError(null); try { await backend.requestMedicalHistory(requestNote); actions.setServerHistoryRequests((await backend.historyRequests()).requests); setRequestNote(''); } catch (e) { setRequestError(e instanceof Error ? e.message : 'Could not request your records.'); } finally { setRequestBusy(false); } };
  return (
    <div className="page"><PageHeader title={T('tab.records')} />
      <section className="history-request card">
        <div><p className="eyebrow">{T('tab.records')}</p><h2>{T('rec.historyTitle')}</h2><p className="muted">{T('rec.historySub')}</p></div>
        <label htmlFor="history-request-note">{T('rec.historyReason')} <span className="muted">{T('rec.optional')}</span></label>
        <textarea id="history-request-note" className="field" rows={2} maxLength={300} value={requestNote} onChange={e => setRequestNote(e.target.value)} placeholder={T('rec.historyPlaceholder')} />
        {requestError && <Note tone="danger">{requestError}</Note>}
        <Btn className="inline" disabled={requestBusy} onClick={() => void requestHistory()}>{requestBusy ? 'Sending…' : T('rec.historyRequest')}</Btn>
        {s.historyRequests.length > 0 && <div className="history-requests"><p className="eyebrow">{T('rec.localRequests')}</p>{s.historyRequests.map(request => <div className="row" key={request.id}><span><b>{request.note || T('rec.historyCopy')}</b><br/><small>{request.requestedAt}</small></span><StatusBadge label={request.status} tone={request.status === 'fulfilled' ? 'ok' : 'info'} /></div>)}</div>}
      </section>
      {s.patient.outstanding > 0 && <Note tone="warn">{T('rec.outstanding', { amt: money(s.patient.outstanding) })}</Note>}
      <p className="eyebrow">{T('rec.visits')}</p>
      {s.history.length === 0 && <EmptyState title="No visit history yet" description="Completed visits will appear here." />}
      {s.history.map(h => (
        <div className="card" key={h.id} style={{ marginBottom: 10 }}>
          <div className="row" style={{ border: 0, padding: 0 }}><b>{h.dateLabel}</b><b>{money(h.total)}</b></div>
          <span className="muted" style={{ margin: 0 }}>{T(`route.${h.route}.title`)} · {h.summary}</span>
        </div>))}
    </div>
  );
}

export function Profile() {
  const { state: s, actions, T } = useVisit();
  const [phone, setPhone] = useState(s.patient.phone);
  const [area, setArea] = useState(s.patient.area);
  const [msg, setMsg] = useState<string | null>(null);
  const [phoneChallenge, setPhoneChallenge] = useState(''); const [phoneCode, setPhoneCode] = useState(''); const [phoneBusy, setPhoneBusy] = useState(false);
  const [err, setErr] = useState<{ phone?: string; area?: string }>({});
  const save = async () => {
    if ((phone !== s.patient.phone && (!phoneChallenge || phoneCode.length !== 6)) || !validPhone(phone) || area.trim().length < 2) { setErr({ phone: !validPhone(phone) ? T('err.phone') : phone !== s.patient.phone && !phoneChallenge ? 'Verify the new phone number before saving it.' : undefined, area: area.trim().length < 2 ? T('err.area') : undefined }); setMsg(null); return; }
    try { if (phone !== s.patient.phone) await backend.changePhone(phone, phoneChallenge, phoneCode); await backend.updateProfile(area, s.notifyPref); actions.updateDetails(phone, area); setPhoneChallenge(''); setPhoneCode(''); setErr({}); setMsg(T('prof.saved')); }
    catch (error) { setMsg(error instanceof Error ? error.message : 'Could not save your profile.'); }
  };
  const updateNotify = async (value: 'push+sms' | 'sms') => { try { await backend.updateProfile(s.patient.area, value); actions.setNotifyPref(value); } catch (error) { setMsg(error instanceof Error ? error.message : 'Could not update notification preference.'); } };
  const verifyNewPhone = async () => { setPhoneBusy(true); setMsg(null); try { const result = await backend.requestOtp(phone, 'phone-change'); setPhoneChallenge(result.challengeId); setMsg(`Verification code sent to ${phone}.`); } catch (error) { setMsg(error instanceof Error ? error.message : 'Could not send a verification code.'); } finally { setPhoneBusy(false); } };
  return (
    <div className="page card"><PageHeader title={T('tab.profile')} />
      <p className="muted">{s.patient.name} · {s.patient.hospitalNo}</p>
      <Field label={T('f.phone')} value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" error={err.phone} />
      {phone !== s.patient.phone && <><Btn kind="ghost" className="inline" disabled={phoneBusy} onClick={() => void verifyNewPhone()}>{phoneBusy ? 'Sending…' : 'Verify new phone number'}</Btn>{phoneChallenge && <Field label="Verification code" value={phoneCode} onChange={e => setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} />}</>}
      <Field label={T('f.area')} value={area} onChange={e => setArea(e.target.value)} error={err.area} />
      <Btn onClick={save}>{T('btn.save')}</Btn>{msg && <Note tone="ok">{msg}</Note>}

      <label htmlFor="ins">{T('prof.insurance')}</label>
      <select id="ins" className="field" value={s.insuranceId} disabled>
        {config.pricing.insurance.schemes.map(x => <option key={x.id} value={x.id}>{T('ins.' + x.id)}</option>)}
      </select>
      <p className="muted">Insurance pricing is not connected to a payer yet; this choice will not change your bill.</p>

      <label htmlFor="np">{T('prof.notify')}</label>
      <select id="np" className="field" value={s.notifyPref} onChange={e => void updateNotify(e.target.value as 'push+sms' | 'sms')}>
        <option value="push+sms">{T('prof.pushSms')}</option><option value="sms">{T('prof.smsOnly')}</option>
      </select>
    </div>
  );
}
