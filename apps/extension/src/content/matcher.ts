import Sanscript from '@indic-transliteration/sanscript';

/**
 * Pure element-matching logic (no DOM access) so it can be unit-tested.
 * The DOM layer builds Candidates; this module ranks them.
 */

export interface LabelSource {
  text: string;
  /** Trust weight: aria-label/visible text 1.0, title .85, name/id .6 */
  weight: number;
}

export interface Candidate {
  index: number; // DOM order
  labels: LabelSource[];
  tag: string;
  role: string;
  inputType?: string;
  editable: boolean;
  inViewport: boolean;
  inMain: boolean;
  href?: string;
  /** name/id/type hints such as q, query, search */
  searchHint: boolean;
}

export interface Match {
  candidate: Candidate;
  score: number;
}

export const ACCEPT_THRESHOLD = 0.55;

const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'for', 'in', 'on', 'this', 'that', 'my']);

export const tokens = (s: string): string[] =>
  s.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').split(' ').filter((t) => t && !STOP.has(t));

const INDIC_SCRIPT = /[\u0900-\u097f\u0c80-\u0cff]/u;

function phoneticKey(token: string): string {
  return token.toLowerCase()
    .replace(/tion$/g, 'shun')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/g(?=[eiy])/g, 'j')
    .replace(/ph/g, 'f')
    .replace(/x/g, 'ks')
    .replace(/[cq]/g, 'k')
    .replace(/[aeiouy]/g, '');
}

function indicPhoneticKey(token: string): string {
  const scheme = /[\u0c80-\u0cff]/u.test(token) ? 'kannada' : 'devanagari';
  return phoneticKey(Sanscript.t(token, scheme, 'itrans'));
}

function lev1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

function tokenSim(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return 0.85;
  if (a.length >= 5 && b.length >= 5 && lev1(a, b)) return 0.8;
  return 0;
}

export function labelScore(label: string, target: string): number {
  const lt = tokens(label);
  const tt = tokens(target);
  if (!lt.length || !tt.length) return 0;

  if (tt.some((token) => INDIC_SCRIPT.test(token))) {
    const targetKeys = tt.map((token) => INDIC_SCRIPT.test(token) ? indicPhoneticKey(token) : phoneticKey(token));
    const labelKeys = lt.map(phoneticKey);
    const matches = targetKeys.filter((key) => key.length >= 3 && labelKeys.includes(key)).length;
    const coverage = matches / targetKeys.length;
    if (coverage >= 0.66) return coverage * 0.82 / (1 + 0.03 * Math.max(0, lt.length - tt.length));
  }

  const ln = lt.join(' ');
  const tn = tt.join(' ');
  if (ln === tn) return 1;

  const extra = Math.max(0, lt.length - tt.length);
  const lengthPenalty = 1 / (1 + 0.03 * extra);

  if (` ${ln} `.includes(` ${tn} `)) return 0.9 * lengthPenalty;

  let sum = 0;
  for (const t of tt) sum += Math.max(...lt.map((l) => tokenSim(l, t)));
  const coverage = sum / tt.length;
  // Require most tokens to match; a single shared word out of three is not a match.
  return coverage >= 0.66 ? coverage * 0.8 * lengthPenalty : 0;
}

export interface Query {
  target: string;
  mode: 'click' | 'type' | 'find';
  roleHint?: string;
}

const CLICKABLE_INPUTS = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'image']);

function roleCompatible(c: Candidate, q: Query): boolean {
  if (q.mode === 'type') return c.editable;
  if (q.mode === 'click') {
    if (!c.editable) return true;
    if (c.inputType && CLICKABLE_INPUTS.has(c.inputType)) return true;
    return q.roleHint === 'field' || q.roleHint === 'box'; // "click the search box"
  }
  return true;
}

const ROLE_MATCH: Record<string, string[]> = {
  button: ['button', 'submit'], link: ['link', 'a'], tab: ['tab'], menu: ['menuitem', 'menu'],
  checkbox: ['checkbox'], radio: ['radio'], option: ['option'], toggle: ['switch', 'checkbox'],
  icon: ['button', 'link'], dropdown: ['combobox', 'select', 'listbox'],
};

export function scoreCandidate(c: Candidate, q: Query): number {
  if (!roleCompatible(c, q)) return 0;
  const generic = tokens(q.target).join(' ');

  let best = 0;
  for (const l of c.labels) best = Math.max(best, labelScore(l.text, q.target) * l.weight);

  // "search" / "search box" target: prefer real search inputs even if labelled oddly
  if (q.mode === 'type' && (generic === 'search' || generic === 'search box' || generic === 'search bar' || generic === 'query')) {
    if (c.inputType === 'search' || c.role === 'searchbox' || c.searchHint) best = Math.max(best, 0.95);
    else if (best === 0) best = 0.3; // last-resort: any text field
  }
  // no target given: any editable is acceptable
  if (!generic && q.mode === 'type') best = 0.6;

  if (best === 0) return 0;
  if (q.roleHint && ROLE_MATCH[q.roleHint]?.includes(c.role)) best += 0.08;
  if (c.inViewport) best += 0.04;
  return Math.min(best, 1);
}

export function rank(cands: Candidate[], q: Query): Match[] {
  return cands
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, q) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.index - b.candidate.index);
}

const COLLECTION_NOUNS = /^(?:results?|links?|videos?|items?|products?|posts?|articles?|listings?|rows?|entries|entry|cards?|stories|story|images?|threads?|topics?|repos?|repositories|answers?|songs?|tracks?|jobs?)$/i;

export function isCollectionTarget(target: string): boolean {
  const t = tokens(target);
  return t.length > 0 && t.every((w) => COLLECTION_NOUNS.test(w));
}

/**
 * "click the 2nd result": candidates are main-content links with descriptive text,
 * de-duplicated (thumbnail + title anchors share an href), in reading order.
 */
export function pickOrdinal(cands: Candidate[], q: Query, ordinal: number): Match | null {
  let pool: Candidate[];
  if (isCollectionTarget(q.target)) {
    const seen = new Set<string>();
    pool = cands.filter((c) => {
      if (c.role !== 'link' || !c.inMain || !c.href) return false;
      const text = c.labels.find((l) => l.weight >= 1)?.text ?? '';
      if (tokens(text).length < 2) return false;
      if (seen.has(c.href)) return false;
      seen.add(c.href);
      return true;
    });
  } else {
    pool = rank(cands, q)
      .filter((m) => m.score >= ACCEPT_THRESHOLD)
      .map((m) => m.candidate)
      .sort((a, b) => a.index - b.index);
  }
  if (!pool.length) return null;
  const idx = ordinal === -1 ? pool.length - 1 : ordinal - 1;
  const chosen = pool[idx];
  return chosen ? { candidate: chosen, score: 0.75 } : null;
}
