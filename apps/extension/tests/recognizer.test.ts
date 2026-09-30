import { afterEach, describe, expect, it, vi } from 'vitest';
import { Recognizer, classifyError } from '@/voice/recognizer';

class FakeRec {
  static last: FakeRec;
  static startError: Error | null = null;
  lang = ''; continuous = false; interimResults = false; maxAlternatives = 1;
  onresult: ((e: unknown) => void) | null = null; onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null; onstart: (() => void) | null = null;
  constructor() { FakeRec.last = this; }
  start() { if (FakeRec.startError) throw FakeRec.startError; this.onstart?.(); } stop() { this.onend?.(); } abort() {}
}
const result = (transcript: string, isFinal: boolean) => ({ resultIndex: 0, results: [Object.assign([{ transcript }], { isFinal })] });
const mk = () => {
  const ev = { onStart: vi.fn(), onInterim: vi.fn(), onFinal: vi.fn(), onError: vi.fn(), onEnd: vi.fn() };
  (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRec;
  return { r: new Recognizer(ev), ev };
};
afterEach(() => {
  FakeRec.startError = null;
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
});

describe('Recognizer', () => {
  it('streams interim text and delivers the final transcript once', () => {
    const { r, ev } = mk(); r.start('en-US');
    expect(FakeRec.last.continuous).toBe(true);
    FakeRec.last.onresult!(result('click the log', false));
    FakeRec.last.onresult!(result('click the login button', true));
    FakeRec.last.onend!();
    expect(ev.onInterim).toHaveBeenCalledWith('click the log');
    expect(ev.onFinal).toHaveBeenCalledTimes(1);
    expect(ev.onFinal).toHaveBeenCalledWith('click the login button');
  });
  it('delivers multiple final utterances in one continuous session', () => {
    const { r, ev } = mk(); r.start('en-US');
    FakeRec.last.onresult!(result('go to youtube.com', true));
    FakeRec.last.onresult!(result('search for cats', true));
    expect(ev.onFinal.mock.calls.map(([text]) => text)).toEqual(['go to youtube.com', 'search for cats']);
  });
  it('salvages interim text when Chrome ends without a final result', () => {
    const { r, ev } = mk(); r.start('en-US');
    FakeRec.last.onresult!(result('scroll down', false));
    FakeRec.last.onend!();
    expect(ev.onFinal).toHaveBeenCalledWith('scroll down');
  });
  it('does not deliver text after an error', () => {
    const { r, ev } = mk(); r.start('en-US');
    FakeRec.last.onresult!(result('half heard', false));
    FakeRec.last.onerror!({ error: 'network' });
    FakeRec.last.onend!();
    expect(ev.onFinal).not.toHaveBeenCalled();
    expect(ev.onError).toHaveBeenCalledWith('network', 'network');
  });
  it('passes the language and reports unsupported browsers', () => {
    const { r } = mk(); r.start('hi-IN'); expect(FakeRec.last.lang).toBe('hi-IN');
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    const ev = { onStart: vi.fn(), onInterim: vi.fn(), onFinal: vi.fn(), onError: vi.fn(), onEnd: vi.fn() };
    new Recognizer(ev).start('en-US');
    expect(ev.onError).toHaveBeenCalledWith('unsupported', expect.any(String));
  });
  it('classifies errors', () => {
    expect(classifyError('not-allowed')).toBe('permission');
    expect(classifyError('NotAllowedError')).toBe('permission');
    expect(classifyError('service-not-allowed')).toBe('permission');
    expect(classifyError('audio-capture')).toBe('no-mic');
    expect(classifyError('no-speech')).toBe('no-speech');
  });
  it('reports synchronous browser microphone permission errors accurately', () => {
    FakeRec.startError = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    const { r, ev } = mk();
    r.start('en-US');
    expect(ev.onError).toHaveBeenCalledWith('permission', 'NotAllowedError');
  });
});
