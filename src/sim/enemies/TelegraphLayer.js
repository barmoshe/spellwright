// sim/enemies/TelegraphLayer.js — telegraphs.md §1.1 render contract.
//
// ONE Graphics at depth band `decals` (10), cleared and redrawn once per sim step with every active
// telegraph shape: one draw call however many enemies are winding up (architecture §11 ≤ 30 draw calls).
// Shapes are pooled plain objects ("decals") owned by the attack that allocated them; their geometry and
// progress `p` are written by the AI each step (state-graph R3: progress-driven, never a tween).
//
// Rim (accessibility §3, style-guide §2.4 `telegraph-rim` = dual keyline 1 px #fdd0d6 over 1 px #222222):
//   opening/signal: DASHED (2 on / 1 off), the dash pattern crawls 1 px per 4 steps (motion channel)
//   lock window:    SOLID + DOUBLED (second inner light line) — dashed→solid is the non-hue lock read
//   heavy (dmg ≥ 2): 2 px light line
// Fill: `telegraph-fill` at decalFillAlphaSignal → decalFillAlphaLock in the lock window. Release: 1 step
// full fill at α 0.7 (§1.4). Interrupted: 100 ms grey fade (§1.5). WYSIWYH: every damaging decal is drawn
// at exactly the extent the sim tests (callers pass the tested radius / arc / lane width).
// Cap: ≤ 16 shapes; non-damaging shapes (sigils, pulse rings, spokes) are dropped first, damaging never.

import { DEPTH } from '../../config.js';
import { COL, TAU, clamp } from './tokens.js';

const POOL = 128;
const MAX_SHAPES = 16;

function blank(d) {
  d.kind = ''; d.owner = 0; d.damaging = false; d.heavy = false; d.mode = 'live'; d.t = 0; d.ms = 0; d.drawn = false;
  d.x = 0; d.y = 0; d.r = 0; d.r0 = 0; d.r1 = 0; d.aim = 0; d.arc = 0; d.len = 0; d.width = 0; d.s0 = 0;
  d.count = 0; d.a0 = 0; d.astep = 0; d.p = 0; d.locked = false; d.alpha = 1; d.rot = 0; d.chev = 0; d.wallEnd = false;
  d.color = COL.rim; d.fillColor = COL.fill; d.innerColor = 0; d.fillAlpha = 0; d.tick = 0; d.blink = false; d.rune = false;
  d.brighten = 0; d.pulse = 1; d.age = 0;
  return d;
}

export class TelegraphLayer {
  /** @param {Phaser.Scene} scene  @param {(k:string)=>number} T tunables reader */
  constructor(scene, T) {
    this.scene = scene;
    this.T = T;
    this.g = scene.add.graphics().setDepth(DEPTH.decals);
    this.live = [];
    this.free = [];
    for (let i = 0; i < POOL; i++) this.free.push(blank({}));
    this.step = 0;
    this.dirty = true;
    this.alphaSignal = T('decalFillAlphaSignal');
    this.alphaLock = T('decalFillAlphaLock');
    this.refused = 0;
    this.artSigil = false;      // set by EnemyViews when the TA's fx.summon_sigil frames exist
  }

  // ------------------------------------------------------------------ allocation
  add(kind, owner = 0, damaging = false) {
    const d = this.free.pop();
    if (!d) { this.refused++; return null; }
    blank(d);
    d.kind = kind; d.owner = owner; d.damaging = damaging;
    this.live.push(d);
    this.dirty = true;
    return d;
  }
  remove(d) {
    if (!d) return;
    const i = this.live.indexOf(d);
    if (i >= 0) { this.live[i] = this.live[this.live.length - 1]; this.live.pop(); this.free.push(d); }
    this.dirty = true;
  }
  /** 1-step full-fill release flash (§1.4), then freed. */
  toFlash(d) { if (d) { d.mode = 'flash'; d.drawn = false; d.locked = true; this.dirty = true; } }
  /** 100 ms grey fizzle (§1.5). */
  toFizzle(d, ms = 100) { if (d && d.mode === 'live') { d.mode = 'fizzle'; d.t = 0; d.ms = ms; this.dirty = true; } }
  /** Fade out over ms, harmless (hazard pools after their damage window). */
  toFade(d, ms) { if (d) { d.mode = 'fade'; d.t = 0; d.ms = ms; this.dirty = true; } }
  /** Expanding outline ring (dust ring, shockwave, ring release). Self-freeing. */
  ring(x, y, r0, r1, ms, color, alpha = 1, width = 1) {
    const d = this.add('expRing', 0, false); if (!d) return null;
    d.x = x; d.y = y; d.r0 = r0; d.r1 = r1; d.ms = ms; d.color = color; d.alpha = alpha; d.width = width; d.mode = 'timed';
    return d;
  }
  clear() { while (this.live.length) this.free.push(this.live.pop()); this.dirty = true; }

  // ------------------------------------------------------------------ per sim step
  /** Advance timers and free finished decals. Called at the START of every sim step. */
  tick(dt) {
    this.step++;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const d = this.live[i];
      d.age += dt;
      let done = false;
      if (d.mode === 'flash') done = d.drawn;
      else if (d.mode === 'fizzle' || d.mode === 'fade' || d.mode === 'timed') { d.t += dt; done = d.t >= d.ms; }
      if (done) { this.live[i] = this.live[this.live.length - 1]; this.live.pop(); this.free.push(d); }
    }
    this.dirty = true;
  }

  /** Redraw everything (once per sim step; RunScene render calls this only when dirty). */
  redraw() {
    if (!this.dirty) return;
    this.dirty = false;
    const g = this.g;
    g.clear();
    const crawl = (this.step >> 2) % 3;
    let drawn = 0;
    // pass 1: damaging shapes (never dropped); pass 2: the rest up to the cap
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < this.live.length; i++) {
        const d = this.live[i];
        if ((pass === 0) !== d.damaging) continue;
        if (pass === 1 && drawn >= MAX_SHAPES && d.kind !== 'expRing' && d.kind !== 'hazardActive') continue;
        this._draw(g, d, crawl);
        if (d.mode === 'flash') d.drawn = true;
        drawn++;
      }
    }
  }

  // ------------------------------------------------------------------ drawing
  _draw(g, d, crawl) {
    const fiz = d.mode === 'fizzle';
    const k = fiz || d.mode === 'fade' ? clamp(1 - d.t / d.ms, 0, 1) : 1;
    const flash = d.mode === 'flash';
    const locked = d.locked || flash;
    const style = this._style || (this._style = { dashed: false, heavy: false, doubled: false, alpha: 1, mono: -1, crawl: 0 });
    style.dashed = !locked && !fiz; style.heavy = d.heavy; style.doubled = locked && !fiz; style.alpha = d.alpha * k;
    style.mono = fiz ? COL.fizzle : -1; style.crawl = crawl;
    if (d.brighten > this.step) { style.alpha = Math.min(1, style.alpha + 0.3); }
    const fillA = flash ? 0.7 : (locked ? this.alphaLock : this.alphaSignal) * k;
    const fillC = fiz ? COL.fizzle : d.fillColor;
    const x = Math.round(d.x), y = Math.round(d.y);
    switch (d.kind) {
      case 'circle': {
        const R = Math.round(d.r);
        const fr = flash ? R : Math.round(R * clamp(d.p, 0, 1));
        if (fr > 0) g.fillStyle(fillC, fillA).fillCircle(x, y, fr);
        this._rimCircle(g, x, y, R, style);
        break;
      }
      case 'wedge': {
        const R = Math.round(d.r);
        const fr = flash ? R : Math.round(R * clamp(d.p, 0, 1));
        const a0 = d.aim - d.arc / 2, a1 = d.aim + d.arc / 2;
        if (fr > 0) { g.fillStyle(fillC, fillA); g.beginPath(); g.slice(x, y, fr, a0, a1, false); g.closePath(); g.fillPath(); }
        this._rimWedge(g, x, y, R, a0, a1, style);
        break;
      }
      case 'lane': this._lane(g, d, style, fillC, fillA, flash); break;
      case 'spokes': {
        const c = style.mono >= 0 ? style.mono : d.color;
        for (let i = 0; i < d.count; i++) {
          const a = d.a0 + i * d.astep, ca = Math.cos(a), sa = Math.sin(a);
          this._pxLine(g, x + ca * d.r0, y + sa * d.r0, x + ca * d.r1, y + sa * d.r1, COL.rimDark, style.alpha * 0.8, false, 0, 1, 1);
          this._pxLine(g, x + ca * d.r0, y + sa * d.r0, x + ca * d.r1, y + sa * d.r1, c, style.alpha, false, 0, 0, 0);
        }
        break;
      }
      case 'aimLines': case 'aimTicks': {
        const c = style.mono >= 0 ? style.mono : d.color;
        for (let i = 0; i < d.count; i++) {
          const a = d.a0 + i * d.astep, ca = Math.cos(a), sa = Math.sin(a);
          this._pxLine(g, x + ca * d.r0, y + sa * d.r0, x + ca * (d.r0 + d.len), y + sa * (d.r0 + d.len), c, style.alpha, false, 0, 0, 0);
        }
        break;
      }
      case 'pulseRing': this._rimCircle(g, x, y, Math.round(d.r), style, true); break;
      case 'sigil': if (!this.artSigil || fiz) this._sigil(g, x, y, d, style); break;   // art sigils: EnemyViews (fx.summon_sigil)
      case 'hazardMark': {
        const R = Math.round(d.r);
        const fr = flash ? R : Math.round(R * clamp(d.p, 0, 1));
        if (fr > 0) g.fillStyle(fillC, fillA).fillCircle(x, y, fr);
        this._rimCircle(g, x, y, R, style);
        if (d.rune && !fiz) {        // rune-ring: 4 dashes rotating 90°/s (lich fire_zones)
          const rr = Math.max(3, R - 4);
          for (let i = 0; i < 4; i++) {
            const a = d.rot + i * (TAU / 4);
            this._pxArc(g, x, y, rr, a - 0.25, a + 0.25, COL.rim, style.alpha, false, 0);
          }
        }
        break;
      }
      case 'hazardActive': this._hazardActive(g, x, y, d, style); break;
      case 'expRing': {
        const t = clamp(d.t / d.ms, 0, 1);
        const e = 1 - (1 - t) * (1 - t) * (1 - t);   // Cubic.easeOut
        const rr = Math.round(d.r0 + (d.r1 - d.r0) * e);
        if (rr > 0) { g.lineStyle(d.width, d.color, d.alpha * (1 - t)); g.strokeCircle(x, y, rr); }
        break;
      }
      default: break;
    }
  }

  /** Pixel circle: dual keyline, dashed/solid/doubled/heavy. `plain` = single light line (pulse ring). */
  _rimCircle(g, x, y, R, s, plain = false) {
    if (R <= 0) return;
    if (s.mono >= 0) { this._pxArc(g, x, y, R, 0, TAU, s.mono, s.alpha, false, 0); return; }
    if (!plain && R > 2) this._pxArc(g, x, y, R - 1, 0, TAU, COL.rimDark, s.alpha, s.dashed, s.crawl);
    this._pxArc(g, x, y, R, 0, TAU, COL.rim, s.alpha, s.dashed, s.crawl);
    if (s.heavy && !plain) this._pxArc(g, x, y, R + 1, 0, TAU, COL.rim, s.alpha, s.dashed, s.crawl);
    if (s.doubled && !plain && R > 4) this._pxArc(g, x, y, R - 2, 0, TAU, COL.rim, s.alpha, false, 0);
  }

  _rimWedge(g, x, y, R, a0, a1, s) {
    const c = s.mono >= 0 ? s.mono : COL.rim;
    const ca0 = Math.cos(a0), sa0 = Math.sin(a0), ca1 = Math.cos(a1), sa1 = Math.sin(a1);
    if (s.mono < 0) {
      this._pxArc(g, x, y, R - 1, a0, a1, COL.rimDark, s.alpha, s.dashed, s.crawl);
      // inner keyline of the radial edges: 1 px toward the wedge interior
      this._pxLine(g, x, y, x + ca0 * (R - 1), y + sa0 * (R - 1), COL.rimDark, s.alpha, s.dashed, s.crawl, -sa0, ca0);
      this._pxLine(g, x, y, x + ca1 * (R - 1), y + sa1 * (R - 1), COL.rimDark, s.alpha, s.dashed, s.crawl, sa1, -ca1);
    }
    this._pxArc(g, x, y, R, a0, a1, c, s.alpha, s.dashed, s.crawl);
    this._pxLine(g, x, y, x + ca0 * R, y + sa0 * R, c, s.alpha, s.dashed, s.crawl, 0, 0);
    this._pxLine(g, x, y, x + ca1 * R, y + sa1 * R, c, s.alpha, s.dashed, s.crawl, 0, 0);
    if (s.heavy && s.mono < 0) this._pxArc(g, x, y, R + 1, a0, a1, c, s.alpha, s.dashed, s.crawl);
    if (s.doubled && R > 4) this._pxArc(g, x, y, R - 2, a0, a1, c, s.alpha, false, 0);
  }

  /** Charge lane (rect-path): WYSIWYH width, raycast length, chevrons toward the end, ✕ wall marker. */
  _lane(g, d, s, fillC, fillA, flash) {
    const ca = Math.cos(d.aim), sa = Math.sin(d.aim), nx = -sa, ny = ca, hw = d.width / 2;
    const s0 = d.s0, L = d.len;
    if (L - s0 <= 0) return;
    const fillLen = flash ? L : s0 + (L - s0) * clamp(d.p, 0, 1);
    const bx = d.x + ca * s0, by = d.y + sa * s0;
    if (fillLen > s0) {
      const ex = d.x + ca * fillLen, ey = d.y + sa * fillLen;
      g.fillStyle(fillC, fillA);
      g.beginPath();
      g.moveTo(bx + nx * hw, by + ny * hw); g.lineTo(ex + nx * hw, ey + ny * hw);
      g.lineTo(ex - nx * hw, ey - ny * hw); g.lineTo(bx - nx * hw, by - ny * hw);
      g.closePath(); g.fillPath();
    }
    const ex = d.x + ca * L, ey = d.y + sa * L;
    const c = s.mono >= 0 ? s.mono : COL.rim;
    for (let j = 0; j < 2; j++) {
      const sg = j === 0 ? 1 : -1;
      if (s.mono < 0) this._pxLine(g, bx + nx * (hw - 1) * sg, by + ny * (hw - 1) * sg, ex + nx * (hw - 1) * sg, ey + ny * (hw - 1) * sg, COL.rimDark, s.alpha, s.dashed, s.crawl, 0, 0);
      this._pxLine(g, bx + nx * hw * sg, by + ny * hw * sg, ex + nx * hw * sg, ey + ny * hw * sg, c, s.alpha, s.dashed, s.crawl, 0, 0);
      if (s.heavy && s.mono < 0) this._pxLine(g, bx + nx * (hw + 1) * sg, by + ny * (hw + 1) * sg, ex + nx * (hw + 1) * sg, ey + ny * (hw + 1) * sg, c, s.alpha, s.dashed, s.crawl, 0, 0);
    }
    this._pxLine(g, ex + nx * hw, ey + ny * hw, ex - nx * hw, ey - ny * hw, c, s.alpha, s.dashed, s.crawl, 0, 0);
    if (s.mono >= 0) return;
    // chevrons `>` 3 px every 16 px, scrolled by d.chev (px), pointing along the aim
    const off = ((d.chev % 16) + 16) % 16;
    for (let t = s0 + off + 4; t < L - 2; t += 16) {
      const cx = d.x + ca * t, cy = d.y + sa * t;
      this._pxLine(g, cx - ca * 3 + nx * 3, cy - sa * 3 + ny * 3, cx, cy, COL.rim, s.alpha, false, 0, 0, 0);
      this._pxLine(g, cx - ca * 3 - nx * 3, cy - sa * 3 - ny * 3, cx, cy, COL.rim, s.alpha, false, 0, 0, 0);
    }
    if (d.wallEnd) {       // 5 px ✕ impact tick at the lane end: "bait it into a wall"
      this._pxLine(g, ex - 2, ey - 2, ex + 2, ey + 2, COL.rim, s.alpha, false, 0, 0, 0);
      this._pxLine(g, ex - 2, ey + 2, ex + 2, ey - 2, COL.rim, s.alpha, false, 0, 0, 0);
    }
  }

  /** Summon sigil: hostile protection-circle glyph (NOT a filled disc), α ∝ p, rotating 120°/s. */
  _sigil(g, x, y, d, s) {
    const c = s.mono >= 0 ? s.mono : COL.rim;
    const R = Math.round(d.r);
    const a = s.alpha * clamp(d.p, 0.15, 1);
    this._pxArc(g, x, y, R, 0, TAU, c, a, s.mono < 0, s.crawl);
    for (let tri = 0; tri < 2; tri++) {           // hexagram
      for (let i = 0; i < 3; i++) {
        const a0 = d.rot + tri * Math.PI / 3 + i * TAU / 3, a1 = a0 + TAU / 3;
        this._pxLine(g, x + Math.cos(a0) * (R - 2), y + Math.sin(a0) * (R - 2), x + Math.cos(a1) * (R - 2), y + Math.sin(a1) * (R - 2), c, a * 0.9, false, 0, 0, 0);
      }
    }
  }

  /** Active hazard pool (art-slot-map zones.hazard.*): element disc + dual keyline outside + inner element rim. */
  _hazardActive(g, x, y, d, s) {
    const R = Math.round(d.r);
    const k = d.mode === 'fade' ? clamp(1 - d.t / d.ms, 0, 1) : 1;
    g.fillStyle(d.fillColor, d.fillAlpha * k).fillCircle(x, y, R);
    let ra = 1 - 0.6 * d.tick;                      // tick flash: outline α 1.0 → 0.4 over 200 ms
    if (d.blink && ((this.step / 8) | 0) % 2 === 1) ra *= 0.35;   // final 500 ms: 4 Hz blink
    ra *= k;
    this._pxArc(g, x, y, R + 1, 0, TAU, COL.rimDark, ra, false, 0);
    this._pxArc(g, x, y, R + 2, 0, TAU, COL.rim, ra, false, 0);
    this._pxArc(g, x, y, R, 0, TAU, d.innerColor, ra, false, 0);
  }

  // ------------------------------------------------------------------ pixel primitives (integer px, R4)
  _pxArc(g, x, y, R, a0, a1, color, alpha, dashed, crawl) {
    if (R <= 0 || alpha <= 0) return;
    g.fillStyle(color, alpha);
    const span = a1 - a0;
    const n = Math.max(6, Math.ceil(Math.abs(span) * R * 1.2));
    let lx = 1e9, ly = 1e9, k = 0;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (span * i) / n;
      const px = Math.round(x + Math.cos(a) * R), py = Math.round(y + Math.sin(a) * R);
      if (px === lx && py === ly) continue;
      lx = px; ly = py;
      if (dashed && ((k + crawl) % 3) === 2) { k++; continue; }
      k++;
      g.fillRect(px, py, 1, 1);
    }
  }
  /** Pixel line; (ox, oy) is a sub-pixel offset applied to both ends (inner keylines). */
  _pxLine(g, x0, y0, x1, y1, color, alpha, dashed, crawl, ox, oy) {
    if (alpha <= 0) return;
    x0 += ox || 0; y0 += oy || 0; x1 += ox || 0; y1 += oy || 0;
    g.fillStyle(color, alpha);
    const dx = x1 - x0, dy = y1 - y0;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    let lx = 1e9, ly = 1e9;
    for (let i = 0; i <= n; i++) {
      const px = Math.round(x0 + (dx * i) / n), py = Math.round(y0 + (dy * i) / n);
      if (px === lx && py === ly) continue;
      lx = px; ly = py;
      if (dashed && ((i + crawl) % 3) === 2) continue;
      g.fillRect(px, py, 1, 1);
    }
  }

  destroy() { this.g.destroy(); this.live.length = 0; this.free.length = 0; }
}
