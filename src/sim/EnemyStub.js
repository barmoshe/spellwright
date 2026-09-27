// sim/EnemyStub.js — a MINIMAL EnemySystem implementing sim-contract §3, used ONLY when the enemy module
// (src/sim/enemies/EnemySystem.js, enemy developer) is absent. Chasers with contact damage, no attacks.
// It lets the core loop (rooms, casting, combat, rewards) run end to end during integration.

import { DEPTH } from '../config.js';
import { EV } from '../core/ev.js';

let UID = 1;

export class EnemySystem {
  constructor(ctx) { this.ctx = ctx; this.list = []; }
  get live() { return this.list; }
  aliveCount() { return this.list.length; }
  forEachAlive(fn) { for (let i = 0; i < this.list.length; i++) { const e = this.list[i]; if (e.alive) fn(e); } }
  queryCircle(x, y, r, fn) { for (const e of this.list.slice()) if (e.alive && e.hittable && Math.hypot(e.x - x, e.y - y) <= r + e.r) fn(e); }
  nearest(x, y, range, exclude) {
    let best = null, bd = range;
    for (const e of this.list) { if (!e.alive || !e.hittable || (exclude && exclude.has(e.uid))) continue; const d = Math.hypot(e.x - x, e.y - y); if (d <= bd) { bd = d; best = e; } }
    return best;
  }
  spawn(defId, x, y, opts = {}) {
    const ctx = this.ctx, def = ctx.cat.enemies[defId];
    const hp = def.hp * ctx.floor.hpMult * ((ctx.curse && ctx.curse.enemyHpMult) || 1) * (opts.elite ? ctx.rules.enemies.elite.hpMult : 1);
    const sprite = ctx.scene.add.image(x, y, 'ph-enemy').setDepth(DEPTH.actors);
    if (opts.elite) sprite.setTint(0xfacb3e);
    const e = { uid: UID++, id: defId, def, x, y, r: def.radius, flying: def.flying, alive: true, hittable: false, hp, maxHp: hp, elite: !!opts.elite,
      isBoss: !!opts.boss, kbResist: Math.min(1, (def.kbResist || 0) + (opts.elite ? ctx.rules.enemies.elite.kbResistAdd : 0)), immune: new Set(def.immune || []),
      status: ctx.combat.newStatus(), kbVx: 0, kbVy: 0, coins: def.coins, threat: def.threat, portalMs: opts.portal === false ? 0 : ctx.rules.enemies.spawnPortalMs,
      ai: { state: 'spawning' }, view: { sprite, flash: () => { sprite.setTintFill ? null : null; sprite.setTint(0xffffff).setTintMode(1); ctx.scene.time.delayedCall(60, () => sprite.active && (opts.elite ? sprite.setTint(0xfacb3e).setTintMode(0) : sprite.clearTint())); } },
      summoner: opts.summoner || null, noCoins: !!opts.noCoins };
    sprite.setAlpha(0.3);
    this.list.push(e);
    return e;
  }
  spawnBoss(bossId, x, y) {
    const b = this.ctx.cat.bosses[bossId];
    const e = this.spawn('skeleton', x, y, { boss: true, portal: false });
    e.id = bossId; e.def = b; e.hp = e.maxHp = b.hp * ((this.ctx.curse && this.ctx.curse.enemyHpMult) || 1); e.r = b.radius; e.isBoss = true; e.kbResist = 1; e.immune = new Set(b.immune);
    e.view.sprite.setScale(2).setTint(0x9f294e); e.hittable = true; e.portalMs = 0;
    this.ctx.bus.emit(EV.BOSS_START, { id: bossId, name: b.name, title: b.title, hp: e.hp, maxHp: e.maxHp, thresholds: b.phases.map((p) => p.untilHpFrac).filter((f) => f > 0) });
    return e;
  }
  step(dt) {
    const ctx = this.ctx, p = ctx.player, dts = dt / 1000;
    for (const e of this.list) {
      if (!e.alive) continue;
      if (e.portalMs > 0) { e.portalMs -= dt; if (e.portalMs <= 0) { e.hittable = true; e.view.sprite.setAlpha(1); } continue; }
      const frozen = ctx.combat.isFrozen(e) || ctx.combat.isStunned(e);
      const sp = frozen ? 0 : (e.def.speed || 30) * ctx.combat.slowFactor(e);
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      let vx = (dx / d) * sp + e.kbVx, vy = (dy / d) * sp + e.kbVy;
      const kd = ctx.T('knockbackDecay') * dts;
      const kl = Math.hypot(e.kbVx, e.kbVy); if (kl > 0) { const nk = Math.max(0, kl - kd); e.kbVx *= nk / kl; e.kbVy *= nk / kl; }
      const nx = e.x + vx * dts, ny = e.y + vy * dts;
      const blocked = e.flying ? ctx.world.blocksShots.bind(ctx.world) : ctx.world.blocksGround.bind(ctx.world);
      if (!blocked(nx, e.y)) e.x = nx;
      if (!blocked(e.x, ny)) e.y = ny;
      if (!frozen && d < e.r + p.r && p.canBeHit()) p.hurt(e.def.contactDamage || 1, { kind: 'contact', enemyId: e.id, x: e.x, y: e.y });
    }
  }
  render() { for (const e of this.list) e.view.sprite.setPosition(Math.round(e.x), Math.round(e.y)).setDepth(DEPTH.actors + e.y / 10000); }
  kill(e, cause) {
    if (!e.alive) return;
    e.alive = false; e.hittable = false;
    this.list.splice(this.list.indexOf(e), 1);
    e.view.sprite.destroy();
    this.ctx.fx.particles('dust', e.x, e.y, this.ctx.T('deathPuffParticles'), {});
    this.ctx.combat.onEnemyKilled(e, cause);
    if (e.isBoss) this.ctx.bus.emit(EV.BOSS_DEAD, { id: e.id });
    if (e.def.onDeath && e.def.onDeath.type === 'spawn' && cause !== 'cleanup') for (let i = 0; i < e.def.onDeath.count; i++) this.spawn(e.def.onDeath.enemyId, e.x + i * 6 - 3, e.y, { portal: false });
  }
  killAll(cause) { for (const e of this.list.slice()) this.kill(e, cause); }
  clear() { for (const e of this.list) e.view.sprite.destroy(); this.list.length = 0; }
  destroy() { this.clear(); }
}
