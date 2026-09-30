import type { PanelRequest, Reply } from '@/shared/messages';
import { fail, ok } from '@/shared/messages';
import { clearAuth, getSettings, setSettings } from '@/shared/storage';
import { answerConfirmation, currentRun, startRun, stopRun } from './runner';
import { flushQueue, isSignedIn, login } from './sync';

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
chrome.runtime.onStartup.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  void flushQueue();
});

// Alt+Shift+V: open the panel and start listening (a keyboard command counts as a user gesture).
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'toggle-voice' || !tab?.windowId) return;
  chrome.sidePanel.open({ windowId: tab.windowId })
    .then(() => new Promise((r) => setTimeout(r, 400)))
    .then(() => chrome.runtime.sendMessage({ type: 'voice/toggle' }))
    .catch(() => undefined);
});

async function handle(req: PanelRequest): Promise<Reply> {
  switch (req.type) {
    case 'agent/start':
      return ok(await startRun(req.instruction));
    case 'agent/stop':
      return ok(stopRun());
    case 'agent/state':
      return ok(await currentRun());
    case 'agent/confirm':
      answerConfirmation(req.requestId, req.approved);
      return ok();
    case 'settings/get':
      return ok(await getSettings());
    case 'settings/set':
      return ok(await setSettings(req.patch));
    case 'auth/login':
      await login(req.email, req.password);
      return ok(true);
    case 'auth/logout':
      await clearAuth();
      return ok(true);
    case 'auth/status':
      return ok(await isSignedIn());
    default:
      return fail('Unknown request');
  }
}

const PANEL_TYPES = new Set([
  'agent/start', 'agent/stop', 'agent/state', 'agent/confirm', 'settings/get', 'settings/set',
  'auth/login', 'auth/logout', 'auth/status',
]);

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  // Only handle our protocol, only from our own extension pages (never from web pages or other extensions).
  if (sender.id !== chrome.runtime.id) return false;
  const type = (msg as { type?: string } | null)?.type;
  if (!type || !PANEL_TYPES.has(type)) return false; // stay silent so other listeners can answer
  handle(msg as PanelRequest)
    .then(sendResponse)
    .catch((e: unknown) => sendResponse(fail(e instanceof Error ? e.message : String(e))));
  return true;
});
