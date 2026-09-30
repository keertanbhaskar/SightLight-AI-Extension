import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentRequest } from '@/shared/messages';
import type { RunSnapshot } from '@/shared/types';

type Runner = typeof import('@/background/runner');

const tab = { id: 1, status: 'complete', url: 'https://shop.test/' };
let events: Array<{ type: string; requestId?: string; run?: RunSnapshot }>;
let contentCalls: ContentRequest[];
let elements: Record<string, { label: string; href?: string }>;
let panelOpen: boolean;
let store: Record<string, unknown>;

function installChrome() {
  events = []; contentCalls = []; panelOpen = true; store = {};
  Object.assign(tab, { status: 'complete', url: 'https://shop.test/' });
  elements = { login: { label: 'Log in' }, 'buy now': { label: 'Buy now' } };
  const local = { get: async () => store, set: async (o: object) => { Object.assign(store, o); }, remove: async () => {} };
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: { local, session: { get: async () => store, set: async (o: object) => { Object.assign(store, o); } } },
    runtime: {
      id: 'ext',
      sendMessage: async (m: (typeof events)[number]) => { if (!panelOpen) throw new Error('no receiver'); events.push(m); },
    },
    tabs: {
      query: async () => [{ ...tab }],
      get: async () => ({ ...tab }),
      update: async (_id: number, p: { url: string }) => { tab.url = p.url; },
      goBack: async () => {}, reload: async () => {},
      onUpdated: { addListener: () => {}, removeListener: () => {} },
      sendMessage: async (_id: number, req: ContentRequest) => {
        contentCalls.push(req);
        if (req.type === 'ping') return { ok: true, pong: true };
        if (req.type === 'resolve') {
          const s = req.step;
          if (s.kind === 'click') {
            const el = elements[s.target];
            return el ? { ok: true, element: { id: 'sl-1', label: el.label, role: 'button', tag: 'button', editable: false, score: 0.9, href: el.href } }
                      : { ok: false, error: `No matching element for "${s.target}"`, retryable: true };
          }
          if (s.kind === 'type') return { ok: true, element: { id: 'sl-2', label: 'Search', role: 'searchbox', tag: 'input', editable: true, score: 1, inputType: 'search' } };
          return { ok: true };
        }
        return { ok: true, detail: 'done' };
      },
    },
    scripting: { executeScript: async () => {} },
  };
}

const finalRun = () => [...events].reverse().find((e) => e.type === 'run/update')!.run!;
const settled = async () => { await vi.advanceTimersByTimeAsync(60_000); };

let runner: Runner;
beforeEach(async () => { vi.useFakeTimers(); installChrome(); vi.resetModules(); runner = await import('@/background/runner'); });
afterEach(() => vi.useRealTimers());

describe('runner', () => {
  it('runs a multi-step plan to completion', async () => {
    await runner.startRun('click login then scroll down');
    await settled();
    const run = finalRun();
    expect(run.status).toBe('completed');
    expect(run.log.map((l) => l.ok)).toEqual([true, true]);
    expect(contentCalls.filter((c) => c.type === 'act')).toHaveLength(2);
  });

  it('starts from a non-web tab when the first step is navigation, and survives it', async () => {
    tab.url = 'chrome://newtab/';
    await runner.startRun('go to shop.test then click login');
    await settled();
    expect(finalRun().status).toBe('completed');
    expect(tab.url).toBe('https://shop.test/');
  });

  it('opens search results when searching from a browser New Tab page', async () => {
    tab.url = 'edge://newtab/';
    await runner.startRun('search for cats');
    await settled();
    expect(finalRun().status).toBe('completed');
    expect(tab.url).toBe('https://www.google.com/search?q=cats');
    expect(contentCalls).toHaveLength(0);
  });

  it('refuses instructions it only partly understands instead of half-running them', async () => {
    await expect(runner.startRun('click login then dance wildly')).rejects.toThrow(/dance wildly/);
    expect(contentCalls).toHaveLength(0);
  });

  it('refuses page actions on chrome:// pages', async () => {
    tab.url = 'chrome://settings';
    await expect(runner.startRun('click login')).rejects.toThrow(/Edge protects New Tab and browser pages/);
  });

  it('FAILS (never "completes") when the target is not on the page', async () => {
    await runner.startRun('click unicorn');
    await settled();
    const run = finalRun();
    expect(run.status).toBe('failed');
    expect(run.error).toMatch(/unicorn/);
  });

  it('asks before a risky click; deny -> failed, action never sent', async () => {
    await runner.startRun('click buy now');
    await vi.advanceTimersByTimeAsync(2000);
    const req = events.find((e) => e.type === 'confirm/request')!;
    expect(req).toBeTruthy();
    expect(finalRun().status).toBe('awaiting_confirmation');
    runner.answerConfirmation(req.requestId!, false);
    await settled();
    expect(finalRun().status).toBe('failed');
    expect(finalRun().error).toMatch(/not approved/);
    expect(contentCalls.some((c) => c.type === 'act' && c.step.kind === 'click')).toBe(false);
  });

  it('approve -> the click is performed', async () => {
    await runner.startRun('click buy now');
    await vi.advanceTimersByTimeAsync(2000);
    runner.answerConfirmation(events.find((e) => e.type === 'confirm/request')!.requestId!, true);
    await settled();
    expect(finalRun().status).toBe('completed');
  });

  it('fails safe when confirmation is needed but the panel is closed', async () => {
    panelOpen = false;
    await runner.startRun('click buy now');
    await settled();
    const run = (store.currentRun as RunSnapshot);
    expect(run.status).toBe('failed');
    expect(run.error).toMatch(/panel is closed/);
  });

  it('a search is typed and submitted in one step', async () => {
    await runner.startRun('search for cats');
    await settled();
    const act = contentCalls.find((c) => c.type === 'act')!;
    expect(act).toMatchObject({ step: { kind: 'type', text: 'cats', submit: true } });
  });

  it('Stop aborts a running task', async () => {
    await runner.startRun('wait 20 seconds then click login');
    await vi.advanceTimersByTimeAsync(1000);
    expect(runner.stopRun()).toBe(true);
    await settled();
    expect(finalRun().status).toBe('stopped');
    expect(contentCalls.some((c) => c.type === 'act')).toBe(false);
  });

  it('rejects a second concurrent run', async () => {
    await runner.startRun('wait 5 seconds');
    await expect(runner.startRun('click login')).rejects.toThrow(/already running/);
    await settled();
  });

  it('reports an interrupted run honestly after a service-worker restart', async () => {
    store.currentRun = { id: 'r', status: 'running', steps: [], log: [], instruction: 'x', currentStep: 0, startedAt: 1, tabId: 1 };
    const run = await runner.currentRun();
    expect(run?.status).toBe('failed');
    expect(run?.error).toMatch(/interrupted/i);
  });
});
