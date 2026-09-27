// spells/preview.js — wand-editor cast preview (wand-editor-ux §5.1; systems.md §7): a dry-run of
// mechanic-spec §4 on a COPY of the wand state and a CLONE of the spell RNG, so previewing never
// changes what the real wand fires next. PURE.
//
// "The preview shows the program's steady cycle from a reset deck at full mana." Mana regenerates
// during each cast's delay (the wand's real regen, with relic mults), exactly as in play.

import { castWand, buildOrder, manaMaxOf, manaRegenOf, effectiveRechargeMs } from './evaluate.js';

const MAX_CASTS = 16;

/**
 * @param {object} wandDef
 * @param {(string|null)[]} slots   the slot contents to preview (the current edit)
 * @param {object} cards            merged card catalogue by id
 * @param {object} env              as castWand's env; env.rng MUST be a clone (rng.clone())
 * @returns {{
 *   casts: { index, drawn, wasted, inertTriggers, skipped, truncatedShots, shots, delayAfterMs, recharge, manaSpent, wrapped }[],
 *   cycleMs, manaPerCycle, maxManaSingleCast, dpsSingleTarget, sustainable, secondsOfFire, regenPerS, manaMax,
 *   effectiveRechargeMs, warnings: {id, severity:'error'|'warn', cardId?, cast?, data?}[], nextSlots: int[][] (slots fired per cast)
 * }}
 */
export function previewCycle(wandDef, slots, cards, env) {
  const ws = { slots: slots.slice(), order: [], cursor: 0, mana: manaMaxOf(wandDef, env), castTimerMs: 0, rechargeTimerMs: 0, swapLockMs: 0 };
  buildOrder(wandDef, ws, cards, null);           // shuffle wands preview in slot order (wand-editor-ux §6)
  const casts = [];
  let cycleMs = 0, manaPerCycle = 0, maxManaSingleCast = 0, dmgPerCycle = 0;
  const manaMax = manaMaxOf(wandDef, env), regen = manaRegenOf(wandDef, env);
  const warnings = [];

  if (ws.order.length === 0 && !(wandDef.alwaysCast || []).length) warnings.push({ id: 'W1', severity: 'error' });
  for (const id of slots) if (id && cards[id] && (cards[id].mana || 0) > manaMax) {
    if (!warnings.some((w) => w.id === 'W2' && w.cardId === id)) warnings.push({ id: 'W2', severity: 'error', cardId: id, data: { mana: cards[id].mana, max: manaMax } });
  }

  for (let k = 0; k < MAX_CASTS && ws.order.length + (wandDef.alwaysCast || []).length > 0; k++) {
    ws.castTimerMs = 0; ws.rechargeTimerMs = 0;
    const plan = castWand(wandDef, ws, cards, env);
    if (!plan) break;
    const last = plan.exhausted;
    const delayAfterMs = last ? plan.rechargeMs : plan.delayMs;
    casts.push({ index: k + 1, drawn: plan.drawn, wasted: plan.wasted, inertTriggers: plan.inertTriggers, skipped: plan.skipped,
      truncatedShots: plan.truncatedShots, shots: plan.shots, delayAfterMs, recharge: last, manaSpent: plan.manaSpent,
      wrapped: plan.wrapped, firedSlots: plan.firedSlots });
    cycleMs += delayAfterMs;
    manaPerCycle += plan.manaSpent;
    maxManaSingleCast = Math.max(maxManaSingleCast, plan.manaSpent + plan.skipped.reduce((a, id) => a + (cards[id].mana || 0), 0));
    dmgPerCycle += expectedDamage(plan.shots, env);
    for (const id of plan.wasted) warnings.push({ id: 'W4', severity: 'warn', cardId: id, cast: k + 1 });
    for (const t of plan.inertTriggers) warnings.push({ id: 'W5', severity: 'warn', cardId: t.cardId, cast: k + 1, data: { reason: t.reason } });
    if (plan.truncatedShots > 0) warnings.push({ id: 'W6', severity: 'warn', cast: k + 1, data: { n: plan.shots.length + plan.truncatedShots, cap: env.rules.casting.maxShotsPerCast } });
    ws.mana = Math.min(manaMax, ws.mana + (regen * delayAfterMs) / 1000);
    if (last) break;
  }
  const paidPerCastMax = maxManaSingleCast;
  if (paidPerCastMax > manaMax) warnings.push({ id: 'W3', severity: 'error', data: { mana: paidPerCastMax, max: manaMax } });

  const drainPerS = cycleMs > 0 ? (manaPerCycle / cycleMs) * 1000 : 0;
  const sustainable = drainPerS <= regen + 1e-9;
  const secondsOfFire = sustainable ? Infinity : Math.floor(manaMax / (drainPerS - regen));
  if (!sustainable) warnings.push({ id: 'W7', severity: 'warn', data: { seconds: secondsOfFire } });

  return {
    casts, cycleMs, manaPerCycle, maxManaSingleCast, regenPerS: regen, manaMax,
    dpsSingleTarget: cycleMs > 0 ? (dmgPerCycle / cycleMs) * 1000 : 0,
    sustainable, secondsOfFire, warnings,
    effectiveRechargeMs: effectiveRechargeMs(wandDef, ws, cards, env),
    shuffle: !!wandDef.shuffle,
  };
}

/**
 * ≈DPS numerator (wand-editor-ux §5.3): Σ direct damage of every shot (incl. payloads) + one application
 * of each explode/zap/zone first tick, × expected crit multiplier. Excludes status ticks, chain jumps beyond
 * the first target, reactions and orbit re-hits. Mines deal no contact damage (mechanic-spec §5.4).
 */
function expectedDamage(shots, env) {
  const critMult = env.rules.crit.mult;
  let sum = 0;
  for (const s of shots) {
    const d = s.stats.damage;
    let one = s.behavior.type === 'mine' ? 0 : d;
    for (const e of [...s.onHit, ...s.onExpire, ...(s.onTick ? s.onTick.effects : [])]) {
      if (e.type === 'explode' || e.type === 'zap' || e.type === 'zone') one += d * (e.damageMult ?? 1);
    }
    const crit = Math.min(1, s.critTotal ?? env.rules.crit.baseChance);
    sum += one * (1 + crit * (critMult - 1));
    if (s.payload) sum += expectedDamage(s.payload, env);
  }
  return sum;
}
