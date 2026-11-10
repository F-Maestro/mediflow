import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { config, configureApi } from '@mediflow/shared';
import './styles.css';
import { App } from './App';

// Auth is held for this browser session. Patient/clinical records are loaded from the API, never localStorage.
configureApi({ baseUrl: import.meta.env.VITE_API_URL || 'http://127.0.0.1:4000' , tokenStore: {
  async get() { return sessionStorage.getItem('mediflow.access-token'); },
  async set(value) { if (value) sessionStorage.setItem('mediflow.access-token', value); else sessionStorage.removeItem('mediflow.access-token'); },
} });
// Theme tokens from the shared config become CSS variables: rebrand by editing config.ts only.
Object.entries(config.theme).forEach(([k, v]) => document.documentElement.style.setProperty(`--${k}`, v));
document.title = `${config.hospital.name} | ${config.hospital.tagline}`;

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
