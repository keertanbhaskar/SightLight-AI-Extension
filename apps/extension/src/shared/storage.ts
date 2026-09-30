import { DEFAULT_SETTINGS, type Settings } from './types';

const SETTINGS_KEY = 'settings';
const AUTH_KEY = 'auth';

export interface AuthTokens {
  access: string;
  refresh: string;
}

export async function getSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(SETTINGS_KEY);
  return sanitizeSettings({ ...DEFAULT_SETTINGS, ...(r[SETTINGS_KEY] as Partial<Settings> | undefined) });
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = sanitizeSettings({ ...(await getSettings()), ...patch });
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

/** Clamp untrusted/legacy values so the agent can never run unbounded. */
export function sanitizeSettings(s: Settings): Settings {
  const clamp = (n: unknown, lo: number, hi: number, d: number) =>
    typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d;
  let backendUrl = (s.backendUrl ?? '').trim().replace(/\/+$/, '');
  if (backendUrl && !/^https?:\/\//i.test(backendUrl)) backendUrl = '';
  return {
    maxSteps: clamp(s.maxSteps, 1, 100, DEFAULT_SETTINGS.maxSteps),
    maxRuntime: clamp(s.maxRuntime, 5, 600, DEFAULT_SETTINGS.maxRuntime),
    requireConfirmation: s.requireConfirmation !== false,
    voiceLang: s.voiceLang || DEFAULT_SETTINGS.voiceLang,
    voiceAutoRun: s.voiceAutoRun === true,
    backendUrl,
  };
}

export async function getAuth(): Promise<AuthTokens | null> {
  const r = await chrome.storage.local.get(AUTH_KEY);
  return (r[AUTH_KEY] as AuthTokens | undefined) ?? null;
}
export const setAuth = (t: AuthTokens) => chrome.storage.local.set({ [AUTH_KEY]: t });
export const clearAuth = () => chrome.storage.local.remove(AUTH_KEY);
