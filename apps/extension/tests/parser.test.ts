import { describe, expect, it } from 'vitest';
import { normalizeInstruction, normalizeUrl, parseInstruction } from '@/agent/parser';

const kinds = (s: string) => parseInstruction(s).steps.map((x) => x.kind);

describe('normalizeInstruction (voice cleanup)', () => {
  it('strips politeness, fillers and trailing punctuation', () => {
    expect(normalizeInstruction('Hey SightLite, can you please um click the login button.')).toBe(
      'click the login button',
    );
  });
  it('joins spoken domains', () => {
    expect(parseInstruction('ಹೋಂ button ಒತ್ತು').steps[0]).toMatchObject({
      kind: 'click', target: 'home', role: 'button',
    });
    expect(normalizeInstruction('go to youtube dot com')).toBe('go to youtube.com');
  });
});

describe('normalizeUrl', () => {
  it('accepts http(s) and bare domains', () => {
    expect(normalizeUrl('example.com/a')).toBe('https://example.com/a');
    expect(normalizeUrl('http://localhost:3000')).toBe('http://localhost:3000/');
  });
  it('rejects dangerous or non-URL input', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeUrl('chrome://settings')).toBeNull();
    expect(normalizeUrl('the pricing page')).toBeNull();
  });
});

describe('navigation', () => {
  it('go to a known site name navigates (old parser clicked "youtube")', () => {
    const [s] = parseInstruction('go to youtube').steps;
    expect(s).toMatchObject({ kind: 'navigate', url: 'https://www.youtube.com' });
  });
  it('go to a domain navigates', () => {
    expect(parseInstruction('open github.com').steps[0]).toMatchObject({ kind: 'navigate' });
  });
  it('go to a non-URL phrase clicks a link', () => {
    expect(parseInstruction('go to the pricing page').steps[0]).toMatchObject({ kind: 'click', target: 'pricing' });
  });
  it('blocks javascript: URLs by treating them as a click target, not navigation', () => {
    const s = parseInstruction('open javascript:alert(1)').steps[0];
    expect(s?.kind).not.toBe('navigate');
  });
});

describe('click', () => {
  it('extracts role hint and target', () => {
    expect(parseInstruction('click on the login button').steps[0]).toMatchObject({
      kind: 'click', target: 'login', role: 'button',
    });
  });
  it('extracts ordinals', () => {
    expect(parseInstruction('click the first result').steps[0]).toMatchObject({
      kind: 'click', target: 'result', ordinal: 1,
    });
    expect(parseInstruction('click the last video').steps[0]).toMatchObject({ ordinal: -1 });
  });
  it('"press enter" is a key press, not a click on "enter"', () => {
    expect(parseInstruction('press enter').steps[0]).toMatchObject({ kind: 'press', key: 'Enter' });
  });
});

describe('type', () => {
  it('splits text and field', () => {
    expect(parseInstruction('type hello world in the search box').steps[0]).toMatchObject({
      kind: 'type', text: 'hello world', target: 'search',
    });
  });
  it('normalizes instructional field targets and spoken email formatting', () => {
    expect(parseInstruction('Type "Keerthana at gmail.com" in "enter your email"').steps[0]).toMatchObject({
      kind: 'type', text: 'Keerthana@gmail.com', target: 'email',
    });
  });
  it('converts a spoken email separator to @ without changing the recognized name', () => {
    expect(parseInstruction('type "keeartana at gmail.com" in the email field').steps[0]).toMatchObject({
      kind: 'type', text: 'keeartana@gmail.com', target: 'email',
    });
  });
  it('handles an article in the dictated email address and continues the command', () => {
    const result = parseInstruction('Type "Keerthana at a gmail.com" in "email" and click "continue"');
    expect(result.steps).toMatchObject([
      { kind: 'type', text: 'Keerthana@gmail.com', target: 'email' },
      { kind: 'click', target: 'continue' },
    ]);
    expect(result.unparsed).toEqual([]);
  });
  it('uses the LAST preposition when text itself contains one', () => {
    expect(parseInstruction('type going in circles into the email field').steps[0]).toMatchObject({
      text: 'going in circles', target: 'email',
    });
  });
  it('does not invent a target for "type best places in paris"', () => {
    expect(parseInstruction('type best places in paris').steps[0]).toMatchObject({
      kind: 'type', text: 'best places in paris', target: undefined,
    });
  });
  it('preserves case and quoted text', () => {
    expect(parseInstruction('type "Hello, World and then some" into the message box').steps).toEqual([
      expect.objectContaining({ kind: 'type', text: 'Hello, World and then some', target: 'message' }),
    ]);
  });
  it('fill X with Y keeps the value verbatim', () => {
    expect(parseInstruction('fill the email field with Bob@Example.com').steps[0]).toMatchObject({
      kind: 'type', target: 'email', text: 'Bob@Example.com',
    });
  });
  it('type + press enter merges into a submitting step', () => {
    const r = parseInstruction('type cats in the search box and press enter');
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0]).toMatchObject({ kind: 'type', submit: true });
  });
});

describe('search', () => {
  it('understands Kannada commands', () => {
    expect(parseInstruction('ಕ್ಲಿಕ್ ಮಾಡಿ ಲಾಗಿನ್ ಬಟನ್').steps[0]).toMatchObject({
      kind: 'click', target: 'login', role: 'button',
    });
    expect(parseInstruction('ಹೋಗಿ ಯುಟ್ಯೂಬ್‌ಗೆ').steps[0]).toMatchObject({ kind: 'navigate' });
    expect(parseInstruction('click ಬಿಬಿಸಿ').steps[0]).toMatchObject({ kind: 'click', target: 'bbc' });
    expect(parseInstruction('Hogi sensor network').steps[0]).toMatchObject({ kind: 'click', target: 'sensor network' });
  });
  it('understands Hindi commands when speech recognition is set to Hindi', () => {
    expect(parseInstruction('होम बटन दबाएं').steps[0]).toMatchObject({
      kind: 'click', target: 'home', role: 'button',
    });
    expect(parseInstruction('होम बटन पर क्लिक करें').steps[0]).toMatchObject({
      kind: 'click', target: 'home', role: 'button',
    });
  });
  it('opens web searches from Hindi and Kannada address-bar-style commands', () => {
    const hindi = parseInstruction('वेब पर मौसम आज खोजें').steps[0];
    const kannada = parseInstruction('ವೆಬ್‌ನಲ್ಲಿ ಕನ್ನಡ ಸುದ್ದಿ ಹುಡುಕಿ').steps[0];
    expect(hindi).toMatchObject({ kind: 'navigate', url: expect.stringContaining('q=') });
    expect(kannada).toMatchObject({ kind: 'navigate', url: expect.stringContaining('q=') });
    expect((hindi as { url: string }).url).toContain(encodeURIComponent('मौसम आज'));
    expect((kannada as { url: string }).url).toContain(encodeURIComponent('ಕನ್ನಡ ಸುದ್ದಿ'));
  });
  it('search on a known site becomes a direct URL', () => {
    const s = parseInstruction('search for lo-fi beats on youtube').steps[0];
    expect(s).toMatchObject({ kind: 'navigate' });
    expect((s as { url: string }).url).toContain('search_query=lo-fi%20beats');
  });
  it('generic search types into the search box and submits', () => {
    expect(parseInstruction('search for python internships').steps[0]).toMatchObject({
      kind: 'type', target: 'search', text: 'python internships', submit: true,
    });
  });
  it('keeps "and" inside a search query', () => {
    expect(parseInstruction('search for salt and pepper').steps[0]).toMatchObject({ text: 'salt and pepper' });
  });
});

describe('compound instructions', () => {
  it('splits on "then" / "and then" / "and <verb>"', () => {
    expect(kinds('go to google.com and search for cats then click the first result')).toEqual([
      'navigate', 'type', 'click',
    ]);
  });
  it('handles voice-style run-ons', () => {
    expect(kinds('open youtube dot com, search for react tutorials, click the second video')).toEqual([
      'navigate', 'type', 'click',
    ]);
  });
});

describe('scroll / wait / history', () => {
  it('understands Hindi and Kannada page scroll commands', () => {
    expect(parseInstruction('पेज को ऊपर करो').steps[0]).toMatchObject({
      kind: 'scroll', direction: 'up', times: 1,
    });
    expect(parseInstruction('पेज को नीचे स्क्रॉल करें').steps[0]).toMatchObject({
      kind: 'scroll', direction: 'down', times: 1,
    });
    expect(parseInstruction('ಪುಟವನ್ನು ಮೇಲಕ್ಕೆ ಸ್ಕ್ರೋಲ್ ಮಾಡಿ').steps[0]).toMatchObject({
      kind: 'scroll', direction: 'up', times: 1,
    });
  });
  it('scroll with counts and number words', () => {
    expect(parseInstruction('scroll down three times').steps[0]).toMatchObject({
      kind: 'scroll', direction: 'down', times: 3,
    });
    expect(parseInstruction('scroll to the bottom').steps[0]).toMatchObject({ direction: 'bottom' });
  });
  it('scroll to <thing> finds the element', () => {
    expect(parseInstruction('scroll to the pricing table').steps[0]).toMatchObject({ kind: 'find', target: 'pricing table' });
  });
  it('wait is capped', () => {
    expect(parseInstruction('wait 10 minutes').steps[0]).toMatchObject({ kind: 'wait', ms: 30000 });
    expect(parseInstruction('wait two seconds').steps[0]).toMatchObject({ ms: 2000 });
  });
  it('back and reload', () => {
    expect(kinds('go back then reload the page')).toEqual(['back', 'reload']);
  });
});

describe('robustness', () => {
  it('reports unknown clauses instead of guessing', () => {
    const r = parseInstruction('make me a sandwich');
    expect(r.steps).toHaveLength(0);
    expect(r.unparsed).toEqual(['make me a sandwich']);
  });
  it('does not match verbs inside words (prototype, center, finder)', () => {
    expect(parseInstruction('prototype the center finder').steps).toHaveLength(0);
  });
  it('keeps partial plans and flags the rest', () => {
    const r = parseInstruction('click login then dance wildly');
    expect(r.steps).toHaveLength(1);
    expect(r.unparsed).toEqual(['dance wildly']);
  });
  it('empty input', () => {
    expect(parseInstruction('   ').steps).toEqual([]);
  });
  it('caps runaway text length', () => {
    const r = parseInstruction(`type ${'a'.repeat(5000)}`);
    expect((r.steps[0] as { text: string }).text.length).toBe(2000);
  });
});
