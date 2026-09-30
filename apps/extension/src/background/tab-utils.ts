import type { ContentRequest, ContentResponse } from '@/shared/messages';

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });

export async function waitForComplete(tabId: number, timeoutMs = 15_000, signal?: AbortSignal): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === 'complete') return;
  await new Promise<void>((resolve) => {
    const done = () => { chrome.tabs.onUpdated.removeListener(onUpdated); clearTimeout(timer); resolve(); };
    const onUpdated = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') done();
    };
    const timer = setTimeout(done, timeoutMs); // a slow page must not hang the run forever
    signal?.addEventListener('abort', done, { once: true });
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

/** Content script is auto-injected on load; tabs opened before install need explicit injection. */
export async function ensureContent(tabId: number, signal?: AbortSignal): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const r = (await chrome.tabs.sendMessage(tabId, { type: 'ping' } satisfies ContentRequest)) as ContentResponse | undefined;
      if (r?.ok) return;
    } catch {
      if (attempt === 1) {
        try {
          await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
        } catch (e) {
          throw new Error(`Cannot access this page (${e instanceof Error ? e.message : 'restricted'}). Try a regular http(s) page.`);
        }
      }
    }
    await sleep(250, signal);
  }
  throw new Error('Page did not become ready (content script unreachable)');
}

export async function callContent(tabId: number, req: ContentRequest): Promise<ContentResponse> {
  try {
    const r = (await chrome.tabs.sendMessage(tabId, req)) as ContentResponse | undefined;
    return r ?? { ok: false, error: 'No response from page' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), retryable: true };
  }
}

/**
 * After an action, detect whether it triggered a navigation (link click, form submit, Enter) and wait for it.
 * This is what lets multi-page tasks work: the run lives here, not in the page that just unloaded.
 */
export async function settle(tabId: number, urlBefore: string | undefined, signal?: AbortSignal): Promise<void> {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    const t = await chrome.tabs.get(tabId);
    if (t.status === 'loading' || (urlBefore && t.url && t.url !== urlBefore)) {
      await waitForComplete(tabId, 15_000, signal);
      await sleep(400, signal); // let SPA frameworks render
      return;
    }
    await sleep(100, signal);
  }
  await sleep(250, signal);
}
