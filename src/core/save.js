// core/save.js — versioned localStorage persistence (specs/engine/save-schema.md, schema v2).
// Settings + meta progression only; runs are not save-resumable. The ONLY module that touches
// localStorage. Load never throws; storage-unavailable degrades to in-memory with one warning.

const KEY = 'spellwright.save';
const KEY_BAK = 'spellwright.save.bak';
const KEY_CORRUPT = 'spellwright.save.corrupt';
const KEY_PREMIGRATE = 'spellwright.save.v1';   // the raw v1 document, written once before the v1→v2 migration
export const SCHEMA_VERSION = 2;

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
  // settings-spec §6 (v2 touch rows): additive keys, defaults on load, no SCHEMA_VERSION bump
  touchControls: { def: 'auto', oneOf: ['auto', 'on', 'off'] },
  touchFire: { def: 'auto', oneOf: ['auto', 'stick'] },
  touchStickSide: { def: 'standard', oneOf: ['standard', 'swapped'] },
  haptics: { def: 'low', oneOf: ['off', 'low', 'high'] },
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
      milestones: [],                  // PAID goal ids (unlocks.json; v2 goals — the v1 field name is kept for the codex)
      currency: {},
      stats: { runs: 0, wins: 0, deaths: 0, abandons: 0, kills: 0, bestFloor: 0, bestTimeS: null, playtimeS: 0, payloadsReleased: 0,
        defencesBroken: 0, evolves: 0, duos: 0, dailyComplete: 0, bestHeatWin: null },   // v2 goal counters
      reactionsSeen: [],               // lifetime (Alchemist milestone)
      discovered: { cards: [], relics: [], enemies: [], reactions: [] },   // codex
      codexSeenCount: 0,               // entries count when the codex was last opened ("Codex (new)")
      ftue: {},                        // { flagName: true } incl. tutorialDone (ftue-flow §3)
      lastLoadout: 'apprentice',
      // ---- v2 (save-schema v2, Wave E) ----
      lastMode: 'standard',            // 'standard' | 'gentle' | 'daily' (Mode Select pre-selection)
      heat: { max: 0, last: 0 },       // highest unlocked Heat tier (a win at n unlocks n+1) · last selected
      gentle: { losses: 0 },           // lost Gentle runs (never decreases): bonus = modes.gentle.rule × losses, capped
      daily: { date: null, attempts: 0, first: null, best: null },   // today's (UTC) daily; `first` is the result that counts
      goals: { earned: [], seen: 0 },  // earned-but-unpaid early goals (queue) · goals complete when Goals was last opened
      bossesReached: [],               // mini-boss / boss ids whose room was entered (reach_miniboss)
      bossesKilled: [],                // lifetime boss + mini-boss kills (kill_boss)
      statBonus: { startCapacity: 0 }, // stat unlocks paid by goals (the only one: +1 starting slot)
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
  if (Number.isFinite(m.codexSeenCount)) d.meta.codexSeenCount = m.codexSeenCount | 0;
  // ---- v2 fields ----
  if (['standard', 'gentle', 'daily'].includes(m.lastMode)) d.meta.lastMode = m.lastMode;
  const int = (v, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v | 0)) : lo);
  if (m.heat && typeof m.heat === 'object') {
    d.meta.heat.max = int(m.heat.max, 0, HEAT_MAX);
    d.meta.heat.last = Math.min(d.meta.heat.max, int(m.heat.last, 0, HEAT_MAX));
  }
  if (m.gentle && typeof m.gentle === 'object') d.meta.gentle.losses = int(m.gentle.losses, 0, 1e6);
  const dy = m.daily;
  if (dy && typeof dy === 'object' && typeof dy.date === 'string') {
    d.meta.daily = { date: dy.date, attempts: int(dy.attempts, 0, 1e6), first: dailyRes(dy.first), best: dailyRes(dy.best) };
  }
  if (m.goals && typeof m.goals === 'object') { d.meta.goals.earned = uniq(m.goals.earned); d.meta.goals.seen = int(m.goals.seen, 0, 1e4); }
  d.meta.bossesReached = uniq(m.bossesReached);
  d.meta.bossesKilled = uniq(m.bossesKilled);
  if (m.statBonus && typeof m.statBonus === 'object') for (const [k, v] of Object.entries(m.statBonus)) if (Number.isFinite(v)) d.meta.statBonus[k] = v | 0;
  if (Number.isFinite(m.migratedFrom)) d.meta.migratedFrom = m.migratedFrom | 0;
  return d;
}

const HEAT_MAX = 5;   // rules.heat.maxLevel (validation bound only; the catalogue is not loaded here)
/** A daily result record (first attempt / best of the day), or null. */
function dailyRes(r) {
  if (!r || typeof r !== 'object' || !['victory', 'death', 'abandon'].includes(r.outcome)) return null;
  const n = (v) => (Number.isFinite(v) ? v : 0);
  return { date: String(r.date || ''), outcome: r.outcome, floor: n(r.floor), step: n(r.step), timeS: n(r.timeS), kills: n(r.kills),
    loadoutId: String(r.loadoutId || ''), ruleId: String(r.ruleId || '') };
}

// v1 milestone ids → v2 goal ids (content-inventory §0.1). all_reactions / slayer_300 are dropped: their
// already-unlocked ids stay unlocked because unlock lists persist by id.
const V1_GOAL = { reach_floor_2: 'g_reach_f2', kill_ossuary_knight: 'g_kill_boss1', reach_floor_3: 'g_reach_f3',
  kill_mire_queen: 'g_kill_boss2', win_run: 'g_win', first_payload: 'g_first_payload', three_deaths: 'g_persistence' };
const V1_BOSS = { kill_ossuary_knight: 'ossuary_knight', kill_mire_queen: 'mire_queen', win_run: 'archlich' };

/** v1 → v2 (pure). Never drops an unlock; curseLevel → heat; curses feature → heat feature. */
function migrateV1(doc) {
  const m = { ...(doc.meta || {}) };
  const old = Array.isArray(m.milestones) ? m.milestones.filter((x) => typeof x === 'string') : [];
  const goals = [];
  for (const id of old) {
    const g = V1_GOAL[id] || (id.startsWith('g_') ? id : null);     // pre-release v1 docs already hold v2 goal ids
    if (g && !goals.includes(g)) goals.push(g);
  }
  const wins = Number(m.stats && m.stats.wins) || 0;
  const won = old.includes('win_run') || goals.includes('g_win') || wins > 0;
  const curse = Math.max(0, Math.min(3, Number(m.curseLevel) | 0));
  const unlocked = { ...(m.unlocked || {}) };
  const features = Array.isArray(unlocked.features) ? unlocked.features.slice() : [];
  if ((won || features.includes('curses')) && !features.includes('heat')) features.push('heat');
  unlocked.features = features;
  const bosses = old.map((id) => V1_BOSS[id]).filter(Boolean);
  delete m.curseLevel;
  // a v1 win was at an unrecorded curse level: count it as a Heat 0 win (never overstates, feeds win_heat)
  if (won) m.stats = { ...(m.stats || {}), bestHeatWin: 0 };
  return { ...doc, schema: 2,
    meta: { ...m, milestones: goals, unlocked, heat: { max: won ? Math.max(1, curse) : 0, last: won ? curse : 0 },
      bossesKilled: bosses, bossesReached: bosses.slice(), migratedFrom: 1 } };
}

// Migration chain: MIGRATIONS[n] upgrades a schema-n doc to schema n+1. Pure functions.
const MIGRATIONS = {
  1: migrateV1,
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

  _parse(raw, primary = false) {
    const doc = JSON.parse(raw);
    if (!doc || typeof doc !== 'object') throw new Error('save is not an object');
    if (Number(doc.schema) > SCHEMA_VERSION) { this.readOnly = true; }   // newer build wrote it: don't overwrite
    const old = (Number(doc.schema) || 1) < SCHEMA_VERSION;
    const out = normalize(this.readOnly ? doc : migrate(doc));
    // v1 players are never corrupted: the raw pre-migration document is kept once under its own key
    // (the .bak rotation would overwrite it on the second write); migration errors throw BEFORE this point.
    if (old && primary && !this.readOnly) {
      try { if (!this.ls.getItem(KEY_PREMIGRATE)) this.ls.setItem(KEY_PREMIGRATE, raw); } catch (_) { /* ignore */ }
      this.migrated = true;
    }
    return out;
  }

  _load() {
    if (!this.ls) return defaultDoc();
    const raw = this.ls.getItem(KEY);
    if (!raw) return defaultDoc();
    try { const d = this._parse(raw, true); if (this.migrated) { this.doc = d; this.flush(); } return d; }
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
    this._recordV2(summary);
    this.flush();
  }

  /** v2 lifetime counters + mode results (goal conditions read these; run/meta.js pays the goals). */
  _recordV2(s) {
    const m = this.doc.meta, st = m.stats;
    st.defencesBroken += s.defencesBroken | 0;
    st.evolves += s.evolves | 0;
    st.duos += s.duosFormed | 0;
    const add = (list, ids) => { for (const id of ids || []) if (!list.includes(id)) list.push(id); };
    add(m.bossesReached, s.bossesReached);
    add(m.bossesKilled, s.bossesKilled);
    add(m.bossesKilled, s.miniBossesKilled);
    const mode = s.mode || 'standard';
    if (mode === 'standard' && s.outcome === 'victory') {
      const h = s.heatLevel | 0;
      m.heat.max = Math.min(HEAT_MAX, Math.max(m.heat.max, h + 1));    // rules.heat.unlockNextOnWinAt
      st.bestHeatWin = st.bestHeatWin == null ? h : Math.max(st.bestHeatWin, h);
    }
    if (mode === 'gentle' && s.outcome === 'death') m.gentle.losses++;     // "each lost Gentle run"; never decreases
    if (mode === 'daily' && s.daily) {
      const dy = s.daily;
      if (m.daily.date !== dy.date) m.daily = { date: dy.date, attempts: 0, first: null, best: null };
      m.daily.attempts++;
      const res = { date: dy.date, outcome: s.outcome, floor: s.floor | 0, step: s.step | 0, timeS: s.timeS || 0, kills: s.kills | 0,
        loadoutId: dy.loadoutId, ruleId: dy.ruleId };
      if (!m.daily.first) m.daily.first = res;                            // attempts: unlimited_first_counts
      if (!m.daily.best || dailyBetter(res, m.daily.best)) m.daily.best = res;
      if (s.outcome === 'victory' || (s.maxFloor | 0) >= 2) st.dailyComplete++;   // "win or lose after Floor 1"
    }
  }

  /** Settings → Reset all progress: erases unlocks, codex and stats; settings are kept (settings-spec). */
  reset() { const settings = this.doc.settings; this.doc = defaultDoc(); this.doc.settings = settings; this.readOnly = false; this.flush(); }
}

/** Daily "best today": a win beats any loss (faster win better); else deeper (floor, room) is better. */
function dailyBetter(a, b) {
  const w = (r) => (r.outcome === 'victory' ? 1 : 0);
  if (w(a) !== w(b)) return w(a) > w(b);
  if (w(a)) return a.timeS < b.timeS;
  return a.floor * 100 + a.step > b.floor * 100 + b.step;
}

export const Save = new SaveStore();
if (typeof window !== 'undefined') { window.__SW__ = window.__SW__ || {}; window.__SW__.save = Save; }
