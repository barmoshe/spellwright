// input/Rumble.js — gamepad vibration (controller-prompts §6). One service (SystemScene), bus-driven:
// gameplay code never calls it; it listens to existing events and plays through the pad-in-hand's
// `vibrationActuator.playEffect('dual-rumble', …)` (platform/gamepad.js PadReader.actuator).
// Feature-detected: no actuator (Safari/Firefox today) ⇒ every call is a silent no-op.
//
// Rules implemented (§6): one effect at a time (a new effect of ≥ priority replaces the running one;
// lower is DROPPED, never queued) · never in menus / room fades / on focus loss (reset()) · only while
// the pad is the device in hand · Vibration setting Off/Low/High (Low = ×0.5 magnitudes, same ms) ·
// magnitudes ≤ 1.0, duration ≤ 400 ms, nothing continuous · Settings preview = Player hurt at the new level.

import { EV } from '../core/events.js';
import { Save } from '../core/save.js';

/** §6 priority table (High level; Low = ×0.5 magnitudes). gapMs = the rate limit the table names. */
export const RUMBLE = Object.freeze({
  death: { p: 6, strong: 0.80, weak: 0.50, ms: 400 },
  bossPhase: { p: 5, strong: 0.70, weak: 0.70, ms: 300 },
  hurt: { p: 4, strong: 0.60, weak: 0.40, ms: 140 },           // rate: inherits i-frames (hp can't drop inside them)
  explosion: { p: 3, strong: 0.35, weak: 0.25, ms: 90, gapMs: 150 },
  roomClear: { p: 2, strong: 0.00, weak: 0.30, ms: 120 },
  dash: { p: 1, strong: 0.00, weak: 0.25, ms: 60 },             // rate: dash cooldown (event only fires on a dash)
});
const LEVEL = { off: 0, low: 0.5, high: 1 };
const MAX_MS = 400;

export class Rumble {
  /**
   * @param router     InputRouter (device + padReader)
   * @param bus        game event bus
   * @param isBlocked  () => true while a modal is open or the room is fading (§6 rule 2)
   */
  constructor(router, bus, isBlocked) {
    this.router = router;
    this.isBlocked = isBlocked;
    this.cur = null;              // { p, until } of the running effect
    this.lastAt = {};             // name → performance.now() of the last play (rate limits)
    this.log = [];                // last 16 plays (debug: __SW__.rumble.log)
    this._hp = null;
    bus.on(EV.RUN_START, () => { this._hp = null; });
    bus.on(EV.PLAYER_HP, (hp) => {
      const prev = this._hp; this._hp = hp;
      if (prev !== null && hp < prev) this.play(hp <= 0 ? 'death' : 'hurt');
    });
    bus.on(EV.BOSS_PHASE, () => this.play('bossPhase'));
    bus.on(EV.FX_EXPLOSION, () => this.play('explosion'));
    bus.on(EV.ROOM_CLEARED, () => this.play('roomClear'));
    bus.on(EV.PLAYER_DASHED, () => this.play('dash'));
  }

  get level() { return LEVEL[Save.settings.vibration] ?? LEVEL.low; }

  /** Play a table effect. `force` = the Settings preview (the one exception to "never in menus"). */
  play(name, force = false) {
    const fx = RUMBLE[name]; if (!fx) return false;
    const k = this.level;
    if (k <= 0) return false;
    if (this.router.device !== 'pad') return false;                 // §6 rule 3: only the pad in hand
    if (!force && this.isBlocked()) return false;                   // §6 rule 2
    const act = this.router.padReader.actuator;
    if (!act) return false;                                         // feature-detect: silent no-op
    const now = performance.now();
    if (fx.gapMs && now - (this.lastAt[name] ?? -1e9) < fx.gapMs) return false;
    if (this.cur && now < this.cur.until && fx.p < this.cur.p) return false;   // lower priority: dropped
    const params = {
      startDelay: 0,
      duration: Math.min(MAX_MS, fx.ms),
      strongMagnitude: Math.min(1, fx.strong * k),
      weakMagnitude: Math.min(1, fx.weak * k),
    };
    this.lastAt[name] = now;
    this.cur = { p: fx.p, until: now + params.duration, forced: force };
    try {
      const r = act.playEffect('dual-rumble', params);
      if (r && typeof r.catch === 'function') r.catch(() => {});      // 'preempted' rejections are expected
    } catch (e) { /* unsupported effect type: no-op */ }
    if (this.log.length >= 16) this.log.shift();
    this.log.push({ name, ...params });
    return true;
  }

  /** §6 rule 5: changing the Vibration row plays Player hurt once at the new level. */
  preview() { this.cur = null; return this.play('hurt', true); }

  /** Stop whatever is running (modal opened, room fade, blur / visibility loss). */
  stop() {
    this.cur = null;
    const act = this.router.padReader.actuator;
    if (act && typeof act.reset === 'function') { try { const r = act.reset(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* no-op */ } }
  }

  /** Per render frame (SystemScene): a modal or fade appearing mid-effect cuts it (§6 rule 2). */
  update() {
    if (!this.cur) return;
    if (performance.now() >= this.cur.until) this.cur = null;
    else if (!this.cur.forced && this.isBlocked()) this.stop();
  }
}
