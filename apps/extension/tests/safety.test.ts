import { describe, expect, it } from 'vitest';
import { assessStep, checkLimits } from '@/agent/safety';
import type { Step } from '@/shared/types';

const click = (target: string): Step => ({ kind: 'click', target, label: target });

describe('safety: word-boundary matching', () => {
  it.each(['Border colour', 'Sender name', 'Postgres docs', 'Order history', 'Repost guide'])(
    'does not flag %s', (label) => {
      expect(assessStep(click('x'), { label }).level).toBe('safe');
    });
  it.each(['Buy now', 'Place order', 'Delete account', 'Log out', 'Pay $20', 'Submit', 'Unsubscribe'])(
    'flags %s', (label) => {
      expect(assessStep(click('x'), { label }).level).toBe('confirm');
    });
  it('flags risky hrefs', () => {
    expect(assessStep(click('x'), { label: 'Continue', href: 'https://a.com/account/logout?next=/' }).level).toBe('confirm');
  });
});

describe('safety: other steps', () => {
  it('blocks non-http navigation', () => {
    expect(assessStep({ kind: 'navigate', url: 'javascript:alert(1)', label: '' }).level).toBe('block');
    expect(assessStep({ kind: 'navigate', url: 'https://example.com', label: '' }).level).toBe('safe');
  });
  it('confirms typing into password fields', () => {
    const s: Step = { kind: 'type', text: 'x', submit: false, label: '' };
    expect(assessStep(s, { label: 'Password', inputType: 'password' }).level).toBe('confirm');
    expect(assessStep(s, { label: 'Card', autocomplete: 'cc-number' }).level).toBe('confirm');
  });
  it('checks what Enter would submit', () => {
    const s: Step = { kind: 'press', key: 'Enter', label: '' };
    expect(assessStep(s, { label: 'q', formHint: 'Place your order' }).level).toBe('confirm');
    expect(assessStep(s, { label: 'q', formHint: 'Search' }).level).toBe('safe');
  });
});

describe('limits use consistent units', () => {
  it('trips on time (old code compared seconds with ms and never tripped)', () => {
    expect(checkLimits(0, 61_000, { maxSteps: 10, maxRuntimeSec: 60 })).toMatch(/Time limit/);
    expect(checkLimits(0, 59_000, { maxSteps: 10, maxRuntimeSec: 60 })).toBeNull();
  });
  it('trips on steps', () => {
    expect(checkLimits(10, 0, { maxSteps: 10, maxRuntimeSec: 60 })).toMatch(/Step limit/);
  });
});
