import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { config, actions, useVisit, backend, setApiToken } from '@mediflow/shared';
import { Brand, Btn, Card, Field, LangToggle, LinkBtn, Note, Eyebrow, Muted, s, t, ThemeToggle } from './ui';

export function Login({ dark, onToggleTheme }: { dark: boolean; onToggleTheme: () => void }) {
  const { T } = useVisit();
  const [mode, setMode] = useState<'login' | 'register'>('login'); const [step, setStep] = useState<'id' | 'code'>('id');
  const [method, setMethod] = useState<'otp' | 'password'>('otp'); const [ident, setIdent] = useState(''); const [password, setPassword] = useState('');
  const [code, setCode] = useState(''); const [err, setErr] = useState<string | null>(null); const [secs, setSecs] = useState(0);
  const [challengeId, setChallengeId] = useState(''); const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false); const [resetChallengeId, setResetChallengeId] = useState(''); const [resetCode, setResetCode] = useState(''); const [newPassword, setNewPassword] = useState('');
  const [registration, setRegistration] = useState({ name: '', phone: '', nationalId: '', dob: '', area: '', password: '' });
  useEffect(() => { if (secs <= 0) return; const id = setTimeout(() => setSecs(secs - 1), 1000); return () => clearTimeout(id); }, [secs]);
  const send = async () => { if (ident.trim().length < 8) { setErr(T('err.ident')); return; } setBusy(true); setErr(null); try { const result = await backend.requestOtp(ident, 'login'); setChallengeId(result.challengeId); setSecs(result.expiresInSeconds); setStep('code'); } catch (error) { setErr(error instanceof Error ? error.message : T('err.noAccount')); } finally { setBusy(false); } };
  const verify = async () => { setBusy(true); setErr(null); try { const session = await backend.verifyOtp(ident, challengeId, code); if (session.user.role !== 'patient') throw new Error('Staff accounts must use the web staff workspace.'); await setApiToken(session.accessToken); actions.setServerIdentity(await backend.me()); } catch (error) { setErr(error instanceof Error ? error.message : T('err.code')); } finally { setBusy(false); } };
  const passwordSignIn = async () => { if (ident.trim().length < 8 || !password) { setErr('Enter your phone number and passphrase.'); return; } setBusy(true); setErr(null); try { const result = await backend.passwordLogin(ident, password, 'patient'); if ('requiresOtp' in result) throw new Error('Unexpected staff verification response.'); await setApiToken(result.accessToken); actions.setServerIdentity(await backend.me()); } catch (error) { setErr(error instanceof Error ? error.message : 'Sign-in failed. Check your details and try again.'); } finally { setBusy(false); } };
  const requestPasswordReset = async () => { if (ident.trim().length < 8) { setErr('Enter the phone number on your account first.'); return; } setBusy(true); setErr(null); try { const result = await backend.requestOtp(ident, 'password-reset'); setResetChallengeId(result.challengeId); setSecs(result.expiresInSeconds); } catch (error) { setErr(error instanceof Error ? error.message : 'Could not request a verification code.'); } finally { setBusy(false); } };
  const savePasswordReset = async () => { setBusy(true); setErr(null); try { await backend.resetPassword({ phone: ident, challengeId: resetChallengeId, code: resetCode, password: newPassword }); setResetting(false); setResetChallengeId(''); setResetCode(''); setNewPassword(''); setPassword(''); setStep('id'); setErr('Passphrase saved. Sign in with it now.'); } catch (error) { setErr(error instanceof Error ? error.message : 'Could not update the passphrase.'); } finally { setBusy(false); } };
  const requestRegistrationOtp = async () => { setBusy(true); setErr(null); try { const result = await backend.requestOtp(registration.phone, 'registration'); setChallengeId(result.challengeId); setSecs(result.expiresInSeconds); setStep('code'); } catch (error) { setErr(error instanceof Error ? error.message : 'Could not send a verification code.'); } finally { setBusy(false); } };
  const register = async () => { setBusy(true); setErr(null); try { const session = await backend.register({ ...registration, challengeId, code }); await setApiToken(session.accessToken); actions.setServerIdentity(await backend.me()); } catch (error) { setErr(error instanceof Error ? error.message : 'Registration could not be completed.'); } finally { setBusy(false); } };
  return (
    <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
      <View style={s.rowBetween}><Brand /><View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><ThemeToggle dark={dark} onToggle={onToggleTheme} /><LangToggle /></View></View>
      <Text style={{ fontSize: 34, fontWeight: '800', color: t.ink, marginTop: 24, lineHeight: 38 }}>{T('hero.title')}</Text>
      <Text style={[s.muted, { marginTop: 8 }]}>{T('hero.text')}</Text>
      <Card>
        <Eyebrow>{T('login.welcome', { name: config.hospital.name })}</Eyebrow><Text style={s.h2}>{resetting ? 'Set or reset passphrase' : mode === 'register' ? T('login.newPatient') : T('login.title')}</Text>
        {resetting && <>
          <Muted>Verify your phone to set or reset a passphrase. Use at least 15 characters.</Muted>
          <Field label={T('f.phone')} value={ident} onChangeText={setIdent} keyboardType="phone-pad" autoCapitalize="none" error={err} />
          {!resetChallengeId ? <Btn kind="primary" label={busy ? 'Sending…' : 'Send password reset code'} onPress={() => void requestPasswordReset()} disabled={busy} /> : <>
            <Note>{T('login.codeSent')} {ident}.</Note>
            <Field label={T('login.code')} value={resetCode} onChangeText={v => setResetCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} textContentType="oneTimeCode" />
            <Field label="New passphrase (15+ characters)" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" maxLength={128} />
            <Btn label={busy ? 'Saving…' : 'Set passphrase'} onPress={() => void savePasswordReset()} disabled={busy || resetCode.length !== 6 || newPassword.length < 15} />
          </>}
          {err ? <Note tone={err.startsWith('Passphrase saved') ? 'ok' : 'danger'}>{err}</Note> : null}
          <LinkBtn label="Back to sign in" onPress={() => { setResetting(false); setResetChallengeId(''); setResetCode(''); setNewPassword(''); setErr(null); }} />
        </>}
        {!resetting && mode === 'login' && step === 'id' && <>
          <Field label={T('f.phone')} value={ident} onChangeText={setIdent} keyboardType="phone-pad" autoCapitalize="none" error={err} />
          <View style={s.rowBetween}><LinkBtn label="Use one-time code" onPress={() => { setMethod('otp'); setErr(null); }} /><LinkBtn label="Use passphrase" onPress={() => { setMethod('password'); setErr(null); }} /></View>
          {method === 'otp' ? <Btn kind="primary" label={busy ? 'Sending…' : T('login.sendCode')} onPress={() => void send()} disabled={busy} /> : <>
            <Field label="Passphrase" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="password" error={err} />
            <Btn kind="primary" label={busy ? 'Signing in…' : 'Sign in with passphrase'} onPress={() => void passwordSignIn()} disabled={busy} />
            <LinkBtn label={T('login.forgotPassword')} onPress={() => { setResetting(true); setResetChallengeId(''); setErr(null); }} />
          </>}
          {err ? <Note tone={err.startsWith('Passphrase saved') ? 'ok' : 'danger'}>{err}</Note> : null}
          <LinkBtn label={T('login.startRegistration')} onPress={() => { setMode('register'); setStep('id'); setErr(null); }} />
        </>}
        {!resetting && mode === 'login' && step === 'code' && <>
          <Note>{T('login.codeSent')} {ident}.</Note>
          <Field label={T('login.code')} value={code} onChangeText={v => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} textContentType="oneTimeCode" error={err} autoFocus />
          <Btn label={busy ? 'Verifying…' : T('login.verify')} onPress={() => void verify()} disabled={code.length < 6 || busy} />
          <View style={s.rowBetween}><LinkBtn label={T('btn.back')} onPress={() => { setStep('id'); setCode(''); setErr(null); }} />
            <LinkBtn label={secs > 0 ? T('login.resendIn', { s: secs }) : T('login.resend')} disabled={secs > 0 || busy} onPress={() => { setStep('id'); void send(); }} /></View>
        </>}
        {!resetting && mode === 'register' && step === 'id' && <>
          <Muted>{T('login.registerIntro')}</Muted>
          <Field label={T('login.fullName')} value={registration.name} onChangeText={value => setRegistration({ ...registration, name: value })} autoCapitalize="words" />
          <Field label={T('f.phone')} value={registration.phone} onChangeText={value => setRegistration({ ...registration, phone: value })} keyboardType="phone-pad" />
          <Field label={T('login.identity')} value={registration.nationalId} onChangeText={value => setRegistration({ ...registration, nationalId: value })} />
          <Field label={T('f.dob')} value={registration.dob} onChangeText={value => setRegistration({ ...registration, dob: value })} placeholder="YYYY-MM-DD" />
          <Field label={T('f.area')} value={registration.area} onChangeText={value => setRegistration({ ...registration, area: value })} />
          <Field label="Create passphrase (15+ characters)" value={registration.password} onChangeText={value => setRegistration({ ...registration, password: value })} secureTextEntry autoCapitalize="none" autoComplete="new-password" maxLength={128} />
          <Muted>You can also sign in with a one-time code.</Muted>
          {err ? <Note tone="danger">{err}</Note> : null}<Btn label={busy ? 'Sending…' : 'Verify phone to continue'} disabled={busy || registration.password.length < 15} onPress={() => void requestRegistrationOtp()} />
          <LinkBtn label={T('login.backToSignIn')} onPress={() => { setMode('login'); setErr(null); }} />
        </>}
        {!resetting && mode === 'register' && step === 'code' && <>
          <Note>{T('login.codeSent')} {registration.phone}.</Note>
          <Field label={T('login.code')} value={code} onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} textContentType="oneTimeCode" error={err} />
          <Btn label={busy ? 'Creating account…' : T('login.createDemo')} disabled={busy || code.length !== 6 || registration.password.length < 15} onPress={() => void register()} />
          <LinkBtn label={T('btn.back')} onPress={() => { setStep('id'); setErr(null); }} />
        </>}
      </Card>
      <Text style={[s.muted, { textAlign: 'center' }]}>Hospital staff use the web workspace.</Text>
    </ScrollView>
  );
}
