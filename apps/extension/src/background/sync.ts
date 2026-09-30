import { clearAuth, getAuth, getSettings, setAuth } from '@/shared/storage';
import type { RunSnapshot } from '@/shared/types';

/**
 * Optional backend sync. A finished run is uploaded as task -> execution -> actions.
 * Failures are queued in chrome.storage.local and retried (bounded).
 */
const QUEUE_KEY = 'syncQueue';
const MAX_QUEUE = 50;

interface Http { ok: boolean; status: number; json: unknown }

async function http(base: string, method: string, path: string, body?: unknown, token?: string): Promise<Http> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = res.status === 204 ? null : await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

async function authed(base: string, method: string, path: string, body?: unknown): Promise<Http> {
  const auth = await getAuth();
  if (!auth) throw new Error('Not signed in to backend');
  let r = await http(base, method, path, body, auth.access);
  if (r.status === 401) {
    const rr = await http(base, 'POST', '/api/auth/refresh', { refresh_token: auth.refresh });
    const access = (rr.json as { access_token?: string } | null)?.access_token;
    if (!rr.ok || !access) {
      await clearAuth();
      throw new Error('Session expired, please sign in again');
    }
    await setAuth({ access, refresh: auth.refresh });
    r = await http(base, method, path, body, access);
  }
  return r;
}

const must = (r: Http, what: string) => {
  if (!r.ok) throw new Error(`${what} failed (${r.status})`);
  return r.json as Record<string, unknown>;
};

export async function login(email: string, password: string): Promise<void> {
  const { backendUrl } = await getSettings();
  if (!backendUrl) throw new Error('Set a backend URL first');
  const r = await http(backendUrl, 'POST', '/api/auth/login', { email, password });
  const j = r.json as { access_token?: string; refresh_token?: string; detail?: string } | null;
  if (!r.ok || !j?.access_token || !j.refresh_token) throw new Error(j?.detail ?? `Login failed (${r.status})`);
  await setAuth({ access: j.access_token, refresh: j.refresh_token });
  await flushQueue();
}

export async function isSignedIn(): Promise<boolean> {
  return (await getAuth()) !== null;
}

const iso = (ms: number) => new Date(ms).toISOString();

async function upload(base: string, run: RunSnapshot): Promise<void> {
  const finished = run.finishedAt ?? Date.now();
  const taskStatus = run.status === 'completed' ? 'completed' : run.status === 'stopped' ? 'stopped' : 'failed';
  const execState = run.status === 'completed' ? 'completed' : run.status === 'stopped' ? 'stopped' : 'error';

  const task = must(await authed(base, 'POST', '/api/tasks', { instruction: run.instruction.slice(0, 1000) }), 'Create task');
  const taskId = String(task.id);
  must(await authed(base, 'PATCH', `/api/tasks/${taskId}`, {
    status: taskStatus, started_at: iso(run.startedAt), completed_at: iso(finished),
    duration_ms: finished - run.startedAt, steps_count: run.log.length,
  }), 'Update task');

  const exec = must(await authed(base, 'POST', `/api/executions/tasks/${taskId}/executions`, { state: 'idle' }), 'Create execution');
  const execId = String(exec.id);
  must(await authed(base, 'PATCH', `/api/executions/${execId}`, {
    state: execState, completed_at: iso(finished), duration_ms: finished - run.startedAt,
    ...(run.error ? { error_message: run.error.slice(0, 2000) } : {}),
  }), 'Update execution');

  for (const entry of run.log) {
    const step = run.steps[entry.index];
    must(await authed(base, 'POST', `/api/executions/${execId}/actions`, {
      action_type: step?.kind ?? 'observe',
      target_label: entry.label.slice(0, 500),
      perception_source: 'dom',
      status: entry.ok ? 'success' : 'failed',
      metadata: { detail: entry.detail ?? null, at: entry.at },
    }), 'Record action');
  }
}

async function readQueue(): Promise<RunSnapshot[]> {
  const r = await chrome.storage.local.get(QUEUE_KEY);
  return (r[QUEUE_KEY] as RunSnapshot[] | undefined) ?? [];
}

export async function flushQueue(): Promise<void> {
  const { backendUrl } = await getSettings();
  if (!backendUrl || !(await isSignedIn())) return;
  const queue = await readQueue();
  const remaining: RunSnapshot[] = [];
  for (const run of queue) {
    try { await upload(backendUrl, run); } catch { remaining.push(run); }
  }
  await chrome.storage.local.set({ [QUEUE_KEY]: remaining });
}

export async function syncRun(run: RunSnapshot): Promise<void> {
  const { backendUrl } = await getSettings();
  if (!backendUrl || !(await isSignedIn())) return;
  try {
    await upload(backendUrl, run);
  } catch (e) {
    console.warn('[sightlite] sync failed, queued:', e);
    const queue = await readQueue();
    await chrome.storage.local.set({ [QUEUE_KEY]: [...queue, run].slice(-MAX_QUEUE) });
  }
}
