// ui/DamageNumbers.js — world-space damage numbers (hud-layout §4, motion-spec §6 `world-damage-number`).
// Lives in RunScene (world coordinates, depth 95) and is advanced by WorldHud.update(dtMs), so it
// freezes with hit-stop and modals like every world object (motion-spec §0 rule 4).
//
// Policy: T1 white with the baked 1 px outline · ceil(dmg) · aggregation per enemy within 200 ms of
// the last shown number (the number updates and restarts its rise) · cap 24 live (new replaces
// oldest) · crit = integer ×`critNumberScale` + "!" + gold · first-time reaction = the reaction word
// prefix, later reactions = the reaction's tint · rise `damageNumberRisePx` over `damageNumberRiseMs`
// (Cubic.easeOut), fade over the last 150 ms; 1-step 2 px spawn pop instead of a scale overshoot.
// Reduced motion: no rise and no pop; appear, hold, fade. No numbers for damage the player takes.
// Zero allocation after warm-up: 24 pooled text objects, setText only on spawn/aggregate.

import { C, txt, setColor } from './kit.js';
import { T } from '../core/tunables.js';
import { Save } from '../core/save.js';
import { t } from '../core/i18n.js';
import { reducedMotion, SPATIAL } from './HudKit.js';

const CAP = 24, AGG_MS = 200, FADE_MS = 150, POP_MS = 17, AGG_RADIUS = 20;
export const REACTION_TINT = { melt: C.element.fire, overload: C.element.shock, blight: C.element.poison, superconduct: C.element.frost, quench: C.dim };

const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);

export class DamageNumbers {
  constructor(scene, run) {
    this.scene = scene;
    this.run = run;
    this.pool = [];
    this.pending = [];          // first-time reaction words waiting for their number {name, x, y, age, first}
    this.riseMs = T('damageNumberRiseMs');
    this.risePx = T('damageNumberRisePx');
    this.critScale = Math.max(1, Math.round(T('critNumberScale')));   // integer only (O-UX-3)
    this.seq = 0;
  }

  _slot() {
    for (const e of this.pool) if (!e.active) return e;
    if (this.pool.length < CAP) {
      const o = txt(this.scene, 0, 0, '0', 'T1', { origin: [0.5, 1] }).setDepth(95).setVisible(false);
      const e = { o, active: false };
      this.pool.push(e);
      return e;
    }
    let old = this.pool[0];
    for (const e of this.pool) if (e.seq < old.seq) old = e;
    return old;
  }

  /** A reaction fired at (x, y): prefix the next/nearest number with its word (first time) or tint it. */
  reaction(name, x, y, first) {
    // A number already spawned this instant at the same spot takes it retroactively.
    for (const e of this.pool) {
      if (!e.active || e.age > 60 || Math.abs(e.x - x) > 32 || Math.abs(e.baseY - y) > 32) continue;
      this._applyReaction(e, name, first); this._render(e);
      return;
    }
    this.pending.push({ name, x, y, age: 0, first });
    if (this.pending.length > 8) this.pending.shift();
  }

  _applyReaction(e, name, first) {
    if (first) e.prefix = t(`world.reaction.${name}`);
    e.tint = REACTION_TINT[name] ?? null;
  }

  /** combat:dmg payload {x, y, amount, crit, element, target, id?} */
  spawn(d) {
    if (!d || d.target === 'player') return;
    if (Save.settings.damageNumbers === false) return;
    const amount = Math.ceil(d.amount || 0);
    if (amount <= 0) return;
    // aggregation: same enemy id (or, without an id, the same spot) within 200 ms of its last hit
    for (const e of this.pool) {
      if (!e.active || e.sinceHit > AGG_MS) continue;
      const same = d.id != null ? e.id === d.id : (Math.abs(e.x - d.x) <= AGG_RADIUS && Math.abs(e.baseY - d.y) <= AGG_RADIUS + this.risePx);
      if (!same) continue;
      e.value += amount;
      e.crit = e.crit || !!d.crit;
      e.sinceHit = 0; e.age = 0;
      e.y0 = e.o.y;                        // restart the rise from the current y (motion-spec aggregate)
      if (d.reaction) e.tint = REACTION_TINT[d.reaction] ?? e.tint;
      this._takePending(e);
      this._render(e);
      return;
    }
    const e = this._slot();
    e.active = true; e.seq = ++this.seq;
    e.id = d.id ?? null;
    e.value = amount; e.crit = !!d.crit; e.prefix = ''; e.tint = null;
    const jitter = this.run && this.run.rng && this.run.rng.fx ? Math.round(this.run.rng.fx.float(-3, 3)) : 0;
    e.x = Math.round(d.x + jitter); e.baseY = Math.round(d.y);
    e.y0 = e.baseY;
    e.age = 0; e.sinceHit = 0;
    if (d.reaction) e.tint = REACTION_TINT[d.reaction] ?? null;   // combat:dmg carries the reaction name
    this._takePending(e);
    this._render(e);
    e.o.setVisible(true).setAlpha(1);
    this._place(e);
  }

  _takePending(e) {
    for (let i = 0; i < this.pending.length; i++) {
      const p = this.pending[i];
      if (Math.abs(p.x - e.x) <= 32 && Math.abs(p.y - e.baseY) <= 32) { this._applyReaction(e, p.name, p.first); this.pending.splice(i, 1); return; }
    }
  }

  _render(e) {
    const s = `${e.prefix ? e.prefix + ' ' : ''}${e.value}${e.crit ? '!' : ''}`;
    e.o.setText(s);
    e.o.setScale(e.crit ? this.critScale : 1);
    setColor(e.o, e.crit ? C.gold : (e.tint ?? C.text));
  }

  _place(e) {
    const rm = reducedMotion();
    const p = Math.min(1, e.age / this.riseMs);
    let y = rm ? e.y0 : e.y0 - this.risePx * easeOutCubic(p);
    if (!rm && e.age < POP_MS) y += 2;
    // clamp to the spatial box (hud-layout §2.4) in screen space
    const cam = this.scene.cameras.main;
    const sx = e.x - cam.scrollX, sy = y - cam.scrollY;
    const hw = (e.o.width * e.o.scaleX) / 2, hh = e.o.height * e.o.scaleY;
    const cx = Math.max(SPATIAL.x + hw, Math.min(SPATIAL.x + SPATIAL.w - hw, sx));
    const cy = Math.max(SPATIAL.y + hh, Math.min(SPATIAL.y + SPATIAL.h, sy));
    e.o.setPosition(Math.round(cx + cam.scrollX), Math.round(cy + cam.scrollY));
    const fadeAt = this.riseMs - FADE_MS;
    e.o.setAlpha(e.age <= fadeAt ? 1 : Math.max(0, 1 - (e.age - fadeAt) / FADE_MS));
  }

  update(dt) {
    for (const p of this.pending) p.age += dt;
    while (this.pending.length && this.pending[0].age > 150) this.pending.shift();
    for (const e of this.pool) {
      if (!e.active) continue;
      e.age += dt; e.sinceHit += dt;
      if (e.age >= this.riseMs) { e.active = false; e.o.setVisible(false); continue; }
      this._place(e);
    }
  }

  clear() { for (const e of this.pool) { e.active = false; e.o.setVisible(false); } this.pending.length = 0; }
  destroy() { for (const e of this.pool) e.o.destroy(); this.pool.length = 0; }
}
