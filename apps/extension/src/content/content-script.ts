import type { ContentRequest, ContentResponse } from '@/shared/messages';
import type { ElementInfo, Step } from '@/shared/types';
import * as actions from './actions';
import { collect, describe, formHintFor, lookup, isEditable } from './dom';
import { ACCEPT_THRESHOLD, pickOrdinal, rank, type Query } from './matcher';

/**
 * Stateless page agent: it perceives and acts, the service worker decides.
 * (The old design ran the whole agent loop here, so any navigation killed the task.)
 */
declare global {
  interface Window {
    __sightliteLoaded?: boolean;
  }
}

if (!window.__sightliteLoaded) {
  window.__sightliteLoaded = true;
  chrome.runtime.onMessage.addListener((msg: ContentRequest, _sender, sendResponse) => {
    if (!msg || typeof msg !== 'object' || !('type' in msg)) return false;
    handle(msg)
      .then(sendResponse)
      .catch((e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    return true;
  });
}

async function handle(msg: ContentRequest): Promise<ContentResponse> {
  switch (msg.type) {
    case 'ping':
      return { ok: true, pong: true };
    case 'resolve':
      return resolve(msg.step);
    case 'act':
      return act(msg.step, msg.elementId);
    default:
      return { ok: false, error: 'Unknown request' };
  }
}

function queryFor(step: Step): Query | null {
  if (step.kind === 'click') return { target: step.target, mode: 'click', roleHint: step.role };
  if (step.kind === 'type') return { target: step.target ?? '', mode: 'type' };
  if (step.kind === 'find') return { target: step.target, mode: 'find' };
  return null;
}

function resolve(step: Step): ContentResponse {
  // Enter: report the focused element + what its form would submit, so safety can judge it.
  if (step.kind === 'press') {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { ok: true };
    const info: ElementInfo = describe(el, 1, 'active');
    return { ok: true, element: { ...info, formHint: formHintFor(el) } };
  }

  const q = queryFor(step);
  if (!q) return { ok: true };

  const all = collect();

  // type with no target: use the focused field if editable
  if (step.kind === 'type' && !step.target) {
    const active = document.activeElement as HTMLElement | null;
    const hit = active && isEditable(active) ? all.find((c) => c.element === active) : undefined;
    if (hit) return { ok: true, element: withForm(hit.element, 1, hit.candidate.index) };
  }

  const cands = all.map((a) => a.candidate);
  const ordinal = step.kind === 'click' ? step.ordinal : undefined;
  const best = ordinal !== undefined
    ? pickOrdinal(cands, q, ordinal)
    : (() => { const r = rank(cands, q)[0]; return r && r.score >= ACCEPT_THRESHOLD ? r : null; })();

  if (!best) {
    const near = rank(cands, q).slice(0, 3).map((m) => all[m.candidate.index]!).map((c) => describe(c.element, 0, `sl-${c.candidate.index}`));
    return { ok: false, error: `No matching element for "${q.target || 'field'}"${near.length ? `. Closest: ${near.map((n) => `"${n.label}"`).join(', ')}` : ''}`, retryable: true };
  }

  const found = all[best.candidate.index]!;
  const alternatives = rank(cands, q).slice(1, 4).map((m) => {
    const a = all[m.candidate.index]!;
    return describe(a.element, m.score, `sl-${a.candidate.index}`);
  });
  return { ok: true, element: withForm(found.element, best.score, best.candidate.index), alternatives };
}

function withForm(el: HTMLElement, score: number, index: number): ElementInfo {
  return { ...describe(el, score, `sl-${index}`), formHint: formHintFor(el) };
}

async function act(step: Step, elementId?: string): Promise<ContentResponse> {
  const fromId = () => (elementId ? lookup(elementId) : null);

  switch (step.kind) {
    case 'click': {
      const el = fromId();
      if (!el) return { ok: false, error: 'Element went away before it could be clicked', retryable: true };
      const r = await actions.click(el);
      return r.ok ? { ok: true } : { ok: false, error: r.error ?? 'Click failed' };
    }
    case 'type': {
      const el = fromId();
      if (!el) return { ok: false, error: 'Field went away before it could be filled', retryable: true };
      const r = await actions.type(el, step.text);
      if (!r.ok) return { ok: false, error: r.error ?? 'Typing failed' };
      if (step.submit) {
        const s = await actions.pressKey(el, 'Enter');
        return { ok: true, detail: s.detail ?? 'typed and pressed Enter' };
      }
      return { ok: true };
    }
    case 'press': {
      const r = await actions.pressKey(document.activeElement as HTMLElement | null, step.key);
      return r.ok ? { ok: true, detail: r.detail } : { ok: false, error: r.error ?? 'Key press failed' };
    }
    case 'scroll': {
      const r = await actions.scroll(step.direction, step.times);
      return { ok: true, detail: r.detail };
    }
    case 'find': {
      const el = fromId();
      if (!el) return { ok: false, error: 'Element not found' };
      await actions.reveal(el);
      return { ok: true, detail: 'scrolled into view' };
    }
    default:
      return { ok: false, error: `Content script cannot perform "${step.kind}"` };
  }
}
