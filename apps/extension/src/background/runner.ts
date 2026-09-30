import { parseInstruction } from '@/agent/parser';
import { assessStep, checkLimits, type Target } from '@/agent/safety';
import type { PanelEvent } from '@/shared/messages';
import { getSettings } from '@/shared/storage';
import type { RunSnapshot, Settings, Step } from '@/shared/types';
import { syncRun } from './sync';
import { callContent, ensureContent, settle, sleep, waitForComplete } from './tab-utils';

const RUN_KEY = 'currentRun';
const CONFIRM_TIMEOUT_MS = 60_000;

interface Active {
  run: RunSnapshot;
  abort: AbortController;
  confirm?: { id: string; resolve: (ok: boolean) => void };
}

let active: Active | null = null;

function broadcast(event: PanelEvent): Promise<boolean> {
  return chrome.runtime.sendMessage(event).then(() => true, () => false);
}

async function publish(a: Active): Promise<void> {
  await chrome.storage.session.set({ [RUN_KEY]: a.run });
  await broadcast({ type: 'run/update', run: a.run });
}

export async function currentRun(): Promise<RunSnapshot | null> {
  if (active) return active.run;
  const r = await chrome.storage.session.get(RUN_KEY);
  const stored = (r[RUN_KEY] as RunSnapshot | undefined) ?? null;
  // The service worker can be killed mid-run; report that honestly instead of showing "running" forever.
  if (stored && (stored.status === 'running' || stored.status === 'awaiting_confirmation')) {
    stored.status = 'failed';
    stored.error = 'Run was interrupted (browser restarted the extension). Please retry.';
    stored.finishedAt = Date.now();
    await chrome.storage.session.set({ [RUN_KEY]: stored });
  }
  return stored;
}

export function stopRun(): boolean {
  if (!active) return false;
  active.confirm?.resolve(false);
  active.abort.abort();
  return true;
}

export function answerConfirmation(requestId: string, approved: boolean): void {
  if (active?.confirm?.id === requestId) active.confirm.resolve(approved);
}

export async function startRun(instruction: string): Promise<RunSnapshot> {
  if (active) throw new Error('A task is already running. Stop it first.');

  const parsed = parseInstruction(instruction);
  if (!parsed.steps.length) {
    throw new Error(parsed.unparsed.length
      ? `I couldn't understand: "${parsed.unparsed.join('", "')}". Try e.g. "click the login button" or "search for cats".`
      : 'Please enter an instruction.');
  }
  if (parsed.unparsed.length) {
    // Partial execution of a half-understood command is worse than asking again.
    throw new Error(`I understood part of that but not: "${parsed.unparsed.join('", "')}". Please rephrase.`);
  }

  const settings = await getSettings();
  if (parsed.steps.length > settings.maxSteps) {
    throw new Error(`That is ${parsed.steps.length} steps; the limit is ${settings.maxSteps} (change it in Settings).`);
  }

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error('No active tab found');
  const steps = [...parsed.steps];
  const regularPage = /^https?:/i.test(tab.url ?? '');
  const firstStep = steps[0];
  if (!regularPage && firstStep?.kind === 'type' && firstStep.target === 'search' && firstStep.submit) {
    const url = new URL('https://www.google.com/search');
    url.searchParams.set('q', firstStep.text);
    steps[0] = { kind: 'navigate', url: url.toString(), label: `Search the web for "${firstStep.text}"` };
  }

  const needsPage = steps[0]?.kind !== 'navigate';
  if (needsPage && !/^https?:/i.test(tab.url ?? '')) {
    throw new Error('Edge protects New Tab and browser pages from extension control. Say "go to <site>" or "search for <words>" first, then run page actions.');
  }

  const run: RunSnapshot = {
    id: `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    instruction, status: 'running', steps, currentStep: 0, log: [],
    startedAt: Date.now(), tabId: tab.id,
  };
  active = { run, abort: new AbortController() };
  void execute(active, settings); // fire and forget; progress arrives via run/update
  await publish(active);
  return run;
}

async function execute(a: Active, settings: Settings): Promise<void> {
  const { run, abort } = a;
  try {
    for (let i = 0; i < run.steps.length; i++) {
      if (abort.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const limit = checkLimits(i, Date.now() - run.startedAt, { maxSteps: settings.maxSteps, maxRuntimeSec: settings.maxRuntime });
      if (limit) throw new Error(limit);

      run.currentStep = i;
      await publish(a);
      const step = run.steps[i]!;
      try {
        const detail = await runStep(a, step, settings);
        run.log.push({ index: i, label: step.label, ok: true, detail, at: Date.now() });
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') throw e;
        const msg = e instanceof Error ? e.message : String(e);
        run.log.push({ index: i, label: step.label, ok: false, detail: msg, at: Date.now() });
        throw new Error(`Step ${i + 1} ("${step.label}") failed: ${msg}`);
      }
    }
    run.currentStep = run.steps.length;
    run.status = 'completed';
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      run.status = 'stopped';
    } else {
      run.status = 'failed';
      run.error = e instanceof Error ? e.message : String(e);
    }
  } finally {
    run.finishedAt = Date.now();
    await publish(a);
    active = null;
    void syncRun(run);
  }
}

async function confirmWithUser(a: Active, message: string): Promise<boolean> {
  const id = `c_${Math.random().toString(36).slice(2, 10)}`;
  a.run.status = 'awaiting_confirmation';
  await publish(a);
  const delivered = await broadcast({ type: 'confirm/request', requestId: id, message });
  if (!delivered) {
    a.run.status = 'running';
    throw new Error('Confirmation needed but the SightLite panel is closed. Open it and retry.');
  }
  const approved = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), CONFIRM_TIMEOUT_MS);
    a.confirm = { id, resolve: (ok) => { clearTimeout(timer); resolve(ok); } };
  });
  a.confirm = undefined;
  a.run.status = 'running';
  await publish(a);
  return approved;
}

async function guard(a: Active, step: Step, target: Target | undefined, settings: Settings): Promise<void> {
  const verdict = assessStep(step, target);
  if (verdict.level === 'block') throw new Error(`Blocked for safety: ${verdict.reason}`);
  if (verdict.level === 'confirm' && settings.requireConfirmation) {
    const what = target?.label ? `"${target.label}"` : step.label;
    const ok = await confirmWithUser(a, `${verdict.reason}\nTarget: ${what}\nAllow this action?`);
    if (!ok) throw new Error('Action was not approved');
  }
}

async function runStep(a: Active, step: Step, settings: Settings): Promise<string | undefined> {
  const { tabId } = a.run;
  const signal = a.abort.signal;

  switch (step.kind) {
    case 'navigate': {
      await guard(a, step, undefined, settings);
      await chrome.tabs.update(tabId, { url: step.url });
      await sleep(150, signal);
      await waitForComplete(tabId, 20_000, signal);
      await sleep(400, signal);
      return undefined;
    }
    case 'back': {
      await chrome.tabs.goBack(tabId).catch(() => { throw new Error('No page to go back to'); });
      await sleep(200, signal);
      await waitForComplete(tabId, 15_000, signal);
      return undefined;
    }
    case 'reload': {
      await chrome.tabs.reload(tabId);
      await sleep(200, signal);
      await waitForComplete(tabId, 15_000, signal);
      return undefined;
    }
    case 'wait':
      await sleep(step.ms, signal);
      return undefined;
  }

  // Everything below talks to the page
  await ensureContent(tabId, signal);
  const urlBefore = (await chrome.tabs.get(tabId)).url;

  let elementId: string | undefined;
  let target: Target | undefined;

  if (step.kind === 'click' || step.kind === 'type' || step.kind === 'find' || step.kind === 'press') {
    const attempts = step.kind === 'press' ? 1 : 3;
    let lastError = 'Element not found';
    for (let n = 0; n < attempts; n++) {
      const r = await callContent(tabId, { type: 'resolve', step });
      if (r.ok) {
        if ('element' in r && r.element) {
          elementId = r.element.id;
          target = { label: r.element.label, tag: r.element.tag, role: r.element.role, href: r.element.href,
            inputType: r.element.inputType, autocomplete: r.element.autocomplete, formHint: r.element.formHint };
        }
        lastError = '';
        break;
      }
      lastError = r.error;
      if (!r.retryable) break;
      // Dynamic pages: wait for content, then look further down the page.
      await sleep(700, signal);
      if (n >= 1) await callContent(tabId, { type: 'act', step: { kind: 'scroll', direction: 'down', times: 1, label: 'scroll' } });
    }
    if (lastError) throw new Error(lastError);
  }

  await guard(a, step, target, settings);
  const r = await callContent(tabId, { type: 'act', step, elementId });
  if (!r.ok) throw new Error(r.error);

  if (step.kind === 'click' || step.kind === 'type' || step.kind === 'press') await settle(tabId, urlBefore, signal);
  const detail = 'detail' in r ? r.detail : undefined;
  return target ? `${target.label}${detail ? ` – ${detail}` : ''}` : detail;
}
