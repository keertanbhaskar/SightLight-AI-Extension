/** Domain types shared by service worker, content script and UI. */

export type Direction = 'up' | 'down' | 'left' | 'right' | 'top' | 'bottom';

/** One atomic thing the agent can do. Produced by the parser, executed by the orchestrator. */
export type Step =
  | { kind: 'navigate'; url: string; label: string }
  | { kind: 'click'; target: string; ordinal?: number; role?: string; label: string }
  | { kind: 'type'; target?: string; text: string; submit: boolean; label: string }
  | { kind: 'press'; key: string; label: string }
  | { kind: 'scroll'; direction: Direction; times: number; label: string }
  | { kind: 'wait'; ms: number; label: string }
  | { kind: 'back'; label: string }
  | { kind: 'reload'; label: string }
  | { kind: 'find'; target: string; label: string };

export type StepKind = Step['kind'];

export interface ParseResult {
  steps: Step[];
  /** Clauses we could not understand. Never silently guessed. */
  unparsed: string[];
  /** The cleaned instruction after voice/filler normalisation. */
  normalized: string;
}

export type RunStatus =
  | 'idle'
  | 'running'
  | 'awaiting_confirmation'
  | 'completed'
  | 'stopped'
  | 'failed';

export interface StepLog {
  index: number;
  label: string;
  ok: boolean;
  detail?: string;
  at: number;
}

export interface RunSnapshot {
  id: string;
  instruction: string;
  status: RunStatus;
  steps: Step[];
  currentStep: number;
  log: StepLog[];
  startedAt: number;
  finishedAt?: number;
  error?: string;
  tabId: number;
}

export interface ElementInfo {
  id: string;
  label: string;
  role: string;
  tag: string;
  href?: string;
  inputType?: string;
  autocomplete?: string;
  /** Submit-button text / form action Enter would trigger (for safety checks). */
  formHint?: string;
  editable: boolean;
  score: number;
}

export interface Settings {
  maxSteps: number;
  /** seconds */
  maxRuntime: number;
  requireConfirmation: boolean;
  voiceLang: string;
  /** Run voice commands immediately after recognition ends. */
  voiceAutoRun: boolean;
  /** Empty string disables backend sync. */
  backendUrl: string;
}

export const DEFAULT_SETTINGS: Settings = {
  maxSteps: 20,
  maxRuntime: 120,
  requireConfirmation: true,
  voiceLang: 'en-US',
  voiceAutoRun: false,
  backendUrl: '',
};
