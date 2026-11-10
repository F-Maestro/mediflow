import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { backend, config, currentStage, isClosed, useVisit, waitFor, waitRange } from '@mediflow/shared';
import { Btn, Card, Eyebrow, H1, Muted, Note, Pill, s, t } from './ui';

type OverviewActions = {
  onSymptoms: () => void;
  onAppointments: () => void;
  onJourney: () => void;
  onResults: () => void;
  onPrescriptions: () => void;
  onRecords: () => void;
};

export function PatientOverview({ onSymptoms, onAppointments, onJourney, onResults, onPrescriptions, onRecords }: OverviewActions) {
  const { state: S, T } = useVisit();
  const stage = currentStage(S);
  const active = !!S.routeId && !isClosed(S);
  const wait = active && stage ? waitFor(S) : 0;
  const nextAppointment = S.appointments.find(a => a.status === 'booked');
  const firstName = S.patient.name.trim().split(/\s+/)[0] || S.patient.name;
  const medications = S.prescriptions.length ? S.prescriptions : S.orders.drugIds.map(id => config.drugs.find(item => item.id === id)).filter(item => item !== undefined);
  const downloadSummary = () => {
    const lines = [
      'MediFlow visit summary',
      `Patient: ${S.patient.name} (${S.patient.hospitalNo})`,
      `Blood pressure: ${S.patient.lastBp}`,
      `Blood group: ${S.patient.bloodGroup}`,
      `Allergy: ${S.patient.allergy || 'None recorded'}`,
      ...S.history.map(visit => `${visit.dateLabel}: ${visit.summary} · ${visit.total} KES`),
      ...S.labs.map(lab => `Test: ${lab.test.name} — ${lab.report || 'Report pending'}`),
    ].join('\n');
    void Share.share({ title: T('dash.shareRecords'), message: lines });
  };

  return <ScrollView contentContainerStyle={p.page}>
    <View style={p.welcome}><Eyebrow>{T('dash.welcome')}</Eyebrow><H1>{T('dash.greeting', { name: firstName })}</H1><Muted>{T('dash.subtitle')}</Muted>
      <View style={p.primaryActions}><View style={p.action}><Btn label={T('dash.checkSymptoms')} onPress={onSymptoms} /></View><View style={p.action}><Btn kind="ghost" label={T('dash.bookAppointment')} onPress={onAppointments} /></View></View>
    </View>

    <Card>
      <View style={p.headingRow}><View style={{ flex: 1 }}><Eyebrow>{T('dash.currentCare')}</Eyebrow><Text style={s.h2}>{active ? T('dash.journeyInProgress') : T('dash.readyToStart')}</Text></View><Pill tone={active ? 'ok' : 'warn'} text={active ? T('visit.inProgress') : T('dash.noActiveVisit')} /></View>
      {active ? <>
        <View style={p.stageBlock}><Text style={p.stageIcon}>⌁</Text><View style={{ flex: 1 }}><Text style={p.caption}>{T('visit.currentStage')}</Text><Text style={p.stageName}>{T('stage.' + (stage ?? 'route'))}</Text><Text style={p.caption}>{S.routeId ? T('route.' + S.routeId + '.title') : ''}</Text></View></View>
        <View style={p.queueRow}><View><Text style={p.caption}>{T('dash.queue')}</Text><Text style={p.metric}>{Math.max(0, S.ahead)} {T('dash.patientsAhead')}</Text></View><View><Text style={p.caption}>{T('dash.estimatedWait')}</Text><Text style={p.metric}>{wait ? `${waitRange(wait)} ${T('min')}` : T('dash.upNext')}</Text></View></View>
        <Btn label={T('dash.openJourney')} kind="ghost" onPress={onJourney} />
      </> : <><Muted>{T('dash.noVisitDescription')}</Muted><Btn label={T('dash.startCheckIn')} onPress={onSymptoms} /></>}
    </Card>

    <Card><View style={p.headingRow}><View style={{ flex: 1 }}><Eyebrow>{T('dash.health')}</Eyebrow><Text style={s.h2}>{T('dash.healthOverview')}</Text></View><Text onPress={onRecords} accessibilityRole="button" style={p.link}>{T('dash.viewRecords')} ›</Text></View>
      <Muted>{T('dash.savedSnapshot')}</Muted>
      <View style={p.metricRow}>
        <Metric title={T('dash.bloodPressure')} value={S.patient.lastBp} />
        <Metric title={T('dash.bloodGroup')} value={S.patient.bloodGroup} />
      </View>
      <View style={{ marginTop: 10 }}><Metric title={T('dash.allergies')} value={S.patient.allergy || T('dash.noneRecorded')} /></View>
    </Card>

    <HealthTrends />

    <Card><View style={p.headingRow}><View style={{ flex: 1 }}><Eyebrow>{T('tab.appts')}</Eyebrow><Text style={s.h2}>{T('dash.scheduledCare')}</Text></View><Text onPress={onAppointments} accessibilityRole="button" style={p.link}>{T('dash.viewAll')} ›</Text></View>
      {nextAppointment ? <View style={p.appointmentRow}><View style={p.dateBox}><Text style={p.dateSmall}>{nextAppointment.day}</Text><Text style={p.dateTime}>{nextAppointment.time}</Text></View><View style={{ flex: 1 }}><Text style={p.appointmentTitle}>{nextAppointment.clinic}</Text><Text style={p.caption}>{nextAppointment.doctor}</Text></View><Pill text={T('appt.confirmed')} /></View> : <><Muted>{T('dash.noAppointmentsDescription')}</Muted><Btn kind="ghost" label={T('dash.bookAppointment')} onPress={onAppointments} /></>}
    </Card>

    <Card><View style={p.headingRow}><View style={{ flex: 1 }}><Eyebrow>{T('dash.shortcuts')}</Eyebrow><Text style={s.h2}>{T('dash.quickActions')}</Text></View></View>
      <ActionRow icon="＋" title={T('dash.checkSymptoms')} subtitle={T('dash.symptomsHelp')} onPress={onSymptoms} />
      <ActionRow icon="▣" title={T('dash.bookAppointment')} subtitle={T('dash.appointmentsHelp')} onPress={onAppointments} />
      <ActionRow icon="⇧" title={T('dash.shareRecords')} subtitle={T('dash.recordsHelp')} onPress={downloadSummary} />
      <ActionRow icon="↗" title={T('dash.askCareTeam')} subtitle={T('dash.contactHelp')} onPress={() => void Linking.openURL(`https://wa.me/${config.hospital.whatsapp}`)} />
    </Card>

    <Card><View style={p.headingRow}><View style={{ flex: 1 }}><Eyebrow>{T('nav.results')}</Eyebrow><Text style={s.h2}>{T('dash.recentResults')}</Text></View><Text onPress={onResults} accessibilityRole="button" style={p.link}>{T('dash.viewAll')} ›</Text></View>
      {S.labs.length ? S.labs.slice(0, 3).map(lab => <View style={p.listRow} key={lab.test.id}><Text style={p.resultIcon}>{lab.report ? '✓' : '◷'}</Text><View style={{ flex: 1 }}><Text style={p.appointmentTitle}>{lab.test.name}</Text><Text style={p.caption}>{lab.report ? T('dash.reportReady') : T('dash.expectedMinutes', { minutes: lab.minutesLeft })}</Text></View><Pill tone={lab.report ? 'ok' : 'warn'} text={lab.report ? T('dash.ready') : T('dash.processing')} /></View>) : <Muted>{T('dash.resultsAppear')}</Muted>}
      <Btn kind="ghost" label={T('nav.results')} onPress={onResults} />
    </Card>

    <Card><View style={p.headingRow}><View style={{ flex: 1 }}><Eyebrow>{T('nav.prescriptions')}</Eyebrow><Text style={s.h2}>{T('dash.currentMedication')}</Text></View><Text onPress={onPrescriptions} accessibilityRole="button" style={p.link}>{T('dash.viewAll')} ›</Text></View>
      {medications.length ? medications.slice(0, 3).map(med => <View style={p.listRow} key={med.id}><Text style={p.medIcon}>✚</Text><View style={{ flex: 1 }}><Text style={p.appointmentTitle}>{med.name}</Text><Text style={p.caption}>{med.directions}</Text></View></View>) : <Muted>{T('dash.prescriptionsAppear')}</Muted>}
      <Btn kind="ghost" label={T('nav.prescriptions')} onPress={onPrescriptions} />
    </Card>
  </ScrollView>;
}

type HealthMetric = 'bloodPressure' | 'heartRate' | 'weight' | 'temperature';
const healthMetricNames: Record<HealthMetric, string> = { bloodPressure: 'Blood pressure', heartRate: 'Heart rate', weight: 'Weight', temperature: 'Temperature' };
const healthTrendCutoff = Date.now() - 183 * 86400000;
function HealthTrends() {
  const { state: S, T } = useVisit();
  const [metric, setMetric] = useState<HealthMetric>('bloodPressure');
  const readings = (S.vitalReadings ?? []).filter(item => Date.parse(item.recordedAt) >= healthTrendCutoff).sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  const raw = metric === 'bloodPressure'
    ? [{ label: 'Systolic', color: '#102b2d', values: readings.map(r => r.bloodPressureSystolic) }, { label: 'Diastolic', color: '#12a99e', values: readings.map(r => r.bloodPressureDiastolic) }]
    : [{ label: healthMetricNames[metric], color: '#12a99e', values: readings.map(r => metric === 'heartRate' ? r.heartRate : metric === 'weight' ? r.weightKg : r.temperatureC) }];
  const values = raw.flatMap(item => item.values.filter((n): n is number => n !== null));
  const min = values.length ? Math.min(...values) : 0; const max = values.length ? Math.max(...values) : 1; const range = Math.max(max - min, max * .08, 1);
  const count = readings.length; const latest = readings[count - 1];
  const unit = metric === 'heartRate' ? 'bpm' : metric === 'weight' ? 'kg' : metric === 'temperature' ? '°C' : 'mmHg';
  return <Card><View style={p.headingRow}><View style={{ flex: 1 }}><Eyebrow>{T('dash.health')}</Eyebrow><Text style={s.h2}>{T('dash.healthTrends')}</Text></View></View>
    <Text style={p.caption}>{T('dash.lastRecordedVisits')}</Text>
    <View style={p.trendMetrics}>{(Object.keys(healthMetricNames) as HealthMetric[]).map(key => <Pressable key={key} onPress={() => setMetric(key)} accessibilityRole="button" accessibilityState={{ selected: metric === key }} style={[p.trendMetric, metric === key && p.trendMetricSelected]}><Text style={[p.trendMetricText, metric === key && p.trendMetricTextSelected]}>{healthMetricNames[key]}</Text></Pressable>)}</View>
    {!values.length ? <Text style={p.trendEmpty}>{T('dash.noTrendReadings')}</Text> : <>
      <View style={p.chart}>
        {[0, 1, 2, 3].map(index => <View key={index} style={[p.chartGrid, { top: `${index * 29}%` }]} />)}
        {raw.map((item, si) => {
          const pts = item.values.map((value, index) => value == null ? null : ({ x: count < 2 ? 50 : 7 + index * (86 / (count - 1)), y: 88 - ((value - (min - range * .15)) / (range * 1.3)) * 76 })).filter((point): point is { x: number; y: number } => point !== null);
          return <View key={si} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
            {pts.slice(1).map((point, index) => { const prev = pts[index]; const dx = point.x - prev.x; const dy = point.y - prev.y; const length = Math.sqrt(dx * dx + dy * dy); const angle = Math.atan2(dy, dx) * 180 / Math.PI; return <View key={`line-${index}`} style={[p.chartLine, { left: `${prev.x}%`, top: `${prev.y}%`, width: `${length}%`, backgroundColor: item.color, transform: [{ rotate: `${angle}deg` }] }]} />; })}
            {pts.map((point, index) => <View key={`dot-${index}`} style={[p.chartDot, { left: `${point.x}%`, top: `${point.y}%`, borderColor: item.color }]} />)}
          </View>;
        })}
      </View>
      <View style={p.chartDates}>{readings.filter((_, i) => count <= 6 || i === 0 || i === count - 1 || i % Math.ceil(count / 5) === 0).map(item => <Text key={item.id} style={p.caption}>{new Date(item.recordedAt).toLocaleDateString(undefined, { month: 'short' })}</Text>)}</View>
      <View style={p.trendLegend}>{raw.map((item, index) => { const value = metric === 'bloodPressure' ? (index === 0 ? latest?.bloodPressureSystolic : latest?.bloodPressureDiastolic) : (metric === 'heartRate' ? latest?.heartRate : metric === 'weight' ? latest?.weightKg : latest?.temperatureC); return <View key={item.label} style={p.legendItem}><View style={[p.legendDot, { backgroundColor: item.color }]} /><Text style={p.caption}>{item.label} · {value ?? '—'} {unit}</Text></View>; })}</View>
      <Text style={p.trendEmptyCompact}>{T('dash.trendCareNote')}</Text>
      {count < 2 && <Text style={p.trendEmpty}>{T('dash.needMoreReadings')}</Text>}
    </>}
  </Card>;
}

export function MorePage({ onResults, onPrescriptions, onRecords, onPrivacy }: { onResults: () => void; onPrescriptions: () => void; onRecords: () => void; onPrivacy: () => void }) {
  const { T } = useVisit();
  return <ScrollView contentContainerStyle={p.page}><Eyebrow>{T('nav.account')}</Eyebrow><H1>{T('nav.more')}</H1><Muted>{T('dash.quickActions')}</Muted>
    <Card><MenuLink title={T('nav.results')} sub={T('results.subtitle')} onPress={onResults} /><MenuLink title={T('nav.prescriptions')} sub={T('prescriptions.subtitle')} onPress={onPrescriptions} /><MenuLink title={T('nav.records')} sub={T('rec.historySub')} onPress={onRecords} /><MenuLink title={T('nav.privacy')} sub={T('privacy.subtitle')} onPress={onPrivacy} /></Card>
    <Card><SupportPanel /></Card>
  </ScrollView>;
}

function SupportPanel() {
  const [draft, setDraft] = useState(''); const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ id: string; direction: string; message: string; createdAt: string }[]>([]);
  const refresh = useCallback(async () => { try { const data = await backend.supportMessages(); setMessages(data.messages.map(item => ({ id: String(item.id), direction: String(item.direction), message: String(item.message), createdAt: String(item.createdAt) }))); } catch { /* Continue to allow retry when the API reconnects. */ } }, []);
  useEffect(() => { const first = setTimeout(() => void refresh(), 0); const timer = setInterval(() => void refresh(), 10000); return () => { clearTimeout(first); clearInterval(timer); }; }, [refresh]);
  const send = async () => { if (!draft.trim() || busy) return; setBusy(true); setError(null); try { await backend.sendSupportMessage(draft.trim(), consent); setDraft(''); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not send your message.'); } finally { setBusy(false); } };
  return <><Eyebrow>Care team support</Eyebrow><Text style={s.h2}>Message the care team</Text>{messages.map(item => <Text key={item.id} style={[s.muted, { paddingVertical: 5 }]}>{item.direction === 'inbound' ? 'Care team' : 'You'} · {new Date(item.createdAt).toLocaleString()}{'\n'}{item.message}</Text>)}
    <TextInput accessibilityLabel="Message the care team" multiline maxLength={4000} value={draft} onChangeText={setDraft} placeholder="Type a message" style={[s.input, { minHeight: 76, textAlignVertical: 'top', paddingTop: 10 }]} />
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent }} onPress={() => setConsent(value => !value)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 }}><Text style={{ color: t.primaryDark, fontWeight: '800' }}>{consent ? '☑' : '□'}</Text><Text style={s.muted}>Allow WhatsApp delivery for this message</Text></Pressable>
    {error ? <Note tone="danger">{error}</Note> : null}<Btn disabled={busy || !draft.trim()} label={busy ? 'Sending…' : 'Send message'} onPress={() => void send()} />
  </>;
}

export function ResultsPage({ onJourney }: { onJourney: () => void }) {
  const { state: S, T } = useVisit();
  return <ScrollView contentContainerStyle={p.page}><H1>{T('nav.results')}</H1><Muted>{T('results.subtitle')}</Muted>
    {S.labs.length === 0 ? <Card><Muted>{T('results.empty')}</Muted><Btn label={T('dash.openJourney')} onPress={onJourney} /></Card> : <Card><Eyebrow>{T('results.currentVisit')}</Eyebrow>
      {S.labs.map(lab => <View style={p.listRow} key={lab.test.id}><Text style={p.resultIcon}>{lab.report ? '✓' : '◷'}</Text><View style={{ flex: 1 }}><Text style={p.appointmentTitle}>{lab.test.name}</Text><Text style={p.caption}>{lab.report ? T('results.reportAvailable') : T('dash.expectedMinutes', { minutes: lab.minutesLeft })}</Text>{lab.report ? <Text style={p.report}>{lab.report}</Text> : null}</View><Pill tone={lab.report ? 'ok' : 'warn'} text={lab.report ? T('dash.ready') : T('dash.processing')} /></View>)}
      <Note tone="info">{T('results.reviewNote')}</Note><Btn kind="ghost" label={T('dash.openJourney')} onPress={onJourney} /></Card>}
  </ScrollView>;
}

export function PrescriptionsPage({ onJourney }: { onJourney: () => void }) {
  const { state: S, T } = useVisit();
  const medicines = S.prescriptions.length ? S.prescriptions : S.orders.drugIds.map(id => config.drugs.find(item => item.id === id)).filter(item => item !== undefined);
  return <ScrollView contentContainerStyle={p.page}><H1>{T('nav.prescriptions')}</H1><Muted>{T('prescriptions.subtitle')}</Muted>
    {medicines.length === 0 ? <Card><Muted>{T('prescriptions.empty')}</Muted><Btn label={T('dash.openJourney')} onPress={onJourney} /></Card> : <Card><Eyebrow>{T('prescriptions.currentVisit')}</Eyebrow>
      {medicines.map(med => <View style={p.listRow} key={med.id}><Text style={p.medIcon}>✚</Text><View style={{ flex: 1 }}><Text style={p.appointmentTitle}>{med.name}</Text><Text style={p.caption}>{med.directions}</Text></View><Pill tone={med.inStock ? 'ok' : 'warn'} text={T(med.inStock ? 'prescriptions.available' : 'prescriptions.checkStock')} /></View>)}
      <Btn kind="ghost" label={T('dash.openJourney')} onPress={onJourney} /></Card>}
  </ScrollView>;
}

export function PrivacyPage({ onRecords }: { onRecords: () => void }) {
  const { T } = useVisit();
  return <ScrollView contentContainerStyle={p.page}><H1>{T('nav.privacy')}</H1><Muted>{T('privacy.subtitle')}</Muted><Card>
    <Pill text={T('privacy.statusLabel')} /><Text style={[s.h2, { marginTop: 12 }]}>{T('privacy.statusTitle')}</Text><Muted>{T('privacy.localDescription')}</Muted>
    <Text style={p.sectionLabel}>{T('privacy.accountTitle')}</Text><Muted>{T('privacy.accountDescription')}</Muted><Text style={p.sectionLabel}>{T('privacy.notificationsTitle')}</Text><Muted>{T('privacy.notificationsDescription')}</Muted><Text style={p.sectionLabel}>{T('privacy.permissionsTitle')}</Text><Muted>{T('privacy.permissionsDescription')}</Muted><Btn kind="ghost" label={T('privacy.profileAction')} onPress={onRecords} />
  </Card></ScrollView>;
}

function Metric({ title, value }: { title: string; value: string }) {
  return <View style={p.metricBox}><Text style={p.caption}>{title}</Text><Text style={p.metric}>{value}</Text></View>;
}
function ActionRow({ icon, title, subtitle, onPress }: { icon: string; title: string; subtitle: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={p.actionRow}><Text style={p.actionIcon}>{icon}</Text><View style={{ flex: 1 }}><Text style={p.appointmentTitle}>{title}</Text><Text style={p.caption}>{subtitle}</Text></View><Text style={p.chevron}>›</Text></Pressable>;
}
function MenuLink({ title, sub, onPress }: { title: string; sub: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={p.menuLink}><View style={{ flex: 1 }}><Text style={p.appointmentTitle}>{title}</Text><Text style={p.caption}>{sub}</Text></View><Text style={p.chevron}>›</Text></Pressable>;
}

function makePortalStyles() {
  return {
  page: { padding: 16, paddingBottom: 26 },
  welcome: { paddingTop: 6, paddingBottom: 4 },
  primaryActions: { flexDirection: 'row' as const, gap: 8, alignItems: 'stretch' as const },
  action: { flex: 1 },
  headingRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8, marginBottom: 12 },
  stageBlock: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, backgroundColor: t.primarySoft, padding: 13, borderRadius: 13, marginTop: 14 },
  stageIcon: { width: 42, height: 42, overflow: 'hidden' as const, borderRadius: 14, textAlign: 'center' as const, textAlignVertical: 'center' as const, paddingTop: 7, backgroundColor: t.card, color: t.primaryDark, fontSize: 24 },
  stageName: { color: t.ink, fontWeight: '800' as const, fontSize: 15, marginVertical: 2 },
  caption: { color: t.inkSoft, fontSize: 11, lineHeight: 16 },
  queueRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, gap: 12, marginTop: 12 },
  metric: { color: t.ink, fontSize: 13, fontWeight: '800' as const, marginTop: 3 },
  metricRow: { flexDirection: 'row' as const, gap: 8 },
  metricBox: { flex: 1, padding: 11, borderRadius: 11, borderWidth: 1, borderColor: t.line, backgroundColor: t.bg },
  link: { color: t.primaryDark, fontWeight: '700' as const, fontSize: 11 },
  appointmentRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: t.line },
  dateBox: { width: 66, minHeight: 51, justifyContent: 'center' as const, alignItems: 'center' as const, borderRadius: 10, backgroundColor: t.primarySoft },
  dateSmall: { color: t.primaryDark, fontSize: 9, textTransform: 'uppercase' as const }, dateTime: { color: t.ink, fontSize: 10, fontWeight: '800' as const, marginTop: 3 },
  appointmentTitle: { color: t.ink, fontSize: 12, fontWeight: '700' as const },
  actionIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: t.primarySoft, color: t.primaryDark, textAlign: 'center' as const, textAlignVertical: 'center' as const, paddingTop: 7, fontSize: 16 },
  actionRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 11, minHeight: 58, borderTopWidth: 1, borderTopColor: t.line },
  chevron: { color: t.primaryDark, fontSize: 23, fontWeight: '500' as const, paddingHorizontal: 4 },
  listRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: t.line },
  resultIcon: { width: 34, height: 34, overflow: 'hidden' as const, textAlign: 'center' as const, textAlignVertical: 'center' as const, paddingTop: 7, borderRadius: 11, backgroundColor: t.warnSoft, color: t.warnText, fontSize: 16 },
  medIcon: { width: 34, height: 34, overflow: 'hidden' as const, textAlign: 'center' as const, textAlignVertical: 'center' as const, paddingTop: 7, borderRadius: 11, backgroundColor: t.primarySoft, color: t.primaryDark, fontSize: 15 },
  report: { color: t.ink, fontSize: 12, marginTop: 8, lineHeight: 18 },
  sectionLabel: { color: t.ink, fontWeight: '800' as const, fontSize: 13, marginTop: 10 },
  menuLink: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.line },
  trendMetrics: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginTop: 10, marginBottom: 4 },
  trendMetric: { borderWidth: 1, borderColor: t.line, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 7 },
  trendMetricSelected: { backgroundColor: t.primarySoft, borderColor: t.primaryDark },
  trendMetricText: { color: t.inkSoft, fontSize: 10, fontWeight: '600' as const }, trendMetricTextSelected: { color: t.primaryDark, fontWeight: '800' as const },
  trendEmpty: { color: t.inkSoft, fontSize: 12, lineHeight: 18, paddingVertical: 18 },
  trendEmptyCompact: { color: t.inkSoft, fontSize: 10, lineHeight: 15, paddingTop: 10 },
  chart: { height: 150, marginTop: 12, marginHorizontal: 2, position: 'relative' as const, overflow: 'hidden' as const },
  chartGrid: { position: 'absolute' as const, left: 0, right: 0, height: 1, backgroundColor: t.line, opacity: .65 },
  chartLine: { position: 'absolute' as const, height: 2, marginTop: -1, marginLeft: 0, transformOrigin: 'left center' as never },
  chartDot: { position: 'absolute' as const, width: 9, height: 9, borderRadius: 5, borderWidth: 2, backgroundColor: t.card, marginLeft: -4, marginTop: -4 },
  chartDates: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, paddingHorizontal: 2, marginTop: 5 },
  trendLegend: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12, paddingTop: 12, marginTop: 10, borderTopWidth: 1, borderTopColor: t.line },
  legendItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 }, legendDot: { width: 8, height: 8, borderRadius: 4 },
  };
}
const p = new Proxy({} as ReturnType<typeof makePortalStyles>, {
  get: (_target, property: string | symbol) => typeof property === 'string' ? makePortalStyles()[property as keyof ReturnType<typeof makePortalStyles>] : undefined,
});
