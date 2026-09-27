// sim/Camera.js — feel-spec §verb-7 camera (sim-contract §2 ctx.cam).
// Rooms ≤ 640×360 → locked centred, no look-ahead. Larger rooms (per axis) → v2 VELOCITY lead (plan Addendum 1):
// target lead = clampLen(playerVel × lookAheadLeadMs/1000, lookAheadMaxPx), the same for every device (auto-aim
// flips and mouse flicks no longer swing the view); the lead eases with time constant lookAheadEaseMs; the camera
// eases with lerp = 1 − (1 − cameraLerp)^(dt·60) (frame-rate independent), bounded to the room.
// Reduced motion: no look-ahead (smoothing stays). Shake offset comes from Fx (clamped).
//
// aspect-ratio-spec §3 — phone room-fit zoom: on a phone the camera zooms each room to fill the play area (touch
// profile: the CLEAR rect below the 54 px HUD band) (z = clamp(floor(zFit × 16) / 16, 1, 2), 1/16 quantum so a 16 px tile stays
// an integer number of internal px), decided at room load (inside the black fade) and on EV.DISPLAY_CHANGED — never
// tweened mid-play. A room that fits the clear rect is locked and centred IN the clear rect. Everywhere else z = 1.
// `view` is the live world-space view rect {x, y, w, h, z} (= Phaser's worldView, but current this frame): the
// on-screen attack gate, auto-aim, HUD twins and world-UI projection all read it. W is live (config.js VIEW_W).

import { VIEW_W, VIEW_H } from '../config.js';
import { EV } from '../core/ev.js';
import { BAND_H } from '../ui/hudLayout.js';

const Z_MAX = 2, Z_Q = 16, FIT_MARGIN = 4;   // cap 2.0 (orchestrator 2026-09-27; spec v2.2 said 1.5)

export class CameraRig {
  constructor(ctx) {
    this.ctx = ctx;
    this.cam = ctx.scene.cameras.main;
    this.cx = VIEW_W / 2; this.cy = VIEW_H / 2;     // camera centre (world)
    this.pan = null;
    this.view = { x: 0, y: 0, w: VIEW_W, h: VIEW_H, z: 1 };
    this.z = 1;
    this.band = 0;                                    // touch HUD band height in SCREEN px (phones in play), else 0
    this.frame = null;                                // clear-rect framing {x, y} (world centre) when the room fits
    this.gate = { x: 0, y: 0, w: VIEW_W, h: VIEW_H };  // the view minus the band, world px (on-screen gate, auto-aim)
    this.lx = 0; this.ly = 0;                         // current (eased) velocity lead, px
    const bus = ctx.bus || ctx.scene.registry.get('bus');
    if (bus) {
      const onDisplay = () => { if (ctx.world) this.snap(); };      // W / safe rect / HUD profile changed: re-fit as a snap (§3.3)
      bus.on(EV.DISPLAY_CHANGED, onDisplay);
      bus.on(EV.TOUCH_PROFILE, onDisplay);                         // the band appears / goes: the play area changed
      ctx.scene.events.once('shutdown', () => { bus.off(EV.DISPLAY_CHANGED, onDisplay); bus.off(EV.TOUCH_PROFILE, onDisplay); });
    }
  }

  /**
   * §3.1 + orchestrator "too much black space" (2026-09-27): on a PHONE the room (tile bounds incl. walls, + a 4 px
   * margin each side) is zoomed to FILL the play area — the clear rect below the 54 px touch band in the touch
   * profile, the whole safe-width view in the desktop profile. z = clamp(floor(zFit × 16) / 16, 1, 2); a room that
   * fits is locked and centred in that rect; a bigger room keeps z ≥ 1 and scrolls. Desktop stays z = 1: its integer
   * ×2/×3 canvas scale would turn a fractional camera zoom into visibly uneven pixels.
   */
  _fit() {
    const w = this.ctx.world, reg = this.ctx.scene.registry;
    const disp = reg.get('display'), router = reg.get('router');
    this.z = 1; this.frame = null; this.band = 0;
    if (!w || !disp || !disp.isPhone) return;
    const touch = !!(router && router.touchProfile);
    const S = disp.safe, sL = S.l, sR = VIEW_W - S.r;
    const B = touch ? S.t + BAND_H : 0;
    this.band = B;
    const clear = { x: sL + 4, y: B, w: VIEW_W - sL - sR - 8, h: VIEW_H - B };
    const zFit = Math.min(clear.w / (w.w + 2 * FIT_MARGIN), clear.h / (w.h + 2 * FIT_MARGIN));
    this.z = Math.max(1, Math.min(Z_MAX, Math.floor(zFit * Z_Q) / Z_Q));
    if (w.w * this.z <= clear.w && w.h * this.z <= clear.h) {
      // centre the room in the clear rect: screen centre of clear ↔ view centre, converted to world at z
      const dx = (clear.x + clear.w / 2) - VIEW_W / 2, dy = (clear.y + clear.h / 2) - VIEW_H / 2;
      this.frame = { x: w.w / 2 - dx / this.z, y: w.h / 2 - dy / this.z };
    }
  }

  get T() { return this.ctx.T; }

  /** Snap to the room framing (room load). */
  snap() {
    this.lx = 0; this.ly = 0;
    this._fit();
    if (this.cam.zoom !== this.z) this.cam.setZoom(this.z);
    const t = this._target();
    this.cx = t.x; this.cy = t.y;
    this._apply();
  }

  _target() {
    const w = this.ctx.world, p = this.ctx.player;
    let tx, ty;
    if (!w) return { x: this.cx, y: this.cy };
    if (this.pan) return { x: this.pan.x, y: this.pan.y };
    if (this.frame) return { x: this.frame.x, y: this.frame.y };
    const VW = VIEW_W / this.z, VH = VIEW_H / this.z;   // view size in world px
    // phones (v2.2 §3.1): a room taller than the clear rect follows vertically, and its top bound is raised by the
    // band so the top wall can scroll out from under the HUD: y-bounds [room.top − B, room.bottom]
    const bandW = this.band / this.z;
    const lockX = w.w <= VW, lockY = !bandW && w.h <= VH;
    tx = p ? p.x : w.w / 2; ty = p ? p.y : w.h / 2;
    if (p && !this.ctx.flags.reducedMotion && (!lockX || !lockY)) { tx += this.lx; ty += this.ly; }
    if (lockX) tx = w.w / 2; else tx = Math.max(VW / 2, Math.min(w.w - VW / 2, tx));
    if (lockY) ty = w.h / 2;
    else { const lo = VH / 2 - bandW, hi = w.h - VH / 2; ty = lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, ty)); }
    return { x: tx, y: ty };
  }

  step(dtMs) {
    // velocity lead (feel-spec §verb-7 v2): target = clampLen(vel × leadMs, max); lead += (target − lead)(1 − e^(−dt/ease))
    const p = this.ctx.player, b = p && p.body;
    let gx = 0, gy = 0;
    if (b && b.velocity) {
      const k = this.T('lookAheadLeadMs', 250) / 1000, max = this.T('lookAheadMaxPx');
      gx = b.velocity.x * k; gy = b.velocity.y * k;
      const m = Math.hypot(gx, gy); if (m > max) { gx *= max / m; gy *= max / m; }
    }
    const a = 1 - Math.exp(-dtMs / this.T('lookAheadEaseMs', 300));
    this.lx += (gx - this.lx) * a; this.ly += (gy - this.ly) * a;
    const t = this._target();
    if (this.pan && this.pan.ms > 0) {
      this.pan.t = Math.min(this.pan.ms, this.pan.t + dtMs);
      const k = this.pan.t / this.pan.ms;
      this.cx = this.pan.fromX + (t.x - this.pan.fromX) * k;
      this.cy = this.pan.fromY + (t.y - this.pan.fromY) * k;
    } else {
      const lerp = 1 - Math.pow(1 - this.T('cameraLerp'), (dtMs / 1000) * 60);
      this.cx += (t.x - this.cx) * lerp;
      this.cy += (t.y - this.cy) * lerp;
    }
    this._apply();
  }

  _apply() {
    const fx = this.ctx.fx;
    const sx = Math.round(this.cx - VIEW_W / 2) + (fx ? fx.shakeX : 0);
    const sy = Math.round(this.cy - VIEW_H / 2) + (fx ? fx.shakeY : 0);
    this.cam.setScroll(sx, sy);
    // Phaser zooms about the view centre: worldView = centre ± (W / z) / 2
    const z = this.z, v = this.view;
    v.w = VIEW_W / z; v.h = VIEW_H / z; v.z = z;
    v.x = sx + VIEW_W / 2 - v.w / 2; v.y = sy + VIEW_H / 2 - v.h / 2;
    const g = this.gate, bw = this.band / z;          // v2.2 §3.1: an enemy under the HUD band counts as off-screen
    g.x = v.x; g.y = v.y + bw; g.w = v.w; g.h = v.h - bw;
  }

  /** Boss intro (feel bossIntroPanMs): pan to (x, y) over ms; release() pans back over the same time. */
  panTo(x, y, ms) {
    if (this.ctx.flags.reducedMotion) {
      // reduced motion (accessibility-spec §4.1): a cut — 150 ms fade to the boss framing, hold, fade back on release
      const cam = this.cam;
      cam.fadeOut(150, 0, 0, 0);
      cam.once('camerafadeoutcomplete', () => { this.pan = { x, y, ms: 0, t: 0, fromX: x, fromY: y }; this.cx = x; this.cy = y; this._apply(); cam.fadeIn(150, 0, 0, 0); });
      return;
    }
    this.pan = { x, y, ms, t: 0, fromX: this.cx, fromY: this.cy };
  }
  release(ms) {
    if (!this.pan) return;
    if (this.ctx.flags.reducedMotion) {
      const cam = this.cam;
      cam.fadeOut(150, 0, 0, 0);
      cam.once('camerafadeoutcomplete', () => { this.pan = null; this.snap(); cam.fadeIn(150, 0, 0, 0); });
      return;
    }
    const back = this._targetNoPan();
    this.pan = { x: back.x, y: back.y, ms: ms ?? this.pan.ms, t: 0, fromX: this.cx, fromY: this.cy, releasing: true };
    this.ctx.scene.time.delayedCall(this.pan.ms + 20, () => { if (this.pan && this.pan.releasing) this.pan = null; });
  }
  _targetNoPan() { const p = this.pan; this.pan = null; const t = this._target(); this.pan = p; return t; }

  /** On-screen test against the GATE rect (the view minus the touch HUD band; = the view on desktop). */
  inView(x, y, inset = 0) {
    const v = this.gate;
    return x >= v.x + inset && x <= v.x + v.w - inset && y >= v.y + inset && y <= v.y + v.h - inset;
  }
  /** Screen position of a world point (HUD spatial twins). */
  toScreen(x, y) { const v = this.view; return { x: (x - v.x) * v.z, y: (y - v.y) * v.z }; }
  /** World position of a screen point. */
  toWorld(sx, sy) { const v = this.view; return { x: v.x + sx / v.z, y: v.y + sy / v.z }; }
}
