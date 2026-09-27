// core/tunables.js — feel tunables read VERBATIM from specs/design/feel-spec.md (architecture §7.2).
//
// The feel-spec's `feel-tunables:` fenced YAML blocks ARE the tunables file — there is no
// hand-mirrored copy to drift (feel-tunables-block.md mirror contract, rules 1–2, 5).
// Block shape (studio template §8):
//   feel-tunables:
//     verb: <verb>
//     params:
//       - { param: X, value: 1, unit: frames, source_ref: Ref, range: [0, 2], frozen: false }
// Block-style rows (`- param: X` + indented `key: value` lines) are accepted too.
//
// PURE parser (no Phaser import) — runnable from node for review: `node -e "import('./src/core/tunables.js')…"`.
// With ?debug, TUNING is wrapped in a read-tracking Proxy: __SW__.tunables.unread() lists every
// declared tunable no code has read (presence != consumption — mirror-contract rule 6).

import { VIEW_W, VIEW_H, SIM_HZ, DEBUG } from '../config.js';

export const UNITS = new Set(['frames', 'px', 'px/s', 'px/s2', 'ms', 'mult', 'count', 's', 'bool',
  'ratio', 'deg', 'deg/s', 'hz', 'frac-H', 'frac-W', 'fps']);

/** Split a flow-map body on top-level commas (ignores commas inside [] or quotes). */
function splitTopLevel(s) {
  const out = []; let depth = 0, q = null, cur = '';
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '[' || ch === '{') depth++;
    if (ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function parseScalar(raw) {
  const v = raw.trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(v)) return Number(v);
  if (v.startsWith('[') && v.endsWith(']')) return splitTopLevel(v.slice(1, -1)).map(parseScalar);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

function parseKV(part) {
  const i = part.indexOf(':');
  if (i < 0) return null;
  return [part.slice(0, i).trim(), parseScalar(part.slice(i + 1))];
}

/** Strip a trailing YAML comment that sits outside quotes/brackets. */
function stripComment(line) {
  let q = null, depth = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') depth--;
    else if (ch === '#' && depth === 0 && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

/**
 * Parse every feel-tunables block in a markdown document.
 * @returns {{ blocks: {verb:string, params:object[]}[], errors: string[] }}
 */
export function parseFeelSpec(markdown) {
  const lines = markdown.split(/\r?\n/);
  const blocks = []; const errors = [];
  let inFence = false, fenceLines = [], fenceStart = 0;
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    if (/^\s*```/.test(line)) {
      if (!inFence) { inFence = true; fenceLines = []; fenceStart = n + 1; }
      else { inFence = false; parseFence(fenceLines, fenceStart, blocks, errors); }
      continue;
    }
    if (inFence) fenceLines.push(line);
  }
  return { blocks, errors };
}

function parseFence(fl, startLine, blocks, errors) {
  const idx = fl.findIndex((l) => /^\s*(feel|motion)-tunables\s*:/.test(l));
  if (idx < 0) return;
  const block = { verb: null, params: [] };
  let pending = null;
  const flush = () => { if (pending) { block.params.push(pending.row); pending = null; } };
  for (let i = idx + 1; i < fl.length; i++) {
    const lineNo = startLine + i + 1;
    const line = stripComment(fl[i]);
    if (!line.trim()) continue;
    const verbM = line.match(/^\s*(?:verb|domain)\s*:\s*(.+)$/);
    if (verbM && !pending) { block.verb = String(parseScalar(verbM[1])); continue; }
    if (/^\s*params\s*:\s*$/.test(line)) continue;
    const flowM = line.match(/^\s*-\s*\{(.*)\}\s*$/);
    if (flowM) {
      flush();
      const row = {};
      for (const part of splitTopLevel(flowM[1])) {
        const kv = parseKV(part);
        if (!kv) { errors.push(`feel-spec.md:${lineNo}: cannot parse "${part.trim()}"`); continue; }
        row[kv[0]] = kv[1];
      }
      row.__line = lineNo;
      block.params.push(row);
      continue;
    }
    const blockStartM = line.match(/^\s*-\s*(\w[\w-]*)\s*:\s*(.*)$/);
    if (blockStartM) { flush(); pending = { row: { [blockStartM[1]]: parseScalar(blockStartM[2]), __line: lineNo } }; continue; }
    const contM = line.match(/^\s+(\w[\w-]*)\s*:\s*(.*)$/);
    if (contM && pending) { pending.row[contM[1]] = parseScalar(contM[2]); continue; }
    if (/^\S/.test(line)) break;            // left the feel-tunables mapping
    errors.push(`feel-spec.md:${lineNo}: unrecognised line "${line.trim()}"`);
  }
  flush();
  for (const r of block.params) {
    if (typeof r.param !== 'string') errors.push(`feel-spec.md:${r.__line}: row has no param`);
    if (!('value' in r)) errors.push(`feel-spec.md:${r.__line}: ${r.param} has no value`);
    if (r.unit && !UNITS.has(r.unit)) errors.push(`feel-spec.md:${r.__line}: ${r.param} unit "${r.unit}" not in the closed unit set`);
  }
  blocks.push(block);
}

/**
 * Flatten blocks into { param: value }. A param repeated across verbs is namespaced `verb.param`
 * (feel-tunables-block.md key-namespacing escape valve) and reported.
 */
export function flatten(blocks) {
  const seen = new Map(); const values = {}; const meta = {}; const collisions = [];
  for (const b of blocks) for (const r of b.params) {
    if (typeof r.param !== 'string') continue;
    const list = seen.get(r.param) || []; list.push(b.verb); seen.set(r.param, list);
  }
  for (const b of blocks) for (const r of b.params) {
    if (typeof r.param !== 'string') continue;
    const collide = seen.get(r.param).length > 1;
    const key = collide ? `${b.verb}.${r.param}` : r.param;
    if (collide && !collisions.includes(r.param)) collisions.push(r.param);
    values[key] = r.value;
    meta[key] = { verb: b.verb, unit: r.unit, range: r.range, frozen: r.frozen, source_ref: r.source_ref, line: r.__line };
  }
  return { values, meta, collisions };
}

// ---- unit resolvers (the unit's declared contract, not a freelance transform) ----
export const scaledW = (fracW) => fracW * VIEW_W;
export const scaledH = (fracH) => fracH * VIEW_H;
/**
 * `ms` → sim steps, the ONE time conversion (mechanic-spec §0, feel-spec §0): round(ms·60/1000).
 * Also used by db.js consumers for data `…Ms` fields. `frames` values are already steps.
 */
export const toSteps = (ms) => Math.round((ms * SIM_HZ) / 1000);

// ---- runtime singleton ----
let _values = Object.freeze({});
let _meta = {};
const _read = new Set();

export let TUNING = _values;

/** Install parsed tunables. Returns the list of errors for the dev banner. */
export function installTunables(markdownIn) {
  const markdown = Array.isArray(markdownIn) ? markdownIn.filter(Boolean).join('\n\n') : markdownIn;
  if (!markdown) {
    TUNING = _values = Object.freeze({});
    return { errors: [], count: 0, missing: true };
  }
  const { blocks, errors } = parseFeelSpec(markdown);
  const { values, meta, collisions } = flatten(blocks);
  _meta = meta;
  _values = Object.freeze(values);
  TUNING = DEBUG
    ? new Proxy(_values, { get(t, k) { if (typeof k === 'string') _read.add(k); return t[k]; } })
    : _values;
  if (collisions.length) console.info('[tunables] namespaced (verb.param) collisions:', collisions);
  return { errors, count: Object.keys(values).length, missing: false };
}

/**
 * Read one tunable. `fallback` exists ONLY for the pre-spec skeleton; every call site that uses a
 * fallback is listed by __SW__.tunables.fallbacks() so none survives into Wave 4 unnoticed.
 */
const _fallbacks = new Map();
export function T(key, fallback) {
  const v = TUNING[key];
  if (v === undefined) {
    if (fallback === undefined) throw new Error(`[tunables] "${key}" is not declared in feel-spec.md`);
    _fallbacks.set(key, fallback);
    return fallback;
  }
  _read.add(key);
  return v;
}

export const TunablesDebug = {
  all: () => ({ ..._values }),
  meta: (k) => _meta[k],
  unread: () => Object.keys(_values).filter((k) => !_read.has(k)),
  fallbacks: () => Object.fromEntries(_fallbacks),
};

if (typeof window !== 'undefined') { window.__SW__ = window.__SW__ || {}; window.__SW__.tunables = TunablesDebug; }
