import { describe, expect, it } from 'vitest';
import { ACCEPT_THRESHOLD, labelScore, pickOrdinal, rank, type Candidate } from '@/content/matcher';

let n = 0;
const c = (o: Partial<Candidate> & { text?: string }): Candidate => ({
  index: n++, tag: 'a', role: 'link', editable: false, inViewport: true, inMain: true, searchHint: false,
  labels: o.text ? [{ text: o.text, weight: 1 }] : [], ...o,
});

describe('rank', () => {
  it('matches Kannada and Hindi speech targets to English page labels phonetically', () => {
    expect(labelScore('Action', 'ಆಕ್ಷನ್')).toBeGreaterThan(ACCEPT_THRESHOLD);
    expect(labelScore('Action', 'एक्शन')).toBeGreaterThan(ACCEPT_THRESHOLD);
    expect(labelScore('Contact', 'ಆಕ್ಷನ್')).toBe(0);
    expect(rank([c({ text: 'Action', role: 'button', tag: 'button' })], {
      target: 'ಆಕ್ಷನ್', mode: 'click',
    })[0]?.candidate.labels[0]?.text).toBe('Action');
    expect(rank([c({ text: 'Action', role: 'button', tag: 'button' })], {
      target: 'एक्शन', mode: 'click',
    })[0]?.candidate.labels[0]?.text).toBe('Action');
  });

  it('prefers exact over partial', () => {
    const r = rank([c({ text: 'Log in with Google' }), c({ text: 'Log in', role: 'button', tag: 'button' })], { target: 'log in', mode: 'click' });
    expect(r[0]!.candidate.labels[0]!.text).toBe('Log in');
  });
  it('tolerates a typo and a plural', () => {
    expect(rank([c({ text: 'Documentation' })], { target: 'documentaton', mode: 'click' })[0]!.score).toBeGreaterThan(ACCEPT_THRESHOLD);
  });
  it('rejects a single shared word out of several (old char-overlap matched almost anything)', () => {
    expect(rank([c({ text: 'Contact sales team' })], { target: 'download the annual report', mode: 'click' })).toHaveLength(0);
  });
  it('type only targets editable elements', () => {
    const btn = c({ text: 'Search', role: 'button', tag: 'button' });
    const box = c({ text: 'Search', tag: 'input', role: 'textbox', editable: true, inputType: 'text' });
    const r = rank([btn, box], { target: 'search', mode: 'type' });
    expect(r).toHaveLength(1);
    expect(r[0]!.candidate).toBe(box);
  });
  it('click ignores text fields but allows checkboxes', () => {
    const box = c({ text: 'Email', tag: 'input', role: 'textbox', editable: true, inputType: 'text' });
    const cb = c({ text: 'Email', tag: 'input', role: 'checkbox', editable: true, inputType: 'checkbox' });
    expect(rank([box, cb], { target: 'email', mode: 'click' }).map((m) => m.candidate)).toEqual([cb]);
  });
  it('generic "search" finds the search input by name hint even if unlabeled', () => {
    const q = c({ tag: 'input', role: 'textbox', editable: true, inputType: 'text', searchHint: true });
    expect(rank([q], { target: 'search', mode: 'type' })[0]!.score).toBeGreaterThan(0.9);
  });
});

describe('ordinals', () => {
  const results = () => [
    c({ text: 'Home page', inMain: false, href: '/home' }),
    c({ text: 'Learn React basics', href: '/a' }),
    c({ text: 'Learn React basics', href: '/a' }), // thumbnail duplicate
    c({ text: 'React hooks explained', href: '/b' }),
    c({ text: 'Advanced React patterns', href: '/c' }),
  ];
  it('first/second/last result skip nav links and de-duplicate', () => {
    const cands = results();
    const q = { target: 'result', mode: 'click' as const };
    expect(pickOrdinal(cands, q, 1)!.candidate.href).toBe('/a');
    expect(pickOrdinal(cands, q, 2)!.candidate.href).toBe('/b');
    expect(pickOrdinal(cands, q, -1)!.candidate.href).toBe('/c');
  });
  it('returns null when out of range', () => {
    expect(pickOrdinal(results(), { target: 'result', mode: 'click' }, 9)).toBeNull();
  });
});
