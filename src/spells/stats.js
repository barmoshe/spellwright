// spells/stats.js — per-shot stat composition, mechanic-spec §5.1 (normative). PURE.
//   1. wand: speed ×= speedMult; spreadDeg += wand.spreadDeg
//   2. modifiers (draw order) then relic shot_stat (filtered by the element AFTER infusion):
//      all `add` summed onto the base, then all `mult` multiplied (damage product capped);
//      `set` element — last drawn wins; `append` onHit/onExpire — in draw order
//   3. relic effect_param on matching effect entries
//   4. crit rolled once per shot (spell stream)
//   5. clamp to rules.shotClamps
// So `final = (base + Σadd) × Πmult`, then clamp — order-independent within a class.

export const STAT_KEYS = ['damage', 'speed', 'lifetimeMs', 'radius', 'spreadDeg', 'pierce', 'bounce',
  'homing', 'knockback', 'statusChance', 'critChance'];

const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

/**
 * @param {object} card     projectile card (spells.json)
 * @param {object[]} mods   modifier cards in draw order (their `effects[]`)
 * @param {object} env      { wand, rules, relicShotStats: [{stat,op,value,element?}], effectParams: [{effect,field,op,value}], rng }
 * @returns {object} shot   { stats, element, onHit, onExpire, onTick, isCrit }
 */
export function composeShot(card, mods, env) {
  const { wand, rules } = env;
  const base = { ...card.stats };
  base.speed = (base.speed || 0) * (wand ? wand.speedMult ?? 1 : 1);
  base.spreadDeg = (base.spreadDeg || 0) + (wand ? wand.spreadDeg || 0 : 0);

  // element first (set ops, last drawn wins) — relic filters evaluate against it
  let element = card.element || 'arcane';
  const onHit = clone(card.onHit || []);
  const onExpire = clone(card.onExpire || []);
  for (const m of mods) for (const e of m.effects || []) {
    if (e.op === 'set' && e.key === 'element') element = e.value;
    else if (e.op === 'append') (e.key === 'onHit' ? onHit : onExpire).push(clone(e.value));
  }

  const add = Object.create(null), mult = Object.create(null);
  const acc = (key, op, value) => {
    if (op === 'add') add[key] = (add[key] || 0) + value;
    else if (op === 'mult') mult[key] = (mult[key] ?? 1) * value;
  };
  for (const m of mods) for (const e of m.effects || []) if (e.op === 'add' || e.op === 'mult') acc(e.key, e.op, e.value);
  for (const r of env.relicShotStats || []) if (!r.element || r.element === element) acc(r.stat, r.op, r.value);

  const stats = {};
  const cap = rules.casting.modifierDamageMultCap;
  for (const k of STAT_KEYS) {
    let m = mult[k] ?? 1;
    if (k === 'damage' && m > cap) m = cap;
    stats[k] = ((base[k] || 0) + (add[k] || 0)) * m;
  }

  // effect_param relics (e.g. storm_battery: chain jumps +1) on every matching effect entry
  const onTick = clone(card.onTick || null);
  const applyParam = (ent, p) => {
    const cur = ent[p.field] || 0;
    ent[p.field] = p.op === 'mult' ? cur * p.value : p.op === 'set' ? p.value : cur + p.value;
  };
  for (const p of env.effectParams || []) {
    for (const list of [onHit, onExpire, onTick ? onTick.effects : null]) {
      if (list) for (const ent of list) if (ent.type === p.effect) applyParam(ent, p);
    }
  }

  // clamp
  const cl = rules.shotClamps;
  for (const k of STAT_KEYS) if (cl[k]) stats[k] = Math.min(cl[k][1], Math.max(cl[k][0], stats[k]));
  stats.pierce = Math.round(stats.pierce); stats.bounce = Math.round(stats.bounce);

  // crit: rolled once per shot (spell stream)
  const critTotal = rules.crit.baseChance + stats.critChance;
  const isCrit = env.rng ? env.rng.next() < critTotal : false;
  return { stats, element, onHit, onExpire, onTick, isCrit, critTotal };
}
