import type { Direction, ParseResult, Step } from '@/shared/types';

/**
 * Deterministic natural-language -> Step[] parser.
 *
 * Design rules (each one fixes a bug in the previous implementation):
 *  1. Quoted text is protected and never lower-cased or split.
 *  2. Compound commands ("search X then click the first result") become multiple steps.
 *  3. Clauses we do not understand are reported in `unparsed`; we never guess.
 *  4. Voice transcripts are normalised first (fillers, "dot com", number words).
 */

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, once: 1, two: 2, twice: 2, three: 3, thrice: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  fifteen: 15, twenty: 20, thirty: 30,
};

const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10, last: -1,
};

const SITE_HOME: Record<string, string> = {
  google: 'https://www.google.com', youtube: 'https://www.youtube.com',
  github: 'https://github.com', gmail: 'https://mail.google.com',
  amazon: 'https://www.amazon.com', wikipedia: 'https://www.wikipedia.org',
  reddit: 'https://www.reddit.com', twitter: 'https://x.com', x: 'https://x.com',
  linkedin: 'https://www.linkedin.com', facebook: 'https://www.facebook.com',
  flipkart: 'https://www.flipkart.com', bing: 'https://www.bing.com',
  duckduckgo: 'https://duckduckgo.com', stackoverflow: 'https://stackoverflow.com',
  'stack overflow': 'https://stackoverflow.com', netflix: 'https://www.netflix.com',
};

const SITE_SEARCH: Record<string, string> = {
  google: 'https://www.google.com/search?q=',
  youtube: 'https://www.youtube.com/results?search_query=',
  amazon: 'https://www.amazon.com/s?k=',
  wikipedia: 'https://en.wikipedia.org/w/index.php?search=',
  github: 'https://github.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  reddit: 'https://www.reddit.com/search/?q=',
  stackoverflow: 'https://stackoverflow.com/search?q=',
  'stack overflow': 'https://stackoverflow.com/search?q=',
  linkedin: 'https://www.linkedin.com/search/results/all/?keywords=',
  twitter: 'https://x.com/search?q=', x: 'https://x.com/search?q=',
  maps: 'https://www.google.com/maps/search/',
  'google maps': 'https://www.google.com/maps/search/',
  flipkart: 'https://www.flipkart.com/search?q=',
};

const VERBS =
  'click|tap|press|hit|type|enter|input|write|fill|search|scroll|go|open|visit|navigate|wait|select|choose|submit|reload|refresh|find|locate|google|look';

const FIELD_NOUNS =
  /\b(box|field|bar|input|textbox|text box|search|búsqueda|busqueda|recherche|suchfeld|email|e-mail|correo electrónico|correo electronico|courriel|password|username|user name|name|phone|address|area|textarea|comment|message|query|subject|title|url|zip|code|city)\b/i;

const KEY_MAP: Record<string, string> = {
  enter: 'Enter', return: 'Enter', escape: 'Escape', esc: 'Escape', tab: 'Tab',
  space: ' ', spacebar: ' ', backspace: 'Backspace', delete: 'Delete',
  'arrow up': 'ArrowUp', 'arrow down': 'ArrowDown', 'arrow left': 'ArrowLeft',
  'arrow right': 'ArrowRight', 'page up': 'PageUp', 'page down': 'PageDown',
  'up arrow': 'ArrowUp', 'down arrow': 'ArrowDown',
};

const MAX_TEXT = 2000;
const MAX_WAIT_MS = 30_000;
const MAX_SCROLLS = 20;

const KANNADA_COMMANDS: Array<[string, string]> = [
  ['ಕ್ಲಿಕ್ ಮಾಡಿ', 'click'],
  ['ಕ್ಲಿಕ್ ಮಾಡು', 'click'],
  ['ಕ್ಲಿಕ್', 'click'],
  ['ಹೋಗಿ', 'go to'],
  ['ಹೋಗು', 'go to'],
  ['ಹುಡುಕಿ', 'search for'],
  ['ಹುಡುಕಾಡಿ', 'search for'],
  ['ಟೈಪ್ ಮಾಡಿ', 'type'],
  ['ಟೈಪ್ ಮಾಡು', 'type'],
  ['ಟೈಪ್', 'type'],
  ['ಪ್ರೆಸ್ ಮಾಡಿ', 'press'],
  ['ಪ್ರೆಸ್ ಮಾಡು', 'press'],
  ['ಪ್ರೆಸ್', 'press'],
  ['ಒತ್ತಿರಿ', 'click'],
  ['ಒತ್ತಿ', 'click'],
  ['ಒತ್ತು', 'click'],
  ['ತಟ್ಟಿ', 'click'],
  ['ಸ್ಕ್ರೋಲ್', 'scroll'],
  ['ಸ್ಕ್ರೋಲ್ ಮಾಡಿ', 'scroll'],
  ['ಹಿಂದಕ್ಕೆ', 'back'],
  ['ರೀಲೋಡ್', 'reload'],
  ['ರಿಲೋಡ್', 'reload'],
  ['ರೀलोड', 'reload'],
  ['ಮೇಲೆ', 'up'],
  ['ಕೆಳಗೆ', 'down'],
  ['ಬಟನ್', 'button'],
  ['ಲಾಗಿನ್', 'login'],
  ['ಇನ್', 'in'],
  ['ವಾಚ್', 'watch'],
  ['ಯುಟ್ಯೂಬ್', 'youtube'],
  ['ಗೂಗಲ್', 'google'],
  ['ಜಿಮೇಲ್', 'gmail'],
  ['ರೆಡಿಟ್', 'reddit'],
  ['ಫೇಸ್‌ಬುಕ್', 'facebook'],
  ['ಫೇಸ್ಬುಕ್', 'facebook'],
  ['ಗೂಗಲ್ ಮ್ಯಾಪ್ಸ್', 'google maps'],
  ['hogi', 'go to'],
  ['hogu', 'go to'],
];

const HINDI_COMMANDS: Array<[string, string]> = [
  ['क्लिक कीजिए', 'click'],
  ['क्लिक करें', 'click'],
  ['क्लिक करो', 'click'],
  ['दबाइए', 'click'],
  ['दबाएं', 'click'],
  ['दबाएँ', 'click'],
  ['दबाओ', 'click'],
  ['खोलिए', 'go to'],
  ['खोलें', 'go to'],
  ['खोलो', 'go to'],
  ['जाइए', 'go to'],
  ['जाएं', 'go to'],
  ['जाओ', 'go to'],
  ['ढूंढें', 'search for'],
  ['ढूँढें', 'search for'],
  ['ढूंढो', 'search for'],
  ['ढूँढो', 'search for'],
  ['खोजें', 'search for'],
  ['खोजो', 'search for'],
  ['टाइप करें', 'type'],
  ['लिखें', 'type'],
  ['वापस', 'back'],
  ['रीलोड करें', 'reload'],
  ['स्क्रॉल करें', 'scroll'],
];

const INTERNATIONAL_COMMANDS: Array<[RegExp, string]> = [
  [/^(?:haz|haga|hacer)\s+clic\s+en\s+(?:el|la)\s+/iu, 'click the '],
  [/^(?:pulsa|pulse|presiona|presione)\s+(?:el|la)\s+/iu, 'click the '],
  [/^(?:clique|cliquez)\s+sur\s+(?:le|la|l['’])\s*/iu, 'click the '],
  [/^(?:clique|cliquez)\s+(?:le|la)\s+/iu, 'click the '],
  [/^(?:klicke|klicken|klick)\s+auf\s+(?:den|die|das|der)\s+/iu, 'click the '],
  [/\b(?:clickea|cliquea|clica|pulsa|pulse|presiona|presione|appuie|appuyez|drücke|druecke)\b/giu, 'click'],
  [/\b(?:ve|vaya|ir)\s+a\s+/giu, 'go to '],
  [/\b(?:va|allez|aller)\s+(?:à|a)\s+/giu, 'go to '],
  [/\b(?:gehe|geh|gehen)\s+zu\s+/giu, 'go to '],
  [/\b(?:abre|abra|abrir|ouvre|ouvrez|ouvrir|öffne|oeffne|öffnen|oeffnen)\b/giu, 'open'],
  [/^(?:busca|busque|buscar)\b/iu, 'search for'],
  [/^(?:cherche|cherchez|recherche|recherchez|rechercher)\b/iu, 'search for'],
  [/^(?:suche|suchen|sucht)\s+nach\b/iu, 'search for'],
  [/\b(?:escribe|escriba|escribir|écris|ecris|écrivez|ecrivez|tape|tapez|schreibe|schreib|schreiben)\b/giu, 'type'],
  [/^(?:sube|desplaza|desplázate|desplazate)\s+(?:por\s+)?(?:la\s+)?página\s+(?:hacia\s+)?arriba$/iu, 'scroll up'],
  [/^(?:baja|desplaza|desplázate|desplazate)\s+(?:por\s+)?(?:la\s+)?página\s+(?:hacia\s+)?abajo$/iu, 'scroll down'],
  [/^(?:fais|faites)\s+défiler\s+(?:la\s+page\s+)?vers\s+le\s+haut$/iu, 'scroll up'],
  [/^(?:fais|faites)\s+défiler\s+(?:la\s+page\s+)?vers\s+le\s+bas$/iu, 'scroll down'],
  [/^(?:scrolle|scroll|rolle)\s+(?:(?:die\s+)?seite\s+)?nach\s+oben$/iu, 'scroll up'],
  [/^(?:scrolle|scroll|rolle)\s+(?:(?:die\s+)?seite\s+)?nach\s+unten$/iu, 'scroll down'],
  [/\b(?:en|sur|auf)\s+(?=(?:google|youtube|amazon|wikipedia|github|bing|reddit)\b)/giu, 'on '],
  [/\b(search for)\s+(?:the|el|la|los|las|un|una|unos|unas|des|du|de la|le|les|der|die|das|ein|eine|einen|einem)\s+/giu, '$1 '],
];

const KANNADA_TEXT_ALIASES: Record<string, string> = {
  ಬಿಬಿಸಿ: 'bbc',
  BBC: 'bbc',
  bbc: 'bbc',
  ಯುಟ್ಯೂಬ್: 'youtube',
  ಗೂಗಲ್: 'google',
  ಹೋಂ: 'home',
  ಲಾಗಿನ್: 'login',
  ಬಟನ್: 'button',
  ಹೋಮ್: 'home',
  ಮುಖಪುಟ: 'home',
};

const HINDI_TEXT_ALIASES: Record<string, string> = {
  होम: 'home',
  'मुख्य पृष्ठ': 'home',
  'लॉग इन': 'login',
  लॉगिन: 'login',
  बटन: 'button',
  गूगल: 'google',
  यूट्यूब: 'youtube',
  जीमेल: 'gmail',
};

const INTERNATIONAL_TEXT_ALIASES: Array<[string, string]> = [
  ["page d'accueil", 'home'],
  ['página principal', 'home'],
  ['pagina principal', 'home'],
  ['página de inicio', 'home'],
  ['pagina de inicio', 'home'],
  ['startseite', 'home'],
  ['accueil', 'home'],
  ['inicio', 'home'],
  ['d’accueil', 'home'],
  ["d'accueil", 'home'],
  ['anmelden', 'login'],
  ['connexion', 'login'],
  ['conexión', 'login'],
  ['conexion', 'login'],
  ['iniciar sesión', 'login'],
  ['iniciar sesion', 'login'],
  ['schaltfläche', 'button'],
  ['schaltflaeche', 'button'],
  ['búsqueda', 'search'],
  ['busqueda', 'search'],
  ['recherche', 'search'],
  ['suchfeld', 'search'],
  ['botón', 'button'],
  ['boton', 'button'],
  ['bouton', 'button'],
  ['correo electrónico', 'email'],
  ['correo electronico', 'email'],
  ['courriel', 'email'],
];

function translateSupportedLanguages(input: string): string {
  let s = input.trim().replace(/[\u200b\u200c\u200d]/g, '');
  s = s
    .replace(/^ವೆಬ್(?:‌)?ನಲ್ಲಿ\s+(.+?)\s+(?:ಹುಡುಕಿ|ಹುಡುಕಾಡಿ)$/i, 'search web for $1')
    .replace(/^वेब\s+पर\s+(.+?)\s+(?:खोजें|खोजो|ढूंढें|ढूँढें|ढूंढो|ढूँढो)$/i, 'search web for $1');
  s = s.replace(
    /^(?:पेज|पृष्ठ|स्क्रीन|page|screen)(?:\s+(?:को|ko))?\s+(ऊपर|नीचे|upar|neeche)(?:\s+(?:की ओर|तरफ|स्क्रॉल|scroll))?\s+(?:करो|करें|करिए|कीजिए|karo|karein|कर|करना)$/iu,
    (_match, direction: string) => `scroll ${/ऊपर|upar/i.test(direction) ? 'up' : 'down'}`,
  );
  s = s.replace(
    /^(?:ಪುಟ(?:ವನ್ನು)?|ಸ್ಕ್ರೀನ್|page|screen)(?:\s+(?:ನ್ನು|ಅನ್ನು))?\s+(ಮೇಲೆ|ಮೇಲಕ್ಕೆ|ಕೆಳಗೆ|ಕೆಳಕ್ಕೆ)(?:\s+(?:ಸ್ಕ್ರೋಲ್|scroll))?\s+(?:ಮಾಡಿ|ಮಾಡು|ಮಾಡಿರಿ)$/u,
    (_match, direction: string) => `scroll ${/ಮೇಲೆ|ಮೇಲಕ್ಕೆ/.test(direction) ? 'up' : 'down'}`,
  );
  for (const [pattern, replacement] of INTERNATIONAL_COMMANDS) s = s.replace(pattern, replacement);

  s = s
    .replace(/^(?:vuelve|regresa)\s+atrás$/iu, 'go back')
    .replace(/^retourne\s+en\s+arrière$/iu, 'go back')
    .replace(/^geh(?:e)?\s+zurück$/iu, 'go back')
    .replace(/^(?:recarga|actualiza)\s+(?:la\s+)?página$/iu, 'reload page')
    .replace(/^(?:recharge|actualise)\s+(?:la\s+)?page$/iu, 'reload page')
    .replace(/^(?:lade\s+neu|aktualisiere)\s+(?:die\s+)?seite$/iu, 'reload page');

  const ordered = [...KANNADA_COMMANDS].sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of ordered) {
    const pattern = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    s = s.replace(pattern, to);
  }

  const hindiOrdered = [...HINDI_COMMANDS].sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of hindiOrdered) {
    const pattern = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    s = s.replace(pattern, to);
  }

  for (const [from, to] of Object.entries(KANNADA_TEXT_ALIASES)) {
    const pattern = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    s = s.replace(pattern, to);
  }

  for (const [from, to] of Object.entries(HINDI_TEXT_ALIASES)) {
    const pattern = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    s = s.replace(pattern, to);
  }

  for (const [from, to] of [...INTERNATIONAL_TEXT_ALIASES].sort((a, b) => b[0].length - a[0].length)) {
    const pattern = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
    s = s.replace(pattern, to);
  }

  s = s.replace(/\bbutton\s+(?:(?:de|del|of)\s+)?(home|login)\b/giu, '$1 button');
  s = s.replace(/^(.+?)\s+(?:(?:पर|पे|को)\s+)?(click|press|tap|hit)$/i, '$2 $1');
  s = s.replace(/\b(?:ಮಾಡಿ|ಮಾಡು|ಮಾಡುತ್ತೇನೆ|ದಯವಿಟ್ಟು|ಇಲ್ಲಿ|ಈಗ|ನಾನು|ನೀವು)\b/gi, ' ');
  s = s.replace(/(\p{L})(?:ಗೆ|ಗೇ|ನಲ್ಲಿ|ಮೇಲೆ|ಮಧ್ಯೆ|ಮೂಲಕ|ಇಂದ|ವರೆಗೆ|ವರೆಗೂ|ಅಲ್ಲಿ)(?=$|[\s.,!?])/gu, '$1');
  s = s.replace(/(?:\s+|^)(?:ಗೆ|ಗೇ|ನಲ್ಲಿ|ಮೇಲೆ|ಮಧ್ಯೆ|ಮೂಲಕ|ಇಂದ|ವರೆಗೆ|ವರೆಗೂ|ಅಲ್ಲಿ)(?=\s|$)/gi, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// ---------------------------------------------------------------- normalisation

const QUOTE_TOKEN = (i: number) => `\u0001${i}\u0002`;
const QUOTE_RE = /\u0001(\d+)\u0002/g;

function protectQuotes(input: string): { text: string; quotes: string[] } {
  const quotes: string[] = [];
  const stash = (_m: string, lead: string, body: string) => {
    quotes.push(body);
    return `${lead}${QUOTE_TOKEN(quotes.length - 1)}`;
  };
  let text = input
    .replace(/(^|[\s(])"([^"]+)"/g, stash)
    .replace(/(^|[\s(])\u201c([^\u201d]+)\u201d/g, stash)
    // single quotes only when they clearly delimit (avoid "what's", "don't")
    .replace(/(^|\s)'([^']+)'(?=\s|$|[.,!?;])/g, stash);
  text = text.trim();
  return { text, quotes };
}

const restore = (s: string, quotes: string[]) =>
  s.replace(QUOTE_RE, (_m, i: string) => quotes[Number(i)] ?? '');

/** Clean a raw typed or spoken instruction. Exported for tests and the voice UI. */
export function normalizeInstruction(raw: string): string {
  let s = translateSupportedLanguages(raw).replace(/\s+/g, ' ').trim();
  s = s.replace(/^(?:hey|ok|okay)[, ]+(?:sight\s?lite|assistant|browser)[,:]?\s*/i, '');
  // politeness / filler prefixes, applied repeatedly ("hey, can you please ...")
  const prefix =
    /^(?:please|kindly|can you|could you|would you|will you|i want you to|i'd like you to|i would like you to|go ahead and|just)\b[, ]*/i;
  for (let i = 0; i < 4 && prefix.test(s); i++) s = s.replace(prefix, '');
  s = s.replace(/\b(?:um+|uh+|erm|hmm+)\b[, ]*/gi, '');
  // spoken domain forms: "youtube dot com" -> "youtube.com"
  s = s.replace(/\s+dot\s+(com|org|net|io|in|dev|co|edu|gov|ai|app)\b/gi, '.$1');
  s = s.replace(/[\s,]*\b(?:please|thanks|thank you)\b[.!]*$/i, '');
  s = s.replace(/[.!?;,\s]+$/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

function toNumber(word: string | undefined): number | undefined {
  if (!word) return undefined;
  const w = word.toLowerCase();
  if (/^\d+$/.test(w)) return parseInt(w, 10);
  return NUMBER_WORDS[w];
}

// ---------------------------------------------------------------- URL helpers

/** Returns a safe http(s) URL or null. Never returns javascript:, file:, chrome:, data: ... */
export function normalizeUrl(input: string): string | null {
  const s = input.trim().replace(/\s+/g, '');
  if (!s) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[a-z0-9.-]+:\d+/i.test(s);
  const domainLike =
    /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|(?:[a-z0-9-]+\.)+[a-z]{2,})(?::\d+)?(?:[/?#]\S*)?$/i.test(s);
  if (!hasScheme && !domainLike) return null;
  try {
    const u = new URL(hasScheme ? s : `https://${s}`);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

function resolveDestination(phrase: string): string | null {
  const cleaned = phrase
    .replace(/^(?:the\s+)?/i, '')
    .replace(/\s+(?:website|site|homepage|home page|page)$/i, '')
    .trim()
    .toLowerCase();
  return SITE_HOME[cleaned] ?? normalizeUrl(phrase);
}

// ---------------------------------------------------------------- clause splitting

function splitClauses(text: string): string[] {
  const verbAhead = `(?=(?:${VERBS})\\b)`;
  const parts = text
    .split(new RegExp(
      [
        '\\s*;\\s*',
        '\\s*,?\\s*\\b(?:and then|then|after that|afterwards|and finally|finally)\\b\\s*,?\\s*',
        `\\s*,\\s*${verbAhead}`,
        `\\s+and\\s+${verbAhead}`,
      ].join('|'),
      'i',
    ))
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p));
  return parts;
}

// ---------------------------------------------------------------- clause parsing

function cleanTarget(t: string): string {
  return t
    .replace(/^(?:on|the|a|an|to)\s+/i, '')
    .replace(/^(?:on|the|a|an)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "email field" -> "email": generic container nouns never appear in the page's own labels. */
function stripFieldNoun(t: string): string {
  let normalized = t.replace(/^(?:(?:enter|type|write|fill|escriba|escribe|schreibe)\s+)?(?:your|my|the|el|la|los|las|un|una|le|les|der|die|das|ein|eine)\s+/iu, '');
  normalized = normalized.replace(/^(?:caja de búsqueda|caja de busqueda|campo de búsqueda|boîte de recherche|boite de recherche|champ de recherche|suchfeld)$/iu, 'search');
  normalized = normalized.replace(/^(?:(?:caja|campo|champ|boîte|boite)\s+de\s+)?search$/iu, 'search');
  normalized = normalized.replace(/^(?:correo electrónico|correo electronico|courriel|e-mail)$/iu, 'email');
  const stripped = normalized.replace(/\s+(?:field|box|input|textbox|text box|text area|textarea|area|bar)$/i, '').trim();
  return stripped || normalized || t;
}

function normalizeSpokenEmail(text: string): string {
  return text.replace(
    /\b([a-z0-9._%+-]+)\s+at\s+(?:(?:a|the)\s+)?((?:[a-z0-9-]+\.)+[a-z]{2,})\b/gi,
    '$1@$2',
  );
}

const ROLE_NOUNS = /\s+(button|link|icon|tab|option|checkbox|menu|dropdown|toggle|radio|field|box)$/i;

function splitRole(t: string): { target: string; role?: string } {
  const m = t.match(ROLE_NOUNS);
  if (!m) return { target: t };
  const target = t.slice(0, m.index).trim();
  // "click the button" -> target would be empty; keep the noun as target
  return target ? { target, role: m[1]!.toLowerCase() } : { target: t };
}

function splitOrdinal(t: string): { target: string; ordinal?: number } {
  const m = t.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|(\d+)(?:st|nd|rd|th))\b/i);
  if (!m) return { target: t };
  const ordinal = m[2] ? parseInt(m[2], 10) : ORDINALS[m[1]!.toLowerCase()];
  const rest = t.replace(m[0], '').replace(/\s+/g, ' ').replace(/^(?:the|a|an)\s+/i, '').replace(/^of\s+/i, '').trim();
  return { target: rest || t, ordinal };
}

function parseClause(clause: string, quotes: string[]): Step | null {
  const c = clause.trim();
  let m: RegExpMatchArray | null;

  // wait ---------------------------------------------------------------
  if ((m = c.match(/^(?:wait|pause|sleep)(?:\s+for)?\s+(\d+|[a-z]+)\s*(ms|milliseconds?|seconds?|secs?|s|minutes?|mins?)?$/i))) {
    const n = toNumber(m[1]);
    if (n !== undefined) {
      const unit = (m[2] ?? 'seconds').toLowerCase();
      const ms = /^(ms|millisecond)/.test(unit) ? n : /^m(in|inute)/.test(unit) ? n * 60_000 : n * 1000;
      const capped = Math.min(ms, MAX_WAIT_MS);
      return { kind: 'wait', ms: capped, label: `Wait ${capped / 1000}s` };
    }
  }

  // navigation history ---------------------------------------------------
  if (/^(?:go\s+|navigate\s+)?back(?:\s+(?:a page|one page|to the previous page))?$/i.test(c)) {
    return { kind: 'back', label: 'Go back' };
  }
  if (/^(?:reload|refresh)(?:\s+(?:the\s+)?(?:page|tab))?$/i.test(c)) {
    return { kind: 'reload', label: 'Reload page' };
  }

  // scroll -----------------------------------------------------------
  if ((m = c.match(/^scroll\b(.*)$/i))) {
    const rest = m[1]!.trim();
    const dir = rest.match(/\b(top|bottom|up|down|left|right)\b/i)?.[1]?.toLowerCase() as Direction | undefined;
    if (dir) {
      const times = toNumber(rest.match(/\b(\d+|[a-z]+)\s+(?:times?|pages?|screens?)\b/i)?.[1]) ?? 1;
      const n = Math.min(Math.max(times, 1), MAX_SCROLLS);
      return { kind: 'scroll', direction: dir, times: n, label: `Scroll ${dir}${n > 1 ? ` ×${n}` : ''}` };
    }
    const to = rest.match(/^to\s+(?:the\s+)?(.+)$/i);
    if (to) {
      const target = restore(cleanTarget(to[1]!), quotes);
      return { kind: 'find', target, label: `Scroll to "${target}"` };
    }
    if (!rest) return { kind: 'scroll', direction: 'down', times: 1, label: 'Scroll down' };
    return null;
  }

  // key press ----------------------------------------------------------
  if ((m = c.match(/^(?:press|hit|push)\s+(?:the\s+)?([a-z ]+?)(?:\s+key)?$/i))) {
    const key = KEY_MAP[m[1]!.toLowerCase()];
    if (key) return { kind: 'press', key, label: `Press ${key === ' ' ? 'Space' : key}` };
  }
  if (/^submit(?:\s+(?:the\s+)?(?:form|search|query))?$/i.test(c)) {
    return { kind: 'press', key: 'Enter', label: 'Submit (Enter)' };
  }

  // fill FIELD with TEXT -------------------------------------------------
  if ((m = c.match(/^fill(?:\s+(?:in|out))?\s+(?:the\s+)?(.+?)(?:\s+(?:field|box|input))?\s+with\s+(.+)$/i))) {
    const target = stripFieldNoun(restore(cleanTarget(m[1]!), quotes));
    const text = normalizeSpokenEmail(restore(m[2]!, quotes)).slice(0, MAX_TEXT);
    return { kind: 'type', target, text, submit: false, label: `Type "${short(text)}" in "${target}"` };
  }

  // type / enter / write TEXT [into FIELD] -----------------------------------
  if ((m = c.match(/^(?:type|enter|input|write|put)\s+(.+)$/i))) {
    const payload = m[1]!;
    const split = splitTypePayload(payload, quotes);
    const text = normalizeSpokenEmail(restore(split.text, quotes)).slice(0, MAX_TEXT);
    const target = split.target ? stripFieldNoun(restore(cleanTarget(split.target), quotes)) : undefined;
    if (!text) return null;
    return {
      kind: 'type', target, text, submit: false,
      label: target ? `Type "${short(text)}" in "${target}"` : `Type "${short(text)}"`,
    };
  }

  // search --------------------------------------------------------------
  const webSearch = c.match(/^(?:search\s+(?:the\s+)?web\s+for|web\s+search\s+for)\s+(.+)$/i);
  if (webSearch) {
    const query = restore(webSearch[1]!, quotes).slice(0, MAX_TEXT);
    return {
      kind: 'navigate',
      url: SITE_SEARCH.google + encodeURIComponent(query),
      label: `Search the web for "${short(query)}"`,
    };
  }

  const findOnSite = c.match(/^find\s+(.+?)\s+on\s+(google|youtube|amazon|wikipedia|github|bing|reddit)$/i);
  const searchM = c.match(/^(?:search|google|look\s?up|lookup)(?:\s+(?:for|up))?\s+(.+)$/i);
  if (searchM || findOnSite) {
    const query = searchM ? searchM[1]! : `${findOnSite![1]} on ${findOnSite![2]}`;
    const siteM = query.match(/^(.+?)\s+(?:on|in|at|using|with)\s+(google maps|stack overflow|google|youtube|amazon|wikipedia|github|bing|duckduckgo|reddit|stackoverflow|linkedin|twitter|maps|flipkart|x)$/i);
    if (siteM) {
      const site = siteM[2]!.toLowerCase();
      const q = restore(siteM[1]!, quotes).slice(0, MAX_TEXT);
      return {
        kind: 'navigate',
        url: SITE_SEARCH[site]! + encodeURIComponent(q),
        label: `Search "${short(q)}" on ${site}`,
      };
    }
    const text = restore(query, quotes).slice(0, MAX_TEXT);
    return {
      kind: 'type', target: 'search', text, submit: true,
      label: `Search for "${short(text)}"`,
    };
  }

  // navigate --------------------------------------------------------------
  if ((m = c.match(/^(?:go\s+to|goto|navigate\s+to|visit|open|load|take me to|browse to)\s+(.+)$/i))) {
    const phrase = restore(m[1]!, quotes);
    const url = resolveDestination(phrase);
    if (url) return { kind: 'navigate', url, label: `Open ${url}` };
    // Not a URL: "go to the pricing page" / "open the settings link" -> in-page click
    const stripped = cleanTarget(phrase).replace(/\s+(?:page|section)$/i, '');
    const { target, role } = splitRole(stripped);
    const o = splitOrdinal(target);
    return { kind: 'click', target: o.target, ordinal: o.ordinal, role, label: `Click "${o.target}"` };
  }

  // find / locate -----------------------------------------------------------
  if ((m = c.match(/^(?:find|locate|show me|where is)\s+(?:the\s+)?(.+)$/i))) {
    const target = restore(cleanTarget(m[1]!), quotes);
    return { kind: 'find', target, label: `Find "${target}"` };
  }

  // click ----------------------------------------------------------------
  if ((m = c.match(/^(?:click|tap|press|hit|select|choose|check|toggle|activate|push)(?:\s+(?:on|the))*\s+(.+)$/i))) {
    const t = restore(cleanTarget(m[1]!), quotes);
    const { target: withoutRole, role } = splitRole(t);
    const { target, ordinal } = splitOrdinal(withoutRole);
    if (!target) return null;
    return { kind: 'click', target, ordinal, role, label: `Click "${ordinal ? `${ordinalName(ordinal)} ` : ''}${target}"` };
  }

  return null;
}

/** "hello world into the search box" -> { text: "hello world", target: "the search box" } */
function splitTypePayload(payload: string, quotes: string[]): { text: string; target?: string } {
  const prep = /\s+(?:in|into|on|inside|to|en|dans|im|ins)\s+/gi;
  const hits: Array<{ idx: number; len: number }> = [];
  for (let m = prep.exec(payload); m; m = prep.exec(payload)) hits.push({ idx: m.index, len: m[0].length });
  const quoted = QUOTE_RE.test(payload);
  QUOTE_RE.lastIndex = 0;

  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i]!;
    const text = payload.slice(0, h.idx).trim();
    const target = payload.slice(h.idx + h.len).trim();
    if (!text || !target) continue;
    if (target.split(/\s+/).length > 5) continue;
    if (FIELD_NOUNS.test(restore(target, quotes)) || /^\u0001\d+\u0002$/.test(text) && quoted) {
      return { text, target };
    }
  }
  return { text: payload };
}

const short = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const ordinalName = (n: number) =>
  n === -1 ? 'last' : (Object.entries(ORDINALS).find(([, v]) => v === n)?.[0] ?? `#${n}`);

/** Merge "type X" + "press Enter" into a single submitting type step. */
function mergeSubmit(steps: Step[]): Step[] {
  const out: Step[] = [];
  for (const s of steps) {
    const prev = out[out.length - 1];
    if (s.kind === 'press' && s.key === 'Enter' && prev?.kind === 'type' && !prev.submit) {
      out[out.length - 1] = { ...prev, submit: true, label: `${prev.label} + Enter` };
    } else {
      out.push(s);
    }
  }
  return out;
}

// ---------------------------------------------------------------- public API

export function parseInstruction(raw: string): ParseResult {
  const normalized = normalizeInstruction(raw);
  if (!normalized) return { steps: [], unparsed: [], normalized };

  const { text, quotes } = protectQuotes(normalized);
  const steps: Step[] = [];
  const unparsed: string[] = [];

  for (const clause of splitClauses(text)) {
    const step = parseClause(clause, quotes);
    if (step) steps.push(step);
    else unparsed.push(restore(clause, quotes));
  }
  return { steps: mergeSubmit(steps), unparsed, normalized };
}

/** Human-readable plan, shown before execution. */
export function describePlan(steps: Step[]): string[] {
  return steps.map((s, i) => `${i + 1}. ${s.label}`);
}
