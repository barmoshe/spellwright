// ui/Toasts.js — H14 toast column (hud-layout §2.1 H14, §5; motion-spec §4 `hud-toast`).
// Right-aligned column (434, 300, 200, 54) stacking upward from y 354; max 2 visible, newer at the
// bottom, FIFO queue. Hold 3 s + 1 s per extra line, FROZEN while any modal is open; no new toast
// enters while a modal is open either. Reduced motion: fade only (enter 120 / exit 100 ms).
// Runs on the HudScene clock (not frozen by hit-stop, motion-spec §0 rule 4).
//
// A toast whose text names an input is built from a `make()` function, so it re-renders its glyphs
// live when the device changes (hud-layout §3.5).

import { C, icon } from './kit.js';
import { drawDarkPanel, hudImage, reducedMotion, promptRow } from './HudKit.js';

const COL_X = 434, COL_W = 200, BOTTOM = 354, GAP = 2, MAX_VISIBLE = 2, TEXT_W = COL_W - 26;

export class Toasts {
  /** @param {Phaser.Scene} scene HudScene */
  constructor(scene, { flow, router, mixer }) {
    this.scene = scene; this.flow = flow; this.router = router; this.mixer = mixer;
    this.queue = [];
    this.visible = [];         // oldest first; the last is at the bottom
    this.depth = 50;
  }

  /**
   * @param {object} t
   * @param {string} [t.text]        plain text (no glyph tokens)
   * @param {()=>string} [t.make]     text with [token] glyphs, re-evaluated on device change
   * @param {object} [t.icon]         {glyph:'g_stop'} | {kind:'relics'|'spells'|'modifiers'|'wands', id} | {element}
   * @param {string} [t.key]          de-dup key: a queued/visible toast with the same key is not re-added
   */
  push(t) {
    if (t.key && (this.queue.some((q) => q.key === t.key) || this.visible.some((v) => v.key === t.key))) return;
    this.queue.push(t);
  }

  get modalOpen() { return !!(this.flow && this.flow.top()); }

  update(dt) {
    const modal = this.modalOpen;
    if (!modal) {
      for (const v of this.visible) {
        if (v.exiting) continue;
        v.hold -= dt;
        if (v.hold <= 0) this._exit(v);
      }
      while (this.queue.length && this.visible.filter((v) => !v.exiting).length < MAX_VISIBLE) this._enter(this.queue.shift());
    }
  }

  _build(t) {
    const s = this.scene;
    const c = s.add.container(COL_X, BOTTOM).setDepth(this.depth);
    const g = s.add.graphics();
    c.add(g);
    // Plain text and glyph text share one word-wrapping layout (≤ 2 lines is the copy budget).
    const body = promptRow(s, t.make ? t.make() : (t.text || ''), this.router, 'T1', TEXT_W);
    c.add(body);
    const lines = body.lines;
    const h = Math.max(22, body._h + 10);
    drawDarkPanel(g, 0, 0, COL_W, h);
    body.setPosition(22, Math.floor((h - body._h) / 2));
    // 16 px icon, vertically centred at x 3..19
    const iy = Math.floor(h / 2);
    let ic = null;
    if (t.icon && t.icon.glyph) ic = hudImage(s, 7, iy - 4, t.icon.glyph);
    else if (t.icon && t.icon.kind) ic = icon(s, 11, iy, t.icon.kind, t.icon.id, 16);
    else if (t.icon && t.icon.element) {
      ic = s.add.graphics();
      ic.fillStyle(C.stroke, 1).fillCircle(11, iy, 6).fillStyle(C.element[t.icon.element] || C.text, 1).fillCircle(11, iy, 5);
    }
    if (ic) c.add(ic);
    c._h = h; c.lines = lines; c.body = body;
    return c;
  }

  _enter(t) {
    const c = this._build(t);
    const v = { ...t, c, hold: 3000 + 1000 * (c.lines - 1), exiting: false };
    this.visible.push(v);
    this._restack(v);
    const rm = reducedMotion();
    c.setAlpha(0);
    if (rm) {
      this.scene.tweens.add({ targets: c, alpha: 1, duration: 120, ease: 'Linear' });
    } else {
      c.x = COL_X + 16;
      this.scene.tweens.add({ targets: c, x: COL_X, alpha: 1, duration: 180, ease: 'Cubic.easeOut', onUpdate: () => { c.x = Math.round(c.x); } });
    }
    if (this.mixer) this.mixer.fire('toast');
  }

  _exit(v) {
    v.exiting = true;
    const rm = reducedMotion();
    const done = () => {
      const i = this.visible.indexOf(v);
      if (i >= 0) this.visible.splice(i, 1);
      v.c.destroy();
      this._restack(null);
    };
    if (rm) this.scene.tweens.add({ targets: v.c, alpha: 0, duration: 100, ease: 'Linear', onComplete: done });
    else this.scene.tweens.add({ targets: v.c, x: COL_X + 8, alpha: 0, duration: 150, ease: 'Quad.easeIn', onUpdate: () => { v.c.x = Math.round(v.c.x); }, onComplete: done });
  }

  /** Newest at the bottom; each older one sits above it with a 2 px gap. `fresh` snaps into place. */
  _restack(fresh) {
    let y = BOTTOM;
    const rm = reducedMotion();
    for (let i = this.visible.length - 1; i >= 0; i--) {
      const v = this.visible[i];
      y -= v.c._h;
      const ty = y;
      if (v === fresh || rm) v.c.y = ty;
      else if (v.c.y !== ty) this.scene.tweens.add({ targets: v.c, y: ty, duration: 120, ease: 'Cubic.easeInOut', onUpdate: () => { v.c.y = Math.round(v.c.y); } });
      y -= GAP;
    }
  }

  /** Device changed: re-render glyph-bearing toasts in place. */
  refreshGlyphs() {
    for (const v of this.visible) {
      if (!v.make || v.exiting) continue;
      const old = v.c.body;
      const row = promptRow(this.scene, v.make(), this.router, 'T1', TEXT_W);
      row.setPosition(old.x, old.y);
      v.c.add(row); v.c.body = row;
      old.destroy();
    }
  }

  destroy() { for (const v of this.visible) v.c.destroy(); this.visible.length = 0; this.queue.length = 0; }
}
