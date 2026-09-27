// core/rng.js — deterministic seeded RNG (mulberry32) with named streams (architecture §5.3).
// PURE: no Phaser import. Math.random is banned in src/spells, src/sim, src/run.
// Streams are split from the run seed so cosmetic randomness (fx) never perturbs gameplay.

export class RNG {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this._s = this.seed || 0x9e3779b9;
  }
  /** float in [0,1) */
  next() {
    let t = (this._s = (this._s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** int in [0, n) */
  int(n) { return Math.floor(this.next() * n); }
  /** int in [lo, hi] inclusive */
  range(lo, hi) { return lo + Math.floor(this.next() * (hi - lo + 1)); }
  /** float in [lo, hi) */
  float(lo, hi) { return lo + this.next() * (hi - lo); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[this.int(arr.length)]; }
  /** weighted pick over [{weight}] or parallel weights array */
  weighted(items, weightOf = (x) => x.weight) {
    let total = 0;
    for (let i = 0; i < items.length; i++) total += weightOf(items[i]);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) { r -= weightOf(items[i]); if (r < 0) return items[i]; }
    return items[items.length - 1];
  }
  /** in-place Fisher–Yates */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = this.int(i + 1); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  /** Independent copy at the same position — used for dry-runs (wand-editor preview). */
  clone() { const r = new RNG(this.seed); r._s = this._s; return r; }
  getState() { return this._s; }
  setState(s) { this._s = s >>> 0; }
}

// FNV-1a over a string: stable sub-seed per stream name.
function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export const STREAMS = ['run', 'loot', 'spell', 'ai', 'fx'];

/** Named, independent streams derived from one run seed. */
export function makeStreams(seed) {
  const out = {};
  for (const name of STREAMS) out[name] = new RNG((seed ^ hashStr(name)) >>> 0 || 1);
  return out;
}

/** A fresh run seed. The ONE sanctioned non-deterministic source (seed selection only). */
export function freshSeed() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0] >>> 0 || 1;
  }
  return (Date.now() ^ 0x5bd1e995) >>> 0;
}
