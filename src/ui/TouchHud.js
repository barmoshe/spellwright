// ui/TouchHud.js — drawing of the touch profile's controls (mobile-touch-spec §3.2, §3.3 marker, §4, hud-layout §9.4).
// Lives inside HudScene; reads positions ONLY from the ui/hudLayout.js object and state from input/TouchSticks.js.
// All art is procedural until the 2D Artist's touch set lands (the spec allows procedural rings/knobs/arcs;
// icons are drawn at 16 px as 1-px monochrome shapes with a #222222 keyline — shape carries meaning).
//
// Per render frame: sticks (only while pressed), button pressed/ready/cooldown states, the auto-fire target
// marker (four 3 px corner ticks; shape, not colour), and with ?debug + F4 every layout rect (interactive dashed).

import { C } from './kit.js';
import { validateLayout } from './hudLayout.js';
import { EV } from '../core/events.js';
import { T } from '../core/tunables.js';
import { Save } from '../core/save.js';
import { DEBUG, VIEW_W, VIEW_H } from '../config.js';

const BODY = 0x2a2a3a, KEY = 0x222222, LIGHT = 0xfdf7ed;

export class TouchHud {
  constructor(scene, L, router) {
    this.scene = scene; this.L = L; this.router = router;
    this.touch = router.touch;
    this.g = scene.add.graphics().setDepth(60);           // buttons + sticks
    this.mk = scene.add.graphics().setDepth(55);          // target marker
    this.dbg = scene.add.graphics().setDepth(70).setVisible(false);
    this.dash = { charges: 1, max: 1, refill: 1 };
    this.wandCount = 1;
    this.useKind = null;
    this.fadeIn = this.touch && this.touch.seen ? 1 : 0;
    const bad = validateLayout(L);
    if (bad.length) console.warn('[hudLayout] validator:', bad.join(' · '));
    if (DEBUG && scene.input.keyboard) scene.input.keyboard.on('keydown-F4', () => this.dbg.setVisible(!this.dbg.visible));
    this._drawDebug();
  }

  /** HudScene forwards these bus events. */
  onDash(charges, max, refill) { this.dash.charges = charges; this.dash.max = max; this.dash.refill = refill; }
  setWandCount(n) { this.wandCount = n; }
  onInteract(p) { this.useKind = p ? (p.kind || 'take') : null; }

  update(dt, sim) {
    const tch = this.touch; if (!tch) return;
    const on = Save.settings.touchControls === 'on';
    if (tch.seen || on) this.fadeIn = Math.min(1, this.fadeIn + dt / (Save.reducedMotion ? 1 : 200));
    tch.avail.dash = this.fadeIn > 0;
    tch.avail.swap = this.fadeIn > 0 && this.wandCount >= 2;
    tch.avail.use = this.fadeIn > 0 && !!this.useKind;
    tch.avail.pause = true; tch.avail.edit = true;
    const g = this.g; g.clear();
    const B = this.L.buttons;
    this._round(g, B.dash, tch.avail.dash, tch.isPressed('dash'), 'dash');
    this._round(g, B.swap, tch.avail.swap, tch.isPressed('swap'), 'swap');
    this._round(g, B.use, tch.avail.use, tch.isPressed('use'), 'use');
    this._square(g, B.pause, tch.isPressed('pause'), 'pause');
    this._square(g, B.edit, tch.isPressed('edit'), 'edit');
    this._stick(g, tch.move, C.dim);
    this._stick(g, tch.aim, C.gold);
    this._marker(sim);
  }

  // ---- buttons (§4.2: 1 px #222222 keyline, #2a2a3a α .55 body; pressed = 1 px down, darker 80 ms) ----
  _round(g, b, avail, pressed, icon) {
    if (!avail || !b) return;
    const a = this.fadeIn, off = pressed ? 1 : 0, cx = b.cx, cy = b.cy + off, r = b.vr;
    g.fillStyle(KEY, 0.9 * a).fillCircle(cx, cy, r + 1);
    g.fillStyle(pressed ? 0x1a1a26 : BODY, 0.55 * a + 0.2 * a).fillCircle(cx, cy, r);
    let iconA = a;
    if (icon === 'dash' && this.dash.charges < this.dash.max) {
      // cooldown arc: fills clockwise over the refill; icon at α .5 while any charge refills
      const f = Math.max(0, Math.min(1, this.dash.refill));
      g.lineStyle(2, LIGHT, 0.8 * a).beginPath().arc(cx, cy, r - 2, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2, false).strokePath();
      if (this.dash.charges <= 0) iconA = 0.5 * a;
    } else g.lineStyle(1, LIGHT, 0.5 * a).strokeCircle(cx, cy, r - 2);
    this._icon(g, icon, cx, cy, iconA);
    if (icon === 'dash' && this.dash.max > 1) for (let i = 0; i < this.dash.max; i++) {
      const px = cx - (this.dash.max * 4) / 2 + i * 4 + 0.5;
      g.fillStyle(KEY, a).fillRect(px - 1, cy + 9, 5, 5).fillStyle(i < this.dash.charges ? LIGHT : 0x4b5468, a).fillRect(px, cy + 10, 3, 3);
    }
  }
  _square(g, b, pressed, icon) {
    if (!b) return;
    const s = b.vr * 2, x = Math.round(b.cx - b.vr), y = Math.round(b.cy - b.vr) + (pressed ? 1 : 0);
    g.fillStyle(KEY, 0.9).fillRect(x - 1, y - 1, s + 2, s + 2);
    g.fillStyle(pressed ? 0x1a1a26 : BODY, 0.75).fillRect(x, y, s, s);
    this._icon(g, icon, b.cx, b.cy + (pressed ? 1 : 0), 1);
  }

  /** 16 px monochrome icons (#fdf7ed + #222222 keyline): ››› · ⇄ · hand/coin/stair · II · wand+. */
  _icon(g, kind, cx, cy, a) {
    const L = (x, y, w, h) => { g.fillStyle(KEY, a).fillRect(cx + x - 1, cy + y - 1, w + 2, h + 2); };
    const F = (x, y, w, h) => { g.fillStyle(LIGHT, a).fillRect(cx + x, cy + y, w, h); };
    const both = (list) => { for (const r of list) L(...r); for (const r of list) F(...r); };
    if (kind === 'dash') {
      const ch = [];
      for (let k = 0; k < 3; k++) { const ox = -7 + k * 5; ch.push([ox, -4, 2, 2], [ox + 2, -2, 2, 2], [ox + 2, 0, 2, 2], [ox, 2, 2, 2]); }
      both(ch);
    } else if (kind === 'swap') {
      both([[-6, -4, 10, 2], [2, -6, 2, 2], [4, -4, 2, 2], [2, -2, 2, 2], [-4, 2, 10, 2], [-6, 2, 2, 2], [-4, 0, 2, 2], [-4, 4, 2, 2]]);
    } else if (kind === 'use') {
      const k = this.useKind;
      if (k === 'shop-item' || k === 'shopkeeper') { g.fillStyle(KEY, a).fillCircle(cx, cy, 7); g.fillStyle(C.gold, a).fillCircle(cx, cy, 6); F(-1, -3, 2, 6); }
      else if (k === 'stairs' || k === 'stair') both([[-6, 2, 4, 3], [-2, -1, 4, 6], [2, -4, 4, 9]]);
      else both([[-4, -2, 8, 7], [-4, -6, 2, 4], [-1, -7, 2, 5], [2, -6, 2, 4], [5, -1, 2, 3]]);   // hand (take)
    } else if (kind === 'pause') both([[-4, -5, 3, 10], [2, -5, 3, 10]]);
    else if (kind === 'edit') {
      both([[-6, 4, 2, 2], [-4, 2, 2, 2], [-2, 0, 2, 2], [0, -2, 2, 2], [2, -4, 2, 2]]);     // wand diagonal
      both([[3, 1, 5, 1], [5, -1, 1, 5]]);                                                     // + badge
    }
  }

  // ---- sticks (§3.2): drawn only while pressed; base clamped ≥ R + 2 inside the canvas, math uses the true point ----
  _stick(g, s, ring) {
    if (!s.held) return;
    const R = T('touchStickRadiusPx', 28);
    const bx = Math.max(R + 2, Math.min(VIEW_W - R - 2, s.bx)), by = Math.max(R + 2, Math.min(VIEW_H - R - 2, s.by));
    g.fillStyle(KEY, 0.25).fillCircle(bx, by, R);
    g.lineStyle(1, ring, 0.35).strokeCircle(bx, by, R);
    const kx = bx + s.x * R, ky = by + s.y * R;
    g.fillStyle(LIGHT, 0.6).fillCircle(kx, ky, 10);
    g.lineStyle(1, KEY, 0.8).strokeCircle(kx, ky, 10);
  }

  // ---- auto-fire target marker (§3.3 rule 5): four 3 px corner ticks, 1 px light + 1 px dark keyline ----
  _marker(sim) {
    const m = this.mk; m.clear();
    const ctx = sim && sim.ctx;
    const tg = ctx && ctx.autoTarget;
    if (!tg || !ctx.intent || ctx.intent.aimSource !== 'auto' || !ctx.intent.castHeld) return;
    const v = ctx.cam.view, z = v.z || 1;         // world → screen (phone room zoom, aspect-ratio-spec §3)
    const x0 = Math.round((tg.x - v.x - tg.w / 2) * z - 2), y0 = Math.round((tg.y - v.y - (tg.kind === 'enemy' ? tg.h : tg.h / 2)) * z - 2);
    const x1 = x0 + Math.round(tg.w * z) + 4, y1 = y0 + Math.round(tg.h * z) + 4;
    const tick = (x, y, sx, sy) => {
      m.fillStyle(KEY, 1).fillRect(x - (sx < 0 ? 3 : 0) - 1, y - 1, 5, 3).fillRect(x - 1, y - (sy < 0 ? 3 : 0) - 1, 3, 5);
      m.fillStyle(LIGHT, 1).fillRect(x - (sx < 0 ? 2 : 0), y, 3, 1).fillRect(x, y - (sy < 0 ? 2 : 0), 1, 3);
    };
    tick(x0, y0, 1, 1); tick(x1, y0, -1, 1); tick(x0, y1, 1, -1); tick(x1, y1, -1, -1);
  }

  _drawDebug() {
    const d = this.dbg, L = this.L; d.clear();
    for (const b of Object.values(L.buttons)) {
      d.lineStyle(1, 0xff4040, 1);
      if (b.kind === 'circle') d.strokeCircle(b.cx, b.cy, b.r); else d.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    }
    for (const [k, r] of Object.entries(L.clusters)) if (r[2] > 0) { d.lineStyle(1, 0x40ff40, 1).strokeRect(r[0] + 0.5, r[1] + 0.5, r[2] - 1, r[3] - 1); void k; }
    if (L.zones) { d.lineStyle(1, 0x4080ff, 0.6).lineBetween(Math.round(VIEW_W / 2), L.zones.move.y, Math.round(VIEW_W / 2), VIEW_H).lineBetween(0, L.zones.move.y, VIEW_W, L.zones.move.y); }
    const S = L.safe; d.lineStyle(1, 0xffff00, 0.6).strokeRect(S.l + 0.5, S.t + 0.5, S.r - S.l - 1, S.b - S.t - 1);
  }

  destroy() { this.g.destroy(); this.mk.destroy(); this.dbg.destroy(); void EV; }
}
