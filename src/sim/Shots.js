// sim/Shots.js — every projectile (architecture §4: a custom pooled sim, not Arcade bodies).
// Player shots implement mechanic-spec §5: behaviours bolt/boomerang/orbit/mine, pierce/bounce/homing,
// onHit/onExpire/onTick effects, trigger payloads (hit/expire/timer; §4 "payload accounting"), the
// player-projectile cap (oldest first, fires nothing) and the orbit cap. Enemy bullets (sim-contract §2):
// straight discs, walls stop them, pits don't, circle-vs-hurtbox, frost → playerSlow, depth 62.
//
// No per-step allocation in the step loop: pooled shot objects, reused hit lists, a bound hash visitor.

import Phaser from '../../lib/phaser.esm.min.js';
import { TILE, DEPTH, SIM_HZ } from '../config.js';
import { Art } from '../core/art.js';
import { EV } from '../core/ev.js';
import { SpatialHash } from './SpatialHash.js';
import { applyEffect } from './Effects.js';
import { defineEffect } from '../effects/registry.js';

// mechanic-spec §5.4 behaviours — one implementation each (the ShotSystem step methods below).
for (const [key, method] of [['bolt', '_stepBolt'], ['boomerang', '_stepBoomerang'], ['orbit', '_stepOrbit'], ['mine', '_stepMine']]) defineEffect('behavior', key, { method });
import { warnOnce, track } from '../core/log.js';

const DEG = Math.PI / 180;
const MAX_SHOTS = 512;
const ELEMENT_TINT = { arcane: 0xcfc0ff, fire: 0xee8e2e, frost: 0xcae6f5, shock: 0xfacb3e, poison: 0x97da3f };

function blank() {
  return {
    alive: false, team: 0, x: 0, y: 0, vx: 0, vy: 0, heading: 0, speed: 0, r: 2, spawnMs: 0, lifeMs: 0, age: 0,
    damage: 0, pierce: 0, bounce: 0, homing: 0, knockback: 0, statusChance: 0, element: 'arcane', isCrit: false, critTotal: 0,
    behavior: 'bolt', bp: null, onHit: null, onExpire: null, onTick: null, tickT: 0,
    payload: null, trigger: null, triggerTimerMs: 0, released: false, collided: false,
    hits: [], rehit: null, phase: 0, phi: 0, orbitR: 0, angSpeed: 0, armed: false, settled: false,
    cardId: '', seq: 0, noSplit: false, wallNormal: null, sprite: null, glow: null, ownerUid: 0, frost: false, killedByCap: false,
  };
}

export class ShotSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.all = [];
    this.free = [];
    for (let i = 0; i < MAX_SHOTS; i++) this.free.push(this._make());
    this.live = [];
    this.seq = 0;
    this.hash = new SpatialHash(32, 96);
    this._q = null; this._visit = this._visitEnemy.bind(this);
    this.playerCount = 0; this.enemyBulletCount = 0;
  }

  _make() {
    const s = blank();
    s.sprite = this.scene.add.sprite(-100, -100, 'ph-bolt').setVisible(false);
    s.glow = this.scene.add.image(-100, -100, 'ph-glow').setVisible(false).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.projectilesAdd);
    this.all.push(s);
    return s;
  }

  get T() { return this.ctx.T; }
  get casting() { return this.ctx.rules.casting; }

  resize(world) { this.hash.resize(0, 0, world.w, world.h); }

  // ================================================================== spawning
  _acquire() {
    let s = this.free.pop();
    if (!s) { warnOnce('shot-pool', `shot pool exhausted (${MAX_SHOTS})`); track('projectile_refused'); return null; }
    s.alive = true; s.seq = ++this.seq; s.age = 0; s.hits.length = 0; s.rehit = null; s.released = false; s.collided = false;
    s.killedByCap = false; s.wallNormal = null; s.noSplit = false; s.payload = null; s.trigger = null; s.onTick = null; s.tickT = 0;
    this.live.push(s);
    return s;
  }

  /** Enforce rules.casting.maxPlayerProjectiles (oldest first; despawn by cap fires nothing). */
  _capPlayer() {
    if (this.playerCount < this.casting.maxPlayerProjectiles) return;
    for (const s of this.live) if (s.alive && s.team === 0) { s.killedByCap = true; this._despawn(s); return; }
  }
  _capOrbit() {
    let n = 0, oldest = null;
    for (const s of this.live) if (s.alive && s.team === 0 && s.behavior === 'orbit') { n++; if (!oldest) oldest = s; }
    if (n >= this.casting.maxOrbitShots && oldest) { oldest.killedByCap = true; this._despawn(oldest); }
  }

  /**
   * Spawn one player shot from a ShotSpec (spells/evaluate.js). `baseHeadingDeg` = aim angle (cast) or the
   * release heading (payload). The spec's angleOffset + spreadRoll are added here.
   */
  spawnSpec(spec, x, y, baseHeadingDeg, opt = {}) {
    this._capPlayer();
    if (spec.behavior.type === 'orbit') this._capOrbit();
    const s = this._acquire(); if (!s) return null;
    const st = spec.stats;
    s.team = 0; s.cardId = spec.cardId; s.x = x; s.y = y;
    s.heading = baseHeadingDeg + (spec.angleOffset || 0) + (spec.spreadRoll || 0);
    s.speed = st.speed; s.r = st.radius; s.damage = st.damage; s.pierce = st.pierce; s.bounce = st.bounce; s.homing = st.homing;
    s.knockback = st.knockback; s.statusChance = st.statusChance; s.element = spec.element; s.isCrit = !!spec.isCrit; s.critTotal = spec.critTotal;
    s.lifeMs = st.lifetimeMs; s.behavior = spec.behavior.type; s.bp = spec.behavior;
    s.onHit = spec.onHit; s.onExpire = spec.onExpire; s.onTick = spec.onTick; s.tickT = spec.onTick ? spec.onTick.everyMs : 0;
    s.payload = spec.payload; s.trigger = spec.trigger; s.triggerTimerMs = spec.triggerTimerMs || 0;
    s.noSplit = !!opt.noSplit;
    if (opt.hits) for (const h of opt.hits) s.hits.push(h);
    s.phase = 0; s.armed = false; s.settled = false;
    if (s.behavior === 'orbit') {
      const p = this.ctx.player;
      s.phi = s.heading; s.orbitR = s.bp.orbitRadius; s.angSpeed = s.bp.angularSpeed; s.rehit = new Map();
      s.x = p.coreX + Math.cos(s.phi * DEG) * s.orbitR; s.y = p.coreY + Math.sin(s.phi * DEG) * s.orbitR;
    }
    this._setVel(s);
    this._skinPlayer(s, spec);
    this.playerCount++;
    return s;
  }

  _setVel(s) { const a = s.heading * DEG; s.vx = Math.cos(a) * s.speed; s.vy = Math.sin(a) * s.speed; }

  _skinPlayer(s, spec) {
    const im = s.sprite, gl = s.glow;
    const radiusMult = spec.stats.radius / Math.max(1, (this.ctx.cat.cards[spec.cardId]?.stats.radius) || spec.stats.radius);
    const vscale = radiusMult < 1.5 ? 1 : radiusMult < 2.5 ? 2 : 3;          // art-slot-map projectile_scale
    const a = Art.getQuiet(`spells.${spec.cardId}.projectile`, 0);
    if (a) {
      im.setTexture(a.key, a.frame); im.clearTint();
      const anim = `spell_${spec.cardId}`;
      if (this.scene.anims.exists(anim)) im.play(anim, true); else if (im.anims) im.anims.stop();
    } else { if (im.anims) im.anims.stop(); im.setTexture(`ph-shot-${spec.element}`); im.clearTint(); }
    im.setVisible(true).setActive(true).setDepth(DEPTH.projectiles).setScale(vscale).setAlpha(1).setBlendMode(Phaser.BlendModes.NORMAL);
    im.setRotation(s.behavior === 'orbit' || s.behavior === 'mine' ? 0 : s.heading * DEG);
    im.setPosition(Math.round(s.x), Math.round(s.y));
    const g16 = Art.getQuiet('authored.glow_16');
    if (g16) gl.setTexture(g16.key, g16.frame); else gl.setTexture('ph-glow');
    gl.setVisible(true).setTint(ELEMENT_TINT[spec.element] || 0xffffff).setScale(Math.max(1, s.r / 4) * vscale * 0.75).setAlpha(0.55);
    gl.setPosition(Math.round(s.x), Math.round(s.y));
  }

  /** Enemy bullet (sim-contract §2). Caller applies floor enemyProjSpeedMult. */
  enemyBullet(o) {
    const s = this._acquire(); if (!s) return null;
    s.team = 1; s.x = o.x; s.y = o.y; s.heading = o.angleDeg; s.speed = o.speed; s.r = o.radius || 3; s.damage = o.damage ?? 1;
    s.lifeMs = o.lifetimeMs || 3000; s.element = o.element || 'arcane'; s.behavior = 'bullet'; s.ownerUid = o.ownerUid || 0;
    s.frost = s.element === 'frost'; s.pierce = 0; s.bounce = 0; s.homing = 0; s.onHit = null; s.onExpire = null;
    this._setVel(s);
    const d = 2 * s.r + 1;
    const size = d <= 7 ? 7 : d <= 9 ? 9 : 13;
    const el = ['arcane', 'frost', 'poison', 'fire'].includes(s.element) ? s.element : 'arcane';
    const a = Art.getQuiet(`enemy_bullets.${el}.${size}`, 0);
    const im = s.sprite;
    if (a) { im.setTexture(a.key, a.frame); const an = `ebullet_${el}_${size}`; if (this.scene.anims.exists(an)) im.play(an, true); }
    else { if (im.anims) im.anims.stop(); im.setTexture(`ph-eb-${el}-${size}`); }
    im.clearTint().setVisible(true).setActive(true).setScale(1).setRotation(0).setAlpha(1).setDepth(DEPTH.enemyProjectiles).setBlendMode(Phaser.BlendModes.NORMAL);
    im.setPosition(Math.round(s.x), Math.round(s.y));
    s.glow.setVisible(false);
    if (this.ctx.emphasis) im.setTint(0xffffff);
    this.enemyBulletCount++;
    return s;
  }

  clearEnemyBullets(o = {}) {
    for (const s of this.live) if (s.alive && s.team === 1) {
      if (o.pop) this.ctx.fx.particles('spark', s.x, s.y, 1, { color: 0xfdd0d6, speed: 20, lifeMs: 120 });
      this._despawn(s);
    }
  }
  /** A shot's full lifetime (split children use lifetime × childLifetimeMult). */
  lifeOf(s) { return s.lifeMs; }

  clearAll() { for (const s of this.live) if (s.alive) { s.killedByCap = true; this._despawn(s); } this._compact(); }

  // ================================================================== step
  step(dt) {
    // rebuild the enemy hash (targets = EnemySystem.live, indexed)
    this.hash.clear();
    this.targets = this.ctx.enemies.live;
    for (let i = 0; i < this.targets.length; i++) {
      const e = this.targets[i];
      if (e.alive && e.hittable) this.hash.insert(i, e.x, e.y, e.r);
    }
    const n = this.live.length;
    for (let i = 0; i < n; i++) {
      const s = this.live[i];
      if (!s.alive) continue;
      if (s.team === 0) this._stepPlayer(s, dt); else this._stepEnemy(s, dt);
    }
    this._compact();
  }

  _compact() {
    let w = 0;
    for (let i = 0; i < this.live.length; i++) { const s = this.live[i]; if (s.alive) this.live[w++] = s; else this.free.push(s); }
    this.live.length = w;
  }

  // ------------------------------------------------------------------ player shots
  _stepPlayer(s, dt) {
    const dts = dt / 1000;
    s.age += dt;
    // onTick effects
    if (s.onTick) {
      s.tickT -= dt;
      while (s.tickT <= 0 && s.alive) { s.tickT += s.onTick.everyMs; for (const e of s.onTick.effects) applyEffect(this.ctx, e, s, s.x, s.y, null); }
      if (!s.alive) return;
    }
    // timer trigger
    if (s.trigger === 'timer' && !s.released && s.age >= s.triggerTimerMs) this._release(s, s.heading);

    switch (s.behavior) {
      case 'orbit': this._stepOrbit(s, dt); break;
      case 'boomerang': this._stepBoomerang(s, dts); break;
      case 'mine': this._stepMine(s, dt, dts); break;
      default: this._stepBolt(s, dts); break;
    }
    if (!s.alive) return;
    if (s.age >= s.lifeMs) { this._end(s, 'expire'); return; }
    this._sync(s);
  }

  _stepBolt(s, dts) {
    // homing: turn toward the nearest enemy within homingAcquireRangePx by ≤ homing·dt deg per step
    if (s.homing > 0) {
      const tgt = this.ctx.enemies.nearest(s.x, s.y, this.casting.homingAcquireRangePx, null);
      if (tgt) {
        const want = Math.atan2(tgt.y - s.y, tgt.x - s.x) / DEG;
        let d = ((want - s.heading + 540) % 360) - 180;
        const max = s.homing * dts;
        s.heading += Math.max(-max, Math.min(max, d));
        this._setVel(s);
      }
    }
    this._move(s, dts, true);
  }

  /** Sub-stepped move with wall/crate handling and enemy hits. */
  _move(s, dts, walls) {
    const dx = s.vx * dts, dy = s.vy * dts;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (TILE * 0.5)));
    const sx = dx / n, sy = dy / n;
    const w = this.ctx.world;
    for (let k = 0; k < n && s.alive; k++) {
      let nx = s.x + sx, ny = s.y + sy;
      if (walls) {
        const hitX = w.blocksShots(nx, s.y), hitY = w.blocksShots(s.x, ny);
        const hitXY = !hitX && !hitY && w.blocksShots(nx, ny);
        if (hitX || hitY || hitXY) {
          // crates take the shot's damage
          const ci = w.isCrateAt(hitX || hitXY ? nx : s.x, hitY || hitXY ? ny : s.y);
          if (ci >= 0) this.ctx.combat.hitCrate(ci, s.damage);
          const nxv = hitX || hitXY ? -Math.sign(sx) : 0, nyv = hitY || (hitXY && !hitX) ? -Math.sign(sy) : 0;
          if (s.trigger === 'hit' && !s.released) {
            // released by a wall: heading reflected off the wall normal
            const rvx = (hitX || hitXY) ? -s.vx : s.vx, rvy = (hitY || (hitXY && !hitX)) ? -s.vy : s.vy;
            this._release(s, Math.atan2(rvy, rvx) / DEG);
          }
          if (s.bounce > 0) {
            s.bounce--;
            if (hitX || hitXY) { s.vx = -s.vx; nx = s.x; }
            if (hitY || (hitXY && !hitX)) { s.vy = -s.vy; ny = s.y; }
            s.heading = Math.atan2(s.vy, s.vx) / DEG;
            this.ctx.fx.particles('spark', s.x, s.y, 2, { color: ELEMENT_TINT[s.element], speed: 40, lifeMs: 150 });
          } else {
            s.wallNormal = { x: nxv, y: nyv };
            if (s.behavior === 'boomerang' && s.phase === 0) { s.phase = 1; s.hits.length = 0; return; }   // a wall hit turns it early
            this._end(s, 'wall'); return;
          }
        }
      }
      s.x = nx; s.y = ny;
      if (s.behavior !== 'mine') this._hitEnemies(s);
    }
  }

  _hitEnemies(s) {
    this._q = s;
    this.hash.query(s.x, s.y, s.r + 12, this._visit);
    this._q = null;
  }

  _visitEnemy(i) {
    const s = this._q, e = this.targets[i];
    if (!s.alive) return true;
    if (!e || !e.alive || !e.hittable) return false;
    const dx = e.x - s.x, dy = e.y - s.y, rr = e.r + s.r;
    if (dx * dx + dy * dy >= rr * rr) return false;
    if (s.rehit) {                                   // orbit: re-hit after rehitCooldownMs
      const last = s.rehit.get(e.uid);
      if (last != null && this.ctx.time.ms - last < this.casting.rehitCooldownMs) return false;
      s.rehit.set(e.uid, this.ctx.time.ms);
    } else {
      if (s.hits.includes(e.uid)) return false;       // never re-hit the same enemy
      s.hits.push(e.uid);
    }
    this._applyHit(s, e);
    if (!s.alive) return true;
    if (s.behavior === 'orbit') return false;          // infinite pierce
    if (s.pierce > 0) { s.pierce--; return false; }
    this._end(s, 'enemy');
    return true;
  }

  _applyHit(s, e) {
    const d = Math.hypot(s.vx, s.vy) || 1;
    const dir = s.behavior === 'orbit' ? { dx: (e.x - this.ctx.player.coreX), dy: (e.y - this.ctx.player.coreY) } : { dx: s.vx / d, dy: s.vy / d };
    const dl = Math.hypot(dir.dx, dir.dy) || 1;
    this.ctx.combat.hitEnemy(e, s.damage, { element: s.element, statusChance: s.statusChance, isCrit: s.isCrit, source: 'direct',
      knock: s.knockback ? { dx: dir.dx / dl, dy: dir.dy / dl, speed: s.knockback } : null, x: e.x, y: e.y });
    this.ctx.fx.particles('spark', s.x, s.y, this.T('hitParticles'), { color: ELEMENT_TINT[s.element], speed: 60, lifeMs: this.T('hitParticleLifeMs'), dir: Math.atan2(-dir.dy, -dir.dx), spread: 1.2 });
    this.ctx.mixer.fire(`hit_${s.element}`);
    if (s.isCrit) this.ctx.mixer.fire('crit');
    for (const ef of s.onHit || []) applyEffect(this.ctx, ef, s, s.x, s.y, e);
    if (s.trigger === 'hit' && !s.released) this._release(s, s.heading);
  }

  _stepBoomerang(s, dts) {
    if (s.phase === 0) {
      if (s.age >= s.bp.outMs) { s.phase = 1; s.hits.length = 0; }       // hit list cleared at the turn
      else { this._move(s, dts, true); return; }
    }
    // return: fly toward the player's CURRENT position at speed × returnSpeedMult, ignoring walls
    const p = this.ctx.player;
    const dx = p.coreX - s.x, dy = p.coreY - s.y, d = Math.hypot(dx, dy);
    if (d <= this.casting.boomerangCatchRadiusPx) { this._end(s, 'catch'); return; }
    const v = s.speed * s.bp.returnSpeedMult;
    s.vx = (dx / d) * v; s.vy = (dy / d) * v; s.heading = Math.atan2(dy, dx) / DEG;
    this._move(s, dts, false);
  }

  _stepOrbit(s, dt) {
    const p = this.ctx.player;
    s.phi += s.angSpeed * dt / 1000;
    const a = s.phi * DEG;
    s.x = p.coreX + Math.cos(a) * s.orbitR; s.y = p.coreY + Math.sin(a) * s.orbitR;
    s.vx = -Math.sin(a); s.vy = Math.cos(a);
    this._hitEnemies(s);
  }

  _stepMine(s, dt, dts) {
    // decelerate linearly to 0 over settleMs; walls stop it; armed after armMs; triggers on an enemy centre within triggerRadius
    if (!s.settled) {
      const k = Math.max(0, 1 - s.age / s.bp.settleMs);
      const v = s.speed * k;
      const a = s.heading * DEG;
      s.vx = Math.cos(a) * v; s.vy = Math.sin(a) * v;
      const w = this.ctx.world;
      const nx = s.x + s.vx * dts, ny = s.y + s.vy * dts;
      if (w.blocksShots(nx, ny)) s.settled = true; else { s.x = nx; s.y = ny; }
      if (k <= 0) s.settled = true;
    }
    if (!s.armed && s.age >= s.bp.armMs) { s.armed = true; s.sprite.setAlpha(1); }
    if (s.armed) {
      const e = this.ctx.enemies.nearest(s.x, s.y, s.bp.triggerRadius, null);
      if (e && Math.hypot(e.x - s.x, e.y - s.y) <= s.bp.triggerRadius) this._end(s, 'trigger');
    } else s.sprite.setAlpha(0.6);
  }

  // ------------------------------------------------------------------ payloads & ending
  _release(s, headingDeg) {
    if (s.released || !s.payload) { s.released = true; return; }
    s.released = true;
    const back = this.casting.payloadSpawnBackoffPx;
    const a = s.heading * DEG;
    const px = s.x - Math.cos(a) * back, py = s.y - Math.sin(a) * back;
    for (const spec of s.payload) this.spawnSpec(spec, px, py, headingDeg, {});
    this.ctx.run.stats.payloadsReleased++;
    this.ctx.mixer.fire('payload_release');
    this.ctx.bus.emit(EV.FTUE, 'payload-released');
  }

  /** End = fire onExpire once at the end position, release a pending payload, despawn. */
  _end(s, reason) {
    if (!s.alive) return;
    for (const ef of s.onExpire || []) {
      if (ef.type === 'split' && s.noSplit) continue;
      applyEffect(this.ctx, ef, s, s.x, s.y, null);
    }
    if (s.payload && !s.released) {
      const h = s.wallNormal ? Math.atan2(s.wallNormal.y !== 0 ? -s.vy : s.vy, s.wallNormal.x !== 0 ? -s.vx : s.vx) / DEG : s.heading;
      this._release(s, h);
    }
    if (reason === 'wall' || reason === 'enemy') this.ctx.fx.flipbook(`spells.${s.cardId}.impact`, s.x, s.y, { silentFallback: true });
    this._despawn(s);
  }

  _despawn(s) {
    if (!s.alive) return;
    s.alive = false;
    if (s.sprite.anims) s.sprite.anims.stop();
    s.sprite.setVisible(false).setActive(false);
    s.glow.setVisible(false);
    if (s.team === 0) this.playerCount--; else this.enemyBulletCount--;
  }

  _sync(s) {
    s.sprite.setPosition(Math.round(s.x), Math.round(s.y));
    if (s.behavior === 'bolt' || s.behavior === 'boomerang') s.sprite.setRotation(s.behavior === 'boomerang' ? s.age * 0.02 : Math.atan2(s.vy, s.vx));
    s.glow.setPosition(Math.round(s.x), Math.round(s.y));
  }

  // ------------------------------------------------------------------ enemy bullets
  _stepEnemy(s, dt) {
    const dts = dt / 1000;
    s.age += dt;
    const w = this.ctx.world;
    const nx = s.x + s.vx * dts, ny = s.y + s.vy * dts;
    if (w.blocksShots(nx, ny)) { this.ctx.fx.flipbook('fx.ebullet_pop', s.x, s.y, { silentFallback: true, fps: 24 }); this._despawn(s); return; }
    s.x = nx; s.y = ny;
    const p = this.ctx.player;
    if (p.alive && p.canBeHit()) {
      const dx = p.coreX - s.x, dy = p.coreY - s.y, rr = p.hurtR + s.r;
      if (dx * dx + dy * dy < rr * rr) {
        if (p.hurt(s.damage, { kind: 'shot', enemyId: s.ownerUid, x: s.x, y: s.y }) && s.frost) p.applySlow(this.ctx.run.statusTable.status.playerSlow.durationMs);
        this._despawn(s); return;
      }
    }
    if (s.age >= s.lifeMs) { this._despawn(s); return; }
    s.sprite.setPosition(Math.round(s.x), Math.round(s.y));
  }

  destroy() { for (const s of this.all) { s.sprite.destroy(); s.glow.destroy(); } this.all.length = 0; this.live.length = 0; this.free.length = 0; }
}

export { SIM_HZ };
