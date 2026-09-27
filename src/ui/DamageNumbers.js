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
// v2 (hud-layout §9.6): a defended hit shows a WORD instead of a number — "BLOCKED" / "ARMOURED" / "WARDED"
// (T1 grey #b6cbcf + the 7×7 defence icon), "BROKEN" once when the counter keyword breaks it — aggregated
// per enemy per 500 ms so shield spam never floods the screen. Words ride combat:dmg ({word, defence}).

import { C, txt, setColor } from './kit.js';
import { T } from '../core/tunables.js';
import { Save } from '../core/save.js';
import { t } from '../core/i18n.js';
import { reducedMotion, SPATIAL } from './HudKit.js';
import { Art } from '../core/art.js';

const CAP = 24, AGG_MS = 200, FADE_MS = 150, POP_MS = 17, AGG_RADIUS = 20, WORD_AGG_MS = 500;
const WORD_RANK = { blocked: 1, armoured: 1, warded: 1, broken: 2 };
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

  /** v2 defence word (always shown: it's information, not a damage number). */
  _word(d) {
    const rank = WORD_RANK[d.word] || 1;
    for (const e of this.pool) {
      if (!e.active || !e.isWord || e.id !== d.id || e.sinceHit > WORD_AGG_MS) continue;
      if (e.word === 'broken' && rank < 2) { e.sinceHit = 0; return; }        // BROKEN shows once; later blocks fold into it
      e.sinceHit = 0; e.age = 0; e.y0 = e.o.y;
      if (e.word !== d.word) { e.word = d.word; e.defence = d.defence; this._render(e); }
      return;
    }
    const e = this._slot();
    e.active = true; e.seq = ++this.seq; e.id = d.id ?? null; e.isWord = true; e.word = d.word; e.defence = d.defence;
    e.value = 0; e.crit = false; e.prefix = ''; e.tint = null;
    e.x = Math.round(d.x); e.baseY = Math.round(d.y); e.y0 = e.baseY; e.age = 0; e.sinceHit = 0;
    this._render(e);
    e.o.setVisible(true).setAlpha(1);
    this._place(e);
  }

  /** combat:dmg payload {x, y, amount, crit, element, target, id?, word?, defence?} */
  spawn(d) {
    if (!d || d.target === 'player') return;
    if (d.word) { this._word(d); return; }
    if (Save.settings.damageNumbers === false) return;
    const amount = Math.ceil(d.amount || 0);
    if (amount <= 0) return;
    // aggregation: same enemy id (or, without an id, the same spot) within 200 ms of its last hit
    for (const e of this.pool) {
      if (!e.active || e.isWord || e.sinceHit > AGG_MS) continue;
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
    e.id = d.id ?? null; e.isWord = false; e.word = null;
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
    if (e.isWord) {
      e.o.setText(t(`world.defence.${e.word}`));
      e.o.setScale(1);
      setColor(e.o, e.word === 'broken' ? C.text : C.dim);
      const a = e.defence ? Art.getQuiet(`ui.def_${e.defence}`) : null;
      if (a) {
        if (!e.icon) e.icon = this.scene.add.image(0, 0, a.key, a.frame).setDepth(95).setOrigin(1, 1);
        else e.icon.setTexture(a.key, a.frame);
        e.icon.setVisible(true);
      } else if (e.icon) e.icon.setVisible(false);
      return;
    }
    if (e.icon) e.icon.setVisible(false);
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
    // clamp to the spatial box (hud-layout §2.4) in screen space. Phone room zoom (aspect-ratio-spec §3.3): the
    // number is placed in SCREEN px through the sim camera's live view and counter-scaled by 1/z, so it is drawn
    // at its integer scale (1 or critScale) whatever the world zoom — never a fractional text scale (O-UX-3).
    const c = this.scene.ctx && this.scene.ctx.cam, cam = this.scene.cameras.main;
    const v = (c && c.view) || { x: cam.scrollX, y: cam.scrollY, z: 1 }, z = v.z || 1;
    const sx = (e.x - v.x) * z, sy = (y - v.y) * z;
    const k = e.isWord || !e.crit ? 1 : this.critScale;          // on-screen integer scale
    if (e.o.scaleX !== k / z) e.o.setScale(k / z);
    if (e.icon && e.icon.scaleX !== 1 / z) e.icon.setScale(1 / z);
    const hw = (e.o.width * k) / 2, hh = e.o.height * k;
    const cx = Math.round(Math.max(SPATIAL.x + hw, Math.min(SPATIAL.x + SPATIAL.w - hw, sx)));
    const cy = Math.round(Math.max(SPATIAL.y + hh, Math.min(SPATIAL.y + SPATIAL.h, sy)));
    e.o.setPosition(v.x + cx / z, v.y + cy / z);
    const fadeAt = this.riseMs - FADE_MS;
    e.o.setAlpha(e.age <= fadeAt ? 1 : Math.max(0, 1 - (e.age - fadeAt) / FADE_MS));
    if (e.isWord && e.icon && e.icon.visible) e.icon.setPosition(v.x + (cx - hw - 1) / z, v.y + (cy - 1) / z).setAlpha(e.o.alpha);
  }

  update(dt) {
    for (const p of this.pending) p.age += dt;
    while (this.pending.length && this.pending[0].age > 150) this.pending.shift();
    for (const e of this.pool) {
      if (!e.active) continue;
      e.age += dt; e.sinceHit += dt;
      if (e.age >= this.riseMs) { e.active = false; e.o.setVisible(false); if (e.icon) e.icon.setVisible(false); continue; }
      this._place(e);
    }
  }

  clear() { for (const e of this.pool) { e.active = false; e.o.setVisible(false); if (e.icon) e.icon.setVisible(false); } this.pending.length = 0; }
  destroy() { for (const e of this.pool) { e.o.destroy(); if (e.icon) e.icon.destroy(); } this.pool.length = 0; }
}
