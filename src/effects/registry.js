// effects/registry.js — effect-key registry (architecture §6). Each designer vocabulary key is
// implemented EXACTLY ONCE (defineEffect) and referenced by data. Boot validation lists every
// data-referenced key with no implementation in one error — no silent no-op in a shipped build.
//
// Namespaces mirror the designer's vocabulary (mechanic-spec §5.4, §6.1, §7, §9):
//   behavior   spells[].behavior.type                 bolt | boomerang | orbit | mine
//              hooks: onSpawn(p,ctx) onStep(p,ctx) onHitEnemy(p,t,ctx) onHitWall(p,ctx) onExpire(p,ctx)
//   effect     onHit[] / onExpire[] / onTick.effects[] .type, modifier `append` values
//              explode | chain | split | zone | pull | zap | teleport_caster     — apply(entry, p, at, ctx)
//   relic      relics[].effects[].type                shot_stat | player_stat | status_rule | effect_param | on_event | economy
//   action     relics[].effects[].action.type         heal | mana | explode | spawn_spell | shield | revive | coins
//   movement   enemies[]/bosses[].movement.type       chaser | kiter | swarm | stationary | drifter
//   attack     enemies[]/bosses[].attacks[].type      melee_swipe | shoot | ring | spiral | charge | slam | summon | blink | self_destruct | hazard | sequence
// Hooks must not allocate per step.

import { warnOnce } from '../core/log.js';

export const NAMESPACES = ['behavior', 'effect', 'relic', 'action', 'movement', 'attack'];
const REG = Object.fromEntries(NAMESPACES.map((n) => [n, new Map()]));

// Visible placeholder for a missing behavior: the ProjectileSystem tints it magenta.
export const MISSING = Object.freeze({ __missing: true });

export function defineEffect(ns, key, impl) {
  const m = REG[ns];
  if (!m) throw new Error(`[effects] unknown namespace "${ns}"`);
  if (m.has(key)) throw new Error(`[effects] "${ns}:${key}" defined twice — each key is implemented once`);
  m.set(key, Object.freeze({ key, ...impl }));
}

export function getEffect(ns, key) {
  const impl = REG[ns].get(key);
  if (impl) return impl;
  warnOnce(`missing-effect:${ns}:${key}`, `no implementation for "${key}" (${ns})`);
  return MISSING;
}

export function hasEffect(ns, key) { return REG[ns].has(key); }

/**
 * Walk the catalogue and list every referenced vocabulary key that has no implementation.
 * @param {{ get(table:string): {list:any[]} }} db
 * @returns {string[]}
 */
export function validateEffects(db) {
  const missing = [];
  const seen = new Set();
  // One line per missing key, naming its first use.
  const needOnce = (ns, key, where) => {
    const k = `${ns}:${key}`;
    if (!key || seen.has(k)) return;
    seen.add(k);
    if (!REG[ns].has(key)) missing.push(`${k} (first use: ${where})`);
  };
  const effects = (list, where) => { for (const e of list || []) needOnce('effect', e && e.type, where); };

  for (const c of db.get('spells').list) {
    needOnce('behavior', c.behavior && c.behavior.type, `spells/${c.id}`);
    effects(c.onHit, `spells/${c.id}.onHit`); effects(c.onExpire, `spells/${c.id}.onExpire`);
    if (c.onTick) effects(c.onTick.effects, `spells/${c.id}.onTick`);
  }
  for (const m of db.get('modifiers').list) for (const e of m.effects || []) {
    if (e.op === 'append' && e.value) needOnce('effect', e.value.type, `modifiers/${m.id}`);
  }
  for (const r of db.get('relics').list) for (const e of r.effects || []) {
    needOnce('relic', e.type, `relics/${r.id}`);
    if (e.action) needOnce('action', e.action.type, `relics/${r.id}`);
  }
  for (const table of ['enemies', 'bosses']) for (const en of db.get(table).list) {
    needOnce('movement', en.movement && en.movement.type, `${table}/${en.id}`);
    for (const a of en.attacks || []) needOnce('attack', a.type, `${table}/${en.id}.${a.id || a.type}`);
  }
  return missing;
}

export const EffectsDebug = { list: () => Object.fromEntries(NAMESPACES.map((n) => [n, [...REG[n].keys()]])) };
if (typeof window !== 'undefined') { window.__SW__ = window.__SW__ || {}; window.__SW__.effects = EffectsDebug; }
