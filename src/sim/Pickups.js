// sim/Pickups.js — feel-spec §pickup: coins pop at `coinPopSpeed` (fx stream direction) decaying at
// `coinPopDecay`; after `coinMagnetDelayMs` any coin within `magnetRadius` × pickupRadiusMult flies to the player
// at `magnetSpeed` and is collected within `pickupRadius` × pickupRadiusMult. On room clear all coins magnetize.
// Also heart and card drops, and the interactables registry (pedestals, shop, stairs) with ONE nearest prompt
// (hud-layout §6) within `interactRadius`.

import Phaser from '../../lib/phaser.esm.min.js';
import { DEPTH } from '../config.js';
import { EV } from '../core/ev.js';
import { Art } from '../core/art.js';

export class Pickups {
  constructor(ctx) {
    this.ctx = ctx;
    this.items = [];          // { kind:'coin'|'heart'|'card', x, y, vx, vy, age, magnet, sprite, value, id }
    this.interacts = [];      // { id, kind, x, y, verb, label, onUse, enabled, data }
    this.vacuum = false;
    this.nearest = null;
  }
  get T() { return this.ctx.T; }

  coin(x, y, n) {
    const rng = this.ctx.rng.fx, T = this.T;
    for (let i = 0; i < n; i++) {
      const a = rng.float(0, Math.PI * 2), v = T('coinPopSpeed') * rng.float(0.6, 1);
      const a0 = Art.getQuiet('pickups.coin', 0);
      const sp = a0 ? this.ctx.scene.add.sprite(x, y, a0.key, a0.frame) : this.ctx.scene.add.image(x, y, 'ph-coin');
      if (a0 && this.ctx.scene.anims.exists('pickup_coin')) sp.play({ key: 'pickup_coin', startFrame: i % 4 });
      sp.setDepth(DEPTH.pickups);
      this.items.push({ kind: 'coin', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, magnet: false, sprite: sp, value: 1 });
    }
  }
  heart(x, y, amount) {
    const a = Art.getQuiet('pickups.heart_drop', 0);
    const sp = a ? this.ctx.scene.add.image(x, y, a.key, a.frame) : this.ctx.scene.add.image(x, y, 'ph-heart');
    sp.setDepth(DEPTH.pickups);
    this.items.push({ kind: 'heart', x, y, vx: 0, vy: 0, age: 0, magnet: false, sprite: sp, value: amount });
  }
  /** A world card (overflow from a wand swap, or a treasure bonus). Collect = into the bag (if space). */
  card(x, y, cardId) {
    const c = this.ctx.scene.add.container(x, y).setDepth(DEPTH.pickups);
    const g = this.ctx.scene.add.graphics();
    g.fillStyle(0x222222).fillRect(-9, -9, 18, 18).fillStyle(0x2a2a3a).fillRect(-8, -8, 16, 16);
    c.add(g);
    const card = this.ctx.cat.cards[cardId];
    const icon = Art.getQuiet(`icon16.${card.type === 'projectile' ? 'spells' : 'modifiers'}.${cardId}`);
    if (icon) c.add(this.ctx.scene.add.image(0, 0, icon.key, icon.frame));
    else { const tint = { arcane: 0xcfc0ff, fire: 0xee8e2e, frost: 0xcae6f5, shock: 0xfacb3e, poison: 0x97da3f }[card.element] || 0xc58747; g.fillStyle(tint).fillRect(-4, -4, 8, 8); }
    const it = { kind: 'card', x, y, vx: 0, vy: 0, age: 0, magnet: false, sprite: c, value: 1, id: cardId };
    this.items.push(it);
    this.addInteract({ kind: 'card', x, y, verb: 'take', label: card.name, data: it, onUse: () => this._takeCard(it) });
  }
  _takeCard(it) {
    if (this.ctx.run.addCard(it.id) < 0) { this.ctx.bus.emit(EV.TOAST, { text: 'bagFull', kind: 'info' }); this.ctx.mixer.fire('ui_denied'); return false; }
    this.ctx.mixer.fire('pickup_card');
    this._remove(it);
    return true;
  }

  /** Magnetize every coin in the room (room clear). */
  vacuumAll() { this.vacuum = true; for (const it of this.items) if (it.kind === 'coin') it.magnet = true; }

  step(dt) {
    const T = this.T, p = this.ctx.player, pm = this.ctx.run.playerMods;
    const dts = dt / 1000;
    const magnetR = T('magnetRadius') * pm.pickupRadiusMult, pickR = T('pickupRadius') * pm.pickupRadiusMult;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      if (it.kind === 'card') continue;
      const dx = p.x - it.x, dy = p.y - it.y, d = Math.hypot(dx, dy);
      if (it.kind === 'coin' && it.age >= T('coinMagnetDelayMs') && (d <= magnetR || this.vacuum)) it.magnet = true;
      if (it.magnet && p.alive) {
        const v = T('magnetSpeed');
        it.vx = (dx / (d || 1)) * v; it.vy = (dy / (d || 1)) * v;
      } else {
        // pop decay
        const sp = Math.hypot(it.vx, it.vy);
        if (sp > 0) { const ns = Math.max(0, sp - T('coinPopDecay') * dts); it.vx *= ns / sp; it.vy *= ns / sp; }
      }
      const nx = it.x + it.vx * dts, ny = it.y + it.vy * dts;
      if (it.magnet || !this.ctx.world.blocksShots(nx, ny)) { it.x = nx; it.y = ny; } else { it.vx = 0; it.vy = 0; }
      if (p.alive && d <= pickR + 2) {
        if (it.kind === 'coin') { this.ctx.run.addCoins(it.value); this.ctx.mixer.fire('pickup_coin'); }
        else if (it.kind === 'heart') {
          this.ctx.run.heal(it.value); this.ctx.mixer.fire('pickup_heart');
          this.ctx.fx.particles('spark', it.x, it.y, 5, { color: 0xda4e38, speed: 40 });
        }
        this._remove(it);
        continue;
      }
    }
    // nearest interactable within interactRadius → one prompt (hud-layout §6)
    const ir = T('interactRadius');
    let best = null, bd = Infinity;
    for (const x of this.interacts) {
      if (!x.enabled) continue;
      const d = Math.hypot(x.x - p.x, x.y - p.y);
      if (d <= ir + (x.extraRadius || 0) && d < bd) { bd = d; best = x; }
    }
    if (best !== this.nearest) {
      this.nearest = best;
      this.ctx.bus.emit(EV.INTERACT_PROMPT, best ? { text: best.verb, label: best.label, kind: best.kind, x: best.x, y: best.y - (best.promptOffset ?? 12) } : null);
    }
  }

  /** E / X pressed. */
  interact() {
    if (!this.nearest || !this.ctx.player.alive) return false;
    const x = this.nearest;
    const ok = x.onUse(x);
    return ok !== false;
  }

  addInteract(o) { const x = { enabled: true, ...o }; this.interacts.push(x); return x; }
  removeInteract(x) { const i = this.interacts.indexOf(x); if (i >= 0) this.interacts.splice(i, 1); if (x.sprite && x.data == null) x.sprite.destroy(); if (x.glow) x.glow.destroy(); if (this.nearest === x) { this.nearest = null; this.ctx.bus.emit(EV.INTERACT_PROMPT, null); } }

  render(dtMs) {
    for (const it of this.items) {
      const bob = it.kind === 'coin' ? 0 : (this.ctx.flags.reducedMotion ? 0 : Math.round(Math.sin(it.age / 300)));
      it.sprite.setPosition(Math.round(it.x), Math.round(it.y) - bob);
    }
  }

  _remove(it) {
    const i = this.items.indexOf(it);
    if (i >= 0) this.items.splice(i, 1);
    it.sprite.destroy();
    const ix = this.interacts.find((x) => x.data === it);
    if (ix) this.removeInteract(ix);
  }

  clear() {
    for (const it of this.items) it.sprite.destroy();
    this.items.length = 0;
    for (const x of this.interacts) { if (x.sprite) x.sprite.destroy(); if (x.glow) x.glow.destroy(); }
    this.interacts.length = 0;
    this.nearest = null;
    this.vacuum = false;
    this.ctx.bus.emit(EV.INTERACT_PROMPT, null);
  }
}

export { Phaser };
