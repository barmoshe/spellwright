// core/i18n.js — t(key, params) with {name} interpolation. Adding a locale = adding a table file.
import en from '../i18n/en.js';

const TABLES = { en };
let current = en;

export function setLocale(code) { current = TABLES[code] || en; }
export function t(key, params) {
  let s = current[key] ?? en[key];
  if (s === undefined) { console.warn('[i18n] missing key', key); return key; }
  if (params) s = s.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? `{${k}}`));
  return s;
}
