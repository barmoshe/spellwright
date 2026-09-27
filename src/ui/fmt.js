// ui/fmt.js — player-language readouts generated from designer data (wand-editor-ux §4, §5.2;
// accessibility-spec §8 "plain-language numbers, generated from data so they are always true").
// Names and descriptions come from data/*.json; every label and template comes from i18n.

import { cat } from '../data/catalog.js';
import { t } from '../core/i18n.js';
import { TILE } from '../config.js';

// Symbols the baked Kenney fonts may lack (the TA atlas has …×·•←→↑↓ but not ± ° ≈): resolved once
// against the loaded body font, ASCII fallbacks otherwise. initSymbols(scene) is idempotent.
export const SYM = { pm: '±', deg: '°', approx: '≈', to: '→' };
let symInit = false;
export function initSymbols(scene) {
  if (symInit) return SYM;
  const cache = scene.cache.bitmapFont;
  const keys = cache.getKeys ? cache.getKeys() : [];
  const k = keys.find((x) => /body/.test(x)) || keys[0];
  if (!k) return SYM;                              // canvas-text fallback renders any glyph
  symInit = true;
  const chars = (cache.get(k).data || {}).chars || {};
  const ok = (c) => !!chars[c.charCodeAt(0)];
  SYM.pm = ok('±') ? '±' : '+/-'; SYM.deg = ok('°') ? '°' : ' deg'; SYM.approx = ok('≈') ? '≈' : '~'; SYM.to = ok('→') ? '→' : '>';
  return SYM;
}
export const deg = (n) => `${n}${SYM.deg}`;
export const pmDeg = (n) => `${SYM.pm}${n}${SYM.deg}`;

export const sec = (ms) => `${(ms / 1000).toFixed(2)} s`;
export const sec2 = (ms) => `${(ms / 1000).toFixed(2)}s`;
const signedSec = (ms) => `${ms >= 0 ? '+' : '-'}${(Math.abs(ms) / 1000).toFixed(2)} s`;
const pct = (f) => `${Math.round(f * 100)}%`;
const num = (v) => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1));

export const cardOf = (id) => (id ? cat().cards[id] : null);
export const cardName = (id) => (cardOf(id) ? cardOf(id).name : id);
export const wandDef = (id) => cat().wands[id];
export const isSpell = (c) => c && c.type === 'projectile';

export const STATUS_OF = { fire: 'burn', frost: 'chill', shock: 'shock', poison: 'poison' };

/** Type chip words: SPELL · Arcane / MODIFIER / MULTICAST / TRIGGER. */
export function typeWord(card) {
  if (!card) return '';
  if (card.type === 'projectile') return `${t('editor.type.spell')} · ${t('editor.element.' + (card.element || 'arcane'))}`;
  return t('editor.type.' + card.type);
}
export const rarityWord = (r) => t('editor.rarity.' + (r || 'common'));

/** One effect entry (onHit/onExpire/onTick) → short player text. */
export function effectText(e, when) {
  const k = `editor.fx.${e.type}`;
  const p = { r: e.radius, n: e.jumps ?? e.count ?? e.maxTargets, when: when ? t('editor.when.' + when) : '' };
  const s = t(k, p);
  return s === k ? e.type : s;
}

/**
 * Detail rows for a card: [[label, value], ...] (wand-editor-ux §4). Spell: Mana · Delay · Recharge (≠0) ·
 * Damage · Speed · Range (tiles) · Spread, then only the non-zero extras. Modifier: Mana · Delay · Recharge ·
 * one row per effect in player language.
 */
export function cardRows(card) {
  const rows = [[t('editor.row.mana'), String(card.mana ?? 0)], [t('editor.row.delay'), signedSec(card.castDelayAddMs || 0)]];
  if (card.rechargeAddMs) rows.push([t('editor.row.recharge'), signedSec(card.rechargeAddMs)]);
  if (card.type === 'projectile') {
    const s = card.stats;
    rows.push([t('editor.row.damage'), num(s.damage)], [t('editor.row.speed'), num(s.speed)]);
    if (s.speed > 0) rows.push([t('editor.row.range'), t('editor.tiles', { n: Math.round((s.speed * s.lifetimeMs) / 1000 / TILE) })]);
    rows.push([t('editor.row.spread'), pmDeg(num(s.spreadDeg))]);
    if (s.pierce) rows.push([t('editor.row.pierce'), num(s.pierce)]);
    if (s.bounce) rows.push([t('editor.row.bounce'), num(s.bounce)]);
    if (s.homing) rows.push([t('editor.row.homing'), `${deg(num(s.homing))}/s`]);
    const st = STATUS_OF[card.element];
    if (st && s.statusChance) rows.push([t('editor.status.' + st), pct(s.statusChance)]);
    if (s.critChance) rows.push([t('editor.row.crit'), `+${pct(s.critChance)}`]);
    if (card.pattern && card.pattern.type === 'ring') rows.push([t('editor.row.pattern'), t('editor.ring', { n: card.pattern.count })]);
    if (card.behavior && card.behavior.type !== 'bolt') rows.push([t('editor.row.behavior'), t('editor.behavior.' + card.behavior.type)]);
    for (const e of card.onHit || []) rows.push([t('editor.row.effect'), effectText(e, 'hit')]);
    for (const e of card.onExpire || []) rows.push([t('editor.row.effect'), effectText(e, 'expire')]);
    if (card.onTick) for (const e of card.onTick.effects || []) rows.push([t('editor.row.effect'), effectText(e, 'tick')]);
  }
  return rows;
}

/** Modifier / multicast / trigger effect lines (no label column; they read as sentences). */
export function modifierLines(card) {
  if (card.type === 'multicast') return [t('editor.mc', { n: card.count, deg: deg(card.fanDeg) })];
  if (card.type === 'trigger') return [t('editor.trig', { when: card.event === 'timer' ? t('editor.trigTimer', { s: ((card.timerMs || 0) / 1000).toFixed(2) }) : t('editor.trig.' + card.event) })];
  const out = [];
  for (const e of card.effects || []) {
    if (e.op === 'mult') {
      const d = Math.round((e.value - 1) * 100);
      out.push(t('editor.modMult', { sign: d >= 0 ? '+' : '-', n: Math.abs(d), stat: t('editor.statName.' + e.key) }));
    } else if (e.op === 'add') {
      const v = e.key === 'critChance' || e.key === 'statusChance' ? `${Math.round(Math.abs(e.value) * 100)}%` : num(Math.abs(e.value));
      out.push(t('editor.modAdd', { sign: e.value >= 0 ? '+' : '-', v, stat: t('editor.statName.' + e.key) }));
    } else if (e.op === 'set' && e.key === 'element') out.push(t('editor.becomes', { el: t('editor.element.' + e.value) }));
    else if (e.op === 'append') out.push(effectText(e.value, e.key === 'onHit' ? 'hit' : 'expire'));
  }
  if (card.rechargeAddMs && !out.length) out.push(t('editor.rechargeShift', { s: signedSec(card.rechargeAddMs) }));
  return out;
}

/** Short shot tags for cast lines (wand-editor-ux §5.2). */
export function shotTags(s) {
  const card = cardOf(s.cardId);
  const tags = [];
  const base = card ? card.stats : {};
  if (s.element && s.element !== 'arcane') tags.push(t('editor.element.' + s.element).toLowerCase());
  if (s.stats.homing > (base.homing || 0)) tags.push(t('editor.tag.homing'));
  if (s.stats.pierce > (base.pierce || 0)) tags.push(t('editor.tag.pierce', { n: s.stats.pierce }));
  if (s.stats.bounce > (base.bounce || 0)) tags.push(t('editor.tag.bounce', { n: s.stats.bounce }));
  for (const e of [...(s.onHit || []), ...(s.onExpire || [])]) {
    if (e.type === 'explode') tags.push(t('editor.tag.explodes'));
    else if (e.type === 'split') tags.push(t('editor.tag.splits', { n: e.count }));
    else if (e.type === 'chain') tags.push(t('editor.tag.chains', { n: e.jumps }));
    else if (e.type === 'zone') tags.push(t('editor.tag.zone'));
  }
  return tags;
}

/** "Fire Bolt · 7 dmg · fire" — one shot description (no count). */
export function shotLabel(s, short = false) {
  const dmg = t('editor.dmg', { n: num(s.stats.damage) });
  if (short) return `${cardName(s.cardId)} ${num(s.stats.damage)}`;
  return [cardName(s.cardId), dmg, ...shotTags(s)].join(' · ');
}

/**
 * The shot-group text of one cast line. Identical shots merge as "2× Spark Bolt · 5 dmg"; different
 * spells join with " + "; a multicast fan appends "(fan 12°)"; a trigger renders "Spark Bolt 5, on hit: Fireball 10".
 */
export function castShotsText(cast, wandDefn, forceShort = false) {
  const shots = cast.shots || [];
  if (!shots.length) return t('editor.nothing');
  const groups = [];
  for (const s of shots) {
    const key = `${s.cardId}|${Math.round(s.stats.damage * 10)}|${s.element}|${shotTags(s).join(',')}|${s.payload ? s.payload.map((p) => p.cardId).join(',') : ''}`;
    const g = groups.find((x) => x.key === key);
    if (g) g.n++; else groups.push({ key, s, n: 1 });
  }
  const many = forceShort;
  const parts = groups.map(({ s, n }) => {
    let base = many ? shotLabel(s, true) : shotLabel(s);
    if (s.payload && s.payload.length) {
      const pl = s.payload.map((p) => shotLabel(p, true)).join(' + ');
      base = `${shotLabel(s, true)}, ${t('editor.trigOn.' + (s.trigger || 'hit'))}: ${pl}`;
    }
    return n > 1 ? `${n}× ${base}` : base;
  });
  let out = parts.join(' + ');
  const offs = shots.map((s) => s.angleOffset - (s.ringPhase || 0));
  const fan = Math.max(...offs) - Math.min(...offs);
  if (fan > 0.01) out += ` ${t('editor.fan', { deg: deg(num(fan)) })}`;
  const fz = fizzledGroup(cast, wandDefn);
  if (fz) out += ` · ${t('editor.fizzles', { n: ordinal(fz) })}`;
  return out;
}
const ordinal = (n) => t('editor.ordinal.' + Math.min(n, 4));

/**
 * Which top-level group fizzled (1-based), or 0. Re-walks the cast's draw record against the group
 * grammar of mechanic-spec §4 (modifiers accumulate; a projectile closes a group; a multicast needs n
 * sub-groups; a trigger needs a carrier then a payload).
 */
export function fizzledGroup(cast, wandDefn) {
  const n = Math.max(1, (wandDefn && wandDefn.spellsPerCast) | 0);
  if (n < 2) return 0;
  const seq = (cast.drawn || []).filter((d) => !d.skippedNoMana).map((d) => cardOf(d.cardId));
  let i = 0;
  const group = () => {
    for (;;) {
      if (i >= seq.length) return false;
      const c = seq[i++];
      if (!c) continue;
      if (c.type === 'modifier') continue;
      if (c.type === 'projectile') return true;
      if (c.type === 'multicast') { let ok = true; for (let k = 0; k < c.count; k++) ok = group() && ok; return ok; }
      if (c.type === 'trigger') { const a = group(); group(); return a; }
    }
  };
  for (let g = 1; g <= n; g++) if (!group()) return g;
  return 0;
}

/** Full breakdown lines for the detail pane (a focused cast line). */
export function castDetailLines(cast) {
  const out = [];
  const walk = (shots, depth) => {
    for (const s of shots) {
      const pre = depth ? `${'  '.repeat(depth)}> ${t('editor.trigOn.' + (s.__trig || 'hit'))}: ` : '';
      const crit = Math.round((s.critTotal || 0) * 100);
      out.push(`${pre}${cardName(s.cardId)} ${t('editor.dmg', { n: num(s.stats.damage) })}`);
      const extra = [t('editor.critPct', { n: crit }), `${num(s.stats.speed)} px/s`, t('editor.tiles', { n: Math.round((s.stats.speed * s.stats.lifetimeMs) / 1000 / TILE) })];
      const st = STATUS_OF[s.element];
      if (st && s.stats.statusChance) extra.push(`${t('editor.status.' + st)} ${pct(Math.min(1, s.stats.statusChance))}`);
      out.push(`  ${extra.join(' · ')}`);
      const tags = shotTags(s); if (tags.length) out.push(`  ${tags.join(' · ')}`);
      if (s.payload) walk(s.payload.map((p) => ({ ...p, __trig: s.trigger })), depth + 1);
    }
  };
  walk(cast.shots || [], 0);
  return out;
}

/** Warning line text (wand-editor-ux §5.4). */
export function warningText(w, pv) {
  const d = w.data || {};
  switch (w.id) {
    case 'W1': return t('editor.w1');
    case 'W2': return t('editor.w2', { card: cardName(w.cardId), m: d.mana, max: Math.round(d.max) });
    case 'W3': return t('editor.w3', { m: Math.round(d.mana), max: Math.round(d.max) });
    case 'W4': return t('editor.w4', { card: cardName(w.cardId), k: w.cast });
    case 'W5': return d.reason === 'depth' ? t('editor.w5depth') : t('editor.w5', { card: cardName(w.cardId), what: t('editor.w5.' + d.reason), k: w.cast });
    case 'W6': return t('editor.w6', { k: w.cast, n: d.n, cap: d.cap });
    default: return '';
  }
}

export { num, pct };
