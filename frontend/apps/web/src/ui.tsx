import { useEffect, useState, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { backend, config, useVisit, type Lang } from '@mediflow/shared';

export type Theme = 'light' | 'dark';
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return localStorage.getItem('mediflow.theme.v1') === 'dark' ? 'dark' : 'light'; }
    catch { return 'light'; }
  });
  useEffect(() => {
    try { localStorage.setItem('mediflow.theme.v1', theme); } catch { /* preference is optional */ }
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  return { theme, toggleTheme: () => setTheme(current => current === 'dark' ? 'light' : 'dark') };
}
export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return <button type="button" className="theme-toggle" aria-pressed={theme === 'dark'} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={onToggle}><span aria-hidden>{theme === 'dark' ? '☀' : '☾'}</span><span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span></button>;
}

export function Btn({ kind = 'primary', children, ...rest }: { kind?: 'primary' | 'ghost' | 'dark' | 'danger'; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...rest} className={`btn ${kind} ${rest.className ?? ''}`}>{children}</button>;
}
export const Note = ({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; children: ReactNode }) =>
  <div className={`note ${tone}`} role={tone === 'danger' ? 'alert' : undefined}>{children}</div>;
export const KV = ({ k, v, tone }: { k: string; v: string; tone?: 'danger' }) =>
  <div className="kv"><span>{k}</span><b className={tone}>{v}</b></div>;
export const Pill = ({ tone = 'ok', children }: { tone?: 'ok' | 'warn'; children: ReactNode }) => <span className={`pill ${tone}`}>{children}</span>;
export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="page-header"><div><h1>{title}</h1>{description && <p className="muted">{description}</p>}</div>{action && <div className="page-header-action">{action}</div>}</div>;
}
export function StatusBadge({ label, tone = 'info' }: { label: string; tone?: 'info' | 'ok' | 'warn' | 'danger' }) {
  return <span className={`status-badge ${tone}`} role="status">{label}</span>;
}
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <section className="empty-state"><h2>{title}</h2>{description && <p className="muted">{description}</p>}{action}</section>;
}
export function LoadingState({ label }: { label: string }) {
  return <div className="state-message" role="status" aria-live="polite"><span className="loading-dot" aria-hidden="true" />{label}</div>;
}
export function ErrorState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <section className="state-message error-state" role="alert"><strong>{title}</strong>{description && <span>{description}</span>}{action}</section>;
}
export function PatientSummaryCard({ name, patientId, status, stage, nextStage, labels }: { name: string; patientId: string; status: string; stage: string; nextStage?: string; labels?: { visit: string; patientId: string; current: string; next: string } }) {
  return <section className="patient-summary" aria-label="Current visit summary">
    <div className="patient-summary-heading"><div><p className="eyebrow">{labels?.visit ?? 'Current visit'}</p><h2>{name}</h2><p className="muted">{labels?.patientId ?? 'Patient ID'}: {patientId}</p></div><StatusBadge label={status} tone={nextStage ? 'info' : 'ok'} /></div>
    <div className="patient-summary-details"><div><span>{labels?.current ?? 'Current stage'}</span><strong>{stage}</strong></div>{nextStage && <div><span>{labels?.next ?? 'Up next'}</span><strong>{nextStage}</strong></div>}</div>
  </section>;
}
export function ConfirmDialog({ title, description, confirmLabel, cancelLabel, onConfirm, onCancel, danger = false, busy = false }: { title: string; description?: string; confirmLabel: string; cancelLabel: string; onConfirm: () => void; onCancel: () => void; danger?: boolean; busy?: boolean }) {
  return <div className="dialog-backdrop"><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={description ? 'confirm-description' : undefined}>
    <h2 id="confirm-title">{title}</h2>{description && <p id="confirm-description" className="muted">{description}</p>}
    <div className="row2"><Btn kind={danger ? 'danger' : 'primary'} className="inline" disabled={busy} onClick={onConfirm}>{confirmLabel}</Btn><Btn kind="ghost" className="inline" disabled={busy} onClick={onCancel}>{cancelLabel}</Btn></div>
  </section></div>;
}
export const Bar = ({ pct, label }: { pct: number; label: string }) =>
  <div className="bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>;

export function Field({ label, error, ...rest }: { label: string; error?: string | null } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = 'f-' + label.replace(/\W+/g, '');
  return (<div><label htmlFor={id}>{label}</label>
    <input id={id} className={`field ${error ? 'bad' : ''}`} aria-invalid={!!error} aria-describedby={error ? id + '-e' : undefined} {...rest} />
    {error && <div className="err" id={id + '-e'}>{error}</div>}</div>);
}

export function LangToggle() {
  const { state, actions } = useVisit();
  return (
    <div className="lang" role="group" aria-label="Language">
      {(['en', 'sw'] as Lang[]).map(l => (
        <button key={l} aria-pressed={state.lang === l} className={state.lang === l ? 'on' : ''} onClick={() => actions.setLang(l)}>{l === 'en' ? 'EN' : 'SW'}</button>
      ))}
    </div>
  );
}

export function Brand({ dark = false }: { dark?: boolean }) {
  return (<div className="logo" style={{ color: dark ? '#fff' : 'inherit' }}><i aria-hidden>+</i>
    <div>{config.hospital.name}<small>{config.hospital.tagline}</small></div></div>);
}

/** Always-available human help: call or WhatsApp the front desk. */
export function Help() {
  const { T } = useVisit();
  const [message, setMessage] = useState(''); const [consent, setConsent] = useState(false); const [messages, setMessages] = useState<Array<{ id: string; direction: string; message: string; createdAt: string }>>([]);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const refresh = async () => { try { setMessages((await backend.supportMessages()).messages as typeof messages); } catch { /* Support history is optional while the API reconnects. */ } };
  useEffect(() => { void refresh(); const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 10000); return () => window.clearInterval(timer); }, []);
  const send = async () => { if (!message.trim() || busy) return; setBusy(true); setError(null); try { await backend.sendSupportMessage(message.trim(), consent); setMessage(''); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not send your message.'); } finally { setBusy(false); } };
  return (
    <details className="help">
      <summary>{T('help.title')}</summary>
      <div className="helpbox">
        <a href={`tel:${config.hospital.supportPhone.replace(/\s/g, '')}`}>{T('help.call')} {config.hospital.supportPhone}</a>
        <a href={`https://wa.me/${config.hospital.whatsapp}`} target="_blank" rel="noreferrer">{T('help.whatsapp')}</a>
        <div className="support-chat"><b>Message the care team</b><div className="support-messages" aria-live="polite">{messages.map(item => <p key={item.id}><strong>{item.direction === 'inbound' ? 'Care team' : 'You'}:</strong> {item.message}</p>)}</div><textarea className="field" rows={2} maxLength={4000} value={message} onChange={event => setMessage(event.target.value)} placeholder="Type a message" /><label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> Allow WhatsApp delivery for this message</label>{error && <p role="alert">{error}</p>}<button type="button" disabled={busy || !message.trim()} onClick={() => void send()}>{busy ? 'Sending…' : 'Send message'}</button></div>
      </div>
    </details>
  );
}
