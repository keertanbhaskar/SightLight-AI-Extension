import type { Candidate, LabelSource } from './matcher';

const INTERACTIVE = [
  'button', 'a[href]', 'input:not([type="hidden"])', 'textarea', 'select', 'summary',
  '[role="button"]', '[role="link"]', '[role="menuitem"]', '[role="tab"]', '[role="checkbox"]',
  '[role="radio"]', '[role="switch"]', '[role="option"]', '[role="combobox"]', '[role="searchbox"]',
  '[role="textbox"]', '[contenteditable=""]', '[contenteditable="true"]', '[onclick]', '[tabindex]:not([tabindex="-1"])',
].join(',');

const MAIN_EXCLUDE = 'nav, header, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"]';
const SEARCH_NAMES = /^(?:q|query|search|search_query|s|k|keywords?|term|text)$/i;
const MAX_ELEMENTS = 1500;

export interface Collected {
  element: HTMLElement;
  candidate: Candidate;
}

/** Depth-first collection that also pierces OPEN shadow roots (the old code missed them). */
function collectRoots(root: ParentNode, out: HTMLElement[]): void {
  root.querySelectorAll<HTMLElement>(INTERACTIVE).forEach((el) => out.push(el));
  root.querySelectorAll<HTMLElement>('*').forEach((el) => {
    if (el.shadowRoot) collectRoots(el.shadowRoot, out);
  });
}

export function isVisible(el: HTMLElement): boolean {
  if (typeof el.checkVisibility === 'function') {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
  } else {
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
  }
  const r = el.getBoundingClientRect();
  return r.width > 1 && r.height > 1;
}

export function isEditable(el: HTMLElement): boolean {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    const t = el.type.toLowerCase();
    const textual = ['text', 'search', 'email', 'url', 'tel', 'password', 'number', ''].includes(t);
    return textual && !el.readOnly && !el.disabled;
  }
  return el.isContentEditable || el.getAttribute('role') === 'textbox' || el.getAttribute('role') === 'searchbox';
}

const clean = (s: string | null | undefined, max = 160) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Visible text without cloning the subtree (the old getDirectText cloned every element). */
function visibleText(el: HTMLElement): string {
  return clean(el.innerText || el.textContent);
}

function labelsFor(el: HTMLElement): LabelSource[] {
  const out: LabelSource[] = [];
  const add = (text: string | null | undefined, weight: number) => {
    const t = clean(text);
    if (t) out.push({ text: t, weight });
  };

  add(el.getAttribute('aria-label'), 1);
  const lb = el.getAttribute('aria-labelledby');
  if (lb) add(lb.split(/\s+/).map((id) => el.getRootNode() instanceof ShadowRoot
    ? (el.getRootNode() as ShadowRoot).getElementById(id)?.textContent
    : document.getElementById(id)?.textContent).join(' '), 1);

  if (el instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(el.type)) add(el.value, 1);
  else if (!isEditable(el) || el instanceof HTMLSelectElement) add(visibleText(el), 1);

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    (el.labels ? Array.from(el.labels) : []).forEach((l) => add(l.textContent, 1));
    if ('placeholder' in el) add((el as HTMLInputElement).placeholder, 0.95);
  }
  add(el.getAttribute('title'), 0.85);
  add(el.getAttribute('alt') ?? el.querySelector('img[alt]')?.getAttribute('alt'), 0.85);
  add(el.getAttribute('name'), 0.6);
  add(el.id, 0.5);
  return out;
}

function roleOf(el: HTMLElement): string {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit.toLowerCase();
  const tag = el.tagName.toLowerCase();
  if (tag === 'a') return 'link';
  if (tag === 'button' || tag === 'summary') return 'button';
  if (tag === 'select') return 'combobox';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'input') {
    const t = (el as HTMLInputElement).type.toLowerCase();
    if (t === 'checkbox' || t === 'radio') return t;
    if (['button', 'submit', 'reset', 'image'].includes(t)) return 'button';
    if (t === 'search') return 'searchbox';
    return 'textbox';
  }
  return el.isContentEditable ? 'textbox' : 'generic';
}

function inViewport(r: DOMRect): boolean {
  return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
}

/** Elements from the previous scan, addressable by id for the follow-up `act` call. */
const registry = new Map<string, WeakRef<HTMLElement>>();

export function lookup(id: string): HTMLElement | null {
  const el = registry.get(id)?.deref();
  return el && el.isConnected ? el : null;
}

export function collect(): Collected[] {
  const els: HTMLElement[] = [];
  collectRoots(document, els);

  registry.clear();
  const out: Collected[] = [];
  const seen = new Set<HTMLElement>();
  let i = 0;
  for (const el of els) {
    if (seen.has(el)) continue;
    seen.add(el);
    if (!isVisible(el)) continue;
    const labels = labelsFor(el);
    if (!labels.length && !isEditable(el)) continue;

    const r = el.getBoundingClientRect();
    const id = `sl-${i}`;
    registry.set(id, new WeakRef(el));
    const inputType = el instanceof HTMLInputElement ? el.type.toLowerCase() : undefined;
    out.push({
      element: el,
      candidate: {
        index: i,
        labels,
        tag: el.tagName.toLowerCase(),
        role: roleOf(el),
        inputType,
        editable: isEditable(el) || (inputType !== undefined && ['checkbox', 'radio'].includes(inputType)),
        inViewport: inViewport(r),
        inMain: !el.closest(MAIN_EXCLUDE),
        href: el instanceof HTMLAnchorElement ? el.href : undefined,
        searchHint:
          inputType === 'search' ||
          SEARCH_NAMES.test(el.getAttribute('name') ?? '') ||
          /search/i.test(el.getAttribute('aria-label') ?? '') ||
          /search/i.test(el.getAttribute('placeholder') ?? '') ||
          el.getAttribute('role') === 'searchbox' ||
          Boolean(el.closest('form[role="search"], [role="search"]')),
      },
    });
    i++;
    if (i >= MAX_ELEMENTS) break;
  }
  return out;
}

/** Text of the button / form action that pressing Enter in `el` would trigger. */
export function formHintFor(el: HTMLElement): string | undefined {
  const form = el.closest('form');
  if (!form) return undefined;
  const submit = form.querySelector<HTMLElement>('button[type="submit"], input[type="submit"], button:not([type])');
  return clean([submit ? visibleText(submit) || (submit as HTMLInputElement).value : '', form.getAttribute('aria-label')]
    .filter(Boolean).join(' ') || form.getAttribute('action'));
}

export function describe(el: HTMLElement, score: number, id: string) {
  const labels = labelsFor(el);
  return {
    id,
    label: labels[0]?.text ?? el.tagName.toLowerCase(),
    role: roleOf(el),
    tag: el.tagName.toLowerCase(),
    href: el instanceof HTMLAnchorElement ? el.href : undefined,
    inputType: el instanceof HTMLInputElement ? el.type.toLowerCase() : undefined,
    autocomplete: el.getAttribute('autocomplete') ?? undefined,
    editable: isEditable(el),
    score,
  };
}
