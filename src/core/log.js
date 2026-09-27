// core/log.js — telemetry plumbing (architecture §13, invariant I6: no network, no dashboards).
// Ring buffer of typed events so "did X fire?" is answerable from the console in seconds:
//   __SW__.log.last('cast', 5)   __SW__.log.count('kill')
// Also the one place engine warnings that must not be silent go (pool cap, cast truncation).

const CAP = 500;
const buf = new Array(CAP);
let head = 0, total = 0;
const counts = Object.create(null);

export function track(type, payload) {
  buf[head] = { t: performance.now() | 0, type, payload: payload === undefined ? null : payload };
  head = (head + 1) % CAP;
  total++;
  counts[type] = (counts[type] || 0) + 1;
}

/** Warn once per key per session (prevents console spam from a per-step condition). */
const warned = new Set();
export function warnOnce(key, ...msg) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[spellwright] ${key}:`, ...msg);
  track('engine_warning', { key });
}

export const Log = {
  track,
  warnOnce,
  count(type) { return counts[type] || 0; },
  last(type, n = 10) {
    const out = [];
    for (let i = 0; i < Math.min(total, CAP) && out.length < n; i++) {
      const e = buf[(head - 1 - i + CAP) % CAP];
      if (e && (!type || e.type === type)) out.push(e);
    }
    return out;
  },
  get total() { return total; },
};

if (typeof window !== 'undefined') { window.__SW__ = window.__SW__ || {}; window.__SW__.log = Log; }
