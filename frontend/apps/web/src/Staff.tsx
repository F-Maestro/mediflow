import { useEffect, useMemo, useState } from 'react';
import { config, useVisit, staffRoles, staffQueue, waitRange, canAdvance, canUndo, currentStage, labMinutesLeft, ordersTotal, money, buildStatement } from '@mediflow/shared';
import { Brand, Btn, EmptyState, Note, PageHeader, Pill, StatusBadge, ThemeToggle, useTheme } from './ui';

const LABELS: Record<string, string> = { registrar: 'Registrar', nurse: 'Triage nurse', doctor: 'Doctor', lab: 'Lab technologist', pharmacist: 'Pharmacist', cashier: 'Cashier / admin' };
const DESCRIPTIONS: Record<string, string> = {
  registrar: 'Confirm patient details and prepare the visit record.', nurse: 'Review the patient, triage notes, and waiting order.', doctor: 'Recommend tests after consultation, then review lab reports before recommending medicines.',
  lab: 'Track ordered tests and release completed results.', pharmacist: 'Prepare prescribed medicines and update collection status.', cashier: 'Review the statement, record payment, and manage authorised waivers.',
};
type QueueFilter = 'all' | 'waiting' | 'active' | 'flagged';
const rowKey = (row: { name: string; detail: string }) => `${row.name}:${row.detail}`;

export default function StaffApp({ onExit }: { onExit: () => void }) {
  const { state: s, actions } = useVisit();
  const { theme, toggleTheme } = useTheme();
  const [roleId, setRoleId] = useState(staffRoles[0].id);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<QueueFilter>('all');
  const role = staffRoles.find(r => r.id === roleId)!;
  const activeStage = currentStage(s);
  const awaitingLabReport = s.orders.labIds.length > 0 && (s.labs.length !== s.orders.labIds.length || s.labs.some(order => !order.report.trim()));
  const deskStage = role.id === 'doctor' && activeStage === 'results-review' ? 'results-review' : role.id === 'lab' && activeStage === 'results-review' && awaitingLabReport ? 'laboratory' : role.stage;
  const q = staffQueue(deskStage, s);
  const here = activeStage === deskStage || (role.id === 'lab' && activeStage === 'results-review' && awaitingLabReport);
  const [labs, setLabs] = useState<string[]>(config.demoOrders.labIds);
  const [drugs, setDrugs] = useState<string[]>(config.demoOrders.drugIds);
  const [diagnosis, setDiagnosis] = useState(s.diagnosis);
  const [vitals, setVitals] = useState({ systolic: '', diastolic: '', heartRate: '', weightKg: '', temperatureC: '' });
  const [pct, setPct] = useState(20); const [reason, setReason] = useState(config.pricing.waiverReasons[0]);
  const tog = (arr: string[], id: string, set: (a: string[]) => void) => set(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);

  useEffect(() => setDiagnosis(s.diagnosis), [s.diagnosis]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey || target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'].includes(target.tagName)) return;
      if (e.key.toLowerCase() === 'n') actions.callNext();
      if (e.key === 'Enter' && here && canAdvance(s)) actions.advance();
      if (e.key.toLowerCase() === 'u' && canUndo()) actions.undo();
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [actions, here, s]);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return q.rows.filter(row => {
      const matchesQuery = !needle || `${row.name} ${row.detail}`.toLocaleLowerCase().includes(needle);
      const matchesFilter = filter === 'all' || (filter === 'waiting' && !row.isYou) || (filter === 'active' && row.isYou) || (filter === 'flagged' && /fast-track|red flag/i.test(row.detail));
      return matchesQuery && matchesFilter;
    });
  }, [filter, q.rows, query]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = visibleRows.find(row => rowKey(row) === selectedKey) ?? visibleRows.find(row => row.isYou) ?? visibleRows[0];

  const changeRole = (id: string) => { setRoleId(id); setQuery(''); setFilter('all'); setSelectedKey(null); };
  return (
    <div className="shell staff-shell" data-theme={theme}>
      <header className="topbar"><Brand /><div className="who"><span>{config.hospital.facility}</span><ThemeToggle theme={theme} onToggle={toggleTheme} /><button className="link" onClick={onExit}>Log out</button></div></header>
      <aside className="staff-nav">
        <p className="eyebrow">Care team workspace</p><p className="muted">Choose a desk</p>
        <div className="roles" role="tablist" aria-label="Staff desks">
          {staffRoles.map(r => <button key={r.id} role="tab" aria-selected={r.id === roleId} className={r.id === roleId ? 'on' : ''} onClick={() => changeRole(r.id)}>{LABELS[r.id]}</button>)}
        </div>
      </aside>
      <main className="staffwrap">
        <p className="eyebrow">Hospital workspace</p>
        <PageHeader title={`${LABELS[role.id]} desk`} description={DESCRIPTIONS[role.id]} />
        <p className="muted">Shortcuts: <kbd>N</kbd> call next · <kbd>Enter</kbd> complete · <kbd>U</kbd> undo.</p>
        <div className="grid2 staff-metrics">
          <div className="kv"><span>Queue at this stage</span><b>{q.load} waiting</b></div>
          <div className="kv"><span>Estimated wait for next arrival</span><b>{q.waitMinutes ? `${waitRange(q.waitMinutes)} min` : 'None'}</b></div>
        </div>

        <section className="card queue-panel" aria-label="Patient queue">
          <div className="queue-toolbar">
            <label className="queue-search-label" htmlFor="queue-search">Search this queue</label>
            <input id="queue-search" className="field" type="search" placeholder="Name or patient number" value={query} onChange={e => setQuery(e.target.value)} />
            <label className="queue-search-label" htmlFor="queue-filter">Filter</label>
            <select id="queue-filter" className="field" value={filter} onChange={e => setFilter(e.target.value as QueueFilter)}>
              <option value="all">All patients</option><option value="waiting">Waiting</option><option value="active">At this desk</option><option value="flagged">Flagged</option>
            </select>
          </div>
          {visibleRows.length === 0 ? <EmptyState title={q.rows.length === 0 ? 'No patients in this queue' : 'No patients match your search'} description={q.rows.length === 0 ? 'Patients will appear here when they reach this stage.' : 'Try a different name, number, or filter.'} /> : (
            <div className="queue-layout">
              <div className="queue-list" role="list" aria-label="Queue patients">
                {visibleRows.map(row => <button type="button" key={rowKey(row)} className={`qrow queue-select ${row.isYou ? 'you' : ''} ${selected && rowKey(selected) === rowKey(row) ? 'selected' : ''}`} onClick={() => setSelectedKey(rowKey(row))} aria-pressed={!!selected && rowKey(selected) === rowKey(row)}>
                  <span><b>{row.name}</b><br /><span className="muted" style={{ margin: 0 }}>{row.detail}{row.isYou && s.called ? ' · called' : ''}</span></span>
                  <StatusBadge label={row.isYou ? (s.called ? 'Called' : 'Current visit') : 'Waiting'} tone={row.isYou ? 'info' : 'warn'} />
                </button>)}
              </div>
              {selected && <aside className="selected-patient" aria-live="polite">
                <p className="eyebrow">Selected patient</p><h2>{selected.name}</h2><p className="muted">{selected.detail}</p>
                <StatusBadge label={selected.isYou ? (s.called ? 'Called to desk' : 'Current demo visit') : 'In queue'} tone={selected.isYou ? 'info' : 'warn'} />
                {selected.isYou && <div className="row2 selected-actions">
                  <Btn kind="ghost" className="inline" onClick={actions.callNext}>{s.ahead > 0 ? 'Call next' : s.called ? 'Called' : 'Call patient'}</Btn>
                  <Btn className="inline" disabled={!canAdvance(s)} onClick={actions.advance}>Complete stage</Btn>
                </div>}
              </aside>}
            </div>
          )}
        </section>
        {here && !canAdvance(s) && <p className="muted">{role.id === 'lab' && activeStage === 'results-review' ? 'Enter all remaining lab report values below.' : `Cannot complete yet${s.ahead > 0 ? `: ${s.ahead} patient(s) ahead` : activeStage === 'consultation' ? ': complete the diagnosis and test plan' : activeStage === 'test-review' ? ': the patient is reviewing requested tests' : activeStage === 'results-review' ? ': medicine recommendations are awaiting patient approval' : activeStage === 'laboratory' ? labMinutesLeft(s) > 0 ? ': tests still processing' : ': lab report values are still needed' : activeStage === 'checkout' ? ': payment not received' : ''}.`}</p>}
        {canUndo() && <Btn kind="ghost" className="inline" onClick={actions.undo}>Undo last completion</Btn>}

        {role.id === 'doctor' && selected?.isYou && (
          <div className="doctor-workspace">
          <DoctorWorkspace />
          <div className="card" style={{ marginTop: 0 }}>
            {activeStage === 'consultation' ? <>
              <p className="eyebrow">Complete diagnosis · consultation</p><p className="muted">Record your assessment and select any tests. The patient will review the diagnosis and test plan after you complete the consultation.</p>
              <label htmlFor="doctor-diagnosis">Diagnosis / assessment</label><textarea id="doctor-diagnosis" className="field" rows={3} maxLength={2000} value={diagnosis} onChange={event => setDiagnosis(event.target.value)} placeholder="Enter the consultation assessment" />
              {config.labTests.map(test => <label key={test.id} className="check"><input type="checkbox" checked={labs.includes(test.id)} onChange={() => tog(labs, test.id, setLabs)} /><span>{test.name}</span><b>{money(test.price)}</b></label>)}
              <div className="total"><span>Test total (before cover)</span><span>{money(ordersTotal(labs, []))}</span></div>
              <div className="actions"><Btn disabled={!here || s.ahead > 0 || !diagnosis.trim()} onClick={() => { if (actions.submitDiagnosis(diagnosis, labs)) actions.advance(); }}>Complete diagnosis &amp; send to patient review</Btn><Pill tone={s.diagnosis ? 'ok' : 'warn'}>{s.diagnosis ? 'Diagnosis recorded' : 'Diagnosis needed'}</Pill></div>
            </> : activeStage === 'results-review' ? <>
              <p className="eyebrow">Review lab report · recommend medicines</p><p className="muted">Choose medicines after reviewing the submitted lab report. The patient must approve before pharmacy receives the prescription.</p>
              {awaitingLabReport && <Note tone="warn">The report is still being completed by the lab team. Medicine recommendations remain unavailable until every report is entered.</Note>}
              {config.drugs.map(drug => <label key={drug.id} className="check"><input type="checkbox" disabled={awaitingLabReport} checked={drugs.includes(drug.id)} onChange={() => tog(drugs, drug.id, setDrugs)} /><span>{drug.name}{!drug.inStock && ' (out of stock)'}</span><b>{money(drug.price)}</b></label>)}
              <div className="total"><span>Medicine total (before cover)</span><span>{money(ordersTotal([], drugs))}</span></div>
              <div className="actions"><Btn disabled={!here || s.ahead > 0 || awaitingLabReport} onClick={() => actions.proposeDrugs(drugs)}>Send medicine recommendation to patient</Btn><Pill tone={s.orders.drugStatus === 'approved' ? 'ok' : 'warn'}>{s.orders.drugStatus}</Pill></div>
            </> : <Note>Doctor order actions become available at consultation and results review.</Note>}
          </div>
          </div>
        )}
        {role.id === 'nurse' && selected?.isYou && (
          <section className="card triage-vitals-editor"><p className="eyebrow">Triage measurements</p><h2>Record vital signs</h2><p className="muted">Enter measurements taken at triage. Leave anything not measured blank.</p>
            <div className="triage-vitals-fields">
              <label>Systolic blood pressure (mmHg)<input className="field" inputMode="numeric" type="number" min="50" max="300" value={vitals.systolic} onChange={e => setVitals({ ...vitals, systolic: e.target.value })} /></label>
              <label>Diastolic blood pressure (mmHg)<input className="field" inputMode="numeric" type="number" min="30" max="200" value={vitals.diastolic} onChange={e => setVitals({ ...vitals, diastolic: e.target.value })} /></label>
              <label>Heart rate (bpm)<input className="field" inputMode="numeric" type="number" min="20" max="250" value={vitals.heartRate} onChange={e => setVitals({ ...vitals, heartRate: e.target.value })} /></label>
              <label>Weight (kg)<input className="field" inputMode="decimal" type="number" min="1" max="500" step="0.1" value={vitals.weightKg} onChange={e => setVitals({ ...vitals, weightKg: e.target.value })} /></label>
              <label>Temperature (°C)<input className="field" inputMode="decimal" type="number" min="30" max="45" step="0.1" value={vitals.temperatureC} onChange={e => setVitals({ ...vitals, temperatureC: e.target.value })} /></label>
            </div>
            <Btn className="inline" disabled={!here || Object.values(vitals).every(value => !value)} onClick={() => { const number = (value: string) => value.trim() ? Number(value) : null; const saved = actions.recordVitals({ bloodPressureSystolic: number(vitals.systolic), bloodPressureDiastolic: number(vitals.diastolic), heartRate: number(vitals.heartRate), weightKg: number(vitals.weightKg), temperatureC: number(vitals.temperatureC) }); if (saved) setVitals({ systolic: '', diastolic: '', heartRate: '', weightKg: '', temperatureC: '' }); }}>Save triage measurements</Btn>
            {(s.vitalReadings?.length ?? 0) > 0 && <p className="muted">{s.vitalReadings?.length} measurement set(s) recorded for this patient.</p>}
          </section>
        )}
        {role.id === 'doctor' && !selected?.isYou && <Note tone="warn">Medical-chart data is available only for the current demo patient. The other sample queue entries do not include patient records.</Note>}
        {role.id === 'lab' && selected?.isYou && <section className="card lab-report-editor"><p className="eyebrow">Lab report entry</p><h2>Record test results</h2><p className="muted">Enter the report values when processing is complete. The doctor can review them before prescribing.</p>{s.labs.map(order => <div className="report-entry" key={order.test.id}><label htmlFor={`lab-report-${order.test.id}`}>{order.test.name}</label><textarea id={`lab-report-${order.test.id}`} className="field" rows={2} maxLength={2000} value={order.report} disabled={!here || order.minutesLeft > 0} placeholder={order.minutesLeft > 0 ? `Processing · ${order.minutesLeft} min remaining` : 'Enter the lab report'} onChange={event => actions.setLabReport(order.test.id, event.target.value)} />{order.minutesLeft > 0 && <small className="muted">Wait for processing to finish before entering results.</small>}</div>)}{s.labs.length === 0 && <Note>No tests are waiting in this demo lab queue.</Note>}</section>}
        {role.id === 'cashier' && (
          <div className="card" style={{ marginTop: 16 }}>
            <p className="eyebrow">Cashier tools</p>
            <p className="muted">Total due: <b>{money(buildStatement(s).total)}</b> · payment: <b>{s.payment}</b></p>
            <div className="row2"><Btn className="inline" disabled={!here || s.payment === 'paid'} onClick={actions.recordCash}>Record cash payment</Btn></div>
            <p className="eyebrow" style={{ marginTop: 14 }}>Authorised waiver (staff only, recorded)</p>
            <div className="row2">
              <select className="field" style={{ width: 'auto' }} value={pct} onChange={e => setPct(+e.target.value)}>{[10, 20, 50, 100].map(p => <option key={p} value={p}>{p}%</option>)}</select>
              <select className="field" style={{ width: 'auto' }} value={reason} onChange={e => setReason(e.target.value)}>{config.pricing.waiverReasons.map(r => <option key={r}>{r}</option>)}</select>
              <Btn kind="dark" className="inline" disabled={!here} onClick={() => actions.waive(pct, reason, 'cashier')}>Apply waiver</Btn>
            </div>
          </div>
        )}
        {!here && <p className="muted">The demo patient is currently at: {currentStage(s) ?? 'visit closed'}.</p>}
        {config.demoMode && <div className="demo"><span>Demo</span><Btn kind="ghost" className="inline" onClick={() => actions.tick(5)}>Pass 5 minutes</Btn><Btn kind="ghost" className="inline" onClick={actions.restartDemo}>Restart visit</Btn></div>}
      </main>
    </div>
  );
}

function DoctorWorkspace() {
  const { state: s, actions } = useVisit();
  const activeStage = currentStage(s);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [messageDraft, setMessageDraft] = useState('');
  const query = catalogQuery.trim().toLocaleLowerCase();
  const labs = config.labTests.filter(item => !query || item.name.toLocaleLowerCase().includes(query));
  const drugs = config.drugs.filter(item => !query || `${item.name} ${item.directions}`.toLocaleLowerCase().includes(query));
  return <>
    <section className="card clinical-context">
      <div className="doctor-section-heading"><div><p className="eyebrow">Clinical workspace · current demo patient</p><h2>{s.patient.name}</h2><p className="muted">{s.patient.hospitalNo} · {s.patient.dob}</p></div><StatusBadge label={s.redFlag ? 'Needs urgent review' : 'Current visit'} tone={s.redFlag ? 'danger' : 'info'} /></div>
      <div className="grid2 clinical-snapshot"><div className="kv"><span>Allergy</span><b>{s.patient.allergy}</b></div><div className="kv"><span>Known conditions</span><b>{s.patient.condition}</b></div><div className="kv"><span>Current medicine</span><b>{s.patient.medicine}</b></div><div className="kv"><span>Recent blood pressure</span><b>{s.patient.lastBp}</b></div></div>
      <div className="clinical-history"><h3>Visit history</h3>{s.history.length === 0 ? <p className="muted">No previous visits are recorded in this demo profile.</p> : s.history.map(visit => <div className="row" key={visit.id}><span><b>{visit.dateLabel} · {visit.route}</b><br/><small>{visit.summary}</small></span><b>{money(visit.total)}</b></div>)}</div>
      {s.routeId && <div className="clinical-history"><h3>Current patient report</h3><p><b>{s.complaint || 'No main concern entered'}</b></p><p className="muted">Onset: {s.symptomOnset || 'Not provided'} · severity {s.symptomSeverity}/10</p>{s.symptomDetails && <p className="muted">{s.symptomDetails}</p>}</div>}
      {s.diagnosis && <div className="clinical-history"><h3>Consultation assessment</h3><p>{s.diagnosis}</p></div>}
      {activeStage === 'results-review' && s.labs.length > 0 && <div className="clinical-history"><h3>Lab reports for review</h3>{s.labs.map(order => <div className="report-entry" key={order.test.id}><b>{order.test.name}</b><p>{order.report || 'Report not entered'}</p></div>)}</div>}
    </section>

    <div className="doctor-tools-grid">
      <section className="card">
        <p className="eyebrow">Clinical documentation</p><h2>Add a visit note</h2>
        <p className="muted">Demo notes stay in this browser. Use the clinical record system after backend integration.</p>
        <label htmlFor="clinical-note">Note</label><textarea id="clinical-note" className="field" rows={4} maxLength={2000} value={noteDraft} onChange={e => setNoteDraft(e.target.value)} placeholder="Assessment, plan, or other visit information" />
        <Btn className="inline" disabled={!noteDraft.trim()} onClick={() => { actions.addClinicalNote(noteDraft); setNoteDraft(''); }}>Save demo note</Btn>
        {s.clinicalNotes.length > 0 && <div className="clinical-history"><h3>Recent demo notes</h3>{s.clinicalNotes.map(note => <article className="clinical-note" key={note.id}><div><b>{note.author}</b><small>{note.createdAt}</small></div><p>{note.text}</p></article>)}</div>}
      </section>

      <section className="card">
        <p className="eyebrow">Reference catalog · demo data</p><h2>Search tests and medicines</h2>
        <label htmlFor="clinical-catalog">Search available items</label><input id="clinical-catalog" className="field" type="search" value={catalogQuery} onChange={e => setCatalogQuery(e.target.value)} placeholder="Search tests or medicines" />
        <div className="catalog-results" aria-live="polite">
          {labs.map(item => <div className="row" key={`lab-${item.id}`}><span><b>{item.name}</b><br/><small>Lab test · about {item.turnaroundMinutes} min</small></span><b>{money(item.price)}</b></div>)}
          {drugs.map(item => <div className="row" key={`drug-${item.id}`}><span><b>{item.name}</b><br/><small>Medicine · {item.inStock ? item.directions : 'Currently out of stock'}</small></span><b>{money(item.price)}</b></div>)}
          {labs.length + drugs.length === 0 && <p className="muted">No items match that search.</p>}
        </div>
        <Note tone="info">Search covers the local demo catalog only. It is not connected to an external medical database.</Note>
      </section>

      <section className="card doctor-messages">
        <p className="eyebrow">Care team · local demo thread</p><h2>Team handoff</h2>
        <p className="muted">For prototyping only. Messages are stored in this browser, not delivered to another clinician.</p>
        <div className="message-list" aria-live="polite">{s.staffMessages.length === 0 ? <p className="muted">No handoff messages yet.</p> : s.staffMessages.map(message => <article className="team-message" key={message.id}><div><b>{message.author}</b><small>{message.createdAt}</small></div><p>{message.text}</p></article>)}</div>
        <label htmlFor="team-message">Message for the care team</label><textarea id="team-message" className="field" rows={2} maxLength={500} value={messageDraft} onChange={e => setMessageDraft(e.target.value)} placeholder="Add a handoff note" />
        <Btn className="inline" disabled={!messageDraft.trim()} onClick={() => { actions.sendStaffMessage(messageDraft); setMessageDraft(''); }}>Add local message</Btn>
      </section>
    </div>
  </>;
}
