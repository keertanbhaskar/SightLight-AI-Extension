import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseInstruction } from '@/agent/parser';
import type { PanelEvent } from '@/shared/messages';
import { DEFAULT_SETTINGS, type RunSnapshot, type Settings } from '@/shared/types';
import { speak, useVoice } from '@/voice/useVoice';
import { call } from './api';
import { SettingsView } from './SettingsView';

const ACTIVE = new Set(['running', 'awaiting_confirmation']);

export function App() {
  const [instruction, setInstruction] = useState('');
  const [run, setRun] = useState<RunSnapshot | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ requestId: string; message: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const fromVoice = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const queuedVoiceCommands = useRef<string[]>([]);
  const processingVoiceCommand = useRef(false);
  const voiceListening = useRef(false);
  const runNextVoiceCommandRef = useRef<() => void>(() => {});

  const running = run ? ACTIVE.has(run.status) : false;
  const plan = useMemo(() => parseInstruction(instruction), [instruction]);

  const start = useCallback(async (text: string) => {
    setError(null);
    try {
      setRun(await call<RunSnapshot>({ type: 'agent/start', instruction: text }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      if (fromVoice.current && !voiceListening.current) speak(msg, settingsRef.current.voiceLang);
      if (processingVoiceCommand.current) {
        processingVoiceCommand.current = false;
        window.setTimeout(() => runNextVoiceCommandRef.current(), 0);
      }
    }
  }, []);

  const runNextVoiceCommand = useCallback(() => {
    if (processingVoiceCommand.current || running || !settings.voiceAutoRun) return;
    const next = queuedVoiceCommands.current.shift();
    if (!next) return;
    processingVoiceCommand.current = true;
    void start(next);
  }, [running, settings.voiceAutoRun, start]);
  runNextVoiceCommandRef.current = runNextVoiceCommand;

  const voice = useVoice(settings.voiceLang, (text) => {
    fromVoice.current = true;
    if (settingsRef.current.voiceAutoRun) {
      setInstruction(text);
      queuedVoiceCommands.current.push(text);
      runNextVoiceCommandRef.current();
    } else {
      setInstruction((current) => current.trim() ? `${current.trim()} then ${text}` : text);
    }
  });
  voiceListening.current = voice.state === 'listening';

  useEffect(() => {
    void call<Settings>({ type: 'settings/get' }).then(setSettings).catch(() => undefined);
    void call<RunSnapshot | null>({ type: 'agent/state' }).then((r) => r && setRun(r)).catch(() => undefined);
    const onMsg = (m: PanelEvent) => {
      if (m.type === 'run/update') setRun(m.run);
      else if (m.type === 'confirm/request') setConfirm({ requestId: m.requestId, message: m.message });
      else if (m.type === 'voice/toggle') voice.toggle();
    };
    chrome.runtime.onMessage.addListener(onMsg);
    return () => chrome.runtime.onMessage.removeListener(onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Spoken result for hands-free runs
  const lastSpoken = useRef<string>('');
  useEffect(() => {
    if (!run || !fromVoice.current || ACTIVE.has(run.status) || lastSpoken.current === run.id) return;
    if (voice.state === 'listening') return;
    lastSpoken.current = run.id;
    speak(run.status === 'completed' ? 'Done.' : run.status === 'stopped' ? 'Stopped.' : `Failed. ${run.error ?? ''}`, settings.voiceLang);
  }, [run, settings.voiceLang, voice.state]);

  useEffect(() => { if (run && !ACTIVE.has(run.status)) setConfirm(null); }, [run]);

  useEffect(() => {
    if (!run || ACTIVE.has(run.status)) return;
    processingVoiceCommand.current = false;
    runNextVoiceCommand();
  }, [run, runNextVoiceCommand]);

  const answer = (approved: boolean) => {
    if (!confirm) return;
    void call({ type: 'agent/confirm', requestId: confirm.requestId, approved });
    setConfirm(null);
  };

  const canRun = !running && plan.steps.length > 0 && plan.unparsed.length === 0;

  if (showSettings) {
    return <SettingsView settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />;
  }

  return (
    <main className="app">
      <header>
        <h1>SightLite</h1>
        <button className="ghost" onClick={() => setShowSettings(true)} aria-label="Settings">⚙</button>
      </header>

      <div className="field">
        <textarea
          aria-label="Instruction"
          placeholder={'Try: "go to youtube.com, search for lo-fi beats, click the first video"'}
          value={voice.state === 'listening' && voice.interim ? voice.interim : instruction}
          onChange={(e) => { fromVoice.current = false; setInstruction(e.target.value); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canRun) void start(instruction); }}
          disabled={running}
          rows={3}
        />
        {voice.supported && (
          <button
            className={`mic ${voice.state}`}
            onClick={voice.toggle}
            aria-pressed={voice.state === 'listening'}
            aria-label={voice.state === 'listening' ? 'Stop listening' : 'Start voice command'}
            title="Voice command (Alt+Shift+V)"
          >
            {voice.state === 'listening' ? '■' : '🎙'}
          </button>
        )}
      </div>

      <label className="row-l">
        <span>Run immediately after speaking</span>
        <input
          type="checkbox"
          checked={settings.voiceAutoRun}
          onChange={(e) => {
            void call<Settings>({ type: 'settings/set', patch: { voiceAutoRun: e.target.checked } })
              .then(setSettings)
              .catch((err) => setError(err instanceof Error ? err.message : String(err)));
          }}
        />
      </label>

      {voice.error && (
        <div className="notice warn" role="alert">
          {voice.error.message}{' '}
          {voice.error.kind === 'permission' && <button className="link" onClick={voice.openPermissionPage}>Grant access</button>}
        </div>
      )}
      {!voice.supported && <div className="notice">Voice input isn't available in this browser.</div>}
      {error && <div className="notice err" role="alert">{error}</div>}

      {instruction.trim() && !running && (
        <section aria-label="Plan preview" className="plan">
          {plan.steps.map((s, i) => <div key={i} className="step">{i + 1}. {s.label}</div>)}
          {plan.unparsed.map((u, i) => <div key={`u${i}`} className="step bad">? Can't understand: “{u}”</div>)}
        </section>
      )}

      {running ? (
        <button className="btn danger" onClick={() => void call({ type: 'agent/stop' })}>Stop</button>
      ) : (
        <button className="btn primary" disabled={!canRun} onClick={() => void start(instruction)}>Run</button>
      )}

      {run && (
        <section className="status" aria-live="polite">
          <div className={`badge ${run.status}`}>{run.status.replace('_', ' ')}</div>
          <ol className="steps">
            {run.steps.map((s, i) => {
              const log = run.log.find((l) => l.index === i);
              const state = log ? (log.ok ? 'done' : 'failed') : i === run.currentStep && ACTIVE.has(run.status) ? 'now' : 'todo';
              return (
                <li key={i} className={state}>
                  <span className="dot" aria-hidden />
                  <div><div>{s.label}</div>{log?.detail && <small>{log.detail}</small>}</div>
                </li>
              );
            })}
          </ol>
          {run.error && <div className="notice err">{run.error}</div>}
        </section>
      )}

      {confirm && (
        <div className="modal" role="alertdialog" aria-modal="true" aria-label="Confirm action">
          <div className="card">
            <h2>Confirm action</h2>
            <pre>{confirm.message}</pre>
            <div className="row">
              <button className="btn" onClick={() => answer(false)}>Deny</button>
              <button className="btn primary" onClick={() => answer(true)} autoFocus>Allow</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
