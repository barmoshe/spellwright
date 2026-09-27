// sim/Caster.js — the cast verb in the sim (mechanic-spec §3–§4, feel-spec §cast, event-markers §1 cast).
//   • every wand ticks every step (active or not): mana regen, cast/recharge/swap timers (wandSwapCarriesTimers)
//   • swap: 1–3 / Q / wheel / RB / Y → the new wand can't cast for `wandSwapMs`
//   • tryCast every step while held (or toggle-latched); a tap during the cast delay (NOT recharge) is buffered
//     for `castBufferMs` (+ `padBufferBonusMs` on pad); no casting during a dash
//   • sputter (mana skip or an empty group) at most once per `sputterMinIntervalMs`
//   • emits wand:cast { wand, firedSlots, skippedSlots, drawnSlots, cursor, nextSlot, empty, recharge } (hud-layout §7)

import { EV } from '../core/ev.js';
import { castWand, tickWand, canCast } from '../spells/index.js';
import { Save } from '../core/save.js';
import { track } from '../core/log.js';

export class Caster {
  constructor(ctx) {
    this.ctx = ctx;
    this.bufferMs = 0;
    this.lastSputterMs = -1e9;
    this.lastMana = [];
    this.holdMs = 0;
  }
  get T() { return this.ctx.T; }

  step(it, dt) {
    const ctx = this.ctx, run = ctx.run, p = ctx.player, T = this.T;
    // ---- relic live inputs (mechanic-spec §7.1 conditions / scaling): standing = no move input this step
    const en = ctx.enemies;
    run.tickLive(dt, !!(it.moveX || it.moveY), en && typeof en.aliveCount === 'function' ? en.aliveCount() : 0);
    // ---- tick every wand
    for (let i = 0; i < run.wands.length; i++) {
      const w = run.wands[i];
      const wasRecharging = w.state.rechargeTimerMs > 0;
      const r = tickWand(w.def, w.state, dt, run.spellEnv(), run.cards, run.rng.spell);
      if (r === 'recharged') {
        ctx.relics.onWandRecharged(i);                       // relic rule: free_cast_after_full_recharge
        ctx.bus.emit(EV.WAND_RECHARGE, i);
        if (i === run.activeWand) { ctx.mixer.fire('wand_recharge'); p.onRechargeEnd(); }
        ctx.relics.onEvent('wand_recharge', { wandIndex: i, x: p.x, y: p.y });
      } else if (!wasRecharging && w.state.rechargeTimerMs > 0 && i === run.activeWand) p.onRechargeStart();
      // coalesced mana event (≤ 1 per step per wand, only on visible change)
      const m = Math.floor(w.state.mana);
      if (this.lastMana[i] !== m) { this.lastMana[i] = m; ctx.bus.emit(EV.PLAYER_MANA, i, w.state.mana, run.manaMax(i)); }
    }
    if (!p.alive) return;

    // ---- swaps
    const ctrl = p.controllable;
    if (ctrl) {
      let swapped = false;
      if (it.wandSlot) swapped = run.selectWand(it.wandSlot - 1, T('wandSwapMs'));
      if (it.wandNext) swapped = run.cycleWand(1, T('wandSwapMs')) || swapped;
      if (it.wandPrev) swapped = run.cycleWand(-1, T('wandSwapMs')) || swapped;
      if (swapped) {
        p.onSwap(); ctx.mixer.fire('wand_swap');
        Save.setFlag('wandSwap'); ctx.bus.emit(EV.FTUE, 'wand-swapped');
        this.bufferMs = 0;
      }
    }

    // ---- cast input: hold (or toggle latch) + tap buffer
    const w = run.wand;
    if (!w) return;
    const held = ctrl && it.castHeld;
    this.holdMs = held ? this.holdMs + dt : 0;
    if (ctrl && it.castPressed) {
      const inDelay = w.state.castTimerMs > 0 && w.state.rechargeTimerMs <= 0;
      if (inDelay || w.state.swapLockMs > 0) this.bufferMs = T('castBufferMs') + (it.device === 'pad' ? T('padBufferBonusMs') : 0);
    }
    if (this.bufferMs > 0) this.bufferMs = Math.max(0, this.bufferMs - dt);
    const want = held || (ctrl && it.castPressed) || this.bufferMs > 0;
    if (!want || p.isDashing || !canCast(w.state)) return;

    const cursorBefore = w.state.cursor;
    const plan = castWand(w.def, w.state, run.cards, run.spellEnv(undefined, run.activeWand));
    if (!plan) {
      // empty wand (no spells, no always-cast): sputter feedback, rate-limited
      this._sputter('empty');
      return;
    }
    this.bufferMs = 0;
    run.stats.casts++;
    // relic rule hooks (sim/Relics.js): free cast refund · payload echoes · cast toll
    ctx.relics.applyFreeCast(run.activeWand, plan);
    ctx.relics.echoPayloads(plan.shots, T('echoPayloadFanDeg', 8));
    ctx.relics.onCast();
    const aimDeg = Math.atan2(it.aimY, it.aimX) * 180 / Math.PI;
    // shot origin = the wand grip, falling back to the body centre when the grip is inside a wall (plan Addendum 3)
    let tipX = p.tipX, tipY = p.tipY;
    if (ctx.world && ctx.world.raycast(p.coreX, p.coreY, tipX, tipY, 'all') < Math.hypot(tipX - p.coreX, tipY - p.coreY) - 0.5) { tipX = p.coreX; tipY = p.coreY; }
    for (const s of plan.shots) ctx.shots.spawnSpec(s, tipX, tipY, aimDeg, {});
    const el = plan.shots.length ? plan.shots[0].element : null;
    if (el) {
      ctx.lastElement = el;
      // cue-spec event_routing.cast: one routing per cast step (+ multicast layer ≥ 3 shots, + heavy layer)
      const HEAVY = ['comet', 'fireball', 'frost_lance', 'thunder_orb'];
      const heavy = plan.shots.some((s) => HEAVY.includes(s.cardId) || (s.modIds || []).includes('heavy'));
      ctx.mixer.fire(`cast_${el}`, { shots: plan.shots.length, heavy });
    }
    if (plan.shots.length) p.onCast(el);
    if (plan.empty || plan.skipped.length) this._sputter(plan.skipped.length ? 'mana' : 'empty', plan.skipped[0]);
    if (plan.truncatedShots) track('cast_truncated', { wand: w.id, n: plan.truncatedShots });
    const drawnSlots = plan.drawn.map((d) => d.slotIndex);
    const skippedSlots = plan.drawn.filter((d) => d.skippedNoMana).map((d) => d.slotIndex);
    const nextSlot = plan.exhausted ? (w.state.order[0] ?? 0) : w.state.order[w.state.cursor] ?? null;
    ctx.bus.emit(EV.WAND_CAST, { wand: run.activeWand, plan, firedSlots: plan.firedSlots, skippedSlots, drawnSlots, cursor: w.state.cursor, cursorBefore, nextSlot, empty: plan.empty, recharge: plan.exhausted });
    if (plan.exhausted) { ctx.bus.emit(EV.WAND_RECHARGE_START, run.activeWand, plan.rechargeMs); p.onRechargeStart(); }
    Save.setFlag('cast');
    track('cast', { n: plan.shots.length });
  }

  _sputter(reason, cardId) {
    const now = this.ctx.time.ms;
    if (now - this.lastSputterMs < this.T('sputterMinIntervalMs')) return;
    this.lastSputterMs = now;
    this.ctx.player.onSputter();
    this.ctx.mixer.fire('sputter');
    this.ctx.bus.emit(EV.WAND_SPUTTER, { wand: this.ctx.run.activeWand, reason, cardId: cardId || null });
  }

  /** Released cast press duration → FTUE P2b (tap detection). Called by RunScene on cast release. */
  get holdDuration() { return this.holdMs; }
}

/**
 * Pad + touch-override aim assist (feel-spec §aim, §verb-2b): if a living, non-spawning enemy lies within aimAssistConeDeg of the stick
 * direction and within aimAssistRangePx, rotate the aim toward the closest such enemy by strength × the angular
 * difference, each step. Never overrides the stick by more than the cone half-angle. Strength ×= Settings aimAssist/100.
 */
export function applyAimAssist(ctx, it) {
  // pad, and (v2) the touch aim-stick override with the wider touch values (feel-spec §verb-2b); never mouse, never auto
  // v2: plus a tiny MOUSE assist (feel-spec §verb-2: only when the cursor is already within the 5° cone)
  const touch = it.device === 'touch' && it.aimSource === 'stick' && it.castHeld;
  const mouse = it.device === 'kbm';
  if (it.device !== 'pad' && !touch && !mouse) return;
  const T = ctx.T, p = ctx.player;
  const strength = (touch ? T('touchAimAssistStrength', 0.6) : mouse ? T('mouseAimAssistStrength', 0.35) : T('aimAssistStrength')) * (Save.settings.aimAssist / 100);
  const cone = touch ? T('touchAimAssistConeDeg', 14) : mouse ? T('mouseAimAssistConeDeg', 5) : T('aimAssistConeDeg'), range = T('aimAssistRangePx');
  if (strength <= 0) return;
  const aim = Math.atan2(it.aimY, it.aimX) * 180 / Math.PI;
  let best = null, bestD = Infinity, bestDiff = 0;
  ctx.enemies.forEachAlive((e) => {
    if (!e.hittable) return;
    const dx = e.x - p.coreX, dy = e.y - p.coreY, d = Math.hypot(dx, dy);
    if (d > range) return;
    const diff = ((Math.atan2(dy, dx) * 180 / Math.PI - aim + 540) % 360) - 180;
    if (Math.abs(diff) > cone) return;
    if (d < bestD) { bestD = d; best = e; bestDiff = diff; }
  });
  if (!best) return;
  const turn = Math.max(-cone / 2, Math.min(cone / 2, bestDiff * strength));
  const a = (aim + turn) * Math.PI / 180;
  it.aimX = Math.cos(a); it.aimY = Math.sin(a);
}
