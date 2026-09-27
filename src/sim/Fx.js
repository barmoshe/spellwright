// sim/Fx.js — world presentation services (sim-contract §2 ctx.fx). Lives in RunScene, so everything
// here freezes with hit-stop (the whole run scene pauses; state-graph R3).
//   shake(px, ms)        — × Settings screen-shake, 0 under reduced motion, concurrent sum clamped to
//                          feel `shakeMaxPx` (accessibility-spec §4.2). Camera reads offset().
//   hitstop(ms)          — core/timecontrol (pauses the whole run scene; audio keeps playing)
//   particles(...)       — pooled 1–3 px sprites (budget ≤ 1 200 live, architecture §11)
//   ring / explosion     — one Graphics redrawn per render frame for all rings (1 draw call)
//   flipbook(fxId, …)    — art-slot-map fx.* frames via Art; falls back to a ring
//   afterimage(sprite)   — dash / charge ghosts (pooled)
//   largeFlash(area)     — WCAG 2.3.1 limiter: ≤ 3 large flashes (≥ 57 600 px² summed) per 1 s window

import Phaser from '../../lib/phaser.esm.min.js';
import { DEPTH, VIEW_W, VIEW_H } from '../config.js';
import { Art } from '../core/art.js';
import { Save } from '../core/save.js';
import { EV } from '../core/ev.js';

const MAX_PARTICLES = 1200;
const LARGE_FLASH_AREA = 0.25 * VIEW_W * VIEW_H;   // 57 600 px²

export class Fx {
  constructor(ctx) {
    this.ctx = ctx;
    const s = this.scene = ctx.scene;
    this.shakes = [];
    this.shakeX = 0; this.shakeY = 0;
    this.rings = [];
    this.lines = [];
    this.ringG = s.add.graphics().setDepth(DEPTH.fx);
    this.flashG = s.add.graphics().setDepth(DEPTH.projectilesAdd).setBlendMode(Phaser.BlendModes.ADD);
    this.flashes = [];
    this.parts = [];
    this.freeParts = [];
    for (let i = 0; i < 400; i++) this.freeParts.push(this._newPart());
    this.books = [];
    this.ghosts = [];
    this.flashWindow = [];      // timestamps (sim ms) of large flashes
    this.stepFlashArea = 0;
  }

  get T() { return this.ctx.T; }
  get reduced() { return this.ctx.flags.reducedMotion; }

  // ------------------------------------------------------------------ shake
  shake(px, ms) {
    const scale = this.reduced ? 0 : Save.settings.screenShake / 100;
    if (scale <= 0 || px <= 0 || ms <= 0) return;
    this.shakes.push({ px: px * scale, ms, t: 0 });
  }
  hitstop(ms) { if (ms > 0) this.scene.registry.get('time').hitstop(ms); }

  // ------------------------------------------------------------------ particles
  _newPart() {
    const im = this.scene.add.image(-100, -100, 'ph-px').setVisible(false).setDepth(DEPTH.fx);
    return { im, x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 0, fade: true, alive: false };
  }
  /** kinds: dust spark ember mote smoke shard bubble soul coin */
  particles(kind, x, y, n, opt = {}) {
    const rng = this.ctx.rng.fx;
    const color = opt.color ?? { dust: 0x8a7a70, spark: 0xfdf7ed, ember: 0xee8e2e, mote: 0xcfc0ff, smoke: 0x8a8a8a, shard: 0xcae6f5, bubble: 0x97da3f, soul: 0xcfc0ff, coin: 0xfacb3e }[kind] ?? 0xffffff;
    const speed = opt.speed ?? { dust: 30, spark: 70, ember: 25, mote: 15, smoke: 12, shard: 80, bubble: 12, soul: 20, coin: 40 }[kind] ?? 40;
    const life = opt.lifeMs ?? 300;
    const grav = opt.gravity ?? (kind === 'ember' || kind === 'mote' || kind === 'soul' || kind === 'bubble' || kind === 'smoke' ? -20 : 0);
    const size = opt.size ?? (kind === 'shard' || kind === 'smoke' ? 2 : 1);
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= MAX_PARTICLES) return;
      const p = this.freeParts.pop() || this._newPart();
      const a = opt.dir != null ? opt.dir + rng.float(-(opt.spread ?? 0.6), opt.spread ?? 0.6) : rng.float(0, Math.PI * 2);
      const v = speed * rng.float(0.5, 1);
      p.x = x; p.y = y; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.g = grav; p.life = 0; p.max = life * rng.float(0.7, 1.1); p.alive = true;
      p.im.setPosition(Math.round(x), Math.round(y)).setVisible(true).setTint(color).setScale(size / 2).setAlpha(1);
      p.im.setBlendMode(opt.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
      this.parts.push(p);
    }
  }

  // ------------------------------------------------------------------ rings, flashes, explosions
  /** Outline ring: static (grow:false) or expanding from r0 to r over ms. */
  ring(x, y, r, opt = {}) {
    this.rings.push({ x, y, r, r0: opt.r0 ?? (opt.grow === false ? r : 0), ms: opt.ms ?? 150, t: 0, color: opt.color ?? 0xfdf7ed,
      width: opt.width ?? 1, hostile: !!opt.hostile, alpha: opt.alpha ?? 1, fill: opt.fill ?? 0 });
  }
  /** Sprite-local additive flash disc (limited). */
  flashDisc(x, y, r, color = 0xffffff, ms = 60, alpha = 0.8) {
    const area = Math.PI * r * r;
    if (!this.largeFlash(area)) return;
    const k = Save.settings.flashIntensity / 100;
    if (k <= 0) return;
    this.flashes.push({ x, y, r, color, ms, t: 0, alpha: alpha * k });
  }
  /** fx.explosion: flash + flipbook + 1 px ring at the exact radius (the damage radius is always legible). */
  explosion(x, y, r, opt = {}) {
    const hostile = !!opt.hostile;
    this.flashDisc(x, y, Math.min(r, 56), hostile ? 0x9f294e : 0xee8e2e, 80, 0.6);
    this.ring(x, y, r, { grow: false, ms: 120, color: hostile ? 0xfdd0d6 : 0xfdf7ed, hostile });
    this.ring(x, y, r, { r0: r * 0.3, ms: 200, color: hostile ? 0xdc4a7b : 0xee8e2e, width: 2, alpha: 0.7 });
    this.flipbook('fx.explosion', x, y, { scale: r >= 40 ? 3 : 2 });
    this.particles('ember', x, y, Math.min(10, 4 + (r / 8) | 0), { color: hostile ? 0xdc4a7b : 0xee8e2e, speed: r * 2, lifeMs: 280, gravity: 0 });
    this.particles('smoke', x, y, 3, { speed: 15, lifeMs: 500 });
    // rumble hook (controller-prompts §6 "big explosion"): only explosions the player can see
    const v = this.scene.cameras.main.worldView;
    if (this.ctx.bus && x + r >= v.x && x - r <= v.right && y + r >= v.y && y - r <= v.bottom) this.ctx.bus.emit(EV.FX_EXPLOSION, { x, y, r, hostile });
  }

  /** Global large-flash limiter (accessibility-spec §4.3): summed area per step; ≤ 3 large flashes / 1 s. */
  largeFlash(areaPx) {
    const now = this.ctx.time.ms;
    this.flashWindow = this.flashWindow.filter((t) => now - t < 1000);
    this.stepFlashArea += areaPx;
    if (this.stepFlashArea >= LARGE_FLASH_AREA) {
      if (this.flashWindow.length >= 3) return false;
      this.flashWindow.push(now);
      this.stepFlashArea = 0;
    }
    return true;
  }

  /** Jagged lightning line (chain arcs, zaps) — drawn with the ring Graphics. */
  bolt(x0, y0, x1, y1, opt = {}) {
    const rng = this.ctx.rng.fx;
    const pts = [{ x: x0, y: y0 }];
    const n = 4;
    for (let i = 1; i < n; i++) { const t = i / n; pts.push({ x: x0 + (x1 - x0) * t + rng.float(-3, 3), y: y0 + (y1 - y0) * t + rng.float(-3, 3) }); }
    pts.push({ x: x1, y: y1 });
    this.lines.push({ pts, color: opt.color ?? 0xfacb3e, ms: opt.ms ?? 100, t: 0 });
  }

  // ------------------------------------------------------------------ flipbooks
  flipbook(fxId, x, y, opt = {}) {
    const n = Art.count(fxId);
    if (!n) { if (!opt.silentFallback) this.ring(x, y, 6 * (opt.scale || 1), { ms: 160, color: opt.color ?? 0xfdf7ed }); return null; }
    const a = Art.get(fxId, 0);
    const im = this.scene.add.image(x, y, a.key, a.frame).setDepth(opt.depth ?? DEPTH.fx).setScale(opt.scale || 1).setRotation(opt.rotation || 0);
    if (opt.add) im.setBlendMode(Phaser.BlendModes.ADD);
    if (opt.tint != null) im.setTint(opt.tint);
    this.books.push({ im, id: fxId, n, fps: opt.fps ?? 20, t: 0, loop: !!opt.loop, onDone: opt.onDone });
    return im;
  }

  // ------------------------------------------------------------------ afterimages
  afterimage(sprite, opt = {}) {
    const g = this.scene.add.image(sprite.x, sprite.y, sprite.texture.key, sprite.frame.name)
      .setOrigin(sprite.originX, sprite.originY).setFlipX(sprite.flipX).setScale(sprite.scaleX, sprite.scaleY)
      .setDepth(sprite.depth - 0.0001).setTint(opt.tint ?? 0x5698cc).setTintMode(Phaser.TintModes.FILL).setAlpha(opt.alpha ?? 0.6);
    this.ghosts.push({ im: g, t: 0, ms: opt.fadeMs ?? 180, a0: opt.alpha ?? 0.6 });
  }

  // ------------------------------------------------------------------ per step (sim clock)
  step(dt) {
    this.stepFlashArea = 0;
    // shake: sum of linearly decaying shakes, clamped to shakeMaxPx
    let amp = 0;
    for (let i = this.shakes.length - 1; i >= 0; i--) {
      const s = this.shakes[i]; s.t += dt;
      if (s.t >= s.ms) { this.shakes.splice(i, 1); continue; }
      amp += s.px * (1 - s.t / s.ms);
    }
    amp = Math.min(amp, this.T('shakeMaxPx'));
    const rng = this.ctx.rng.fx;
    this.shakeX = amp > 0 ? Math.round(rng.float(-amp, amp)) : 0;
    this.shakeY = amp > 0 ? Math.round(rng.float(-amp, amp)) : 0;
  }

  /** Per render frame (RunScene update; frozen with hit-stop). */
  render(dtMs) {
    const dt = dtMs / 1000;
    // particles
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life += dtMs;
      if (p.life >= p.max) { p.alive = false; p.im.setVisible(false); this.parts[i] = this.parts[this.parts.length - 1]; this.parts.pop(); this.freeParts.push(p); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.96; p.vy *= 0.96;
      p.im.setPosition(Math.round(p.x), Math.round(p.y)).setAlpha(1 - p.life / p.max);
    }
    // rings + flashes
    const g = this.ringG; g.clear();
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dtMs;
      if (r.t >= r.ms) { this.rings.splice(i, 1); continue; }
      const k = r.t / r.ms;
      const rad = Math.round(r.r0 + (r.r - r.r0) * (r.r0 === r.r ? 1 : Phaser.Math.Easing.Cubic.Out(k)));
      if (r.hostile) g.lineStyle(r.width + 2, 0x222222, r.alpha * (1 - k)).strokeCircle(Math.round(r.x), Math.round(r.y), rad);
      g.lineStyle(r.width, r.color, r.alpha * (1 - k * 0.8)).strokeCircle(Math.round(r.x), Math.round(r.y), rad);
    }
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i]; l.t += dtMs;
      if (l.t >= l.ms) { this.lines.splice(i, 1); continue; }
      const a = 1 - l.t / l.ms;
      g.lineStyle(3, 0x222222, a * 0.6).strokePoints(l.pts, false);
      g.lineStyle(1, l.color, a).strokePoints(l.pts, false);
    }
    const f = this.flashG; f.clear();
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const fl = this.flashes[i]; fl.t += dtMs;
      if (fl.t >= fl.ms) { this.flashes.splice(i, 1); continue; }
      f.fillStyle(fl.color, fl.alpha * (1 - fl.t / fl.ms)).fillCircle(Math.round(fl.x), Math.round(fl.y), Math.round(fl.r));
    }
    // flipbooks
    for (let i = this.books.length - 1; i >= 0; i--) {
      const b = this.books[i]; b.t += dtMs;
      let fi = Math.floor((b.t / 1000) * b.fps);
      if (fi >= b.n) {
        if (b.loop) { fi %= b.n; } else { b.im.destroy(); this.books.splice(i, 1); if (b.onDone) b.onDone(); continue; }
      }
      const a = Art.getQuiet(b.id, fi); if (a) b.im.setTexture(a.key, a.frame);
    }
    // ghosts
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const gh = this.ghosts[i]; gh.t += dtMs;
      if (gh.t >= gh.ms) { gh.im.destroy(); this.ghosts.splice(i, 1); continue; }
      gh.im.setAlpha(gh.a0 * (1 - gh.t / gh.ms));
    }
  }

  clear() {
    for (const p of this.parts) { p.im.setVisible(false); p.alive = false; this.freeParts.push(p); }
    this.parts.length = 0; this.rings.length = 0; this.flashes.length = 0; this.lines.length = 0;
    for (const b of this.books) b.im.destroy(); this.books.length = 0;
    for (const g of this.ghosts) g.im.destroy(); this.ghosts.length = 0;
    this.shakes.length = 0;
  }

  destroy() { this.clear(); for (const p of this.freeParts) p.im.destroy(); this.ringG.destroy(); this.flashG.destroy(); }
}
