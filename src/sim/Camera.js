// sim/Camera.js — feel-spec §verb-7 camera (sim-contract §2 ctx.cam).
// Rooms ≤ 640×360 → locked centred, no look-ahead. Larger rooms (per axis) → target = player + aim ×
// min(|cursorOffset| × lookAheadFrac, lookAheadMaxPx) (pad: aim × lookAheadMaxPx × stick magnitude);
// eased with lerp = 1 − (1 − cameraLerp)^(dt·60) (frame-rate independent), bounded to the room.
// Reduced motion: no look-ahead (smoothing stays). Shake offset comes from Fx (clamped).

import { VIEW_W, VIEW_H } from '../config.js';

export class CameraRig {
  constructor(ctx) {
    this.ctx = ctx;
    this.cam = ctx.scene.cameras.main;
    this.cx = VIEW_W / 2; this.cy = VIEW_H / 2;     // camera centre (world)
    this.pan = null;
    this.view = { x: 0, y: 0, w: VIEW_W, h: VIEW_H };
  }

  get T() { return this.ctx.T; }

  /** Snap to the room framing (room load). */
  snap() {
    const t = this._target();
    this.cx = t.x; this.cy = t.y;
    this._apply();
  }

  _target() {
    const w = this.ctx.world, p = this.ctx.player;
    let tx, ty;
    if (!w) return { x: this.cx, y: this.cy };
    const lockX = w.w <= VIEW_W, lockY = w.h <= VIEW_H;
    if (this.pan) return { x: this.pan.x, y: this.pan.y };
    tx = p ? p.x : w.w / 2; ty = p ? p.y : w.h / 2;
    if (p && !this.ctx.flags.reducedMotion && (!lockX || !lockY)) {
      const it = this.ctx.intent;
      let lead;
      if (it && it.device === 'pad') lead = this.T('lookAheadMaxPx') * (it.aimMag ?? 1);
      else {
        const offX = it ? it.aimWorldX - p.x : 0, offY = it ? it.aimWorldY - p.y : 0;
        lead = Math.min(Math.hypot(offX, offY) * this.T('lookAheadFrac'), this.T('lookAheadMaxPx'));
      }
      if (it) { tx += it.aimX * lead; ty += it.aimY * lead; }
    }
    if (lockX) tx = w.w / 2; else tx = Math.max(VIEW_W / 2, Math.min(w.w - VIEW_W / 2, tx));
    if (lockY) ty = w.h / 2; else ty = Math.max(VIEW_H / 2, Math.min(w.h - VIEW_H / 2, ty));
    return { x: tx, y: ty };
  }

  step(dtMs) {
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
    this.view.x = sx; this.view.y = sy;
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

  inView(x, y, inset = 0) {
    const v = this.view;
    return x >= v.x + inset && x <= v.x + v.w - inset && y >= v.y + inset && y <= v.y + v.h - inset;
  }
  /** Screen position of a world point (HUD spatial twins). */
  toScreen(x, y) { return { x: x - this.view.x, y: y - this.view.y }; }
}
