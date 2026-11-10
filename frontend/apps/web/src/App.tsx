import { lazy, Suspense, useEffect, useState } from 'react';
import { hydrate, useVisit, actions, backend, restoreApiSession, setApiToken } from '@mediflow/shared';
import { Login } from './Login';
import { PatientApp } from './Patient';

// The staff workspace is loaded only when needed, so patients download less.
const StaffApp = lazy(() => import('./StaffLive'));

export function App() {
  const { state } = useVisit();
  const [mode, setMode] = useState<'login' | 'patient' | 'staff'>('login');
  // Restore the API session and identity. Clinical visit state is reloaded from the server.
  useEffect(() => { void (async () => {
    await hydrate();
    if (!await restoreApiSession()) return;
    try {
      const user = await backend.me(); actions.setServerIdentity(user);
      setMode(user.role === 'patient' ? 'patient' : 'staff');
    } catch { await setApiToken(null); }
  })(); }, []);

  if (!state.hydrated) return <div className="boot" role="status">Loading…</div>;
  if (mode === 'login') return <Login onPatient={() => setMode('patient')} onStaff={() => setMode('staff')} />;
  if (mode === 'patient') return <PatientApp onExit={() => { void backend.logout().catch(() => {}).finally(() => { void setApiToken(null); actions.signOut(); setMode('login'); }); }} />;
  return <Suspense fallback={<div className="boot" role="status">Loading…</div>}><StaffApp onExit={() => { void backend.logout().catch(() => {}).finally(() => { void setApiToken(null); actions.signOut(); setMode('login'); }); }} /></Suspense>;
}
