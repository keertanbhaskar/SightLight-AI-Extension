import { beforeAll, describe, expect, it } from 'vitest';
import type { ContentRequest, ContentResponse } from '@/shared/messages';
import type { Step } from '@/shared/types';
import { parseInstruction } from '@/agent/parser';

type Listener = (m: ContentRequest, s: unknown, send: (r: ContentResponse) => void) => boolean;
let listener: Listener;
const send = (req: ContentRequest) => new Promise<ContentResponse>((res) => listener(req, {}, res));
const step = (text: string): Step => parseInstruction(text).steps[0]!;

const PAGE = `
<header><nav><a href="/home">Home</a><a href="/about">About</a></nav>
  <form role="search" action="/search"><input name="q" aria-label="Search"><button type="submit">Search</button></form></header>
<main>
  <a href="/r1"><h3>React tutorial for beginners</h3></a>
  <a href="/r1"><img alt="React tutorial for beginners"></a>
  <a href="/r2"><h3>Advanced React patterns</h3></a>
  <a href="/r3"><h3>React hooks deep dive</h3></a>
  <form><label for="em">Email address</label><input id="em" type="email">
    <label><input type="checkbox" id="news"> Subscribe to newsletter</label>
    <button type="button">Buy now</button><button type="submit">Create account</button></form>
</main>
<footer><a href="/privacy">Privacy policy</a></footer>`;

beforeAll(async () => {
  document.body.innerHTML = PAGE;
  // jsdom has no layout engine: give every element a visible box
  Element.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: 120, height: 24, right: 120, bottom: 24, x: 0, y: 0, toJSON() {} } as DOMRect;
  };
  (HTMLElement.prototype as unknown as { checkVisibility: () => boolean }).checkVisibility = () => true;
  HTMLElement.prototype.scrollIntoView = () => {};
  (globalThis as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent ??= class extends MouseEvent {} as typeof MouseEvent;
  document.elementFromPoint = () => null; // not implemented by jsdom (always present in Chrome)
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { onMessage: { addListener: (l: Listener) => { listener = l; } } },
  };
  await import('@/content/content-script');
});

describe('content script on a realistic page', () => {
  it('search box: picks the input, not the Search button', async () => {
    const r = await send({ type: 'resolve', step: step('search for react') });
    expect(r).toMatchObject({ ok: true, element: { tag: 'input', editable: true } });
  });
  it('"type X in the email field" resolves through the <label for>', async () => {
    const r = await send({ type: 'resolve', step: step('type bob@x.com in the email field') });
    expect(r).toMatchObject({ ok: true, element: { tag: 'input', inputType: 'email' } });
  });
  it('first / last result skip nav+footer and the duplicate thumbnail link', async () => {
    const first = await send({ type: 'resolve', step: step('click the first result') });
    const last = await send({ type: 'resolve', step: step('click the last result') });
    expect(first).toMatchObject({ ok: true, element: { href: expect.stringContaining('/r1') } });
    expect(last).toMatchObject({ ok: true, element: { href: expect.stringContaining('/r3') } });
  });
  it('resolves a labelled button and exposes its label for the safety check', async () => {
    const r = await send({ type: 'resolve', step: step('click the buy now button') });
    expect(r).toMatchObject({ ok: true, element: { label: 'Buy now' } });
  });
  it('a missing element is a retryable error, with near-miss hints', async () => {
    const r = await send({ type: 'resolve', step: step('click the flux capacitor') });
    expect(r).toMatchObject({ ok: false, retryable: true });
  });
  it('acts on a resolved element exactly once (checkbox)', async () => {
    const r = await send({ type: 'resolve', step: step('click the subscribe to newsletter checkbox') });
    expect(r.ok).toBe(true);
    const id = (r as { element: { id: string } }).element.id;
    const a = await send({ type: 'act', step: step('click the subscribe to newsletter checkbox'), elementId: id });
    expect(a.ok).toBe(true);
    expect((document.getElementById('news') as HTMLInputElement).checked).toBe(true);
  });
  it('typing goes through resolve -> act and lands in the field', async () => {
    const s = step('type bob@x.com in the email field');
    const r = await send({ type: 'resolve', step: s });
    await send({ type: 'act', step: s, elementId: (r as { element: { id: string } }).element.id });
    expect((document.getElementById('em') as HTMLInputElement).value).toBe('bob@x.com');
  });
  it('a stale element id fails cleanly instead of throwing', async () => {
    const r = await send({ type: 'act', step: step('click login'), elementId: 'sl-9999' });
    expect(r).toMatchObject({ ok: false, retryable: true });
  });
});
