// core/save.js — versioned localStorage persistence (specs/engine/save-schema.md, schema v1).
// Settings + meta progression only; runs are not save-resumable. The ONLY module that touches
// localStorage. Load never throws; storage-unavailable degrades to in-memory with one warning.

const KEY = 'spellwright.save';
const KEY_BAK = 'spellwright.save.bak';
const KEY_CORRUPT = 'spellwright.save.corrupt';
export const SCHEMA_VERSION = 1;

// Ranges double as validation (clamp on load / set).
const SETTINGS_SPEC = {
  masterVolume: { def: 80, min: 0, max: 100 },
  musicVolume: { def: 70, min: 0, max: 100 },
  sfxVolume: { def: 90, min: 0, max: 100 },
  uiVolume: { def: 80, min: 0, max: 100 },
  muteOnFocusLoss: { def: true, bool: true },
  screenShake: { def: 100, min: 0, max: 100 },
  reducedMotion: { def: null, triBool: true },   // null = follow OS
  flashIntensity: { def: 100, min: 0, max: 100 },
  scaleMode: { def: 'auto', oneOf: ['auto', 'integer', 'fill'] },   // settings-spec §1.1 (O-UX-1)
  enemyShotEmphasis: { def: 'standard', oneOf: ['standard', 'high'] },
  showHitbox: { def: false, bool: true },
  castMode: { def: 'hold', oneOf: ['hold', 'toggle'] },
  tutorialHints: { def: true, bool: true },
  bloom: { def: false, bool: true },
  damageNumbers: { def: true, bool: true },
  showFps: { def: false, bool: true },
  aimAssist: { def: 100, min: 0, max: 100 },   // effective = feel aimAssistStrength × aimAssist/100 (O-UX-2)
  bindings: { def: () => ({ kbm: {}, pad: {} }), obj: true },
  language: { def: 'en', str: true },
  // controller-prompts §7/§8: additive keys, missing ones take defaults on load (no SCHEMA_VERSION bump).
  promptStyle: { def: 'auto', oneOf: ['auto', 'xbox', 'playstation'] },
  vibration: { def: 'low', oneOf: ['off', 'low', 'high'] },
};

function defaultSettings() {
  const s = {};
  for (const [k, spec] of Object.entries(SETTINGS_SPEC)) s[k] = typeof spec.def === 'function' ? spec.def() : spec.def;
  return s;
}

function defaultDoc() {
  return {
    schema: SCHEMA_VERSION,
    createdAt: Date.now(),
    settings: defaultSettings(),
    meta: {
      unlocked: { cards: [], wands: [], relics: [], loadouts: [], features: [] },   // ids locked by default that are now unlocked
      milestones: [],                  // achieved unlocks.json ids
      currency: {},
      stats: { runs: 0, wins: 0, deaths: 0, abandons: 0, kills: 0, bestFloor: 0, bestTimeS: null, playtimeS: 0, payloadsReleased: 0 },
      reactionsSeen: [],               // lifetime (Alchemist milestone)
      discovered: { cards: [], relics: [], enemies: [], reactions: [] },   // codex
      codexSeenCount: 0,               // entries count when the codex was last opened ("Codex (new)")
      ftue: {},                        // { flagName: true } incl. tutorialDone (ftue-flow §3)
      lastLoadout: 'apprentice',
      curseLevel: 0,
    },
  };
}

function validSetting(k, v) {
  const spec = SETTINGS_SPEC[k];
  if (!spec) return undefined;
  if (spec.bool) return typeof v === 'boolean' ? v : spec.def;
  if (spec.triBool) return v === null || typeof v === 'boolean' ? v : spec.def;
  if (spec.str) return typeof v === 'string' ? v : spec.def;
  if (spec.oneOf) return spec.oneOf.includes(v) ? v : spec.def;
  if (spec.obj) return v && typeof v === 'object' ? { kbm: { ...(v.kbm || {}) }, pad: { ...(v.pad || {}) } } : spec.def();
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(spec.max, Math.max(spec.min, n)) : spec.def;
}

const uniq = (a) => (Array.isArray(a) ? [...new Set(a.filter((x) => typeof x === 'string'))] : []);

/** defaults ⊕ loaded, with validation (save-schema §Validation). */
function normalize(doc) {
  const d = defaultDoc();
  if (!doc || typeof doc !== 'object') return d;
  d.createdAt = Number(doc.createdAt) || d.createdAt;
  const s = doc.settings || {};
  for (const k of Object.keys(SETTINGS_SPEC)) if (k in s) d.settings[k] = validSetting(k, s[k]);
  // Pre-release v1 rename (never shipped, so no schema bump): pixelPerfect → scaleMode.
  // A doc carrying `pixelPerfect` predates the settings-spec delta: its aimAssist 0 was the old
  // default (no aim-assist row existed), never a player choice — move it to the new default.
  if (typeof s.pixelPerfect === 'boolean') {
    if (!('scaleMode' in s)) d.settings.scaleMode = s.pixelPerfect ? 'auto' : 'fill';
    if (s.aimAssist === 0) d.settings.aimAssist = SETTINGS_SPEC.aimAssist.def;
  }
  const m = doc.meta || {};
  for (const kind of Object.keys(d.meta.unlocked)) d.meta.unlocked[kind] = uniq(m.unlocked?.[kind]);
  for (const kind of Object.keys(d.meta.discovered)) d.meta.discovered[kind] = uniq(m.discovered?.[kind]);
  d.meta.milestones = uniq(m.milestones);
  d.meta.reactionsSeen = uniq(m.reactionsSeen);
  if (m.currency && typeof m.currency === 'object') {
    for (const [k, v] of Object.entries(m.currency)) if (Number.isFinite(v)) d.meta.currency[k] = Math.max(0, v);
  }
  for (const k of Object.keys(d.meta.stats)) {
    const v = m.stats?.[k];
    if (v === null || Number.isFinite(v)) d.meta.stats[k] = v;
  }
  if (m.ftue && typeof m.ftue === 'object') for (const [k, v] of Object.entries(m.ftue)) if (v === true) d.meta.ftue[k] = true;
  if (typeof m.lastLoadout === 'string') d.meta.lastLoadout = m.lastLoadout;
  if (Number.isFinite(m.curseLevel)) d.meta.curseLevel = Math.max(0, Math.min(3, m.curseLevel | 0));
  if (Number.isFinite(m.codexSeenCount)) d.meta.codexSeenCount = m.codexSeenCount | 0;
  return d;
}

// Migration chain: MIGRATIONS[n] upgrades a schema-n doc to schema n+1. Pure functions.
const MIGRATIONS = {
  // 1: (doc) => ({ ...doc, schema: 2, … }),
};

function migrate(doc) {
  let v = Number(doc.schema) || 1;
  while (v < SCHEMA_VERSION) {
    const fn = MIGRATIONS[v];
    if (!fn) throw new Error(`no migration from schema ${v}`);
    doc = fn(doc); v = doc.schema;
  }
  return doc;
}

function storage() {
  try { const k = '__sw_probe__'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; }
  catch (e) { return null; }
}

class SaveStore {
  constructor() {
    this.ls = storage();
    this.readOnly = false;
    this._timer = null;
    if (!this.ls) console.warn('[save] localStorage unavailable — progress is in-memory only this session');
    this.doc = this._load();
  }

  _parse(raw) {
    const doc = JSON.parse(raw);
    if (Number(doc.schema) > SCHEMA_VERSION) { this.readOnly = true; }   // newer build wrote it: don't overwrite
    return normalize(this.readOnly ? doc : migrate(doc));
  }

  _load() {
    if (!this.ls) return defaultDoc();
    const raw = this.ls.getItem(KEY);
    if (!raw) return defaultDoc();
    try { return this._parse(raw); }
    catch (e) {
      console.warn('[save] primary save unreadable, trying backup', e);
      try { this.ls.setItem(KEY_CORRUPT, raw); } catch (_) { /* ignore */ }
      const bak = this.ls.getItem(KEY_BAK);
      if (bak) { try { return this._parse(bak); } catch (_) { /* fall through */ } }
      return defaultDoc();
    }
  }

  /** Debounced write (500 ms). */
  persist() {
    if (!this.ls || this.readOnly) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 500);
  }

  flush() {
    clearTimeout(this._timer); this._timer = null;
    if (!this.ls || this.readOnly) return;
    try {
      const prev = this.ls.getItem(KEY);
      if (prev) this.ls.setItem(KEY_BAK, prev);
      this.ls.setItem(KEY, JSON.stringify(this.doc));
    } catch (e) { console.warn('[save] write failed', e); }
  }

  // ---- settings ----
  get settings() { return this.doc.settings; }
  setSetting(k, v) {
    const val = validSetting(k, v);
    if (val === undefined) { console.warn('[save] unknown setting', k); return; }
    this.doc.settings[k] = val;
    this.persist();
  }
  /** reducedMotion resolved against the OS preference when the setting is null. */
  get reducedMotion() {
    const s = this.doc.settings.reducedMotion;
    if (s !== null) return s;
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ---- meta ----
  get meta() { return this.doc.meta; }
  /** Set by Boot: catalogue's lockedByDefault sets, so isUnlocked() knows what starts locked. */
  setLockTable(locked) { this.locked = locked; }
  /** kind: 'cards'|'wands'|'relics'|'loadouts'|'features' */
  isUnlocked(kind, id) {
    const L = this.locked && this.locked[kind];
    if (!L || !L.has(id)) return true;
    return this.doc.meta.unlocked[kind]?.includes(id) || false;
  }
  unlock(kind, id) { const a = this.doc.meta.unlocked[kind]; if (a && !a.includes(id)) { a.push(id); this.persist(); } }
  discover(kind, id) { const a = this.doc.meta.discovered[kind]; if (a && !a.includes(id)) { a.push(id); this.persist(); return true; } return false; }
  isDiscovered(kind, id) { return !!this.doc.meta.discovered[kind]?.includes(id); }
  addCurrency(k, n) { this.doc.meta.currency[k] = Math.max(0, (this.doc.meta.currency[k] || 0) + n); this.persist(); }
  flag(name) { return !!this.doc.meta.ftue[name]; }
  setFlag(name) { if (!this.doc.meta.ftue[name]) { this.doc.meta.ftue[name] = true; this.persist(); } }
  clearFtue() { this.doc.meta.ftue = {}; this.flush(); }
  setMeta(k, v) { this.doc.meta[k] = v; this.persist(); }

  /** summary: RunState.summary(). Updates lifetime counters. Milestones are applied by run/meta.js. */
  recordRun(summary) {
    const st = this.doc.meta.stats;
    st.runs++;
    if (summary.outcome === 'victory') st.wins++;
    if (summary.outcome === 'death') st.deaths++;
    if (summary.outcome === 'abandon') st.abandons++;
    st.kills += summary.kills | 0;
    st.payloadsReleased += summary.payloadsReleased | 0;
    st.bestFloor = Math.max(st.bestFloor, summary.maxFloor | 0);
    st.playtimeS += Math.round(summary.timeS || 0);
    if (summary.outcome === 'victory' && (st.bestTimeS === null || summary.timeS < st.bestTimeS)) st.bestTimeS = Math.round(summary.timeS);
    for (const r of summary.reactionsSeen || []) if (!this.doc.meta.reactionsSeen.includes(r)) this.doc.meta.reactionsSeen.push(r);
    this.flush();
  }

  /** Settings → Reset all progress: erases unlocks, codex and stats; settings are kept (settings-spec). */
  reset() { const settings = this.doc.settings; this.doc = defaultDoc(); this.doc.settings = settings; this.readOnly = false; this.flush(); }
}

export const Save = new SaveStore();
if (typeof window !== 'undefined') { window.__SW__ = window.__SW__ || {}; window.__SW__.save = Save; }
