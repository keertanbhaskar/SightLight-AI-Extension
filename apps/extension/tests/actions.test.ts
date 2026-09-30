import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as actions from '@/content/actions';

/** jsdom has no layout: give elements a box and make hit-testing return the element itself. */
function layout(el: HTMLElement) {
  el.getBoundingClientRect = () => ({ left: 10, top: 10, width: 100, height: 30, right: 110, bottom: 40, x: 10, y: 10, toJSON() {} }) as DOMRect;
  (el as HTMLElement & { checkVisibility: () => boolean }).checkVisibility = () => true;
  el.scrollIntoView = () => {};
  document.elementFromPoint = () => el;
}

if (typeof globalThis.PointerEvent === 'undefined') {
  (globalThis as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = class extends MouseEvent {} as typeof MouseEvent;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('click', () => {
  it('fires exactly one click event', async () => {
    const b = document.createElement('button'); document.body.append(b); layout(b);
    const spy = vi.fn(); b.addEventListener('click', spy);
    expect((await actions.click(b)).ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('toggles a checkbox once (old executor toggled it twice = no change)', async () => {
    const c = document.createElement('input'); c.type = 'checkbox'; document.body.append(c); layout(c);
    await actions.click(c);
    expect(c.checked).toBe(true);
  });
  it('does not double-submit a form', async () => {
    document.body.innerHTML = '<form><button type="submit">Go</button></form>';
    const form = document.querySelector('form')!; const btn = document.querySelector('button')!; layout(btn);
    const submit = vi.fn((e: Event) => e.preventDefault()); form.addEventListener('submit', submit);
    await actions.click(btn);
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it('refuses disabled and covered elements', async () => {
    const b = document.createElement('button'); b.disabled = true; document.body.append(b); layout(b);
    expect((await actions.click(b)).error).toMatch(/disabled/);
    const b2 = document.createElement('button'); const cover = document.createElement('div');
    document.body.append(b2, cover); layout(b2); document.elementFromPoint = () => cover;
    expect((await actions.click(b2)).error).toMatch(/covered/);
  });
});

describe('type', () => {
  it('bypasses an instance-level value tracker (how React/Vue intercept plain assignment)', async () => {
    const i = document.createElement('input'); document.body.append(i); layout(i);
    const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
    let trackerWrites = 0;
    Object.defineProperty(i, 'value', {
      get() { return native.get!.call(i); },
      set(v: string) { trackerWrites++; native.set!.call(i, v); },
      configurable: true,
    });
    const events: string[] = [];
    i.addEventListener('input', () => events.push('input'));
    expect((await actions.type(i, 'hello')).ok).toBe(true);
    expect(trackerWrites).toBe(0); // proto setter used, so the framework still sees a change on `input`
    expect(native.get!.call(i)).toBe('hello');
    expect(events).toContain('input');
  });
  it('replaces existing text and dispatches input + change', async () => {
    const i = document.createElement('input'); i.value = 'old'; document.body.append(i); layout(i);
    const seen: string[] = [];
    ['input', 'change'].forEach((t) => i.addEventListener(t, () => seen.push(t)));
    await actions.type(i, 'new text');
    expect(i.value).toBe('new text');
    expect(seen).toEqual(['input', 'change']);
  });
  it('rejects non-editable targets', async () => {
    const d = document.createElement('div'); document.body.append(d); layout(d);
    expect((await actions.type(d, 'x')).ok).toBe(false);
  });
});

describe('pressKey Enter', () => {
  it('submits the enclosing form exactly once', async () => {
    document.body.innerHTML = '<form><input id="q"></form>';
    const input = document.getElementById('q') as HTMLInputElement; layout(input);
    const form = document.querySelector('form')!; form.requestSubmit = () => form.dispatchEvent(new Event('submit', { cancelable: true }));
    const submit = vi.fn((e: Event) => e.preventDefault()); form.addEventListener('submit', submit);
    const r = await actions.pressKey(input, 'Enter');
    expect(r.detail).toBe('submitted form');
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it('does not submit when the page handled keydown itself', async () => {
    document.body.innerHTML = '<form><input id="q"></form>';
    const input = document.getElementById('q') as HTMLInputElement;
    input.addEventListener('keydown', (e) => e.preventDefault());
    const form = document.querySelector('form')!; const rs = vi.fn(); form.requestSubmit = rs;
    await actions.pressKey(input, 'Enter');
    expect(rs).not.toHaveBeenCalled();
  });
});
