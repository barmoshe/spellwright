// input/TouchSticks.js — floating twin sticks + thumb buttons (mobile-touch-spec §3–§4, hud-layout §9).
//
// DOM Pointer Events on the WHOLE viewport (#game-root, position:fixed inset:0), not the canvas: a thumb
// resting in the side letterbox still drives a stick (§1). Only pointerType 'touch' is handled here; mouse
// and pen stay on the Phaser path. Coordinates are converted to game px (may be < 0 or > VIEW_W).
//
// Routing of a touch-down, in order (§3.1): a thumb-button hit circle/square → the zone it landed in (if that
// zone's stick is free) → nothing (a miss in the top band never moves or fires). One finger per stick.
//
// Pointer ids: each stick stores its owner id AND a separate `held` boolean — iOS reports huge or negative
// ids, so an id value is never read as "no stick". pointercancel / blur / modal open → releaseAll().
//
// Buttons: DASH / SWAP / USE fire on PRESS (latched gameplay edges; latency matters). PAUSE / EDIT fire on
// RELEASE over the same button (§6 rule 1). The router reads `move` / `aim` vectors once per sim step.

import { T } from '../core/tunables.js';
import { hitButton, layoutFor } from '../ui/hudLayout.js';
import { Save } from '../core/save.js';
import { VIEW_W } from '../config.js';

const PRESS_ACTION = { dash: 'dash', swap: 'wandNext', use: 'interact' };
const RELEASE_ACTION = { pause: 'pause', edit: 'inventory' };

function stick() { return { held: false, id: 0, bx: 0, by: 0, fx: 0, fy: 0, x: 0, y: 0, mag: 0 }; }

export class TouchSticks {
  /**
   * @param router   InputRouter (device switch, latched presses, hudLayout, gameplayActive())
   * @param display  DisplayScaler (toGame)
   * @param onTap    (buttonName) => void — haptic tick + UI tap cue
   */
  constructor(router, display, onTap) {
    this.router = router;
    this.display = display;
    this.onTap = onTap || (() => {});
    this.move = stick();
    this.aim = stick();
    this.btnDown = new Map();          // pointerId → button name (PAUSE/EDIT awaiting release; DASH… for the pressed look)
    this.pressedAt = {};               // button name → performance.now() of the last press (80 ms pressed state)
    this.avail = { dash: false, swap: false, use: false, pause: true, edit: true };
    this.seen = false;                 // a touch has been seen (DASH/SWAP fade in after the first touch, §3.2)
    this.seenAt = 0;
    this.active = 0;                   // touches currently down (the profile switch waits for 0, §5.1)
    const root = typeof document !== 'undefined' ? (document.getElementById('game-root') || window) : null;
    if (!root) return;
    const opt = { passive: true };
    this._down = (e) => this._onDown(e);
    this._mv = (e) => this._onMove(e);
    this._up = (e) => this._onUp(e, false);
    this._cancel = (e) => this._onUp(e, true);
    root.addEventListener('pointerdown', this._down, opt);
    window.addEventListener('pointermove', this._mv, opt);
    window.addEventListener('pointerup', this._up, opt);
    window.addEventListener('pointercancel', this._cancel, opt);
  }

  get R() { return T('touchStickRadiusPx', 28); }

  /** The touch layout. Before the HUD has switched to the touch profile (the very first touch), the sticks still work:
   *  zones come from a touch layout computed on the spot (buttons are not available yet — they fade in after it). */
  _layout() {
    const L = this.router.hudLayout;
    if (L && L.profile === 'touch') return L;
    if (!L || Save.settings.touchControls === 'off') return null;      // 'off': never touch controls (§5.1)
    const S = this.display.safe, side = Save.settings.touchStickSide;
    const k = `${VIEW_W},${S.l},${S.t},${S.r},${S.b},${side}`;   // VIEW_W is live (display.js)
    if (this._tmpKey !== k) { this._tmpKey = k; this._tmpL = layoutFor('touch', S, { stickSide: side }); }
    return this._tmpL;
  }

  _onDown(e) {
    if (e.pointerType !== 'touch') return;
    this.active++;
    this.router._touchSeen();
    if (!this.seen) { this.seen = true; this.seenAt = performance.now(); }
    const L = this._layout();
    if (!L || !this.router.gameplayActive()) return;      // menus: Phaser pointers handle taps
    const p = this.display.toGame(e.clientX, e.clientY);
    // 1. thumb buttons
    for (const [name, b] of Object.entries(L.buttons)) {
      if (!this.avail[name] || !hitButton(b, p.x, p.y)) continue;
      this.btnDown.set(e.pointerId, name);
      this.pressedAt[name] = performance.now();
      if (PRESS_ACTION[name]) this.router._pressed.add(PRESS_ACTION[name]);
      this.onTap(name);
      return;
    }
    // the aim zone excludes the button hit shapes inflated by 4 px (§3.1): a near-miss does nothing
    for (const [name, b] of Object.entries(L.buttons)) if (this.avail[name] && hitButton(b, p.x, p.y, 4)) return;
    // 2. zones (one finger per stick)
    const inZ = (z) => p.x >= z.x && p.x < z.x + z.w && p.y >= z.y && p.y < z.y + z.h;
    const s = inZ(L.zones.move) ? this.move : inZ(L.zones.aim) ? this.aim : null;
    if (!s || s.held) return;
    s.held = true; s.id = e.pointerId;
    s.bx = s.fx = p.x; s.by = s.fy = p.y; s.x = s.y = s.mag = 0;
  }

  _onMove(e) {
    if (e.pointerType !== 'touch') return;
    for (const s of [this.move, this.aim]) {
      if (!s.held || s.id !== e.pointerId) continue;
      const p = this.display.toGame(e.clientX, e.clientY);
      s.fx = p.x; s.fy = p.y;
      let dx = p.x - s.bx, dy = p.y - s.by;
      const R = this.R, d = Math.hypot(dx, dy);
      if (s === this.move && d > R) {                     // the move base follows the thumb (no dead edge)
        s.bx = p.x - (dx / d) * R; s.by = p.y - (dy / d) * R; dx = p.x - s.bx; dy = p.y - s.by;
      }
      const m = Math.min(1, Math.hypot(dx, dy) / R);
      const dd = Math.hypot(dx, dy) || 1;
      s.x = (dx / dd) * m; s.y = (dy / dd) * m; s.mag = m;
    }
  }

  _onUp(e, cancel) {
    if (e.pointerType !== 'touch') return;
    this.active = Math.max(0, this.active - 1);
    for (const s of [this.move, this.aim]) if (s.held && s.id === e.pointerId) { s.held = false; s.x = s.y = s.mag = 0; }
    const name = this.btnDown.get(e.pointerId);
    if (name === undefined) return;
    this.btnDown.delete(e.pointerId);
    if (cancel || !RELEASE_ACTION[name]) return;
    const L = this._layout();
    if (!L || !this.router.gameplayActive()) return;
    const p = this.display.toGame(e.clientX, e.clientY);
    if (hitButton(L.buttons[name], p.x, p.y)) this.router._pressed.add(RELEASE_ACTION[name]);   // release-over-same
  }

  /** Radial deadzone for the move stick (feel-spec touch-aim). */
  moveVector(out) {
    const s = this.move, dz = T('touchMoveDeadzone', 0.15);
    if (!s.held || s.mag <= dz) { out.x = 0; out.y = 0; return out; }
    const k = (s.mag - dz) / (1 - dz) / s.mag;
    out.x = s.x * k; out.y = s.y * k; return out;
  }

  /** Is the aim stick past the override threshold? */
  get aimOverride() { return this.aim.held && this.aim.mag >= T('touchAimOverride', 0.3); }

  /** Button pressed-look window (80 ms, §4.2) or held (PAUSE/EDIT until release). */
  isPressed(name) {
    for (const v of this.btnDown.values()) if (v === name) return true;
    return performance.now() - (this.pressedAt[name] || -1e9) < 80;
  }

  get anyHeld() { return this.move.held || this.aim.held || this.btnDown.size > 0; }

  /** pointercancel / blur / visibility / modal open: nothing stays held (§3.2). */
  releaseAll() {
    for (const s of [this.move, this.aim]) { s.held = false; s.x = s.y = s.mag = 0; }
    this.btnDown.clear();
  }
}
