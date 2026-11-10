import { config, useVisit } from '@mediflow/shared';
import { Btn, EmptyState, Note, PageHeader, StatusBadge } from './ui';

export function ResultsPage({ onJourney }: { onJourney: () => void }) {
  const { state: s, T } = useVisit();
  const reports = s.labs;
  return <div className="page patient-subpage">
    <PageHeader title={T('nav.results')} description={T('results.subtitle')} action={<Btn className="inline" onClick={onJourney}>{T('dash.openJourney')}</Btn>} />
    {reports.length === 0 ? <section className="card patient-empty-card"><EmptyState title={T('dash.noResults')} description={T('results.empty')} action={<Btn className="inline" onClick={onJourney}>{T('dash.openJourney')}</Btn>} /></section> :
      <section className="patient-list-card card">
        <div className="overview-section-heading"><div><p className="eyebrow">{T('results.currentVisit')}</p><h2>{T('results.title')}</h2></div><span className="muted">{reports.length} {T('results.tests')}</span></div>
        {reports.map(lab => {
          const ready = !!lab.report.trim();
          return <article className="patient-list-row" key={lab.test.id}>
            <span className={`patient-list-icon ${ready ? 'ready' : 'pending'}`} aria-hidden="true">{ready ? '✓' : '◷'}</span>
            <div className="patient-list-copy"><b>{lab.test.name}</b><small>{ready ? T('results.reportAvailable') : lab.minutesLeft > 0 ? T('dash.expectedMinutes', { minutes: lab.minutesLeft }) : T('dash.awaitingReport')}</small>
              {ready && <p className="patient-report-text">{lab.report}</p>}
            </div>
            <StatusBadge label={ready ? T('dash.ready') : T('dash.processing')} tone={ready ? 'ok' : 'warn'} />
          </article>;
        })}
        {reports.some(lab => lab.report.trim()) && <Note tone="info">{T('results.reviewNote')}</Note>}
      </section>}
  </div>;
}

export function PrescriptionsPage({ onJourney }: { onJourney: () => void }) {
  const { state: s, T } = useVisit();
  const prescriptions = s.prescriptions.length
    ? s.prescriptions
    : s.orders.drugIds.map(id => config.drugs.find(drug => drug.id === id)).filter((drug): drug is NonNullable<typeof drug> => !!drug);
  return <div className="page patient-subpage">
    <PageHeader title={T('nav.prescriptions')} description={T('prescriptions.subtitle')} action={<Btn className="inline" onClick={onJourney}>{T('dash.openJourney')}</Btn>} />
    {prescriptions.length === 0 ? <section className="card patient-empty-card"><EmptyState title={T('dash.noPrescriptions')} description={T('prescriptions.empty')} action={<Btn className="inline" onClick={onJourney}>{T('dash.openJourney')}</Btn>} /></section> :
      <section className="patient-list-card card">
        <div className="overview-section-heading"><div><p className="eyebrow">{T('prescriptions.currentVisit')}</p><h2>{T('prescriptions.title')}</h2></div><StatusBadge label={s.orders.drugStatus === 'proposed' ? T('prescriptions.awaitingReview') : T('prescriptions.current')} tone={s.orders.drugStatus === 'proposed' ? 'warn' : 'ok'} /></div>
        {prescriptions.map(drug => <article className="patient-list-row" key={drug.id}>
          <span className="patient-list-icon medication" aria-hidden="true">✚</span>
          <div className="patient-list-copy"><b>{drug.name}</b><small>{drug.directions}</small></div>
          <StatusBadge label={drug.inStock ? T('prescriptions.available') : T('prescriptions.checkStock')} tone={drug.inStock ? 'ok' : 'warn'} />
        </article>)}
        {s.orders.drugStatus === 'proposed' && <Note tone="warn">{T('prescriptions.proposedNote')}</Note>}
      </section>}
  </div>;
}

export function PrivacyPage({ onProfile }: { onProfile: () => void }) {
  const { T } = useVisit();
  return <div className="page patient-subpage">
    <PageHeader title={T('nav.privacy')} description={T('privacy.subtitle')} />
    <section className="card privacy-card">
      <div className="privacy-status"><span className="privacy-status-icon" aria-hidden="true">✓</span><div><p className="eyebrow">{T('privacy.statusLabel')}</p><h2>{T('privacy.statusTitle')}</h2></div></div>
      <p>{T('privacy.localDescription')}</p>
      <div className="privacy-detail"><b>{T('privacy.accountTitle')}</b><span>{T('privacy.accountDescription')}</span></div>
      <div className="privacy-detail"><b>{T('privacy.notificationsTitle')}</b><span>{T('privacy.notificationsDescription')}</span></div>
      <div className="privacy-detail"><b>{T('privacy.permissionsTitle')}</b><span>{T('privacy.permissionsDescription')}</span></div>
      <Btn kind="ghost" className="inline" onClick={onProfile}>{T('privacy.profileAction')}</Btn>
    </section>
  </div>;
}
