import { formHintFor, isEditable, isVisible } from './dom';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface ActResult {
  ok: boolean;
  error?: string;
  detail?: string;
}

/** Brief outline so the user can see what the agent touched (replaces the 450-line debug overlay). */
export function highlight(el: HTMLElement, color = '#22c55e'): void {
  const r = el.getBoundingClientRect();
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'fixed', left: `${r.left - 3}px`, top: `${r.top - 3}px`, width: `${r.width + 6}px`,
    height: `${r.height + 6}px`, border: `2px solid ${color}`, borderRadius: '6px', zIndex: '2147483647',
    pointerEvents: 'none', boxShadow: `0 0 0 3px ${color}33`, transition: 'opacity .3s',
  } satisfies Partial<CSSStyleDeclaration>);
  document.documentElement.appendChild(box);
  setTimeout(() => { box.style.opacity = '0'; }, 700);
  setTimeout(() => box.remove(), 1100);
}

function topElementAt(x: number, y: number): Element | null {
  let el: Element | null = document.elementFromPoint(x, y);
  while (el?.shadowRoot) {
    const inner = el.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === el) break;
    el = inner;
  }
  return el;
}

/**
 * Exactly ONE click. The previous executor dispatched synthetic mouse events, then el.click(),
 * then a PointerEvent('click'), then fake input/change events, then eval'd the onclick attribute:
 * checkboxes toggled twice, "Add to cart" fired 3x and forms double-submitted.
 */
export async function click(el: HTMLElement): Promise<ActResult> {
  if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') {
    return { ok: false, error: 'Element is disabled' };
  }
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
  await sleep(120);
  if (!isVisible(el)) return { ok: false, error: 'Element is not visible' };

  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const top = topElementAt(x, y);
  if (top && top !== el && !el.contains(top) && !top.contains(el)) {
    return { ok: false, error: `Element is covered by <${top.tagName.toLowerCase()}> (modal/overlay?)` };
  }

  highlight(el);
  el.focus?.({ preventScroll: true });
  const init = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0 };
  el.dispatchEvent(new PointerEvent('pointerdown', { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  el.dispatchEvent(new MouseEvent('mousedown', init));
  el.dispatchEvent(new PointerEvent('pointerup', { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  el.dispatchEvent(new MouseEvent('mouseup', init));
  el.click(); // dispatches the single 'click' event and triggers native default actions
  return { ok: true };
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  // React/Vue track value via the prototype setter; assigning el.value directly is ignored by them.
  const proto = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

export async function type(el: HTMLElement, text: string): Promise<ActResult> {
  if (!isEditable(el)) return { ok: false, error: 'Target is not an editable field' };
  el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
  await sleep(80);
  highlight(el, '#3b82f6');
  el.focus({ preventScroll: true });

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.select();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
    setNativeValue(el, text);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (el.value !== text) return { ok: false, error: 'The page rejected the typed value' };
  } else {
    // contenteditable / rich-text editors: execCommand keeps their internal model in sync
    const sel = getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel?.removeAllRanges();
    sel?.addRange(range);
    const done = document.execCommand('insertText', false, text);
    if (!done) {
      el.textContent = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
    }
  }
  return { ok: true };
}

function nearbySubmit(el: HTMLElement): HTMLElement | null {
  let scope: HTMLElement | null = el;
  for (let i = 0; i < 3 && scope; i++, scope = scope.parentElement) {
    const btn = scope.querySelector<HTMLElement>(
      'button[type="submit"], input[type="submit"], button[aria-label*="search" i], button[title*="search" i], [role="button"][aria-label*="search" i]',
    );
    if (btn && isVisible(btn)) return btn;
  }
  return null;
}

/** Synthetic Enter does not submit forms by itself, so follow up with requestSubmit / submit button. */
export async function pressKey(el: HTMLElement | null, key: string): Promise<ActResult> {
  const target = el ?? (document.activeElement as HTMLElement | null) ?? document.body;
  const opts = { key, code: key === ' ' ? 'Space' : key, bubbles: true, cancelable: true, composed: true };
  const down = target.dispatchEvent(new KeyboardEvent('keydown', opts));
  target.dispatchEvent(new KeyboardEvent('keypress', opts));
  target.dispatchEvent(new KeyboardEvent('keyup', opts));

  if (key === 'Enter' && down && !(target instanceof HTMLTextAreaElement) && !(target instanceof HTMLButtonElement)) {
    const form = target.closest('form');
    const before = location.href;
    await sleep(150);
    if (location.href === before) {
      if (form) {
        try { form.requestSubmit(); } catch { form.submit(); }
        return { ok: true, detail: 'submitted form' };
      }
      const btn = nearbySubmit(target);
      if (btn) { btn.click(); return { ok: true, detail: 'clicked nearby submit' }; }
    }
  }
  return { ok: true };
}

function scrollContainer(): HTMLElement | null {
  let el = document.elementFromPoint(innerWidth / 2, innerHeight / 2) as HTMLElement | null;
  while (el && el !== document.body) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 4) return el;
    el = el.parentElement;
  }
  return null;
}

export async function scroll(direction: string, times: number): Promise<ActResult> {
  const doc = document.scrollingElement ?? document.documentElement;
  const canScrollPage = doc.scrollHeight > innerHeight + 4;
  const box: HTMLElement | null = canScrollPage ? null : scrollContainer();
  const surface = box ?? doc;
  const page = (box ? box.clientHeight : innerHeight) * 0.85;
  const startY = surface.scrollTop;

  for (let i = 0; i < times; i++) {
    const opts: ScrollToOptions = { behavior: 'instant' as ScrollBehavior };
    if (direction === 'top') opts.top = 0;
    else if (direction === 'bottom') opts.top = surface.scrollHeight;
    else if (direction === 'down') opts.top = surface.scrollTop + page;
    else if (direction === 'up') opts.top = surface.scrollTop - page;
    else if (direction === 'left') opts.left = surface.scrollLeft - page;
    else if (direction === 'right') opts.left = surface.scrollLeft + page;
    surface.scrollTo(opts);
    await sleep(250);
  }
  const moved = Math.round(Math.abs(surface.scrollTop - startY));
  return { ok: true, detail: moved ? `scrolled ${moved}px` : 'already at the edge' };
}

export async function reveal(el: HTMLElement): Promise<ActResult> {
  el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
  await sleep(100);
  highlight(el, '#f59e0b');
  return { ok: true };
}

export { formHintFor };
