/** Thin, testable wrapper around the Web Speech API. */

interface SpeechRecognitionAlt { transcript: string }
interface SpeechRecognitionResultLike { isFinal: boolean; 0: SpeechRecognitionAlt }
interface SpeechRecognitionEventLike { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> }
interface SpeechRecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type Ctor = new () => SpeechRecognitionLike;

export type VoiceError = 'permission' | 'no-mic' | 'network' | 'no-speech' | 'unsupported' | 'other';

export interface RecognizerEvents {
  onStart(): void;
  onInterim(text: string): void;
  onFinal(text: string): void;
  onError(kind: VoiceError, raw: string): void;
  onEnd(): void;
}

export function getCtor(): Ctor | null {
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function classifyError(code: string): VoiceError {
  switch (code.toLowerCase()) {
    case 'not-allowed':
    case 'notallowederror':
    case 'securityerror':
    case 'service-not-allowed': return 'permission';
    case 'audio-capture':
    case 'notfounderror':
    case 'devicesnotfounderror':
    case 'notreadableerror': return 'no-mic';
    case 'network': return 'network';
    case 'no-speech': return 'no-speech';
    default: return 'other';
  }
}

export class Recognizer {
  private rec: SpeechRecognitionLike | null = null;
  private heard = '';
  private delivered = false;
  private errored = false;

  constructor(private readonly events: RecognizerEvents) {}

  static supported(): boolean {
    return getCtor() !== null;
  }

  start(lang: string): void {
    const C = getCtor();
    if (!C) return this.events.onError('unsupported', 'SpeechRecognition unavailable');
    this.stop();
    const rec = new C();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    this.heard = ''; this.delivered = false; this.errored = false;

    rec.onstart = () => this.events.onStart();
    rec.onresult = (e) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        (r.isFinal ? (final += r[0].transcript) : (interim += r[0].transcript));
      }
      if (interim) { this.heard = interim; this.events.onInterim(interim.trim()); }
      if (final.trim()) { this.heard = final; this.delivered = true; this.events.onFinal(final.trim()); }
    };
    rec.onerror = (e) => { this.errored = true; this.events.onError(classifyError(e.error), e.error); };
    rec.onend = () => {
      // Chrome sometimes ends without a final result; salvage what we heard.
      if (!this.delivered && !this.errored && this.heard.trim()) this.events.onFinal(this.heard.trim());
      this.rec = null;
      this.events.onEnd();
    };
    this.rec = rec;
    try {
      rec.start();
    } catch (err) {
      const name = typeof err === 'object' && err && 'name' in err && typeof err.name === 'string'
        ? err.name
        : String(err);
      this.events.onError(classifyError(name), name);
    }
  }

  stop(): void {
    try { this.rec?.stop(); } catch { /* already stopped */ }
  }

  abort(): void {
    if (!this.rec) return;
    this.rec.onend = null; this.rec.onresult = null; this.rec.onerror = null;
    try { this.rec.abort(); } catch { /* noop */ }
    this.rec = null;
  }
}
