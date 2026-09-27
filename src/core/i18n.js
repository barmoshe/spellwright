// core/i18n.js — t(key, params) with {name} interpolation. Adding a locale = adding a table file.
import en from '../i18n/en.js';

const TABLES = { en };
let current = en;

let family = 'kbm';

export function setLocale(code) { current = TABLES[code] || en; }
/** controller-prompts §9.3: while the prompt family is `touch`, t(key) prefers `key + '.touch'` when it exists. */
export function setPromptFamily(f) { family = f; }
export function t(key, params) {
  const tk = family === 'touch' ? key + '.touch' : null;
  let s = (tk && (current[tk] ?? en[tk])) ?? current[key] ?? en[key];
  if (s === undefined) { console.warn('[i18n] missing key', key); return key; }
  if (params) s = s.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? `{${k}}`));
  return s;
}
