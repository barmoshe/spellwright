// spells/keywords.js — mechanic-spec §9.7 defence-breaking keywords, derived from what a shot DOES. PURE
// (no Phaser, node-runnable). One derivation for every consumer:
//   • Combat (A) at hit time: shotKeywords(runtimeShot) + instanceKeywords({source, element, shot})
//   • HUD counter pips (B) + wand editor Enables chips / counter pips (C): wandKeywords(run, i) / planKeywords(pv)
//   • economy counter guarantee + card chips: cardKeywords(cat, id) (the data's generated `keywords[]`)
//
//   pierce = a direct hit from a shot whose composed pierce >= 1, or any boomerang / orbit shot  → shields
//   blast  = any `explode` damage (spell, modifier or relic), an Overload, or a self-destruct     → armour
//   shock  = damage whose element is shock, or a `chain` / `zap` hit                               → wards
// A keyword on a skipped (no mana) or wasted card never counts: the dry-run only contains FIRED shots.

export const BREAKING = Object.freeze(['pierce', 'blast', 'shock']);
/** defence type ← the keyword that breaks it (rules.defences.*.breakKeyword is the data source; this is the fallback) */
export const DEFENCE_OF = Object.freeze({ pierce: 'shield', blast: 'armour', shock: 'ward' });

const none = () => ({ pierce: false, blast: false, shock: false });
const behaviorOf = (s) => (typeof s.behavior === 'string' ? s.behavior : s.behavior && s.behavior.type) || s.bp && s.bp.type || 'bolt';

function effectTypes(s) {
  const out = [];
  for (const e of s.onHit || []) out.push(e.type);
  for (const e of s.onExpire || []) out.push(e.type);
  if (s.onTick && s.onTick.effects) for (const e of s.onTick.effects) out.push(e.type);
  return out;
}

/**
 * Keywords a shot can deliver. Accepts a ShotSpec (castWand: {stats, behavior:{type}, element, onHit…})
 * or a live Shots.js shot ({pierce, behavior:'bolt', element, onHit…}). Payload shots are NOT included
 * (they are separate shots at release). @returns {{pierce:boolean, blast:boolean, shock:boolean}}
 */
export function shotKeywords(s) {
  if (!s) return none();
  const b = behaviorOf(s);
  const pierceN = s.stats ? s.stats.pierce : s.pierce;
  const ef = effectTypes(s);
  return {
    pierce: (pierceN | 0) >= 1 || b === 'boomerang' || b === 'orbit',
    blast: ef.includes('explode'),
    shock: s.element === 'shock' || ef.includes('chain') || ef.includes('zap'),
  };
}

/**
 * The keywords ONE damage instance carries (the defence check, mechanic-spec §9.6–9.7).
 * @param {{source:string, element?:string|null, shot?:object, reaction?:string|null}} o
 *   source ∈ 'direct'|'explode'|'chain'|'zap'|'zone'|'relic'|'reaction'|'status'|'self_destruct'|…
 *   reaction  the reaction name for source 'reaction' ('overload' counts as BLAST)
 *   shot   the live shot for a 'direct' hit (its pierce / behaviour decide PIERCE)
 */
export function instanceKeywords(o) {
  const src = o.source;
  const k = none();
  if (src === 'direct' && o.shot) k.pierce = shotKeywords(o.shot).pierce;
  // 'relic' = a relic `explode` action (Combat.explodeAt source 'relic'); relic spawn_spell shots arrive as 'direct'
  k.blast = src === 'explode' || src === 'relic' || src === 'self_destruct' || (src === 'reaction' && o.reaction === 'overload');
  k.shock = src !== 'status' && (o.element === 'shock' || src === 'chain' || src === 'zap');
  return k;
}

/** First breaking keyword an instance carries (order pierce, blast, shock) or null — handy for EV.DEFENCE.keyword. */
export function firstKeyword(k) { for (const w of BREAKING) if (k && k[w]) return w; return null; }

/** OR of every fired shot (incl. nested payloads) of a previewCycle result. */
export function planKeywords(pv) {
  const k = none();
  const walk = (shots) => {
    for (const s of shots || []) {
      const sk = shotKeywords(s);
      k.pierce ||= sk.pierce; k.blast ||= sk.blast; k.shock ||= sk.shock;
      if (s.payload) walk(s.payload);
    }
  };
  for (const c of (pv && pv.casts) || []) walk(c.shots);
  return k;
}

// memo: the dry-run is ~16 casts; HUD pips ask on WAND_CHANGED only, but keep repeated asks free.
const _memo = new WeakMap();
/**
 * The defence-breaking keywords wand `wandIndex` actually fires this cycle (a dry-run from a reset deck at
 * full mana — wand-editor-ux §5.1). @returns {{pierce:boolean, blast:boolean, shock:boolean}}
 */
export function wandKeywords(run, wandIndex, slotsOverride = null) {
  const w = run && run.wands && run.wands[wandIndex];
  if (!w) return none();
  const slots = slotsOverride || w.state.slots;
  const sig = `${w.id}|${w.def.capacity}|${w.def.spellsPerCast}|${slots.join(',')}|${(run.relics || []).join(',')}`;
  let m = _memo.get(run);
  if (!m) { m = new Map(); _memo.set(run, m); }
  const hit = m.get(wandIndex);
  if (hit && hit.sig === sig) return { ...hit.k };
  const k = planKeywords(run.preview(wandIndex, slotsOverride || undefined));
  m.set(wandIndex, { sig, k });
  return { ...k };
}

/** A card's keywords from the data (build.py-generated from behaviour: the single source). */
export function cardKeywords(cat, id) {
  const rec = (cat && cat.cards && cat.cards[id]) || null;
  const list = (rec && rec.keywords) || [];
  return { pierce: list.includes('pierce'), blast: list.includes('blast'), shock: list.includes('shock'), list };
}

/** The set of breaking keywords carried by any card the run owns (wand slots + bag). */
export function ownedKeywords(run) {
  const k = none();
  const see = (id) => { if (!id) return; const c = cardKeywords(run.cat, id); k.pierce ||= c.pierce; k.blast ||= c.blast; k.shock ||= c.shock; };
  for (const w of run.wands || []) for (const id of w.state.slots) see(id);
  for (const id of run.bag || []) see(id);
  return k;
}

/** Defence type a keyword answers, from rules.defences (data) with the §9.6 fallback. */
export function defenceFor(cat, keyword) {
  const d = cat && cat.rules && cat.rules.defences;
  if (d) for (const [type, rec] of Object.entries(d)) if (rec && rec.breakKeyword === keyword) return type;
  return DEFENCE_OF[keyword] || null;
}
