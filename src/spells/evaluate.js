// spells/evaluate.js — mechanic-spec §4 cast evaluation, implemented verbatim. PURE & deterministic:
// same wand + same wand state + same `spell` RNG state ⇒ identical CastPlan. No Phaser, no Math.random.
//
// modifierScope = "next_group": pending modifiers apply to the next projectile-producing group only;
//   inside a multicast every sub-group inherits a copy.
// wrapMode = "wrap_once_skip_drawn": past the end of the deck, wrap to slot 0 once, skipping cards
//   already drawn this cast; wrapping forces a recharge after the cast.
// Time is in ms here (the designer's unit); the caller converts the resulting delays to sim steps
// once (toSteps). Wand timers in WandState are in ms and are ticked by tickWand().

import { composeShot } from './stats.js';

/**
 * WandState (RunState-owned; mutated only by the engine):
 *   { slots: (cardId|null)[capacity], order: int[] (slot indices), cursor: int, mana: number,
 *     castTimerMs: number, rechargeTimerMs: number, swapLockMs: number }
 */
export function buildOrder(wandDef, ws, cards, rng) {
  ws.order = [];
  for (let i = 0; i < ws.slots.length; i++) if (ws.slots[i] != null && cards[ws.slots[i]]) ws.order.push(i);
  if (wandDef.shuffle && rng) rng.shuffle(ws.order);
  ws.cursor = 0;
}

export function createWandState(wandDef, slots, cards, rng, env) {
  const s = new Array(wandDef.capacity).fill(null);
  (slots || []).forEach((id, i) => { if (i < s.length) s[i] = id ?? null; });
  const ws = { slots: s, order: [], cursor: 0, mana: manaMaxOf(wandDef, env), castTimerMs: 0, rechargeTimerMs: 0, swapLockMs: 0 };
  buildOrder(wandDef, ws, cards, rng);
  return ws;
}

export const manaMaxOf = (wandDef, env) => wandDef.manaMax * ((env && env.player && env.player.manaMaxMult) || 1);
export const manaRegenOf = (wandDef, env) => wandDef.manaRegen * ((env && env.player && env.player.manaRegenMult) || 1);

/** Static effective recharge (mechanic-spec §3.2): shown by the editor before firing. */
export function effectiveRechargeMs(wandDef, ws, cards, env) {
  let add = 0;
  for (const id of ws.slots) if (id != null && cards[id]) add += cards[id].rechargeAddMs || 0;
  const mult = (env && env.player && env.player.rechargeMult) || 1;
  return Math.max(env.rules.casting.minRechargeMs, (wandDef.rechargeMs + add) * mult);
}

/** One sim step for a wand (active or not — inactive wands keep ticking, mechanic-spec §3.3). */
export function tickWand(wandDef, ws, dtMs, env, cards, rng) {
  const max = manaMaxOf(wandDef, env);
  if (ws.mana < max) ws.mana = Math.min(max, ws.mana + (manaRegenOf(wandDef, env) * dtMs) / 1000);
  if (ws.castTimerMs > 0) ws.castTimerMs = Math.max(0, ws.castTimerMs - dtMs);
  if (ws.swapLockMs > 0) ws.swapLockMs = Math.max(0, ws.swapLockMs - dtMs);
  if (ws.rechargeTimerMs > 0) {
    ws.rechargeTimerMs = Math.max(0, ws.rechargeTimerMs - dtMs);
    if (ws.rechargeTimerMs === 0) {        // on reaching 0: cursor = 0; reshuffle if shuffle
      ws.cursor = 0;
      ws.freeWraps = 0;                      // wrap_no_recharge: the per-cycle counter resets when a recharge completes
      if (wandDef.shuffle) buildOrder(wandDef, ws, cards, rng);
      return 'recharged';
    }
  }
  return null;
}

export const isRecharging = (ws) => ws.rechargeTimerMs > 0;
export const canCast = (ws) => ws.rechargeTimerMs <= 0 && ws.castTimerMs <= 0 && ws.swapLockMs <= 0;

/**
 * mechanic-spec §4 tryCast. Returns null if the wand can't cast (timers / empty wand).
 * @param {object} env { rules:{casting,crit,shotClamps}, player:{castDelayMult,rechargeMult,manaMaxMult,manaRegenMult},
 *                       relicShotStats, effectParams, rng (spell stream) }
 * @returns CastPlan {
 *   shots: ShotSpec[], drawn: {cardId, slotIndex|'always', skippedNoMana, wrapped}[], wasted: string[],
 *   inertTriggers: {cardId, reason:'carrier'|'depth'}[], skipped: string[], truncatedShots, manaSpent,
 *   delayMs, rechargeMs (0 if none), exhausted, wrapped, empty (true if the plan fired nothing), firedSlots:int[] }
 */
export function castWand(wandDef, ws, cards, env) {
  if (!canCast(ws)) return null;
  if (ws.order.length === 0 && !(wandDef.alwaysCast && wandDef.alwaysCast.length)) return null;
  const casting = env.rules.casting;
  const ctx = {
    wandDef, ws, cards, env, casting,
    drawn: new Set(), wrapped: false, castDelayAdd: 0,
    virtual: (wandDef.alwaysCast || []).slice(), shotCount: 0,
    plan: { shots: [], drawn: [], wasted: [], inertTriggers: [], skipped: [], truncatedShots: 0, manaSpent: 0,
      delayMs: 0, rechargeMs: 0, exhausted: false, wrapped: false, empty: true, firedSlots: [] },
  };
  const n = Math.max(1, wandDef.spellsPerCast | 0);
  for (let g = 0; g < n; g++) {
    const shots = evalGroup(ctx, [], 0);
    for (const s of shots) ctx.plan.shots.push(s);
  }
  const plan = ctx.plan;
  plan.empty = plan.shots.length === 0;
  const pm = env.player || {};
  const delay = Math.max(casting.minCastDelayMs, (wandDef.castDelayMs + ctx.castDelayAdd) * (pm.castDelayMult || 1));
  plan.delayMs = delay;
  plan.wrapped = ctx.wrapped;
  plan.exhausted = ctx.wrapped || ws.cursor >= ws.order.length;
  // rule relic wrap_no_recharge {perCycle} (mechanic-spec §7.1, §11 Ex 7): up to perCycle times per wand cycle a cast
  // that WRAPPED does not force a recharge — the cast delay applies and the cursor stays where the wrap left it
  const wnr = env.relicRules && env.relicRules.wrap_no_recharge;
  if (plan.exhausted && ctx.wrapped && wnr && (ws.freeWraps | 0) < (wnr.perCycle | 0)) {
    ws.freeWraps = (ws.freeWraps | 0) + 1;
    plan.exhausted = false;
  }
  if (plan.exhausted) {
    const rech = effectiveRechargeMs(wandDef, ws, cards, env);
    plan.rechargeMs = Math.max(delay, rech);
    ws.rechargeTimerMs = plan.rechargeMs;
  } else {
    ws.castTimerMs = delay;
  }
  return plan;
}

// draw(ctx) → { card, virtual, slot } | null
function draw(ctx) {
  const { ws, cards } = ctx;
  if (ctx.virtual.length) {
    const id = ctx.virtual.shift();
    return cards[id] ? { card: cards[id], virtual: true, slot: 'always', wrappedNow: false } : draw(ctx);
  }
  if (ws.order.length === 0) return null;
  let wrappedNow = false;
  if (ws.cursor >= ws.order.length) {
    if (ctx.wrapped) return null;                 // wrap at most once per cast
    ctx.wrapped = true; ws.cursor = 0; wrappedNow = true;
  }
  while (ws.cursor < ws.order.length && ctx.drawn.has(ws.cursor)) ws.cursor++;
  if (ws.cursor >= ws.order.length) return null;
  const i = ws.cursor; ws.cursor++; ctx.drawn.add(i);
  const slot = ws.order[i];
  return { card: cards[ws.slots[slot]], virtual: false, slot, wrappedNow };
}

function evalGroup(ctx, pending, depth) {
  const mods = pending.slice();
  const { ws, plan } = ctx;
  for (;;) {
    const d = draw(ctx);
    if (!d) {                                     // fizzle: pending mods are lost
      for (const m of mods) if (!plan.wasted.includes(m.id)) plan.wasted.push(m.id);
      return [];
    }
    const c = d.card;
    const rec = { cardId: c.id, slotIndex: d.slot, skippedNoMana: false, wrapped: d.wrappedNow };
    plan.drawn.push(rec);
    if (!d.virtual) {
      if (ws.mana < (c.mana || 0)) {              // SKIP: cursor already advanced, no cost, keep drawing
        rec.skippedNoMana = true;
        plan.skipped.push(c.id);
        continue;
      }
      ws.mana -= c.mana || 0;
      plan.manaSpent += c.mana || 0;
      ctx.castDelayAdd += c.castDelayAddMs || 0;
      plan.firedSlots.push(d.slot);
    }
    switch (c.type) {
      case 'modifier':
        mods.push(c);
        continue;
      case 'projectile':
        return makeShots(ctx, c, mods, 0, depth);
      case 'multicast': {
        const out = [];
        const count = c.count | 0;
        for (let k = 0; k < count; k++) {
          const off = count === 1 ? 0 : -c.fanDeg / 2 + (k * c.fanDeg) / (count - 1);
          for (const s of evalGroup(ctx, mods, depth)) { s.angleOffset += off; out.push(s); }
        }
        return out;
      }
      case 'trigger': {
        const carrier = evalGroup(ctx, mods, depth);
        if (carrier.length === 0) { plan.inertTriggers.push({ cardId: c.id, reason: 'carrier' }); return []; }
        if (depth + 1 > ctx.casting.maxTriggerDepth) { plan.inertTriggers.push({ cardId: c.id, reason: 'depth' }); return carrier; }
        const before = ctx.shotCount;
        const payload = evalGroup(ctx, [], depth + 1);   // payload gets NO inherited mods
        if (payload.length === 0) { plan.inertTriggers.push({ cardId: c.id, reason: 'payload' }); return carrier; }
        // Payload accounting (§4): each carrier shot contributes len(payload) toward maxShotsPerCast.
        ctx.shotCount = before;
        const cap = ctx.casting.maxShotsPerCast;
        for (const s of carrier) {
          if (ctx.shotCount + payload.length <= cap) {
            ctx.shotCount += payload.length;
            s.payload = payload.map(clonePayloadShot);
            s.trigger = c.event;
            s.triggerTimerMs = c.timerMs || 0;
          } else {
            plan.truncatedShots += payload.length;
          }
        }
        return carrier;
      }
      default:
        continue;
    }
  }
}

// Each carrier gets its own payload copy (spread/crit rolled once at cast time are shared by value).
function clonePayloadShot(s) {
  return { ...s, stats: { ...s.stats }, onHit: s.onHit.map((e) => ({ ...e })), onExpire: s.onExpire.map((e) => ({ ...e })),
    payload: s.payload ? s.payload.map(clonePayloadShot) : null };
}

function makeShots(ctx, card, mods, angleOffset, depth) {
  const env = ctx.env;
  const pat = card.pattern || { type: 'single' };
  const n = pat.type === 'ring' ? Math.max(1, pat.count | 0) : 1;
  const out = [];
  const cap = ctx.casting.maxShotsPerCast;
  for (let k = 0; k < n; k++) {
    if (ctx.shotCount >= cap) { ctx.plan.truncatedShots += n - k; break; }
    ctx.shotCount++;
    const composed = composeShot(card, mods, { wand: ctx.wandDef, rules: env.rules, relicShotStats: env.relicShotStats,
      effectParams: env.effectParams, rng: env.rng });
    const ring = pat.type === 'ring' ? (360 / n) * k : 0;
    const spread = composed.stats.spreadDeg;
    const spreadRoll = spread > 0 && env.rng ? env.rng.float(-spread, spread) : 0;   // spell stream
    out.push({
      cardId: card.id, behavior: card.behavior || { type: 'bolt' },
      stats: composed.stats, element: composed.element, isCrit: composed.isCrit, critTotal: composed.critTotal,
      onHit: composed.onHit, onExpire: composed.onExpire, onTick: composed.onTick,
      angleOffset: angleOffset + ring, ringPhase: ring, spreadRoll,
      modIds: mods.map((m) => m.id), depth,
      payload: null, trigger: null, triggerTimerMs: 0,
    });
  }
  return out;
}

/** Edit rule (mechanic-spec §3.3, editForcesRecharge): after a changed wand's editor close. */
export function applyEditReset(wandDef, ws, cards, env, rng) {
  buildOrder(wandDef, ws, cards, rng);
  ws.castTimerMs = 0;
  ws.rechargeTimerMs = env.rules.casting.editForcesRecharge ? effectiveRechargeMs(wandDef, ws, cards, env) : 0;
}
