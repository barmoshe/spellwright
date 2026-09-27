// core/db.js — the designer-data catalogue (architecture §7.1).
// data/index.json = { version, files: { <table>: "data/<file>.json" } }; each table file is
// { version, <table>: [ {id, …}, … ] }. Loaded VERBATIM through the Phaser loader in Boot,
// validated at the boundary, deep-frozen, indexed by id. Nothing writes to the catalogue after boot.

const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
};

/** Minimal per-table required fields. Extended in Wave 4 once specs/design + data land. */
export const REQUIRED = {
  spells: ['id', 'type', 'mana', 'stats', 'behavior', 'rarity', 'keywords', 'tags'],
  modifiers: ['id', 'type', 'mana', 'rarity', 'keywords', 'tags'],
  wands: ['id', 'capacity', 'manaMax', 'manaRegen'],
  relics: ['id', 'rarity', 'category', 'tags', 'effects'],
  enemies: ['id'],
  bosses: ['id'],
  rooms: ['id'],
  // v2 tables (design-v2; Wave D)
  forge: ['id', 'type'],
  modes: ['id'],
  affixes: ['id'],
  economy: ['id'],
};

/** Per-type required fields of a forge.json record (merge / evolve / slot). */
const FORGE_FIELDS = { merge: ['from', 'count', 'to', 'cost'], evolve: ['base', 'catalyst', 'to', 'cost'], slot: ['costBase', 'costStep', 'maxCapacity', 'maxBuysPerRun'] };

class Catalogue {
  constructor() {
    this.tables = {};          // table -> { list, byId }
    this.index = null;
    this.errors = [];
    this.loaded = false;
  }

  /** The list of [table, url] pairs Boot must queue. */
  filesFromIndex(index) {
    this.index = index || null;
    if (!index || !index.files) return [];
    return Object.entries(index.files);
  }

  /** Install one parsed table file (called per file from Boot). */
  install(table, json) {
    if (!json) { this.errors.push(`data: table "${table}" failed to load`); return; }
    const list = Array.isArray(json[table]) ? json[table] : Array.isArray(json) ? json : null;
    if (!list) { this.errors.push(`data: ${table}.json has no "${table}" array`); return; }
    const byId = Object.create(null);
    const req = REQUIRED[table] || ['id'];
    list.forEach((rec, i) => {
      for (const f of req) if (rec[f] === undefined) this.errors.push(`data: ${table}[${i}] missing "${f}"`);
      if (rec.id !== undefined) {
        if (byId[rec.id]) this.errors.push(`data: ${table} duplicate id "${rec.id}"`);
        byId[rec.id] = rec;
      }
    });
    // `meta` keeps the file's non-array keys (e.g. rooms.json legend/tileSize) verbatim.
    const meta = {};
    if (!Array.isArray(json)) for (const [k, v] of Object.entries(json)) if (k !== table) meta[k] = v;
    this.tables[table] = deepFreeze({ list, byId, version: json.version ?? null, meta });
  }

  finish() { this._crossCheck(); this.loaded = true; deepFreeze(this.tables); }

  /** v2 cross-table references (forge recipes, duo parents, evolution catalysts) resolve to real ids. */
  _crossCheck() {
    const card = (id) => (this.tables.spells && this.tables.spells.byId[id]) || (this.tables.modifiers && this.tables.modifiers.byId[id]);
    const relic = (id) => this.tables.relics && this.tables.relics.byId[id];
    const forge = this.tables.forge;
    if (forge) forge.list.forEach((r, i) => {
      const need = FORGE_FIELDS[r.type];
      if (!need) { this.errors.push(`data: forge[${i}] unknown type "${r.type}"`); return; }
      for (const f of need) if (r[f] === undefined) this.errors.push(`data: forge[${i}] (${r.type}) missing "${f}"`);
      for (const f of ['from', 'to', 'base']) if (r[f] !== undefined && !card(r[f])) this.errors.push(`data: forge.${r.id}.${f} "${r[f]}" is not a card`);
      if (r.catalyst && r.catalyst.kind === 'relic' && !relic(r.catalyst.id)) this.errors.push(`data: forge.${r.id} catalyst relic "${r.catalyst.id}" missing`);
    });
    const relics = this.tables.relics;
    if (relics) for (const r of relics.list) {
      if (r.duo) for (const p of r.duo.parents || []) if (!relic(p)) this.errors.push(`data: relics.${r.id} duo parent "${p}" missing`);
      for (const e of r.effects || []) if (e.type === 'on_event' && e.action && e.action.type === 'spawn_spell' && !card(e.action.spellId)) this.errors.push(`data: relics.${r.id} spawn_spell "${e.action.spellId}" missing`);
    }
  }

  get(table) { return this.tables[table] || { list: [], byId: Object.create(null) }; }
  byId(table, id) { const t = this.tables[table]; return t ? t.byId[id] : undefined; }
  has(table) { return !!this.tables[table]; }
}

export const DB = new Catalogue();
if (typeof window !== 'undefined') { window.__SW__ = window.__SW__ || {}; window.__SW__.db = DB; }
