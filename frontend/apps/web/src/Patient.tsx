import { useEffect, useState } from 'react';
import { useVisit, isClosed, backend, actions } from '@mediflow/shared';
import { Brand, Help, LangToggle, ThemeToggle, useTheme } from './ui';
import { Today } from './Today';
import { Appointments, Records, Profile } from './Tabs';
import { PatientOverview } from './PatientOverview';
import { PrivacyPage, PrescriptionsPage, ResultsPage } from './PatientPages';

type Tab = 'overview' | 'journey' | 'appts' | 'results' | 'prescriptions' | 'records' | 'privacy';
type NavItem = { id: Tab; label: string; icon: string };

export function PatientApp({ onExit }: { onExit: () => void }) {
  const { state: s, actions, T } = useVisit();
  const { theme, toggleTheme } = useTheme();
  const [tab, setTab] = useState<Tab>('overview');
  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const [appointments, visits, trends, catalog, requests] = await Promise.all([backend.appointments(), backend.visits(), backend.trends(), backend.catalog(), backend.historyRequests()]);
        if (disposed) return;
        actions.setServerAppointments(appointments.appointments); actions.setServerHistory(visits.visits); actions.setServerTrends(trends.readings); actions.setServerCatalog(catalog.items); actions.setServerHistoryRequests(requests.requests);
        const active = visits.visits.find(visit => visit.status === 'active');
        if (active) actions.setServerVisit((await backend.visit(active.id)).visit);
        else if (s.serverVisitId) actions.setServerVisit(null);
      } catch (error) { console.error('Could not refresh patient data:', error); }
    };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 12000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, []);
  const primaryNav: NavItem[] = [
    { id: 'overview', label: T('nav.overview'), icon: '▦' },
    { id: 'journey', label: T('nav.journey'), icon: '⌁' },
    { id: 'appts', label: T('tab.appts'), icon: '▣' },
    { id: 'results', label: T('nav.results'), icon: '▤' },
    { id: 'prescriptions', label: T('nav.prescriptions'), icon: '＋' },
  ];
  const accountNav: NavItem[] = [
    { id: 'records', label: T('nav.records'), icon: '◉' },
    { id: 'privacy', label: T('nav.privacy'), icon: '◇' },
  ];
  const activeJourney = !!s.routeId && !isClosed(s);
  const checkSymptoms = () => {
    if (!activeJourney) actions.chooseRoute('walk-in');
    setTab('journey');
  };
  const navigate = (next: Tab) => setTab(next);

  return (
    <div className="shell patient-shell" data-theme={theme}>
      <aside className="patient-sidebar" aria-label={T('nav.main')}>
        <div className="patient-brand"><Brand /></div>
        <div className="patient-nav-group">
          <p className="patient-nav-label">{T('nav.general')}</p>
          <nav className="patient-nav" aria-label={T('nav.general')}>
            {primaryNav.map(item => <NavButton key={item.id} item={item} active={tab === item.id} onClick={() => navigate(item.id)} />)}
          </nav>
        </div>
        <div className="patient-nav-group patient-account-group">
          <p className="patient-nav-label">{T('nav.account')}</p>
          <nav className="patient-nav" aria-label={T('nav.account')}>
            {accountNav.map(item => <NavButton key={item.id} item={item} active={tab === item.id} onClick={() => navigate(item.id)} />)}
          </nav>
        </div>
        <div className="patient-sidebar-bottom">
          <div className="systems-online"><i aria-hidden="true" /><span><b>{T('nav.systemsOnline')}</b><small>{T('nav.updatesLive')}</small></span></div>
          <button className="patient-logout" onClick={onExit}><span aria-hidden="true">↪</span>{T('btn.logout')}</button>
        </div>
      </aside>

      <div className="patient-workspace">
        <header className="patient-header">
          <div className="patient-header-title"><b>{T('nav.workspace')}</b><span>{activeJourney ? T('visit.inProgress') : T('nav.patientPortal')}</span></div>
          <div className="patient-header-actions">
            <button className="patient-notification" aria-label={T('nav.notifications')} onClick={() => setTab('journey')}>
              ♧{s.notices.length > 0 && <span>{s.notices.length}</span>}
            </button>
            <Help />
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <LangToggle />
            <div className="patient-identity"><div className="avatar" aria-hidden="true">{s.patient.initials}</div><span><b>{s.patient.name}</b><small>{T('nav.patient')} · {s.patient.hospitalNo}</small></span></div>
          </div>
        </header>
        <main id="content" className="patient-content">
          {tab === 'overview' && <PatientOverview onSymptoms={checkSymptoms} onAppointments={() => navigate('appts')} onJourney={() => navigate('journey')} onResults={() => navigate('results')} onPrescriptions={() => navigate('prescriptions')} onRecords={() => navigate('records')} />}
          {tab === 'journey' && <Today goAppointments={() => navigate('appts')} />}
          {tab === 'appts' && <Appointments goToday={() => navigate('journey')} />}
          {tab === 'results' && <ResultsPage onJourney={() => navigate('journey')} />}
          {tab === 'prescriptions' && <PrescriptionsPage onJourney={() => navigate('journey')} />}
          {tab === 'records' && <div className="patient-page-stack"><Records /><Profile /></div>}
          {tab === 'privacy' && <PrivacyPage onProfile={() => navigate('records')} />}
        </main>
      </div>
    </div>
  );
}

function NavButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  return <button className={`patient-nav-item ${active ? 'on' : ''}`} aria-current={active ? 'page' : undefined} onClick={onClick}>
    <span className="patient-nav-icon" aria-hidden="true">{item.icon}</span>{item.label}
  </button>;
}
