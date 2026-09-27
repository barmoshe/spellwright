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

/**
 * mobile-touch-spec §8.2 phone haptics (navigator.vibrate; Android Chrome — iOS Safari has none → no-op).
 * `low` / `high` patterns (ms or [on, off, on…]); null = not at that level. gapMs = the table's rate limit.
 */
export const HAPTICS = Object.freeze({
  death: { p: 7, low: [80, 60, 160], high: [80, 60, 160] },
  bossPhase: { p: 6, low: [40, 40, 40], high: [40, 40, 40] },
  hurt: { p: 5, low: 50, high: 60 },
  shieldBreak: { p: 4, low: 30, high: 40 },
  defenceBreak: { p: 3, low: null, high: 20, gapMs: 300 },
  explosion: { p: 2, low: null, high: 12, gapMs: 200 },
  roomClear: { p: 2, low: null, high: [20, 30, 20] },
  tap: { p: 1, low: 6, high: 8, gapMs: 80 },
  dash: { p: 1, low: null, high: 8 },
});
export const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
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
    this.hCur = null;             // running haptic pattern { p, until }
    this.hLastAt = {};
    this.hLog = [];               // last 16 haptic patterns (debug: __SW__.rumble.hLog)
    this.bigR = 40;               // bigExplosionRadiusPx (set by Boot via setBigRadius)
    bus.on(EV.RUN_START, () => { this._hp = null; });
    bus.on(EV.PLAYER_HP, (hp) => {
      const prev = this._hp; this._hp = hp;
      if (prev !== null && hp < prev) this.cue(hp <= 0 ? 'death' : 'hurt');
    });
    bus.on(EV.PLAYER_HURT, (d) => { if (d && d.shieldBroke) this.haptic('shieldBreak'); });
    bus.on(EV.BOSS_PHASE, () => this.cue('bossPhase'));
    bus.on(EV.FX_EXPLOSION, (d) => { this.play('explosion'); if (d && !d.hostile && d.r >= this.bigR) this.haptic('explosion'); });
    bus.on(EV.ROOM_CLEARED, () => this.cue('roomClear'));
    bus.on(EV.PLAYER_DASHED, () => this.cue('dash'));
    bus.on(EV.TOUCH_TAP, () => this.haptic('tap', true));
    if (EV.DEFENCE) bus.on(EV.DEFENCE, (d) => { if (d && d.result === 'break') this.haptic('defenceBreak'); });
  }

  get level() { return LEVEL[Save.settings.vibration] ?? LEVEL.low; }

  /** One cause → the pad table (device pad) or the phone haptics table (device touch); never both (§9.4). */
  cue(name) { if (this.router.device === 'touch') this.haptic(name); else this.play(name); }
  setBigRadius(r) { if (r > 0) this.bigR = r; }

  /**
   * Phone haptics (mobile-touch-spec §8.2): only while device === 'touch'; one pattern at a time (≥ priority
   * cancels with vibrate(0), lower is dropped); nothing in menus / fades / hidden page except the HUD-button tap
   * (`ui` = true) and the Settings preview (`force`). Setting `haptics` off|low|high. ≤ 300 ms, never continuous.
   */
  haptic(name, ui = false, force = false) {
    const h = HAPTICS[name]; if (!h || !canVibrate()) return false;
    const lvl = Save.settings.haptics || 'low';
    if (lvl === 'off') return false;
    const pat = h[lvl]; if (pat == null) return false;
    if (!force && this.router.device !== 'touch') return false;
    if (!force && !ui && this.isBlocked()) return false;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
    const now = performance.now();
    if (h.gapMs && now - (this.hLastAt[name] ?? -1e9) < h.gapMs) return false;
    if (this.hCur && now < this.hCur.until && h.p < this.hCur.p) return false;
    const total = Math.min(300, Array.isArray(pat) ? pat.reduce((a, b) => a + b, 0) : pat);
    this.hLastAt[name] = now;
    try { if (this.hCur && now < this.hCur.until) navigator.vibrate(0); navigator.vibrate(pat); } catch (e) { return false; }
    this.hCur = { p: h.p, until: now + total };
    if (this.hLog.length >= 16) this.hLog.shift();
    this.hLog.push({ name, pattern: pat });
    return true;
  }
  /** settings-spec §6: changing Haptics plays Player hurt once at the new level. */
  previewHaptic() { this.hCur = null; return this.haptic('hurt', false, true); }

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
    if (this.hCur) { this.hCur = null; try { if (canVibrate()) navigator.vibrate(0); } catch (e) { /* no-op */ } }
    const act = this.router.padReader.actuator;
    if (act && typeof act.reset === 'function') { try { const r = act.reset(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* no-op */ } }
  }

  /** Per render frame (SystemScene): a modal or fade appearing mid-effect cuts it (§6 rule 2). */
  update() {
    if (this.hCur && performance.now() >= this.hCur.until) this.hCur = null;
    if (!this.cur) return;
    if (performance.now() >= this.cur.until) this.cur = null;
    else if (!this.cur.forced && this.isBlocked()) this.stop();
  }
}
