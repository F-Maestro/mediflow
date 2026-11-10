import { config, currentStage, isClosed, useVisit, waitFor, waitRange } from '@mediflow/shared';
import { Btn, EmptyState, Note, StatusBadge } from './ui';
import { HealthTrends } from './HealthTrends';

type OverviewActions = {
  onSymptoms: () => void;
  onAppointments: () => void;
  onJourney: () => void;
  onResults: () => void;
  onPrescriptions: () => void;
  onRecords: () => void;
};

export function PatientOverview({ onSymptoms, onAppointments, onJourney, onResults, onPrescriptions, onRecords }: OverviewActions) {
  const { state: s, T } = useVisit();
  const stage = currentStage(s);
  const active = !!s.routeId && !isClosed(s);
  const upcoming = s.appointments.filter(a => a.status === 'booked');
  const pendingLabs = s.labs.filter(lab => !lab.report.trim());
  const readyLabs = s.labs.filter(lab => !!lab.report.trim());
  const medicationNames = s.prescriptions.length
    ? s.prescriptions.map(med => med.name)
    : s.orders.drugIds.map(id => config.drugs.find(med => med.id === id)?.name).filter((name): name is string => !!name);
  const firstName = s.patient.name.trim().split(/\s+/)[0] || s.patient.name;
  const wait = stage && active ? waitFor(s) : 0;
  const downloadRecords = () => {
    const rows = [
      ['Record', 'Date', 'Details', 'Status'],
      ['Patient profile', '', `${s.patient.name} · ${s.patient.hospitalNo}`, 'Demo record'],
      ...s.history.map(visit => ['Visit', visit.dateLabel, `${visit.summary} · ${visit.total} KES`, 'Complete']),
      ...s.labs.map(lab => ['Test result', '', lab.test.name + (lab.report ? ` · ${lab.report}` : ''), lab.report ? 'Report ready' : 'Processing']),
      ...s.prescriptions.map(med => ['Prescription', '', `${med.name} · ${med.directions}`, 'Current']),
    ];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `mediflow-records-${s.patient.hospitalNo}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div className="patient-overview">
    <section className="overview-welcome">
      <div><p className="eyebrow">{T('dash.welcome')}</p><h1>{T('dash.greeting', { name: firstName })}</h1><p>{T('dash.subtitle')}</p></div>
      <div className="overview-primary-actions">
        <Btn className="inline" onClick={onSymptoms}><span aria-hidden="true">＋ </span>{T('dash.checkSymptoms')}</Btn>
        <Btn kind="ghost" className="inline" onClick={onAppointments}>{T('dash.bookAppointment')}</Btn>
      </div>
    </section>

    <div className="overview-columns">
      <div className="overview-column overview-column-main">
        <section className={`card overview-journey-card ${active ? 'is-active' : ''}`}>
          <div className="overview-section-heading"><div><p className="eyebrow">{T('dash.currentCare')}</p><h2>{active ? T('dash.journeyInProgress') : T('dash.readyToStart')}</h2></div><StatusBadge label={active ? T('visit.inProgress') : T('dash.noActiveVisit')} tone={active ? 'info' : 'warn'} /></div>
          {active ? <>
            <div className="overview-stage"><span className="overview-stage-icon" aria-hidden="true">⌁</span><div><small>{T('visit.currentStage')}</small><b>{T('stage.' + (stage ?? 'route'))}</b><span>{s.routeId ? T('route.' + s.routeId + '.title') : ''}</span></div></div>
            <div className="overview-queue-row"><span>{T('dash.queue')} <b>{Math.max(0, s.ahead)} {T('dash.patientsAhead')}</b></span><span>{T('dash.estimatedWait')} <b>{wait ? `${waitRange(wait)} ${T('min')}` : T('dash.upNext')}</b></span></div>
            <Btn className="inline" onClick={onJourney}>{T('dash.openJourney')} <span aria-hidden="true"> →</span></Btn>
          </> : <>
            <p className="muted">{T('dash.noVisitDescription')}</p>
            <Btn className="inline" onClick={onSymptoms}>{T('dash.startCheckIn')}</Btn>
          </>}
        </section>

        <section className="card overview-health-card">
          <div className="overview-section-heading"><div><p className="eyebrow">{T('dash.health')}</p><h2>{T('dash.healthOverview')}</h2></div><button className="patient-text-action" onClick={onRecords}>{T('dash.viewRecords')} <span aria-hidden="true">›</span></button></div>
          <p className="overview-supporting-text">{T('dash.savedSnapshot')}</p>
          <div className="health-metric-grid">
            <div className="health-metric"><span className="metric-icon bp" aria-hidden="true">♡</span><small>{T('dash.bloodPressure')}</small><b>{s.patient.lastBp}</b><span>{T('dash.lastRecorded')}</span></div>
            <div className="health-metric"><span className="metric-icon blood" aria-hidden="true">◉</span><small>{T('dash.bloodGroup')}</small><b>{s.patient.bloodGroup}</b><span>{T('dash.patientRecord')}</span></div>
            <div className="health-metric"><span className="metric-icon allergy" aria-hidden="true">!</span><small>{T('dash.allergies')}</small><b>{s.patient.allergy || T('dash.noneRecorded')}</b><span>{T('dash.patientRecord')}</span></div>
          </div>
        </section>
        <HealthTrends />

        <section className="card overview-appointments-card">
          <div className="overview-section-heading"><div><p className="eyebrow">{T('tab.appts')}</p><h2>{T('dash.scheduledCare')}</h2></div><button className="patient-text-action" onClick={onAppointments}>{T('dash.viewAll')} <span aria-hidden="true">›</span></button></div>
          {upcoming.length === 0 ? <EmptyState title={T('dash.noAppointments')} description={T('dash.noAppointmentsDescription')} action={<Btn className="inline" onClick={onAppointments}>{T('dash.bookAppointment')}</Btn>} /> :
            upcoming.slice(0, 2).map(appointment => <article className="overview-appointment" key={appointment.id}>
              <div className="overview-date"><small>{appointment.day}</small><b>{appointment.time}</b></div>
              <div className="overview-appointment-copy"><b>{appointment.clinic}</b><span>{appointment.doctor}</span></div>
              <StatusBadge label={T('appt.confirmed')} tone="ok" />
            </article>)}
        </section>
      </div>

      <aside className="overview-column overview-column-side">
        <section className="card overview-quick-card">
          <div className="overview-section-heading"><div><p className="eyebrow">{T('dash.shortcuts')}</p><h2>{T('dash.quickActions')}</h2></div></div>
          <div className="overview-quick-grid">
            <button onClick={onSymptoms}><span className="quick-action-icon blue" aria-hidden="true">＋</span><b>{T('dash.checkSymptoms')}</b><small>{T('dash.symptomsHelp')}</small></button>
            <button onClick={onAppointments}><span className="quick-action-icon green" aria-hidden="true">▣</span><b>{T('dash.bookAppointment')}</b><small>{T('dash.appointmentsHelp')}</small></button>
            <button onClick={downloadRecords}><span className="quick-action-icon violet" aria-hidden="true">▤</span><b>{T('dash.downloadRecords')}</b><small>{T('dash.recordsHelp')}</small></button>
            <a href={`https://wa.me/${config.hospital.whatsapp}`} target="_blank" rel="noreferrer"><span className="quick-action-icon teal" aria-hidden="true">↗</span><b>{T('dash.askCareTeam')}</b><small>{T('dash.contactHelp')}</small></a>
          </div>
        </section>

        <section className="card overview-results-card">
          <div className="overview-section-heading"><div><p className="eyebrow">{T('nav.results')}</p><h2>{T('dash.recentResults')}</h2></div><button className="patient-text-action" onClick={onResults}>{T('dash.viewAll')} <span aria-hidden="true">›</span></button></div>
          {s.labs.length === 0 ? <div className="overview-empty-row"><span className="result-icon" aria-hidden="true">⌕</span><div><b>{T('dash.noResults')}</b><small>{T('dash.resultsAppear')}</small></div></div> : <>
            {pendingLabs.slice(0, 2).map(lab => <div className="overview-result" key={lab.test.id}><span className="result-icon pending" aria-hidden="true">◷</span><div><b>{lab.test.name}</b><small>{lab.minutesLeft > 0 ? T('dash.expectedMinutes', { minutes: lab.minutesLeft }) : T('dash.awaitingReport')}</small></div><StatusBadge label={T('dash.processing')} tone="warn" /></div>)}
            {readyLabs.slice(0, 2).map(lab => <div className="overview-result" key={lab.test.id}><span className="result-icon ready" aria-hidden="true">✓</span><div><b>{lab.test.name}</b><small>{T('dash.reportReady')}</small></div><StatusBadge label={T('dash.ready')} tone="ok" /></div>)}
          </>}
        </section>

        <section className="card overview-medication-card">
          <div className="overview-section-heading"><div><p className="eyebrow">{T('nav.prescriptions')}</p><h2>{T('dash.currentMedication')}</h2></div><button className="patient-text-action" onClick={onPrescriptions}>{T('dash.viewAll')} <span aria-hidden="true">›</span></button></div>
          {medicationNames.length === 0 ? <div className="overview-empty-row"><span className="result-icon medication" aria-hidden="true">＋</span><div><b>{T('dash.noPrescriptions')}</b><small>{T('dash.prescriptionsAppear')}</small></div></div> : medicationNames.slice(0, 3).map(name => <div className="overview-medication" key={name}><span className="medication-icon" aria-hidden="true">✚</span><span><b>{name}</b><small>{T('dash.prescribedCare')}</small></span></div>)}
        </section>
        {s.notices.length > 0 && <Note tone="info">{T('dash.unreadUpdates', { count: s.notices.length })}</Note>}
      </aside>
    </div>
  </div>;
}
