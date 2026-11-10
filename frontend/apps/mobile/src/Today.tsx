import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View, Pressable } from 'react-native';
import {
  config, useVisit, currentStage, isClosed, waitFor, waitRange, labMinutesLeft, canAdvance, canUndo, canDeferStage, buildStatement, backend,
  runningEstimate, planMinutes, stepItems, money, validPhone, type StageId, type RouteId,
} from '@mediflow/shared';
import { Bar, Btn, Card, Check, Eyebrow, Field, H1, KV, LinkBtn, Muted, Note, Pill, s, t } from './ui';

export function Today({ bottom, goAppointments }: { bottom: number; goAppointments: () => void }) {
  const { state: S, actions, T } = useVisit();
  const stage = currentStage(S); const closed = isClosed(S); const chooser = !closed && stage === 'route';
  const est = runningEstimate(S); const items = stepItems(S).filter(i => i.id !== 'route');
  const showWait = !closed && stage && ['triage', 'consultation', 'pharmacy', 'laboratory', 'results-review'].includes(stage);
  const w = waitFor(S);
  const mark = (st: string, i: number) => st === 'done' ? '✓' : st === 'later' ? '⏱' : st === 'maybe' ? '?' : String(i + 1);
  return (
    <View style={{ flex: 1 }}>
      {!chooser && S.routeId && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.line }} contentContainerStyle={{ padding: 12, gap: 12 }}>
          {items.map((i, idx) => (
            <View key={i.id + i.status} accessibilityLabel={`${T('stage.' + i.id)} ${i.status}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderStyle: i.status === 'maybe' || i.status === 'later' ? 'dashed' : 'solid', borderColor: i.status === 'done' || i.status === 'now' ? t.primaryDark : t.line, backgroundColor: i.status === 'done' ? t.primaryDark : i.status === 'now' ? t.primarySoft : t.card, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: i.status === 'done' ? '#fff' : t.ink }}>{mark(i.status, idx)}</Text></View>
              <Text style={{ fontSize: 12, fontWeight: i.status === 'now' ? '800' : '500', color: i.status === 'now' ? t.ink : t.inkSoft }}>{T('stage.' + i.id)}{i.status === 'maybe' ? ` · ${T('tracker.ifNeeded')}` : i.status === 'later' ? ` · ${T('tracker.later')}` : ''}</Text>
            </View>))}
        </ScrollView>)}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: (config.demoMode ? 120 : 40) + bottom }} keyboardShouldPersistTaps="handled">
        {S.notices.map(n => (
          <View key={n.id} accessibilityLiveRegion="polite" style={[s.note, { backgroundColor: t.warnSoft, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
            <Text style={{ color: t.warnText, flex: 1 }}>{T(n.key)}</Text><LinkBtn label={T('btn.dismiss')} onPress={() => actions.dismissNotice(n.id)} /></View>))}
        {!chooser && S.skipped.map(k => <Text key={k.stage + k.reason} style={{ color: t.inkSoft, fontSize: 12, marginBottom: 4 }}>↷ {T('skip.' + k.reason, { stage: T('stage.' + k.stage) })}</Text>)}
        {showWait && (
          <View accessibilityLiveRegion="polite" style={[s.card, { backgroundColor: t.dark }]}>
            <Text style={{ color: '#bcd8d4', fontSize: 10, letterSpacing: 1.2, fontWeight: '700' }}>{(stage === 'laboratory' ? T('wait.labReady') : stage === 'pharmacy' ? T('wait.pharmacy') : T('wait.est')).toUpperCase()}</Text>
            <Text style={{ color: '#fff', fontSize: 34, fontWeight: '800', marginVertical: 4 }}>
              {stage === 'laboratory' ? (labMinutesLeft(S) ? `${waitRange(labMinutesLeft(S))} ${T('min')}` : T('wait.ready')) : w ? `${waitRange(w)} ${T('min')}` : T('wait.next')}</Text>
            {stage !== 'laboratory' && <Text style={{ color: '#bcd8d4', fontSize: 12 }}>{T('wait.ahead', { n: S.ahead })}</Text>}
            {S.fastTrack && stage === 'consultation' && <View style={{ marginTop: 8, alignSelf: 'flex-start' }}><Pill text={T('fast.badge')} /></View>}
          </View>)}
        <Card>
          {chooser ? <RouteChooser goAppointments={goAppointments} /> : closed ? <Done /> : <StageView id={stage!} />}
          {!chooser && !closed && stage && !['registration', 'checkout'].includes(stage) && <StageActions />}
        </Card>
        {S.routeId && !closed && (
          <Card dark><Text style={{ color: '#bcd8d4', fontSize: 10, letterSpacing: 1.2, fontWeight: '700' }}>{T('est.title').toUpperCase()}</Text>
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 4 }}>{money(est.soFar)}</Text>
            {est.max > est.soFar && <Text style={{ color: '#bcd8d4', fontSize: 12 }}>{T('est.mayRise', { amt: money(est.max) })}</Text>}</Card>)}
        <Card dark><Text style={{ color: '#bcd8d4', fontSize: 10, letterSpacing: 1.2, fontWeight: '700' }}>{T('timeline.title').toUpperCase()}</Text>
          {S.timeline.length === 0 && <Text style={{ color: '#d3e8e5', fontSize: 12, marginTop: 6 }}>{T('timeline.empty')}</Text>}
          {S.timeline.map((x, i) => <View key={i} style={[s.rowBetween, { paddingVertical: 3 }]}><Text style={{ color: '#d3e8e5', fontSize: 12, flex: 1 }}>{T('tl.' + x.kind, { stage: x.stage ? T('stage.' + x.stage) : '' })}</Text><Text style={{ color: '#d3e8e5', fontSize: 12 }}>{x.at}</Text></View>)}</Card>
      </ScrollView>
      {config.demoMode && !S.serverVisitId && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fffbe8', borderTopWidth: 1, borderTopColor: '#e6d98a', padding: 8, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={{ flex: 1 }}><Btn kind="ghost" label={T('demo.pass')} onPress={() => actions.tick(5)} /></View>
            {stage === 'checkout' && <View style={{ flex: 1 }}><Btn kind="ghost" label={(S.demoFailNext ? '✓ ' : '') + T('demo.fail')} onPress={actions.toggleFailNext} /></View>}
            <View style={{ flex: 1 }}><Btn kind="ghost" label={T('demo.restart')} onPress={actions.restartDemo} /></View>
          </View>
        </View>)}
    </View>
  );
}

function StageActions() {
  const { state: S, actions, T } = useVisit(); const stage = currentStage(S)!; const ok = canAdvance(S);
  if (S.serverVisitId) return null;
  return (<View>
    <Btn disabled={!ok} label={ok ? T('btn.continueStage', { stage: T('stage.' + (S.plan[S.stageIndex + 1] ?? stage)) }) : T('btn.waitingTeam')} onPress={actions.advance} />
    {canDeferStage(S) && <LinkBtn label={stage === 'laboratory' ? T('defer.lab') : T('defer.pharmacy')} onPress={actions.defer} />}
    {S.stageIndex === 1 && canUndo() && <LinkBtn label={'← ' + T('btn.back')} onPress={actions.undo} />}
  </View>);
}
function Head({ id, title, sub }: { id: StageId; title: string; sub?: string }) {
  const { state: S, T } = useVisit(); const steps: StageId[] = S.plan.filter(p => p !== 'route');
  return (<><Eyebrow>{T('step.of', { n: steps.indexOf(id) + 1 || 1, total: steps.length })}</Eyebrow><H1>{title}</H1>{sub ? <Muted>{sub}</Muted> : null}</>);
}
function StageView({ id }: { id: StageId }) {
  switch (id) {
    case 'registration': return <Registration />; case 'triage': return <Triage />; case 'consultation': return <Consultation />;
    case 'test-review': return <TestReview />; case 'laboratory': return <Lab />; case 'results-review': return <ResultsReview />; case 'pharmacy': return <Pharmacy />; case 'checkout': return <Checkout />; default: return null;
  }
}

function RouteChooser({ goAppointments }: { goAppointments: () => void }) {
  const { state: S, actions, T } = useVisit();
  const apptToday = S.appointments.find(a => a.today && a.status === 'booked');
  const [pick, setPick] = useState<RouteId | null>(S.routeId);
  const [starting, setStarting] = useState(false); const [startError, setStartError] = useState<string | null>(null);
  const route = pick ? config.routes[pick] : null;
  const routeOptions = S.accountRole === 'patient' ? config.routeOrder.filter(item => item !== 'refill' && item !== 'pay') : config.routeOrder;
  const choose = (r: RouteId) => { setPick(r); actions.chooseRoute(r); };
  const stages = route ? [...(route.withRegistration && S.patient.detailsConfirmedDaysAgo > config.registrationValidDays ? ['registration' as StageId] : []), ...route.stages] : [];
  const mins = route ? planMinutes(stages.filter(x => !route.tentative.includes(x))) : 0; const est = runningEstimate(S);
  const start = async () => {
    if (!pick || starting) return; setStarting(true); setStartError(null);
    try { const complaint = [S.complaint, S.symptomOnset && `Onset: ${S.symptomOnset}`, `Severity: ${S.symptomSeverity}/10`, S.symptomDetails].filter(Boolean).join('\n').slice(0, 1000);
      const result = await backend.startVisit(pick, complaint, pick === 'appointment' ? apptToday?.id : undefined); actions.setServerVisit((await backend.visit(result.visit.id)).visit);
    } catch (error) { setStartError(error instanceof Error ? error.message : 'Could not start your visit.'); } finally { setStarting(false); }
  };
  return (<>
    <Eyebrow>{T('route.eyebrow')}</Eyebrow><H1>{T('route.title')}</H1><Muted>{T('route.sub')}</Muted>
    {apptToday && (<View style={{ backgroundColor: t.primarySoft, borderRadius: 14, padding: 14, marginBottom: 12 }}>
      <Text style={{ fontWeight: '800', color: t.ink }}>{T('route.apptToday', { time: apptToday.time })}</Text><Text style={s.muted}>{apptToday.clinic} · {apptToday.doctor}</Text>
      <Btn label={T('route.scanQr')} onPress={() => { actions.chooseRoute('appointment', 'qr'); setPick('appointment'); }} />
      <Btn kind="ghost" label={T('route.atDesk')} onPress={() => { actions.chooseRoute('appointment', 'desk'); setPick('appointment'); }} /></View>)}
    {routeOptions.map(r => (
      <Pressable key={r} accessibilityRole="radio" accessibilityState={{ checked: pick === r }} onPress={() => choose(r)}
        style={{ borderWidth: 2, borderColor: pick === r ? t.primaryDark : t.line, backgroundColor: pick === r ? t.primarySoft : t.card, borderRadius: 14, padding: 14, marginBottom: 10, minHeight: 64 }}>
        <Text style={{ fontWeight: '800', color: t.ink }}>{T(`route.${r}.title`)}</Text><Text style={s.muted}>{T(`route.${r}.desc`)}</Text></Pressable>))}
    <LinkBtn label={T('route.bookLink')} onPress={goAppointments} />
    {S.accountRole === 'patient' ? <Muted>Refills and balance payments will appear when verified prescription and outstanding-balance records are available.</Muted> : null}
    {route?.askComplaint && (<>
      <Text style={s.label}>{T('route.complaint')}</Text>
      <TextInput accessibilityLabel={T('route.complaint')} multiline style={[s.input, { minHeight: 72, textAlignVertical: 'top', paddingTop: 10 }]} value={S.complaint} onChangeText={actions.setComplaint} />
      <View style={{ marginTop: 14, padding: 14, borderRadius: 14, backgroundColor: t.primarySoft }}>
        <Eyebrow>{T('intake.eyebrow')}</Eyebrow><Text style={[s.h2, { marginBottom: 5 }]}>{T('intake.title')}</Text><Text style={s.muted}>{T('intake.sub')}</Text>
        <Field label={T('intake.onset')} value={S.symptomOnset} onChangeText={value => actions.setSymptomIntake(value, S.symptomSeverity, S.symptomDetails)} placeholder={T('intake.onsetPlaceholder')} maxLength={80} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 12 }}>
          <Text style={{ color: t.ink, fontWeight: '700', fontSize: 12, flex: 1 }}>{T('intake.severity', { n: S.symptomSeverity })}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Decrease symptom severity" disabled={S.symptomSeverity <= 1} onPress={() => actions.setSymptomIntake(S.symptomOnset, S.symptomSeverity - 1, S.symptomDetails)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: t.card }}><Text style={{ color: t.primaryDark, fontWeight: '800', fontSize: 18 }}>−</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Increase symptom severity" disabled={S.symptomSeverity >= 10} onPress={() => actions.setSymptomIntake(S.symptomOnset, S.symptomSeverity + 1, S.symptomDetails)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: t.card }}><Text style={{ color: t.primaryDark, fontWeight: '800', fontSize: 18 }}>＋</Text></Pressable>
        </View>
        <Text style={s.label}>{T('intake.details')}</Text>
        <TextInput accessibilityLabel={T('intake.details')} multiline maxLength={1000} textAlignVertical="top" style={[s.input, { minHeight: 82, paddingTop: 10 }]} value={S.symptomDetails} onChangeText={value => actions.setSymptomIntake(S.symptomOnset, S.symptomSeverity, value)} placeholder={T('intake.detailsPlaceholder')} />
        <Text style={[s.muted, { textAlign: 'right', marginTop: 4, marginBottom: 0 }]}>{T('intake.charCount', { n: S.symptomDetails.length })}</Text>
      </View>
      {S.redFlag && <Note tone="danger">{T('redflag.title')} {T('redflag.text', { phone: config.hospital.emergencyPhone })}</Note>}</>)}
    {route && (<View style={{ marginTop: 12, padding: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#9fb0b5', borderRadius: 12 }}>
      <Eyebrow>{T('preview.title')}</Eyebrow>
      <View style={s.wrap}>{stages.map(x => <Text key={x} style={{ borderWidth: 1, borderStyle: route.tentative.includes(x) ? 'dashed' : 'solid', borderColor: t.line, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, fontSize: 12, fontWeight: '600', color: t.ink }}>{T('stage.' + x)}{route.tentative.includes(x) ? ' ?' : ''}</Text>)}</View>
      <Text style={[s.muted, { marginTop: 8, marginBottom: 0 }]}>{mins > 0 ? T('preview.time', { range: `${Math.round(mins * 0.75)}\u2013${Math.round(mins * 1.25)}` }) + ' · ' : ''}{T('preview.cost', { amt: money(est.soFar) })}{route.tentative.length ? ' · ' + T('preview.maybe') : ''}</Text></View>)}
    {startError ? <Note tone="danger">{startError}</Note> : null}
    <Btn label={starting ? 'Starting…' : T('btn.continue')} disabled={!pick || S.routeId === null || starting || (pick === 'appointment' && !apptToday)} onPress={() => void start()} />
  </>);
}

function Registration() {
  const { state: S, actions, T } = useVisit();
  const [phone, setPhone] = useState(S.patient.phone); const [area, setArea] = useState(S.patient.area); const [err, setErr] = useState<{ phone?: string; area?: string }>({});
  const go = () => { const e = actions.updateDetails(phone, area); if (e) { setErr({ phone: !validPhone(phone) ? T('err.phone') : undefined, area: e === 'err.area' ? T('err.area') : undefined }); return; } actions.advance(); };
  return (<><Head id="registration" title={T('reg.title')} sub={T('reg.sub')} /><Note tone="ok">{T('reg.matched')}</Note>
    <Field label={T('f.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" error={err.phone} />
    <Field label={T('f.area')} value={area} onChangeText={setArea} error={err.area} />
    <View style={{ height: 10 }} /><KV k={T('f.id')} v={S.patient.nationalId} /><KV k={T('f.dob')} v={S.patient.dob} />
    <Btn label={T('reg.confirm')} onPress={go} />{S.stageIndex === 1 && canUndo() && <LinkBtn label={'← ' + T('btn.back')} onPress={actions.undo} />}</>);
}
function Triage() {
  const { state: S, T } = useVisit(); const p = S.patient;
  return (<><Head id="triage" title={S.ahead === 0 ? T('triage.ready') : T('triage.queue')} sub={T('triage.sub')} />
    {S.redFlag && <Note tone="danger">{T('redflag.title')} {T('fast.explain')}</Note>}
    <Note>{S.ahead === 0 ? T('triage.yourTurn') : T('wait.ahead', { n: S.ahead })}</Note>
    <KV k={T('snap.blood')} v={p.bloodGroup} /><KV k={T('snap.allergy')} v={p.allergy} danger /><KV k={T('snap.condition')} v={p.condition} />
    <KV k={T('snap.last')} v={p.lastVisit} /><KV k={T('snap.medicine')} v={p.medicine} /><KV k={T('snap.bp')} v={p.lastBp} />
    {config.routes[S.routeId!]?.askComplaint && <Note tone="warn">{T('snap.concern')}: {S.complaint}</Note>}</>);
}
function Consultation() {
  const { state: S, T } = useVisit();
  return (<><Head id="consultation" title={S.ahead === 0 ? T('consult.ready') : T('consult.next')} sub={T('consult.sub')} />
    <KV k={config.demoDoctor.room} v={config.demoDoctor.name} /><Note>{S.ahead === 0 ? T('consult.goNow') : T('consult.wait')}</Note>
    {S.diagnosis ? <View style={s.kv}><Eyebrow>{T('diagnosis.title')}</Eyebrow><Text style={s.kvV}>{S.diagnosis}</Text></View> : <Note>{T('diagnosis.pending')}</Note>}</>);
}
function TestReview() {
  const { state: S, actions, T } = useVisit(); const o = S.orders; const [declined, setDeclined] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const catalog = S.catalogTests ?? config.labTests;
  const tog = (id: string) => setDeclined(d => d.includes(id) ? d.filter(x => x !== id) : [...d, id]);
  const total = o.labIds.filter(i => !declined.includes(i)).reduce((a, i) => a + (catalog.find(x => x.id === i)?.price ?? 0), 0);
  const approve = async () => { if (!S.serverVisitId || busy) return; setBusy(true); setError(null); try { await backend.approveTests(S.serverVisitId, o.labIds.filter(id => !declined.includes(id))); actions.setServerVisit((await backend.visit(S.serverVisitId)).visit); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save your test choices.'); } finally { setBusy(false); } };
  return (<><Head id="test-review" title={T('testReview.title')} sub={T('testReview.sub')} />
    {S.diagnosis && <View style={s.kv}><Eyebrow>{T('diagnosis.title')}</Eyebrow><Text style={s.kvV}>{S.diagnosis}</Text></View>}
    {o.labStatus === 'proposed' && <View><Eyebrow>{T('tests.title')}</Eyebrow><Muted>{T('tests.sub')}</Muted>
      {o.labIds.map(i => { const x = catalog.find(y => y.id === i); return x ? <Check key={i} label={x.name} sub={T('orders.results', { min: x.turnaroundMinutes })} price={money(x.price)} on={!declined.includes(i)} onPress={() => tog(i)} /> : null; })}
      <View style={[s.rowBetween, { paddingTop: 12 }]}><Text style={s.h2}>{T('orders.total')}</Text><Text style={s.h2}>{money(total)}</Text></View><Muted>{T('orders.insurance')}</Muted>{error ? <Note tone="danger">{error}</Note> : null}<Btn label={busy ? 'Saving…' : T('orders.approve')} disabled={busy || !S.serverVisitId} onPress={() => void approve()} /></View>}
    {o.labStatus === 'approved' && <Note tone={o.labIds.length ? 'ok' : undefined}>{o.labIds.length ? T('tests.approved', { n: o.labIds.length }) : T('testReview.none')}</Note>}
  </>);
}
function Lab() {
  const { state: S, actions, T } = useVisit(); const left = labMinutesLeft(S);
  const reportReady = left === 0 && S.labs.length > 0 && S.labs.every(order => order.report.trim());
  return (<><Head id="laboratory" title={left === 0 ? T('lab.ready') : T('lab.processing')} sub={T('lab.sub')} />
    {S.labs.map(o => (<View key={o.test.id} style={s.kv}><View style={s.rowBetween}><Text style={s.kvV}>{o.test.name}</Text><Pill tone={o.minutesLeft ? 'warn' : 'ok'} text={o.minutesLeft ? T('lab.left', { min: o.minutesLeft }) : T('wait.ready')} /></View><Bar pct={Math.round(100 * (1 - o.minutesLeft / o.test.turnaroundMinutes))} /></View>))}
    <Note tone="warn">{T('lab.release')}</Note>
    {!S.serverVisitId && !S.labNotificationRequested && !S.labNotificationSent && <Btn label={T(reportReady ? 'lab.notifyNow' : 'lab.notify')} onPress={actions.requestLabNotification} />}
    {S.labNotificationRequested && <Note>{T('lab.notifyRequested')}{'\n'}{T('lab.notifyDemoOnly')}</Note>}
    {S.labNotificationSent && <Note tone="ok">{T('notice.labReady')}{'\n'}{T('lab.notifyDemoOnly')}</Note>}
    {config.demoMode && !S.serverVisitId && !reportReady && S.labs.length > 0 && <><Btn kind="ghost" label={T('lab.simulateDemo')} onPress={actions.simulateDemoLabCompletion} /><Muted>{T('lab.simulateDemoNote')}</Muted></>}
    <Muted>{T('defer.labHelp')}</Muted></>);
}
function ResultsReview() {
  const { state: S, actions, T } = useVisit(); const o = S.orders; const [declined, setDeclined] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const catalog = S.catalogDrugs ?? config.drugs;
  const tog = (id: string) => setDeclined(d => d.includes(id) ? d.filter(x => x !== id) : [...d, id]);
  const reportsReady = o.labIds.length === 0 || (S.labs.length === o.labIds.length && S.labs.every(lab => lab.report.trim()));
  const total = o.drugIds.filter(i => !declined.includes(i)).reduce((a, i) => a + (catalog.find(x => x.id === i)?.price ?? 0), 0);
  const approve = async () => { if (!S.serverVisitId || busy) return; setBusy(true); setError(null); try { await backend.approveMedicines(S.serverVisitId, o.drugIds.filter(id => !declined.includes(id))); actions.setServerVisit((await backend.visit(S.serverVisitId)).visit); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save your medicine choices.'); } finally { setBusy(false); } };
  return (<><Head id="results-review" title={S.ahead === 0 ? T('review.ready') : T('review.queue')} sub={T('review.sub')} />
    {S.labs.length ? S.labs.map(l => <View key={l.test.id} style={s.kv}><Text style={s.kvV}>{l.test.name}</Text><Text style={s.muted}>{o.drugStatus === 'pending' ? T('review.doctorChecking') : (l.report.trim() || T('review.doctorChecking'))}</Text></View>) : <Note>{T('review.previousResult')}</Note>}
    {!reportsReady && <><Note tone="warn">{T('review.waitingLab')}</Note>{!S.serverVisitId && <>{!S.labNotificationRequested && !S.labNotificationSent && <Btn label={T('lab.notify')} onPress={actions.requestLabNotification} />}{S.labNotificationRequested && <Note>{T('lab.notifyRequested')}{'\n'}{T('lab.notifyDemoOnly')}</Note>}{S.labNotificationSent && <Note tone="ok">{T('notice.labReady')}{'\n'}{T('lab.notifyDemoOnly')}</Note>}{config.demoMode && S.labs.length > 0 && <><Btn kind="ghost" label={T('lab.simulateDemo')} onPress={actions.simulateDemoLabCompletion} /><Muted>{T('lab.simulateDemoNote')}</Muted></>}</>}</>}
    {reportsReady && o.drugStatus === 'pending' && <Note>{T('review.waitingDoctor')}</Note>}
    {reportsReady && o.drugStatus === 'proposed' && <View><Eyebrow>{T('meds.title')}</Eyebrow><Muted>{T('meds.sub')}</Muted>
      {o.drugIds.map(i => { const d = catalog.find(x => x.id === i); return d ? <Check key={i} label={d.name} sub={d.directions} price={money(d.price)} on={!declined.includes(i)} onPress={() => tog(i)} /> : null; })}
      <View style={[s.rowBetween, { paddingTop: 12 }]}><Text style={s.h2}>{T('orders.total')}</Text><Text style={s.h2}>{money(total)}</Text></View><Muted>{T('orders.insurance')}</Muted>
      {error ? <Note tone="danger">{error}</Note> : null}<Btn label={busy ? 'Saving…' : T('meds.approve')} disabled={busy || !S.serverVisitId} onPress={() => void approve()} /></View>}
    {reportsReady && o.drugStatus === 'approved' && <Note tone="ok">{o.drugIds.length ? T('meds.approved', { n: o.drugIds.length }) : T('meds.none')}</Note>}
  </>);
}
function Pharmacy() {
  const { state: S, T } = useVisit();
  return (<><Head id="pharmacy" title={T('rx.title')} sub={T('rx.sub')} />
    {S.prescriptions.map(d => (<View key={d.id} style={s.kv}><View style={s.rowBetween}><Text style={s.kvV}>{d.name}</Text><Pill tone={d.inStock ? 'ok' : 'warn'} text={d.inStock ? T('rx.available') : T('rx.out')} /></View><Text style={s.muted}>{d.directions}</Text>{!d.inStock && <Text style={{ color: t.danger, fontSize: 13 }}>{T('rx.sub2')}</Text>}</View>))}
    <Note>{S.ahead === 0 ? T('rx.ready') : T('rx.ahead', { n: S.ahead })}</Note><Muted>{T('defer.rxHelp')}</Muted></>);
}
function adj(label: string, T: (k: string, v?: Record<string, string | number>) => string) {
  return label.startsWith('rule:') ? T('adj.' + label) : label.startsWith('insurance:') ? T('adj.insurance') : T('adj.waiver.' + label);
}
function Checkout() {
  const { state: S, actions, T } = useVisit(); const st = buildStatement(S);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [paymentId, setPaymentId] = useState<string | null>(null); const [provider, setProvider] = useState<string | null>(null);
  const refresh = useCallback(async () => { if (S.serverVisitId) actions.setServerVisit((await backend.visit(S.serverVisitId)).visit); }, [S.serverVisitId, actions]);
  const pay = async () => { if (!S.serverVisitId || busy) return; setBusy(true); setError(null); try {
    const intent = await backend.paymentIntent(S.serverVisitId, `mobile-${S.serverVisitId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`); setPaymentId(intent.paymentId); setProvider(intent.provider ?? 'daraja');
    if (intent.provider === 'mock') { await backend.mockCompletePayment(intent.paymentId); await refresh(); setPaymentId(null); }
  } catch (e) { setError(e instanceof Error ? e.message : 'Could not start M-Pesa payment.'); } finally { setBusy(false); } };
  useEffect(() => { if (!paymentId || provider === 'mock') return; let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { try { const result = await backend.payment(paymentId); if (['succeeded','failed','cancelled'].includes(result.payment.status)) { if (!stopped) { setPaymentId(null); await refresh(); } return; } }
      catch (e) { if (!stopped) setError(e instanceof Error ? e.message : 'Could not check payment.'); }
      if (!stopped) timer = setTimeout(() => void poll(), 4000); };
    timer = setTimeout(() => void poll(), 3000); return () => { stopped = true; clearTimeout(timer); };
  }, [paymentId, provider, refresh]);
  const finishFree = async () => { if (!S.serverVisitId || busy) return; setBusy(true); setError(null); try { await backend.completeFreeVisit(S.serverVisitId); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not finish this visit.'); } finally { setBusy(false); } };
  return (<><Head id="checkout" title={T('pay.title')} sub={T('pay.sub')} />
    {st.lines.map(l => (<View key={l.key}><View style={[s.rowBetween, { paddingVertical: 8 }]}><Text style={{ color: t.ink, flex: 1 }}>{l.description.startsWith('line.') ? T(l.description) : l.description}</Text><Text style={{ fontWeight: '800', color: t.ink }}>{money(l.gross)}</Text></View>
      {l.adjustments.map(a => <View key={a.label} style={[s.rowBetween, { paddingLeft: 14, paddingBottom: 6 }]}><Text style={{ color: t.successText, fontSize: 13, flex: 1 }}>{adj(a.label, T)}</Text><Text style={{ color: t.successText, fontSize: 13, fontWeight: '700' }}>{money(a.amount)}</Text></View>)}</View>))}
    {st.waivers.map((w, i) => <View key={i} style={[s.rowBetween, { paddingLeft: 14 }]}><Text style={{ color: t.successText, fontSize: 13, flex: 1 }}>{adj(w.label, T)}</Text><Text style={{ color: t.successText, fontWeight: '700' }}>{money(w.amount)}</Text></View>)}
    <View style={[s.rowBetween, { paddingTop: 12, marginTop: 6, borderTopWidth: 2, borderTopColor: t.ink }]}><Text style={s.h2}>{T('pay.total')}</Text><Text style={s.h2}>{money(st.total)}</Text></View>
    <Text style={[s.muted, { marginTop: 6 }]}>{T('pay.version', { v: st.version })}</Text>
    {error ? <Note tone="danger">{error}</Note> : null}
    {st.total === 0 && <><Note tone="ok">{T('pay.nothing')}</Note><Btn label={busy ? 'Finishing…' : T('pay.finish')} disabled={busy || !S.serverVisitId} onPress={() => void finishFree()} /></>}
    {st.total > 0 && S.payment === 'unpaid' && <><Btn label={busy ? 'Connecting to M-Pesa…' : T('pay.mpesa', { amt: money(st.total) })} disabled={busy || !S.serverVisitId} onPress={() => void pay()} /><Muted>Payment is confirmed by the backend after the M-Pesa callback.</Muted></>}
    {paymentId ? <Note tone="warn">Payment pending. Approve the M-Pesa prompt. MediFlow is checking the payment status.</Note> : null}
    {S.payment === 'paid' && <Note tone="ok">Payment confirmed by the backend.</Note>}</>);
}
function Done() {
  const { state: S, actions, T } = useVisit(); const total = buildStatement(S).total;
  return (<><Eyebrow>{T('done.eyebrow')}</Eyebrow><H1>{T('done.title')}</H1><Muted>{T('done.text', { amt: money(total), name: S.patient.name.split(' ')[0] })}</Muted>
    {S.deferred.length > 0 && <Note><Text style={{ fontWeight: '800' }}>{T('done.later')}{'\n'}</Text>{S.deferred.map(d => (d === 'laboratory' ? T('done.labLater') : T('done.rxLater'))).join('\n')}</Note>}
    <Eyebrow>{T('fb.title')}</Eyebrow>
    <View style={{ flexDirection: 'row' }}>{[1, 2, 3, 4, 5].map(n => <Pressable key={n} accessibilityRole="radio" accessibilityLabel={`${n}`} accessibilityState={{ checked: S.feedback === n }} onPress={() => actions.setFeedback(n)} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 32, color: (S.feedback ?? 0) >= n ? '#e0a100' : '#b9c6c9' }}>★</Text></Pressable>)}</View>
    {S.feedback !== null && <Muted>{T('fb.thanks')}</Muted>}<Btn kind="ghost" label={T('done.new')} onPress={actions.newVisit} /></>);
}
