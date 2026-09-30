import type { Step } from '@/shared/types';

export type Verdict =
  | { level: 'safe' }
  | { level: 'confirm'; reason: string }
  | { level: 'block'; reason: string };

/** What the content script tells us about the element a step will touch. */
export interface Target {
  label: string;
  tag?: string;
  role?: string;
  href?: string;
  inputType?: string;
  autocomplete?: string;
  /** Text of the submit button / action of the form an Enter press would submit. */
  formHint?: string;
}

/**
 * Word-boundary patterns. The old implementation used substring matching, so "border"
 * matched "order", "sender" matched "send" and "Postgres" matched "post".
 */
const HIGH_IMPACT: Array<[RegExp, string]> = [
  [/\b(?:buy|buy now|purchase|checkout|check out|place (?:your )?order|order now|confirm (?:your )?order|complete (?:your )?(?:order|purchase)|pay|pay now|payment|proceed to pay)\b/i, 'purchase or payment'],
  [/\b(?:delete|remove|erase|destroy|trash|discard|clear all|empty (?:trash|cart))\b/i, 'deletion'],
  [/\b(?:log ?out|sign ?out|deactivate|close account|delete account|change password|reset password)\b/i, 'account or session change'],
  [/\b(?:transfer|withdraw|wire|send money|invest)\b/i, 'financial transaction'],
  [/\b(?:unsubscribe|cancel (?:subscription|membership|order|account|plan))\b/i, 'cancellation'],
  [/\b(?:send|send message|send email|reply all|post|publish|tweet|submit|share)\b/i, 'sends or publishes content'],
  [/\b(?:confirm|approve|authorize|accept and pay|i agree)\b/i, 'confirmation'],
];

const HREF_RISK = /(?:\/|=)(?:logout|signout|sign-out|log-out|delete|remove|checkout|payment|pay|unsubscribe|purchase)(?:[/?#&=]|$)/i;

const SENSITIVE_AUTOCOMPLETE = /^(?:cc-|current-password|new-password|one-time-code)/i;

export function assessStep(step: Step, target?: Target): Verdict {
  switch (step.kind) {
    case 'navigate': {
      let u: URL;
      try {
        u = new URL(step.url);
      } catch {
        return { level: 'block', reason: 'Invalid URL' };
      }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return { level: 'block', reason: `Blocked ${u.protocol} URL` };
      }
      return { level: 'safe' };
    }

    case 'type': {
      if (target?.inputType === 'password' || SENSITIVE_AUTOCOMPLETE.test(target?.autocomplete ?? '')) {
        return { level: 'confirm', reason: 'Typing into a password / payment field' };
      }
      // "search ... + Enter" is safe; a submitting type into a non-search form gets checked below
      if (step.submit && target?.formHint) return assessText(target.formHint, 'submits a form');
      return { level: 'safe' };
    }

    case 'press': {
      if (step.key === 'Enter' && target?.formHint) return assessText(target.formHint, 'submits a form');
      return { level: 'safe' };
    }

    case 'click': {
      if (!target) return { level: 'safe' };
      const byLabel = assessText(target.label, 'clicks');
      if (byLabel.level !== 'safe') return byLabel;
      if (target.href && HREF_RISK.test(target.href)) {
        return { level: 'confirm', reason: 'Link points to a sensitive action' };
      }
      return { level: 'safe' };
    }

    default:
      return { level: 'safe' };
  }
}

function assessText(text: string, verb: string): Verdict {
  for (const [re, why] of HIGH_IMPACT) {
    const m = text.match(re);
    if (m) return { level: 'confirm', reason: `"${m[0]}" – ${why} (${verb})` };
  }
  return { level: 'safe' };
}

/** Enforces run limits. Both values are in the SAME unit (the old code compared seconds to ms). */
export function checkLimits(
  stepsDone: number,
  elapsedMs: number,
  limits: { maxSteps: number; maxRuntimeSec: number },
): string | null {
  if (stepsDone >= limits.maxSteps) return `Step limit reached (${limits.maxSteps})`;
  if (elapsedMs >= limits.maxRuntimeSec * 1000) return `Time limit reached (${limits.maxRuntimeSec}s)`;
  return null;
}
