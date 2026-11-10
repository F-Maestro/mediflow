import { useEffect, useState } from 'react';
import { config, actions, useVisit, backend, setApiToken } from '@mediflow/shared';
import { Brand, Btn, Field, LangToggle, Note, ThemeToggle, useTheme } from './ui';

export function Login({ onPatient, onStaff }: { onPatient: () => void; onStaff: () => void }) {
  const { state, T } = useVisit();
  const { theme, toggleTheme } = useTheme();
  const [tab, setTab] = useState<'patient' | 'staff' | 'register'>('patient');
  const [step, setStep] = useState<'id' | 'code' | 'password'>('id');
  const [ident, setIdent] = useState('');
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [registerChallengeId, setRegisterChallengeId] = useState('');
  const [registerCode, setRegisterCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [registerErr, setRegisterErr] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [registration, setRegistration] = useState({ name: '', phone: '', nationalId: '', dob: '', area: '', password: '' });
  const [patientMethod, setPatientMethod] = useState<'otp' | 'password'>('otp');
  const [password, setPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetChallengeId, setResetChallengeId] = useState(''); const [resetCode, setResetCode] = useState(''); const [newPassword, setNewPassword] = useState('');
  const [secs, setSecs] = useState(0);

  useEffect(() => { if (secs <= 0) return; const t = setTimeout(() => setSecs(secs - 1), 1000); return () => clearTimeout(t); }, [secs]);

  const sendCode = async () => {
    if (ident.trim().length < 8) { setErr(T('err.ident')); return; }
    setBusy(true); setErr(null);
    try { const result = await backend.requestOtp(ident, 'login'); setChallengeId(result.challengeId); setStep('code'); setSecs(result.expiresInSeconds); }
    catch (error) { setErr(error instanceof Error ? error.message : T('err.noAccount')); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setErr(null);
    try { const session = await backend.verifyOtp(ident, challengeId, code, tab === 'staff' ? 'staff-login' : 'login'); await setApiToken(session.accessToken); const user = await backend.me(); actions.setServerIdentity(user); user.role === 'patient' ? onPatient() : onStaff(); }
    catch (error) { setErr(error instanceof Error ? error.message : T('err.code')); }
    finally { setBusy(false); }
  };
  const passwordSignIn = async () => {
    if (ident.trim().length < 8 || password.length === 0) { setErr('Enter your phone number and passphrase.'); return; }
    setBusy(true); setErr(null);
    try {
      const result = await backend.passwordLogin(ident, password, tab === 'staff' ? 'staff' : 'patient');
      if ('requiresOtp' in result) { setChallengeId(result.challengeId); setStep('code'); setSecs(result.expiresInSeconds); setPassword(''); return; }
      await setApiToken(result.accessToken); const user = await backend.me(); actions.setServerIdentity(user); user.role === 'patient' ? onPatient() : onStaff();
    } catch (error) { setErr(error instanceof Error ? error.message : 'Sign-in failed. Check your details and try again.'); }
    finally { setBusy(false); }
  };
  const requestPasswordReset = async () => { if (ident.trim().length < 8) { setErr('Enter the phone number on your account first.'); return; } setBusy(true); setErr(null); try { const result = await backend.requestOtp(ident, 'password-reset'); setResetChallengeId(result.challengeId); setSecs(result.expiresInSeconds); } catch (error) { setErr(error instanceof Error ? error.message : 'Could not request a verification code.'); } finally { setBusy(false); } };
  const savePasswordReset = async () => { setBusy(true); setErr(null); try { await backend.resetPassword({ phone: ident, challengeId: resetChallengeId, code: resetCode, password: newPassword }); setResetting(false); setResetChallengeId(''); setResetCode(''); setNewPassword(''); setPassword(''); setStep('id'); setErr('Passphrase saved. Sign in with it now.'); } catch (error) { setErr(error instanceof Error ? error.message : 'Could not update the passphrase.'); } finally { setBusy(false); } };
  const sendRegistrationCode = async () => {
    setBusy(true); setRegisterErr(null);
    try { const result = await backend.requestOtp(registration.phone, 'registration'); setRegisterChallengeId(result.challengeId); setSecs(result.expiresInSeconds); }
    catch (error) { setRegisterErr(error instanceof Error ? error.message : 'Could not send a verification code.'); }
    finally { setBusy(false); }
  };
  const register = async () => {
    setBusy(true); setRegisterErr(null);
    try {
      const session = await backend.register({ ...registration, challengeId: registerChallengeId, code: registerCode });
      await setApiToken(session.accessToken); const user = await backend.me(); actions.setServerIdentity(user); setRegistered(true);
    } catch (error) { setRegisterErr(error instanceof Error ? error.message : 'Registration could not be completed.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="login" data-theme={theme}>
      <div className="hero">
        <Brand dark />
        <h1>{T('hero.title')}</h1>
        <p>{T('hero.text')}</p>
        <div className="stats">
          <div className="stat"><b>{T('hero.s1')}</b><span>{T('hero.s1b')}</span></div>
          <div className="stat"><b>{T('hero.s2')}</b><span>{T('hero.s2b')}</span></div>
          <div className="stat"><b>M-Pesa</b><span>{T('hero.s3b')}</span></div>
        </div>
      </div>
      <main className="login-pane">
        <div className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p className="eyebrow">{T('login.welcome', { name: config.hospital.name })}</p><div className="login-preferences"><ThemeToggle theme={theme} onToggle={toggleTheme} /><LangToggle /></div>
          </div>
          <h2>{tab === 'register' ? T('login.newPatient') : tab === 'patient' ? T('login.title') : T('login.staffTitle')}</h2>
          {tab !== 'register' && <div className="tabs login-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'patient'} className={tab === 'patient' ? 'on' : ''} onClick={() => { setTab('patient'); setErr(null); setIdent(''); setStep('id'); setResetting(false); }}>{T('login.patient')}</button>
            <button role="tab" aria-selected={tab === 'staff'} className={tab === 'staff' ? 'on' : ''} onClick={() => { setTab('staff'); setErr(null); setIdent(''); setStep('id'); setResetting(false); }}>{T('login.staffShort')}</button>
          </div>}

          {resetting && tab !== 'register' && <section className="registration-form"><p className="muted">Verify the phone on your account to set or reset your passphrase. Use at least 15 characters.</p><Field label={T('f.phone')} value={ident} onChange={e => setIdent(e.target.value)} inputMode="tel" autoComplete="tel" error={err} />{!resetChallengeId ? <Btn onClick={() => void requestPasswordReset()} disabled={busy}>{busy ? 'Sending…' : 'Send password reset code'}</Btn> : <><Note>{T('login.codeSent')} <b>{ident}</b>.</Note><Field label={T('login.code')} value={resetCode} onChange={e => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} /><Field label="New passphrase (15+ characters)" type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={15} maxLength={128} /><Btn onClick={() => void savePasswordReset()} disabled={busy || resetCode.length !== 6 || newPassword.length < 15}>{busy ? 'Saving…' : 'Set passphrase'}</Btn></>}<button className="link" onClick={() => { setResetting(false); setResetChallengeId(''); setResetCode(''); setNewPassword(''); setErr(null); }}>Back to sign in</button></section>}

          {!resetting && tab === 'patient' && step === 'id' && (<>
            <Field label={T('f.phone')} value={ident} onChange={e => setIdent(e.target.value)} inputMode="tel" autoComplete="tel" error={err} />
            <div className="tabs login-tabs" role="tablist" aria-label="Patient sign-in method"><button type="button" role="tab" aria-selected={patientMethod === 'otp'} className={patientMethod === 'otp' ? 'on' : ''} onClick={() => { setPatientMethod('otp'); setErr(null); }}>{T('login.useCode')}</button><button type="button" role="tab" aria-selected={patientMethod === 'password'} className={patientMethod === 'password' ? 'on' : ''} onClick={() => { setPatientMethod('password'); setErr(null); }}>{T('login.usePassword')}</button></div>
            {patientMethod === 'password' ? <><Field label="Passphrase" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} error={err} /><Btn onClick={() => void passwordSignIn()} disabled={busy}>{busy ? 'Signing in…' : 'Sign in with passphrase'}</Btn><button className="link" onClick={() => { setResetting(true); setResetChallengeId(''); setErr(null); }}>{T('login.forgotPassword')}</button></> : <Btn onClick={() => void sendCode()} disabled={busy}>{busy ? 'Sending…' : T('login.sendCode')}</Btn>}
            {err && <Note tone={err.startsWith('Passphrase saved') ? 'ok' : 'danger'}>{err}</Note>}
            <div className="login-register-prompt"><span>{T('login.newToMediFlow')}</span><button type="button" className="register-cta" onClick={() => { setTab('register'); setErr(null); setRegisterErr(null); setRegistered(false); }}>{T('login.startRegistration')}</button></div>
          </>)}
          {tab === 'patient' && step === 'code' && (<>
            <Note>{T('login.codeSent')} <b>{ident}</b>.</Note>
            <Field label={T('login.code')} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} error={err} autoFocus />
            <Btn onClick={() => void verify()} disabled={code.length < 6 || busy}>{busy ? 'Verifying…' : T('login.verify')}</Btn>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
              <button className="link" onClick={() => { setStep('id'); setCode(''); setErr(null); }}>{T('btn.back')}</button>
              <button className="link" disabled={secs > 0 || busy} onClick={() => { setStep('id'); void sendCode(); }}>{secs > 0 ? T('login.resendIn', { s: secs }) : T('login.resend')}</button>
            </div>
          </>)}
          {tab === 'register' && (registered ? <section className="registration-form">
            <button type="button" className="link register-back" onClick={() => { setTab('patient'); setStep('id'); }}>{T('login.backToSignIn')}</button>
            <p className="eyebrow">{T('login.registrationSuccess')}</p>
            <Note tone="ok">Your patient account is ready. Hospital number: <b>{state.patient.hospitalNo}</b></Note>
            <Btn onClick={onPatient}>Continue to MediFlow</Btn>
          </section> : <section className="registration-form">
            <button type="button" className="link register-back" onClick={() => { setTab('patient'); setStep('id'); setRegisterErr(null); }}>{T('login.backToSignIn')}</button>
            <p className="eyebrow">{T('login.newPatient')}</p>
            <p className="muted">{T('login.registerIntro')}</p>
            <Field label={T('login.fullName')} autoComplete="name" value={registration.name} onChange={e => setRegistration({ ...registration, name: e.target.value })} />
            <Field label={T('f.phone')} type="tel" inputMode="tel" autoComplete="tel" value={registration.phone} onChange={e => setRegistration({ ...registration, phone: e.target.value })} />
            <Field label={T('login.identity')} autoComplete="off" value={registration.nationalId} onChange={e => setRegistration({ ...registration, nationalId: e.target.value })} />
            <Field label={T('f.dob')} type="date" autoComplete="bday" value={registration.dob} onChange={e => setRegistration({ ...registration, dob: e.target.value })} />
            <Field label={T('f.area')} autoComplete="address-level2" value={registration.area} onChange={e => setRegistration({ ...registration, area: e.target.value })} />
            <Field label="Create passphrase (15+ characters)" type="password" autoComplete="new-password" value={registration.password} onChange={e => setRegistration({ ...registration, password: e.target.value })} minLength={15} maxLength={128} />
            <p className="muted">You can also sign in with a one-time code.</p>
            {registerErr && <Note tone="danger">{registerErr}</Note>}
            {!registerChallengeId ? <Btn onClick={() => void sendRegistrationCode()} disabled={busy}>{busy ? 'Sending…' : 'Verify phone to continue'}</Btn> : <>
              <Note>{T('login.codeSent')} <b>{registration.phone}</b>.</Note>
              <Field label={T('login.code')} value={registerCode} onChange={e => setRegisterCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
              {registerErr && <Note tone="danger">{registerErr}</Note>}
              <Btn onClick={() => void register()} disabled={busy || registerCode.length !== 6 || registration.password.length < 15}>{busy ? 'Creating account…' : T('login.createDemo')}</Btn>
            </>}
          </section>)}

          {!resetting && tab === 'staff' && step === 'code' && (<>
            <Note>{T('login.codeSent')} <b>{ident}</b>.</Note>
            <Field label={T('login.code')} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} error={err} />
            <Btn kind="dark" onClick={() => void verify()} disabled={code.length !== 6 || busy}>{busy ? 'Verifying…' : T('login.verify')}</Btn>
            <button className="link" style={{ marginTop: 12 }} onClick={() => { setStep('id'); setCode(''); }}>Change phone number</button>
          </>)}
          {!resetting && tab === 'staff' && step === 'id' && (<>
            <Note tone="warn">{T('login.staffNote')}</Note>
            <label htmlFor="fac">{T('login.facility')}</label>
            <select id="fac" className="field"><option>{config.hospital.facility}</option></select>
            <Field label={T('f.phone')} value={ident} onChange={e => setIdent(e.target.value)} inputMode="tel" autoComplete="tel" error={err} />
            <Field label="Staff passphrase" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} error={err} />
            <p className="muted">Staff sign-in requires your passphrase and a phone verification code.</p>
            <Btn kind="dark" onClick={() => void passwordSignIn()} disabled={busy}>{busy ? 'Verifying…' : 'Continue with passphrase'}</Btn>
            <button className="link" onClick={() => { setResetting(true); setResetChallengeId(''); setErr(null); }}>Set or reset passphrase using phone verification</button>
          </>)}
        </div>
      </main>
    </div>
  );
}
