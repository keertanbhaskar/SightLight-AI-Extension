import type { ElementInfo, RunSnapshot, Settings, Step } from './types';

/** Side panel -> service worker */
export type PanelRequest =
  | { type: 'agent/start'; instruction: string }
  | { type: 'agent/stop' }
  | { type: 'agent/state' }
  | { type: 'agent/confirm'; requestId: string; approved: boolean }
  | { type: 'settings/get' }
  | { type: 'settings/set'; patch: Partial<Settings> }
  | { type: 'auth/login'; email: string; password: string }
  | { type: 'auth/logout' }
  | { type: 'auth/status' };

/** Service worker -> side panel (broadcast) */
export type PanelEvent =
  | { type: 'run/update'; run: RunSnapshot }
  | { type: 'confirm/request'; requestId: string; message: string }
  | { type: 'voice/toggle' };

/** Service worker -> content script */
export type ContentRequest =
  | { type: 'ping' }
  | { type: 'resolve'; step: Step }
  | { type: 'act'; step: Step; elementId?: string };

export type ContentResponse =
  | { ok: true; pong: true }
  | { ok: true; element?: ElementInfo; alternatives?: ElementInfo[]; detail?: string }
  | { ok: false; error: string; retryable?: boolean };

export interface Reply<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export const ok = <T>(data?: T): Reply<T> => ({ ok: true, data });
export const fail = (error: string): Reply<never> => ({ ok: false, error });
