import { useCallback, useEffect, useRef, useState } from 'react';
import {
  config, useVisit, currentStage, isClosed, waitFor, waitRange, labMinutesLeft, canAdvance, canUndo, canDeferStage,
  buildStatement, runningEstimate, planMinutes, stepItems, money, validPhone, backend, type StageId, type RouteId,
} from '@mediflow/shared';
import { Bar, Btn, Field, KV, Note, PatientSummaryCard, Pill } from './ui';
import { visitService } from './services/visitService';

export function Today({ goAppointments }: { goAppointments: () => void }) {
  const { state: s, actions, T } = useVisit();
  const stage = currentStage(s);
  const closed = isClosed(s);
  const chooser = !closed && stage === 'route';
  const est = runningEstimate(s);
  const items = stepItems(s);
  const showWait = !closed && stage && ['triage', 'consultation', 'laboratory', 'results-review', 'pharmacy'].includes(stage);
  const w = waitFor(s);

  return (
    <>
      {s.notices.map(n => (
        <div key={n.id} className="notice" role="status">{T(n.key)}<button className="link" onClick={() => actions.dismissNotice(n.id)}>{T('btn.dismiss')}</button></div>
      ))}

      {s.routeId && <div className="today-summary-wrap"><PatientSummaryCard
        name={s.patient.name}
        patientId={s.patient.hospitalNo}
        status={closed ? T('visit.complete') : T('visit.inProgress')}
        stage={closed ? T('visit.complete') : T('stage.' + (stage ?? 'route'))}
        nextStage={!closed && s.plan[s.stageIndex + 1] ? T('stage.' + s.plan[s.stageIndex + 1]) : undefined}
        labels={{ visit: T('visit.current'), patientId: T('visit.patientId'), current: T('visit.currentStage'), next: T('visit.nextStage') }}
      /></div>}

      {!chooser && s.routeId && (
        <div className="stepper dashboard-stepper" role="list" aria-label={T('tracker.label')}>
          {items.filter(i => i.id !== 'route').map(i => (
            <div key={i.id + i.status} role="listitem" className={`step ${i.status}`} aria-current={i.status === 'now' ? 'step' : undefined}>
              <span className="dot" aria-hidden>{i.status === 'done' ? '✓' : i.status === 'later' ? '⏱' : i.status === 'maybe' ? '?' : items.filter(x => x.id !== 'route').indexOf(i) + 1}</span>
              <span>{T('stage.' + i.id)}{i.status === 'maybe' ? <em> · {T('tracker.ifNeeded')}</em> : i.status === 'later' ? <em> · {T('tracker.later')}</em> : ''}</span>
            </div>
          ))}
        </div>
      )}
      {!chooser && s.skipped.length > 0 && (
        <div className="skipped dashboard-skipped">{s.skipped.map(k => <span key={k.stage + k.reason}>{T('skip.' + k.reason, { stage: T('stage.' + k.stage) })}</span>)}</div>
      )}

      <div className="main dashboard-main">
        <div className="card visit-stage-card">
          {chooser ? <RouteChooser goAppointments={goAppointments} /> : closed ? <Done /> : <StageView id={stage!} />}
          {!chooser && !closed && stage && !['registration', 'checkout'].includes(stage) && <StageActions />}
        </div>
        <aside className="side dashboard-side">
          {showWait && (
            <div className="card dashboard-wait-card" aria-live="polite">
              <small>{stage === 'laboratory' ? T('wait.labReady') : stage === 'pharmacy' ? T('wait.pharmacy') : T('wait.est')}</small>
              <div className="bigwait dashboard-wait-value">
                {stage === 'laboratory' ? (labMinutesLeft(s) ? `${waitRange(labMinutesLeft(s))} ${T('min')}` : T('wait.ready')) : w ? `${waitRange(w)} ${T('min')}` : T('wait.next')}
              </div>
              {stage !== 'laboratory' && <small>{T('wait.ahead', { n: s.ahead })}</small>}
              {s.fastTrack && stage === 'consultation' && <div style={{ marginTop: 8 }}><Pill>{T('fast.badge')}</Pill></div>}
            </div>
          )}
          {s.routeId && !closed && (
            <div className="card dashboard-cost-card">
              <small>{T('est.title')}</small>
              <div className="bigwait" style={{ fontSize: 26 }}>{money(est.soFar)}</div>
              {est.max > est.soFar && <small>{T('est.mayRise', { amt: money(est.max) })}</small>}
            </div>
          )}
          <div className="card dashboard-timeline-card">
            <small>{T('timeline.title')}</small>
            <ul className="timeline">
              {s.timeline.length === 0 && <li>{T('timeline.empty')}</li>}
              {s.timeline.map((t, i) => <li key={i}><span>{T('tl.' + t.kind, { stage: t.stage ? T('stage.' + t.stage) : '' })}</span><span>{t.at}</span></li>)}
            </ul>
          </div>
        </aside>
      </div>

      {config.demoMode && !s.serverVisitId && (
        <div className="demo" role="region" aria-label="Demo controls">
          <span>{T('demo.label')}</span>
          <Btn kind="ghost" className="inline" onClick={() => actions.tick(5)}>{T('demo.pass')}</Btn>
          {stage === 'checkout' && <Btn kind="ghost" className="inline" aria-pressed={s.demoFailNext} onClick={actions.toggleFailNext}>{s.demoFailNext ? '✓ ' : ''}{T('demo.fail')}</Btn>}
          <Btn kind="ghost" className="inline" onClick={actions.restartDemo}>{T('demo.restart')}</Btn>
        </div>
      )}
    </>
  );
}

/** Continue / defer / back: one primary action per screen, secondary options are quieter. */
function StageActions() {
  const { state: s, actions, T } = useVisit();
  if (s.serverVisitId) return null; // staff actions advance the server-owned journey
  const stage = currentStage(s)!;
  const ok = canAdvance(s);
  return (
    <div className="actions">
      <Btn disabled={!ok} onClick={actions.advance}>{ok ? T('btn.continueStage', { stage: T('stage.' + (s.plan[s.stageIndex + 1] ?? stage)) }) : T('btn.waitingTeam')}</Btn>
      {canDeferStage(s) && (
        <button className="link" onClick={actions.defer}>{stage === 'laboratory' ? T('defer.lab') : T('defer.pharmacy')}</button>
      )}
      {s.stageIndex === 1 && canUndo() && <button className="link" onClick={actions.undo}>← {T('btn.back')}</button>}
    </div>
  );
}

function StageHead({ id, title, sub }: { id: StageId; title: string; sub?: string }) {
  const { state: s, T } = useVisit();
  const steps: StageId[] = s.plan.filter(p => p !== 'route');
  const n = steps.indexOf(id) + 1;
  return (<>
    <p className="eyebrow">{T('step.of', { n: n || 1, total: steps.length })}</p>
    <h1>{title}</h1>{sub && <p className="muted">{sub}</p>}
  </>);
}

function StageView({ id }: { id: StageId }) {
  switch (id) {
    case 'registration': return <Registration />;
    case 'triage': return <Triage />;
    case 'consultation': return <Consultation />;
    case 'test-review': return <TestReview />;
    case 'laboratory': return <Lab />;
    case 'results-review': return <ResultsReview />;
    case 'pharmacy': return <Pharmacy />;
    case 'checkout': return <Checkout />;
    default: return null;
  }
}

// ---------------- route chooser ----------------
function RouteChooser({ goAppointments }: { goAppointments: () => void }) {
  const { state: s, actions, T } = useVisit();
  const apptToday = s.appointments.find(a => a.today && a.status === 'booked');
  const [pick, setPick] = useState<RouteId | null>(s.routeId);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const route = pick ? config.routes[pick] : null;
  const routeOptions = s.accountRole === 'patient' ? config.routeOrder.filter(item => item !== 'refill' && item !== 'pay') : config.routeOrder;
  const choose = (r: RouteId) => { setPick(r); actions.chooseRoute(r); };
  const stages = route ? ['route' as StageId, ...(route.withRegistration && s.patient.detailsConfirmedDaysAgo > config.registrationValidDays ? ['registration' as StageId] : []), ...route.stages] : [];
  const mins = route ? planMinutes(stages.filter(x => x !== 'route' && !route.tentative.includes(x))) : 0;
  const est = runningEstimate(s);
  const startVisit = async () => {
    if (!pick || starting) return;
    setStarting(true); setStartError(null);
    try {
      const complaint = [s.complaint, s.symptomOnset && `Onset: ${s.symptomOnset}`, `Severity: ${s.symptomSeverity}/10`, s.symptomDetails].filter(Boolean).join('\n').slice(0, 1000);
      await visitService.startVisit(pick, complaint, pick === 'appointment' ? apptToday?.id : undefined);
    } catch (error) { setStartError(error instanceof Error ? error.message : 'Could not start your visit.'); }
    finally { setStarting(false); }
  };

  return (<>
    <p className="eyebrow">{T('route.eyebrow')}</p>
    <h1>{T('route.title')}</h1><p className="muted">{T('route.sub')}</p>

    {apptToday && (
      <div className="appt">
        <div><b>{T('route.apptToday', { time: apptToday.time })}</b><br /><span className="muted" style={{ margin: 0 }}>{apptToday.clinic} · {apptToday.doctor}</span></div>
        <div className="row2">
          <Btn className="inline" onClick={() => { actions.chooseRoute('appointment', 'qr'); setPick('appointment'); }}>{T('route.scanQr')}</Btn>
          <Btn kind="ghost" className="inline" onClick={() => { actions.chooseRoute('appointment', 'desk'); setPick('appointment'); }}>{T('route.atDesk')}</Btn>
        </div>
      </div>
    )}

    <div role="radiogroup" aria-label={T('route.title')}>
      {routeOptions.map(r => (
        <button key={r} role="radio" aria-checked={pick === r} className={`choice ${pick === r ? 'on' : ''}`} onClick={() => choose(r)}>
          <b>{T(`route.${r}.title`)}</b><br /><span className="muted" style={{ margin: 0 }}>{T(`route.${r}.desc`)}</span>
        </button>
      ))}
    </div>
    <button className="link" onClick={goAppointments}>{T('route.bookLink')}</button>
    {s.accountRole === 'patient' && <p className="muted">Refills and balance payments will appear when verified prescription and outstanding-balance records are available.</p>}

    {route?.askComplaint && (<>
      <label htmlFor="complaint">{T('route.complaint')}</label>
      <textarea id="complaint" className="field" rows={2} value={s.complaint} onChange={e => actions.setComplaint(e.target.value)} />
      <section className="symptom-intake" aria-labelledby="symptom-intake-title">
        <div><p className="eyebrow">{T('intake.eyebrow')}</p><h2 id="symptom-intake-title">{T('intake.title')}</h2><p className="muted">{T('intake.sub')}</p></div>
        <div className="grid2 symptom-fields">
          <div><label htmlFor="symptom-onset">{T('intake.onset')}</label><input id="symptom-onset" className="field" placeholder={T('intake.onsetPlaceholder')} maxLength={80} value={s.symptomOnset} onChange={e => actions.setSymptomIntake(e.target.value, s.symptomSeverity, s.symptomDetails)} /></div>
          <div><label htmlFor="symptom-severity">{T('intake.severity', { n: s.symptomSeverity })}</label><input id="symptom-severity" className="field" type="range" min="1" max="10" value={s.symptomSeverity} onChange={e => actions.setSymptomIntake(s.symptomOnset, Number(e.target.value), s.symptomDetails)} /></div>
          <div className="symptom-details"><label htmlFor="symptom-details">{T('intake.details')}</label><textarea id="symptom-details" className="field" rows={3} maxLength={1000} placeholder={T('intake.detailsPlaceholder')} value={s.symptomDetails} onChange={e => actions.setSymptomIntake(s.symptomOnset, s.symptomSeverity, e.target.value)} /><small>{T('intake.charCount', { n: s.symptomDetails.length })}</small></div>
        </div>
      </section>
      {s.redFlag && <Note tone="danger"><b>{T('redflag.title')}</b> {T('redflag.text', { phone: config.hospital.emergencyPhone })}</Note>}
    </>)}

    {route && (
      <div className="preview">
        <p className="eyebrow">{T('preview.title')}</p>
        <div className="chips">
          {stages.filter(x => x !== 'route').map(x => <span key={x} className={`chip ${route.tentative.includes(x) ? 'maybe' : ''}`}>{T('stage.' + x)}{route.tentative.includes(x) ? ' ?' : ''}</span>)}
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          {mins > 0 ? T('preview.time', { range: `${Math.round(mins * 0.75)}\u2013${Math.round(mins * 1.25)}` }) + ' · ' : ''}
          {T('preview.cost', { amt: money(est.soFar) })}{route.tentative.length ? ' · ' + T('preview.maybe') : ''}
        </p>
      </div>
    )}
    {startError && <Note tone="danger">{startError}</Note>}
    <div className="actions"><Btn disabled={!pick || starting || (s.routeId === null) || (pick === 'appointment' && !apptToday)} onClick={() => void startVisit()}>{starting ? 'Starting…' : T('btn.continue')}</Btn></div>
  </>);
}

// ---------------- stages ----------------
function Registration() {
  const { state: s, actions, T } = useVisit();
  const [phone, setPhone] = useState(s.patient.phone);
  const [area, setArea] = useState(s.patient.area);
  const [err, setErr] = useState<{ phone?: string; area?: string }>({});
  const go = () => {
    const e = actions.updateDetails(phone, area);
    if (e) { setErr({ phone: !validPhone(phone) ? T('err.phone') : undefined, area: e === 'err.area' ? T('err.area') : undefined }); return; }
    actions.advance();
  };
  return (<>
    <StageHead id="registration" title={T('reg.title')} sub={T('reg.sub')} />
    <Note tone="ok">{T('reg.matched')}</Note>
    <div className="grid2">
      <Field label={T('f.phone')} value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" error={err.phone} />
      <Field label={T('f.area')} value={area} onChange={e => setArea(e.target.value)} error={err.area} />
      <KV k={T('f.id')} v={s.patient.nationalId} /><KV k={T('f.dob')} v={s.patient.dob} />
    </div>
    <div className="actions"><Btn onClick={go}>{T('reg.confirm')}</Btn>{s.stageIndex === 1 && canUndo() && <button className="link" onClick={actions.undo}>← {T('btn.back')}</button>}</div>
  </>);
}

function Triage() {
  const { state: s, T } = useVisit(); const p = s.patient;
  return (<>
    <StageHead id="triage" title={s.ahead === 0 ? T('triage.ready') : T('triage.queue')} sub={T('triage.sub')} />
    {s.redFlag && <Note tone="danger"><b>{T('redflag.title')}</b> {T('fast.explain')}</Note>}
    <Note>{s.ahead === 0 ? T('triage.yourTurn') : T('wait.ahead', { n: s.ahead })}</Note>
    <p className="eyebrow">{T('snap.title')}</p>
    <div className="grid2">
      <KV k={T('snap.blood')} v={p.bloodGroup} /><KV k={T('snap.allergy')} v={p.allergy} tone="danger" />
      <KV k={T('snap.condition')} v={p.condition} /><KV k={T('snap.last')} v={p.lastVisit} />
      <KV k={T('snap.medicine')} v={p.medicine} /><KV k={T('snap.bp')} v={p.lastBp} />
    </div>
    {config.routes[s.routeId!]?.askComplaint && <section className="triage-intake"><p className="eyebrow">{T('triage.reported')}</p><Note tone="warn">{T('snap.concern')}: {s.complaint || T('triage.notProvided')}</Note><div className="grid2"><KV k={T('triage.started')} v={s.symptomOnset || T('triage.notProvided')} /><KV k={T('triage.severity')} v={`${s.symptomSeverity}/10`} /></div>{s.symptomDetails && <p className="muted triage-details">{s.symptomDetails}</p>}</section>}
  </>);
}

function Consultation() {
  const { state: s, T } = useVisit();
  return (<>
    <StageHead id="consultation" title={s.ahead === 0 ? T('consult.ready') : T('consult.next')} sub={T('consult.sub')} />
    <KV k={config.demoDoctor.room} v={config.demoDoctor.name} />
    <Note>{s.ahead === 0 ? T('consult.goNow') : T('consult.wait')}</Note>
    {s.diagnosis ? <section className="report-summary"><p className="eyebrow">{T('diagnosis.title')}</p><p>{s.diagnosis}</p></section> : <Note>{T('diagnosis.pending')}</Note>}
  </>);
}

function TestReview() {
  const { state: s, actions, T } = useVisit();
  const [declined, setDeclined] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const toggle = (id: string) => setDeclined(items => items.includes(id) ? items.filter(x => x !== id) : [...items, id]);
  const catalog = s.catalogTests ?? config.labTests;
  const total = s.orders.labIds.filter(id => !declined.includes(id)).reduce((sum, id) => sum + (catalog.find(test => test.id === id)?.price ?? 0), 0);
  const approve = async () => { if (!s.serverVisitId || busy) return; setBusy(true); setError(null); try { await backend.approveTests(s.serverVisitId, s.orders.labIds.filter(id => !declined.includes(id))); actions.setServerVisit((await backend.visit(s.serverVisitId)).visit); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save your test choices.'); } finally { setBusy(false); } };
  return <>
    <StageHead id="test-review" title={T('testReview.title')} sub={T('testReview.sub')} />
    {s.diagnosis && <section className="report-summary"><p className="eyebrow">{T('diagnosis.title')}</p><p>{s.diagnosis}</p></section>}
    {s.orders.labStatus === 'proposed' && <section className="orders">
      {s.orders.labIds.map(id => { const test = catalog.find(item => item.id === id); if (!test) return null; return <label key={id} className="check"><input type="checkbox" checked={!declined.includes(id)} onChange={() => toggle(id)} /><span>{test.name}<em> · {T('orders.results', { min: test.turnaroundMinutes })}</em></span><b>{money(test.price)}</b></label>; })}
      <div className="total"><span>{T('orders.total')}</span><span>{money(total)}</span></div><p className="muted">{T('tests.consent')}</p>
      {error && <Note tone="danger">{error}</Note>}<Btn disabled={busy || !s.serverVisitId} onClick={() => void approve()}>{busy ? 'Saving…' : T('orders.approve')}</Btn>
    </section>}
    {s.orders.labStatus === 'approved' && (s.orders.labIds.length ? <Note tone="ok">{T('tests.approved', { n: s.orders.labIds.length })}</Note> : <Note tone="info">{T('testReview.none')}</Note>)}
  </>;
}

function ResultsReview() {
  const { state: s, actions, T } = useVisit();
  const [declined, setDeclined] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const toggle = (id: string) => setDeclined(items => items.includes(id) ? items.filter(x => x !== id) : [...items, id]);
  const reportsReady = s.orders.labIds.length === 0 || (s.labs.length === s.orders.labIds.length && s.labs.every(order => order.report.trim()));
  const catalog = s.catalogDrugs ?? config.drugs;
  const total = s.orders.drugIds.filter(id => !declined.includes(id)).reduce((sum, id) => sum + (catalog.find(item => item.id === id)?.price ?? 0), 0);
  const approve = async () => { if (!s.serverVisitId || busy) return; setBusy(true); setError(null); try { await backend.approveMedicines(s.serverVisitId, s.orders.drugIds.filter(id => !declined.includes(id))); actions.setServerVisit((await backend.visit(s.serverVisitId)).visit); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save your medicine choices.'); } finally { setBusy(false); } };
  return <>
    <StageHead id="results-review" title={s.ahead === 0 ? T('review.ready') : T('review.queue')} sub={T('review.sub')} />
    {s.labs.length > 0 ? <section className="report-summary"><p className="eyebrow">{T('review.report')}</p>{s.labs.map(order => <div className="row" key={order.test.id}><span><b>{order.test.name}</b><br/><small>{s.orders.drugStatus === 'pending' ? T('review.doctorChecking') : order.report}</small></span><Pill>{T('lab.ready')}</Pill></div>)}</section> : <Note tone="info">{T('review.previousResult')}</Note>}
    {!reportsReady && <><Note tone="warn">{T('review.waitingLab')}</Note>{!s.serverVisitId && <>{!s.labNotificationRequested && !s.labNotificationSent && <Btn onClick={actions.requestLabNotification}>{T('lab.notify')}</Btn>}{s.labNotificationRequested && <Note>{T('lab.notifyRequested')}<br/><small>{T('lab.notifyDemoOnly')}</small></Note>}{s.labNotificationSent && <Note tone="ok">{T('notice.labReady')}<br/><small>{T('lab.notifyDemoOnly')}</small></Note>}{config.demoMode && s.labs.length > 0 && <><Btn kind="ghost" onClick={actions.simulateDemoLabCompletion}>{T('lab.simulateDemo')}</Btn><small className="muted">{T('lab.simulateDemoNote')}</small></>}</>}</>}
    {reportsReady && s.orders.drugStatus === 'pending' && <Note>{T('review.waitingDoctor')}</Note>}
    {reportsReady && s.orders.drugStatus === 'proposed' && <section className="orders"><p className="eyebrow">{T('meds.title')}</p><p className="muted">{T('meds.sub')}</p>
      {s.orders.drugIds.map(id => { const drug = catalog.find(item => item.id === id); if (!drug) return null; return <label key={id} className="check"><input type="checkbox" checked={!declined.includes(id)} onChange={() => toggle(id)} /><span>{drug.name}<em> · {drug.directions}</em></span><b>{money(drug.price)}</b></label>; })}
      <div className="total"><span>{T('orders.total')}</span><span>{money(total)}</span></div><p className="muted">{T('tests.consent')}</p>{error && <Note tone="danger">{error}</Note>}<Btn disabled={busy || !s.serverVisitId} onClick={() => void approve()}>{busy ? 'Saving…' : T('meds.approve')}</Btn>
    </section>}
    {reportsReady && s.orders.drugStatus === 'approved' && <Note tone="ok">{s.orders.drugIds.length ? T('meds.approved', { n: s.orders.drugIds.length }) : T('meds.none')}</Note>}
  </>;
}

function Lab() {
  const { state: s, actions, T } = useVisit(); const left = labMinutesLeft(s);
  const reportReady = left === 0 && s.labs.length > 0 && s.labs.every(order => order.report.trim());
  return (<>
    <StageHead id="laboratory" title={left === 0 ? T('lab.ready') : T('lab.processing')} sub={T('lab.sub')} />
    {s.labs.map(o => {
      const pct = Math.round(100 * (1 - o.minutesLeft / o.test.turnaroundMinutes));
      return (<div key={o.test.id} className="kv" style={{ marginBottom: 10 }}>
        <div className="row" style={{ padding: 0, border: 0 }}><b>{o.test.name}</b><Pill tone={o.minutesLeft ? 'warn' : 'ok'}>{o.minutesLeft ? T('lab.left', { min: o.minutesLeft }) : T('wait.ready')}</Pill></div>
        <Bar pct={pct} label={o.test.name} />
      </div>);
    })}
    <Note tone="warn">{s.labs.every(order => order.report.trim()) ? T('lab.sentForReview') : T('lab.reportPending')}</Note>
    {!s.serverVisitId && <>{!s.labNotificationRequested && !s.labNotificationSent && <Btn onClick={actions.requestLabNotification}>{T(reportReady ? 'lab.notifyNow' : 'lab.notify')}</Btn>}{s.labNotificationRequested && <Note>{T('lab.notifyRequested')}<br/><small>{T('lab.notifyDemoOnly')}</small></Note>}{s.labNotificationSent && <Note tone="ok"><b>{T('notice.labReady')}</b><br/><small>{T('lab.notifyDemoOnly')}</small></Note>}{config.demoMode && !reportReady && s.labs.length > 0 && <><Btn kind="ghost" onClick={actions.simulateDemoLabCompletion}>{T('lab.simulateDemo')}</Btn><small className="muted">{T('lab.simulateDemoNote')}</small></>}</>}
    <p className="muted">{T('defer.labHelp')}</p>
  </>);
}

function Pharmacy() {
  const { state: s, T } = useVisit();
  return (<>
    <StageHead id="pharmacy" title={T('rx.title')} sub={T('rx.sub')} />
    {s.prescriptions.map(d => (
      <div className="row" key={d.id}>
        <div><b>{d.name}</b><br /><span className="muted" style={{ margin: 0 }}>{d.directions}</span>{!d.inStock && <><br /><span className="err">{T('rx.sub2')}</span></>}</div>
        <Pill tone={d.inStock ? 'ok' : 'warn'}>{d.inStock ? T('rx.available') : T('rx.out')}</Pill>
      </div>
    ))}
    <Note>{s.ahead === 0 ? T('rx.ready') : T('rx.ahead', { n: s.ahead })}</Note>
    <p className="muted">{T('defer.rxHelp')}</p>
  </>);
}

function adjLabel(label: string, T: (k: string, v?: Record<string, string | number>) => string) {
  if (label.startsWith('rule:')) return T('adj.' + label);
  if (label.startsWith('insurance:')) return T('adj.insurance');
  return T('adj.waiver.' + label);
}

function Checkout() {
  const { state: s, actions, T } = useVisit();
  const [busy, setBusy] = useState(false); const [payError, setPayError] = useState<string | null>(null); const [paymentId, setPaymentId] = useState<string | null>(null); const [paymentProvider, setPaymentProvider] = useState<string | null>(null);
  const pollLock = useRef(false);
  const st = buildStatement(s);
  const refreshVisit = useCallback(async () => { if (s.serverVisitId) actions.setServerVisit((await backend.visit(s.serverVisitId)).visit); }, [s.serverVisitId, actions]);
  const startPayment = async () => {
    if (!s.serverVisitId || busy) return;
    setBusy(true); setPayError(null);
    try {
      const intent = await backend.paymentIntent(s.serverVisitId, `web-${s.serverVisitId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      setPaymentId(intent.paymentId); setPaymentProvider(intent.provider ?? 'daraja');
      if (intent.provider === 'mock') { await backend.mockCompletePayment(intent.paymentId); await refreshVisit(); setPaymentId(null); }
    } catch (error) { setPayError(error instanceof Error ? error.message : 'M-Pesa payment could not be started.'); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!paymentId || paymentProvider === 'mock' || pollLock.current) return;
    pollLock.current = true; let stopped = false;
    const poll = async () => {
      try {
        const result = await backend.payment(paymentId);
        if (result.payment.status === 'succeeded' || result.payment.status === 'failed' || result.payment.status === 'cancelled') {
          if (!stopped) { setPaymentId(null); await refreshVisit(); }
          return;
        }
      } catch (error) { if (!stopped) setPayError(error instanceof Error ? error.message : 'Could not check payment status.'); }
      if (!stopped) window.setTimeout(() => void poll(), 4000);
    };
    const timer = window.setTimeout(() => void poll(), 3000);
    return () => { stopped = true; window.clearTimeout(timer); pollLock.current = false; };
  }, [paymentId, paymentProvider, refreshVisit]);
  const finishFree = async () => { if (!s.serverVisitId || busy) return; setBusy(true); setPayError(null); try { await backend.completeFreeVisit(s.serverVisitId); await refreshVisit(); } catch (error) { setPayError(error instanceof Error ? error.message : 'Could not complete the visit.'); } finally { setBusy(false); } };
  const line = (d: string) => d.startsWith('line.') ? T(d) : d;
  return (<>
    <StageHead id="checkout" title={T('pay.title')} sub={T('pay.sub')} />
    {st.lines.map(l => (
      <div key={l.key}>
        <div className="row"><span>{line(l.description)}</span><b>{money(l.gross)}</b></div>
        {l.adjustments.map(a => <div className="row adj" key={a.label}><span>{adjLabel(a.label, T)}</span><b>{money(a.amount)}</b></div>)}
      </div>
    ))}
    {st.waivers.map((w, i) => <div className="row adj" key={i}><span>{adjLabel(w.label, T)}</span><b>{money(w.amount)}</b></div>)}
    <div className="total"><span>{T('pay.total')}</span><span>{money(st.total)}</span></div>
    <p className="muted" style={{ marginTop: 6 }}>{T('pay.version', { v: st.version })}</p>

    <div className="actions">
      {st.total === 0 && <><Note tone="ok">{T('pay.nothing')}</Note><Btn disabled={busy || !s.serverVisitId} onClick={() => void finishFree()}>{busy ? 'Finishing…' : T('pay.finish')}</Btn></>}
      {st.total > 0 && s.payment === 'unpaid' && <>
        <Btn disabled={busy || !s.serverVisitId} onClick={() => void startPayment()}>{busy ? 'Connecting to M-Pesa…' : T('pay.mpesa', { amt: money(st.total) })}</Btn>
        {payError && <Note tone="danger">{payError}</Note>}<p className="muted">Payment status is confirmed by the backend after the M-Pesa callback.</p></>}
      {paymentId && <Note tone="warn"><b>Payment pending.</b> Approve the M-Pesa prompt on your phone. This page checks the server status automatically.{payError ? ` ${payError}` : ''}</Note>}
      {s.payment === 'paid' && <>
        <Note tone="ok">{T('pay.paid', { code: s.mpesaReceipt ?? '' })}</Note><Btn onClick={actions.advance}>{T('pay.finish')}</Btn></>}
    </div>
  </>);
}

function Done() {
  const { state: s, actions, T } = useVisit();
  const total = buildStatement(s).total;
  return (<>
    <p className="eyebrow">{T('done.eyebrow')}</p>
    <h1>{T('done.title')}</h1>
    <p className="muted">{T('done.text', { amt: money(total), name: s.patient.name.split(' ')[0] })}</p>
    {s.deferred.length > 0 && <Note>
      <b>{T('done.later')}</b>
      <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
        {s.deferred.map(d => <li key={d}>{d === 'laboratory' ? T('done.labLater') : T('done.rxLater')}</li>)}
      </ul></Note>}
    <p className="eyebrow">{T('fb.title')}</p>
    <div className="stars" role="radiogroup" aria-label={T('fb.title')}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} role="radio" aria-checked={s.feedback === n} aria-label={`${n}`} className={(s.feedback ?? 0) >= n ? 'on' : ''} onClick={() => actions.setFeedback(n)}>★</button>
      ))}
    </div>
    {s.feedback !== null && <p className="muted">{T('fb.thanks')}</p>}
    <div className="actions"><Btn kind="ghost" onClick={actions.newVisit}>{T('done.new')}</Btn></div>
  </>);
}
