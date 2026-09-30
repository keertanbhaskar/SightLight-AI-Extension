import { useEffect, useState } from 'react';
import type { Settings } from '@/shared/types';
import { call } from './api';

const LANGS = ['en-US', 'en-GB', 'en-IN', 'hi-IN', 'kn-IN', 'es-ES', 'fr-FR', 'de-DE'];

interface Props { settings: Settings; onChange: (s: Settings) => void; onClose: () => void }

export function SettingsView({ settings, onChange, onClose }: Props) {
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [url, setUrl] = useState(settings.backendUrl);

  useEffect(() => { void call<boolean>({ type: 'auth/status' }).then(setSignedIn).catch(() => undefined); }, []);

  const save = async (patch: Partial<Settings>) => {
    try { onChange(await call<Settings>({ type: 'settings/set', patch })); } catch (e) { setMsg(String(e)); }
  };

  const login = async () => {
    setMsg(null);
    try {
      await call({ type: 'auth/login', email, password });
      setSignedIn(true); setPassword(''); setMsg('Signed in. Runs will sync to your dashboard.');
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <main className="app">
      <header>
        <h1>Settings</h1>
        <button className="ghost" onClick={onClose} aria-label="Close settings">✕</button>
      </header>

      <label className="row-l"><span>Max steps</span>
        <input type="number" min={1} max={100} value={settings.maxSteps} onChange={(e) => void save({ maxSteps: Number(e.target.value) })} /></label>
      <label className="row-l"><span>Max runtime (s)</span>
        <input type="number" min={5} max={600} value={settings.maxRuntime} onChange={(e) => void save({ maxRuntime: Number(e.target.value) })} /></label>
      <label className="row-l"><span>Confirm risky actions</span>
        <input type="checkbox" checked={settings.requireConfirmation} onChange={(e) => void save({ requireConfirmation: e.target.checked })} /></label>
      {!settings.requireConfirmation && <div className="notice warn">Purchases, deletions and sends will run without asking.</div>}

      <h2>Voice</h2>
      <label className="row-l"><span>Language</span>
        <select value={settings.voiceLang} onChange={(e) => void save({ voiceLang: e.target.value })}>
          {LANGS.map((l) => <option key={l}>{l}</option>)}
        </select></label>
      <label className="row-l"><span>Run immediately after speaking</span>
        <input type="checkbox" checked={settings.voiceAutoRun} onChange={(e) => void save({ voiceAutoRun: e.target.checked })} /></label>
      <p className="hint">Parsing happens on your device. Chrome's speech service transcribes audio online.</p>

      <h2>Dashboard sync (optional)</h2>
      <label className="row-l"><span>Backend URL</span>
        <input value={url} placeholder="https://api.example.com" onChange={(e) => setUrl(e.target.value)} onBlur={() => void save({ backendUrl: url })} /></label>
      {settings.backendUrl && !signedIn && (
        <>
          <input aria-label="Email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          <input aria-label="Password" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          <button className="btn primary" onClick={() => void login()} disabled={!email || !password}>Sign in</button>
        </>
      )}
      {signedIn && <button className="btn" onClick={() => void call({ type: 'auth/logout' }).then(() => setSignedIn(false))}>Sign out</button>}
      {msg && <div className="notice">{msg}</div>}
    </main>
  );
}
