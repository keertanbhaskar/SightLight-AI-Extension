import type { PanelRequest, Reply } from '@/shared/messages';

export async function call<T = unknown>(req: PanelRequest): Promise<T> {
  const res = (await chrome.runtime.sendMessage(req)) as Reply<T> | undefined;
  if (!res) throw new Error('Extension background is not responding');
  if (!res.ok) throw new Error(res.error ?? 'Request failed');
  return res.data as T;
}
