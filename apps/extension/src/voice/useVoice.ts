import { useCallback, useEffect, useRef, useState } from 'react';
import { Recognizer, type VoiceError } from './recognizer';

export type VoiceState = 'idle' | 'listening';

const MESSAGES: Record<VoiceError, string> = {
  permission: 'Microphone access is blocked. Allow it for SightLite in your browser settings, then try again.',
  'no-mic': 'No microphone was found.',
  network: 'Speech service unreachable. Voice needs an internet connection.',
  'no-speech': "I didn't hear anything. Try again.",
  unsupported: 'Voice input is not supported in this browser.',
  other: 'Voice input failed. Try again.',
};

export function useVoice(lang: string, onFinal: (text: string) => void) {
  const [state, setState] = useState<VoiceState>('idle');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<{ kind: VoiceError; message: string } | null>(null);
  const recRef = useRef<Recognizer | null>(null);
  const keepListening = useRef(false);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const langRef = useRef(lang);
  langRef.current = lang;
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal; // always call the latest handler without recreating the recognizer

  useEffect(() => {
    recRef.current = new Recognizer({
      onStart: () => { setState('listening'); setError(null); setInterim(''); },
      onInterim: setInterim,
      onFinal: (t) => { setInterim(''); finalRef.current(t); },
      onError: (kind) => {
        if (kind !== 'no-speech') keepListening.current = false;
        setError({ kind, message: MESSAGES[kind] });
      },
      onEnd: () => {
        setInterim('');
        if (!keepListening.current) {
          setState('idle');
          return;
        }
        restartTimer.current = setTimeout(() => {
          restartTimer.current = null;
          if (keepListening.current) recRef.current?.start(langRef.current);
        }, 250);
      },
    });
    return () => {
      keepListening.current = false;
      if (restartTimer.current) clearTimeout(restartTimer.current);
      recRef.current?.abort();
    };
  }, []);

  const start = useCallback(() => {
    keepListening.current = true;
    if (restartTimer.current) clearTimeout(restartTimer.current);
    restartTimer.current = null;
    setError(null);
    recRef.current?.start(lang);
  }, [lang]);
  const stop = useCallback(() => {
    keepListening.current = false;
    if (restartTimer.current) clearTimeout(restartTimer.current);
    restartTimer.current = null;
    setState('idle');
    setInterim('');
    recRef.current?.stop();
  }, []);
  const toggle = useCallback(() => (state === 'listening' ? stop() : start()), [state, start, stop]);

  const openPermissionPage = useCallback(() => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
  }, []);

  return { supported: Recognizer.supported(), state, interim, error, start, stop, toggle, openPermissionPage };
}

/** Optional spoken feedback for hands-free use. */
export function speak(text: string, lang: string): void {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  speechSynthesis.speak(u);
}
