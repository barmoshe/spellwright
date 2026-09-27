// sim/enemies/attacks.js — mechanic-spec §9.3 attack types, each implemented ONCE (shared by enemies and
// bosses) and registered in the effect registry (architecture §6).
//
// The generic state machine (move → windup → act → recover, selection, aim tracking/lock, interrupts,
// windup floors, cues/events) lives in EnemySystem. Each type supplies hooks:
//   begin(sys, e, atk)        windup step 0: positional locks (slam target, hazard marks, summon sigils), decals
//   update(sys, e, atk, p)    every windup step: decal geometry + progress (R3: p = windupElapsed / windupTotal)
//   release(sys, e, atk)      step W: the act. Returns the sustained act duration in ms (0 = instant)
//   act(sys, e, atk, dt)      every step of a sustained act; returns 'done' | 'stun' | undefined
//   cancel(sys, e, atk)       interrupt (stun/freeze/death/phase): fizzle every decal (telegraphs §1.5)
//   end(sys, e, atk)          leaving act: free what is left
// WYSIWYH (telegraphs §1.1): every hit test is "player core point inside the drawn shape". Charge lanes are
// drawn 2·(enemy.r + playerHurtboxRadius) wide because the charge tests body-circle vs hurtbox-circle.

import { defineEffect } from '../../effects/registry.js';
import { COL, EL_HUE, HAZARD_LOOK, DEG, TAU, angDiff } from './tokens.js';

const isHeavy = (atk) => (atk.damage || 0) >= 2;

// ------------------------------------------------------------------ melee_swipe
defineEffect('attack', 'melee_swipe', {
  begin(sys, e, atk) {
    const d = sys.decal(e, 'wedge', true);
    if (d) { d.r = atk.range; d.arc = atk.arcDeg * DEG; d.heavy = isHeavy(atk); }
  },
  update(sys, e, atk, p) {
    const d = e.ai.dec[0]; if (!d) return;
    d.x = e.x; d.y = e.y; d.aim = e.ai.aim; d.p = p; d.locked = e.ai.locked;
  },
  release(sys, e, atk) {
    const ai = e.ai, pl = sys.ctx.player;
    const dx = pl.coreX - e.x, dy = pl.coreY - e.y;
    if (dx * dx + dy * dy <= atk.range * atk.range && Math.abs(angDiff(Math.atan2(dy, dx), ai.aim)) <= (atk.arcDeg * DEG) / 2) {
      sys.hurtPlayer(e, atk.damage, 'melee');
    }
    sys.flashDecals(e);
    const R = atk.range;
    sys.ctx.fx.flipbook('fx.enemy_slash', e.x + Math.cos(ai.aim) * R * 0.5, e.y + Math.sin(ai.aim) * R * 0.5,
      { rotation: ai.aim, scale: R <= 32 ? 1 : 2, fps: 24, silentFallback: true });   // fx_enemy_slash: 7 f @ 24 fps
    return 0;
  },
});

// ------------------------------------------------------------------ shoot
function spreadAngles(d, aim, atk) {
  const n = atk.count || 1, sp = (atk.spreadDeg || 0) * DEG;
  d.count = n; d.a0 = n > 1 ? aim - sp / 2 : aim; d.astep = n > 1 ? sp / (n - 1) : 0;
}
defineEffect('attack', 'shoot', {
  begin(sys, e, atk) {
    if (e.isBoss) {       // boss_telegraph.shoot: one 48 px aim line per bullet from step 0, tracking until lock
      const d = sys.decal(e, 'aimLines', true);
      if (d) { d.len = 48; d.color = COL.rim; }
    }
  },
  update(sys, e, atk) {
    const ai = e.ai;
    const lines = e.isBoss ? ai.dec[0] : null;
    if (lines) { lines.x = e.x; lines.y = e.y; lines.r0 = e.r + 2; spreadAngles(lines, ai.aim, atk); lines.locked = ai.locked; }
    if (ai.locked && !ai.ticks) {    // lock: aim ticks = the exact volley shape at the commit moment
      const t = sys.decal(e, 'aimTicks', true);
      if (t) { t.len = 4; t.color = COL.rim; ai.ticks = t; }
    }
    if (ai.ticks) { const t = ai.ticks; t.x = e.x; t.y = e.y; t.r0 = e.r + 4; spreadAngles(t, ai.aim, atk); t.locked = true; }
  },
  release(sys, e, atk) {
    const n = atk.count || 1, sp = (atk.spreadDeg || 0);
    const aimDeg = e.ai.aim / DEG;
    for (let i = 0; i < n; i++) {
      const a = n > 1 ? aimDeg - sp / 2 + (sp * i) / (n - 1) : aimDeg;
      sys.bullet(e, e.x, e.y, a, atk.speed, atk.projectile, atk.damage);
    }
    sys.removeDecals(e);
    return 0;
  },
});

// ------------------------------------------------------------------ ring
function ringSpokes(d, e, atk, volley) {
  d.x = e.x; d.y = e.y; d.count = atk.count; d.r0 = e.r + 3; d.r1 = d.r0 + 5;
  d.a0 = ((atk.offsetDeg || 0) + volley * (atk.volleyOffsetDeg || 0)) * DEG; d.astep = TAU / atk.count;
}
function fireRing(sys, e, atk, volley) {
  const base = (atk.offsetDeg || 0) + volley * (atk.volleyOffsetDeg || 0);
  const r0 = e.r + 3;
  for (let i = 0; i < atk.count; i++) {
    const a = base + (360 * i) / atk.count;
    sys.bullet(e, e.x + Math.cos(a * DEG) * r0, e.y + Math.sin(a * DEG) * r0, a, atk.speed, atk.projectile, atk.damage);
  }
  sys.tl.ring(e.x, e.y, e.r, e.r + 8, 34, COL.rim, 0.9, 1);     // 1–2 step expanding outline from the body
  sys.fire('release_ring');
}
const PULSES = [0, 0.33, 0.6, 0.8];
defineEffect('attack', 'ring', {
  begin(sys, e) {
    const d = sys.decal(e, 'pulseRing', false);       // boss_telegraph.ring + eye: 1 px rim circle r = 24, pulsing
    if (d) d.r = 24;
  },
  update(sys, e, atk, p) {
    const ai = e.ai, d = ai.dec[0];
    if (d) {
      d.x = e.x; d.y = e.y;
      const stepMs = 2 * sys.ctx.time.dt;
      let pulsing = false;
      for (let i = 0; i < PULSES.length; i++) { const t0 = PULSES[i] * ai.wTotal; if (ai.wElapsed >= t0 && ai.wElapsed < t0 + stepMs) pulsing = true; }
      d.alpha = pulsing ? 1 : 0.5;
    }
    if (ai.locked && !ai.ticks) { const s = sys.decal(e, 'spokes', true); if (s) { s.color = COL.rim; ai.ticks = s; } }
    if (ai.ticks) ringSpokes(ai.ticks, e, atk, 0);
  },
  release(sys, e, atk) {
    const ai = e.ai;
    sys.removeDecals(e);
    fireRing(sys, e, atk, 0);
    ai.n = 1;
    return (atk.volleys || 1) > 1 ? (atk.volleys - 1) * atk.volleyIntervalMs : 0;
  },
  act(sys, e, atk) {
    const ai = e.ai, vols = atk.volleys || 1;
    if (ai.n >= vols) return 'done';
    const tFire = ai.n * atk.volleyIntervalMs;
    const lockMs = sys.rules.enemies.aimLockBeforeReleaseMs;
    if (ai.actT >= tFire - lockMs && !ai.ticks) {      // gap preview for volley k, 150 ms before it fires
      const s = sys.decal(e, 'spokes', true); if (s) { s.color = COL.rim; s.locked = true; ai.ticks = s; }
    }
    if (ai.ticks) ringSpokes(ai.ticks, e, atk, ai.n);
    if (ai.actT >= tFire) {
      sys.removeDecals(e);
      fireRing(sys, e, atk, ai.n);
      ai.n++;
      if (ai.n >= vols) return 'done';
    }
    return undefined;
  },
});

// ------------------------------------------------------------------ spiral
defineEffect('attack', 'spiral', {
  begin() { /* motes + glyph are body-layer (EnemyView), driven by ai.base / p */ },
  update(sys, e) { if (!e.ai.locked) e.ai.base = e.ai.aim / DEG; },
  release(sys, e, atk) {
    const ai = e.ai;
    ai.n = 0;
    sys.fire('release_ring');
    fireSpiral(sys, e, atk);
    return atk.shotsPerArm * atk.intervalMs;
  },
  act(sys, e, atk) {
    const ai = e.ai;
    while (ai.n < atk.shotsPerArm && ai.actT >= ai.n * atk.intervalMs) fireSpiral(sys, e, atk);
    return ai.actT >= atk.shotsPerArm * atk.intervalMs ? 'done' : undefined;
  },
});
function fireSpiral(sys, e, atk) {
  const ai = e.ai, base = ai.base + ai.n * atk.rotateDegPerShot;
  const r0 = e.r + 8;
  for (let i = 0; i < atk.arms; i++) {
    const a = base + (360 * i) / atk.arms;
    sys.bullet(e, e.x + Math.cos(a * DEG) * r0, e.y + Math.sin(a * DEG) * r0, a, atk.speed, atk.projectile, atk.damage);
  }
  ai.n++;
}

// ------------------------------------------------------------------ charge
function laneGeometry(sys, e, atk, d) {
  const w = sys.ctx.world, full = (atk.speed * atk.durationMs) / 1000;
  const ex = e.x + Math.cos(e.ai.aim) * full, ey = e.y + Math.sin(e.ai.aim) * full;
  const ray = w.raycast(e.x, e.y, ex, ey, 'ground');       // the same raycast the charge's wall stop uses
  d.x = e.x; d.y = e.y; d.aim = e.ai.aim; d.len = Math.min(full, ray); d.wallEnd = ray < full - 0.5;
  d.width = 2 * (e.r + sys.ctx.player.hurtR);
}
defineEffect('attack', 'charge', {
  begin(sys, e, atk) {
    const d = sys.decal(e, 'lane', true);
    if (d) { d.heavy = isHeavy(atk); laneGeometry(sys, e, atk, d); }
  },
  update(sys, e, atk, p) {
    const ai = e.ai, d = ai.dec[0]; if (!d) return;
    if (!ai.locked) { laneGeometry(sys, e, atk, d); d.chev = (d.age * 60) / 1000; }   // chevrons scroll 60 px/s in signal
    d.p = p; d.locked = ai.locked;
  },
  release(sys, e, atk) {
    const ai = e.ai, d = ai.dec[0];
    ai.hit = false; ai.sx0 = e.x; ai.sy0 = e.y;
    e.immovable = true;                              // mechanic §8.1: immovable mid-charge
    e.kbVx = 0; e.kbVy = 0;
    if (d) { d.locked = true; d.p = 1; }
    return atk.durationMs;
  },
  act(sys, e, atk) {
    const ai = e.ai, pl = sys.ctx.player, d = ai.dec[0];
    const ca = Math.cos(ai.aim), sa = Math.sin(ai.aim);
    const slow = sys.slow(e);
    ai.mvx = ca * atk.speed * slow; ai.mvy = sa * atk.speed * slow;
    const trav = Math.hypot(e.x - ai.sx0, e.y - ai.sy0);
    if (d) d.s0 = Math.min(d.len, trav);             // the path empties from the enemy's end
    if (!ai.hit) {
      const dx = pl.coreX - e.x, dy = pl.coreY - e.y, rr = e.r + pl.hurtR;
      if (dx * dx + dy * dy <= rr * rr && sys.hurtPlayer(e, atk.damage, 'charge')) ai.hit = true;   // once per charge
    }
    // a wall, pillar, crate or pit edge stops it and stuns self
    const b = e.body;
    const blocked = (b && !b.blocked.none) || sys.ctx.world.blocksGround(e.x + ca * (e.r + 2), e.y + sa * (e.r + 2));
    if (blocked && ai.actT > 30) {
      ai.wallStunMs = atk.wallStunMs;
      const T = sys.T;
      sys.ctx.fx.shake(T('heavyImpactShakePx'), T('heavyImpactShakeMs'));
      sys.ctx.fx.particles('dust', e.x + ca * e.r, e.y + sa * e.r, 8, { speed: 45 });
      sys.fire('heavy_impact');
      return 'stun';
    }
    return undefined;
  },
  end(sys, e) { e.immovable = false; sys.removeDecals(e); },
});

// ------------------------------------------------------------------ slam (self | target, optional ring)
function slamLand(sys, e, atk, x, y) {
  const pl = sys.ctx.player, T = sys.T, R = atk.radius;
  const dx = pl.coreX - x, dy = pl.coreY - y;
  if (dx * dx + dy * dy <= R * R) sys.hurtPlayer(e, atk.damage, 'slam');
  sys.ctx.fx.shake(T('heavyImpactShakePx'), T('heavyImpactShakeMs'));
  sys.tl.ring(x, y, 0, R, 200, 0x8a7a70, 0.6, 1);                // dust ring to R over 200 ms
  sys.ctx.fx.explosion(x, y, R, { hostile: true });             // ring at exactly R (WYSIWYH)
  sys.ctx.fx.particles('dust', x, y, 10, { speed: 60 });
  sys.fire('heavy_impact');
  const ring = atk.ring;
  if (ring) {
    for (let i = 0; i < ring.count; i++) {
      const a = (360 * i) / ring.count;
      sys.bullet(e, x, y, a, ring.speed, ring.projectile, atk.damage >= 2 ? 1 : atk.damage);
    }
  }
  sys.flashDecals(e);
}
defineEffect('attack', 'slam', {
  begin(sys, e, atk) {
    const ai = e.ai, pl = sys.ctx.player;
    const d = sys.decal(e, 'circle', true);
    if (atk.at === 'target') { ai.tx = pl.coreX; ai.ty = pl.coreY; } else { ai.tx = e.x; ai.ty = e.y; }   // position locks at windup start
    ai.sx0 = e.x; ai.sy0 = e.y;
    if (d) { d.r = atk.radius; d.heavy = isHeavy(atk); d.x = ai.tx; d.y = ai.ty; }
  },
  update(sys, e, atk) {
    const ai = e.ai, d = ai.dec[0]; if (!d) return;
    if (atk.at !== 'target') { ai.tx = e.x; ai.ty = e.y; }
    d.x = ai.tx; d.y = ai.ty;
    const total = ai.wTotal + (atk.at === 'target' ? atk.travelMs : 0);       // the circle spans windup + travel
    d.p = ai.wElapsed / total;
    d.locked = atk.at === 'target' ? false : ai.locked;
  },
  release(sys, e, atk) {
    const ai = e.ai;
    if (atk.at === 'target' && atk.travelMs > 0) {
      ai.state = 'airborne';                          // untargetable, no contact, for travelMs
      e.hittable = false;
      if (e.body) e.body.enable = false;
      sys.fire('enemy_leap');
      return atk.travelMs;
    }
    slamLand(sys, e, atk, ai.tx, ai.ty);
    return 0;
  },
  act(sys, e, atk) {
    const ai = e.ai, d = ai.dec[0];
    const t = Math.min(1, ai.actT / atk.travelMs);
    const x = ai.sx0 + (ai.tx - ai.sx0) * t, y = ai.sy0 + (ai.ty - ai.sy0) * t;
    sys.placeBody(e, x, y);
    ai.air = t;
    if (d) {
      const total = ai.wTotal + atk.travelMs;
      d.p = (ai.wTotal + ai.actT) / total;
      d.locked = atk.travelMs - ai.actT <= sys.rules.enemies.aimLockBeforeReleaseMs;   // lock outline, last 150 ms before landing
    }
    if (t >= 1) {
      if (e.body) { e.body.enable = true; sys.placeBody(e, ai.tx, ai.ty); }
      e.hittable = !e.invuln;
      ai.air = 0;
      slamLand(sys, e, atk, ai.tx, ai.ty);
      return 'done';
    }
    return undefined;
  },
  cancel(sys, e) { if (e.body && !e.body.enable) { e.body.enable = true; sys.placeBody(e, e.x, e.y); } e.ai.air = 0; },
});

// ------------------------------------------------------------------ summon
defineEffect('attack', 'summon', {
  begin(sys, e, atk) {
    const ai = e.ai, w = sys.ctx.world;
    const R = sys.rules.enemies.summonRingRadiusPx;
    const flyer = !!(sys.ctx.cat.enemies[atk.enemyId] && sys.ctx.cat.enemies[atk.enemyId].flying);
    const a0 = sys.rng.float(0, TAU);                 // rolled ONCE at windup start (ai stream), reused at act
    ai.ptsN = Math.min(atk.count, ai.pts.length / 2);
    for (let i = 0; i < ai.ptsN; i++) {
      let x = e.x + Math.cos(a0 + (TAU * i) / ai.ptsN) * R, y = e.y + Math.sin(a0 + (TAU * i) / ai.ptsN) * R;
      if (flyer ? w.blocksShots(x, y) : w.blocksGround(x, y)) { const n = w.nearestWalkable(x, y, 2); if (n) { x = n.x; y = n.y; } else { x = e.x; y = e.y; } }
      ai.pts[i * 2] = x; ai.pts[i * 2 + 1] = y;
      const d = sys.decal(e, 'sigil', false);
      if (d) { d.x = x; d.y = y; d.r = 7; }
    }
  },
  update(sys, e, atk, p) {
    const ai = e.ai;
    for (let i = 0; i < ai.decN; i++) { const d = ai.dec[i]; if (d) { d.p = p; d.rot = (d.age / 1000) * 120 * DEG; } }
  },
  release(sys, e, atk) {
    const ai = e.ai;
    const allowed = Math.max(0, atk.maxAlive - sys.countSummons(e));
    let spawned = 0;
    for (let i = 0; i < ai.ptsN; i++) {
      const d = ai.dec[i];
      if (spawned < allowed && spawned < atk.count) {
        sys.system.spawn(atk.enemyId, ai.pts[i * 2], ai.pts[i * 2 + 1], { summoner: e, portal: true, noCoins: true, summon: true });
        spawned++;
        if (d) sys.tl.toFlash(d);
      } else if (d) sys.tl.toFizzle(d);            // surplus sigils fizzle: the player sees the cast fail
      ai.dec[i] = null;
    }
    ai.decN = 0;
    return 0;
  },
});

// ------------------------------------------------------------------ blink
defineEffect('attack', 'blink', {
  begin() { /* stepped fade + collapse are body-layer (EnemyView) */ },
  release(sys, e, atk) {
    const w = sys.ctx.world, pl = sys.ctx.player;
    const opt = sys.blinkOpt;
    opt.flyer = e.flying; opt.from = sys.playerPt; sys.playerPt.x = pl.x; sys.playerPt.y = pl.y;
    opt.minDist = atk.minDist; opt.maxDist = atk.maxDist; opt.wallClear = sys.rules.enemies.blinkWallClearTiles;
    let dst = w.randomWalkable(sys.rng, opt);
    if (!dst) { opt.wallClear = 0; dst = w.randomWalkable(sys.rng, opt); }
    sys.ctx.fx.flipbook('fx.blink_puff', e.x, e.y, { add: true, tint: 0xcfc0ff, color: 0xcfc0ff });   // codemanu: ADD + tint
    sys.ctx.fx.particles('mote', e.x, e.y, 6, { color: 0xcfc0ff, speed: 25 });
    if (dst) {
      sys.placeBody(e, dst.x, dst.y);
      e.ai.blinkX = dst.x; e.ai.blinkY = dst.y;
      sys.ctx.fx.flipbook('fx.blink_puff', dst.x, dst.y, { add: true, tint: 0xcfc0ff, color: 0xcfc0ff });
    }
    e.ai.blinkInAt = sys.ctx.time.step + 1;           // blink_in cue on W + 1
    sys.fire('enemy_blink_out');
    return 0;
  },
});

// ------------------------------------------------------------------ self_destruct
function explode(sys, e, atk) {
  const pl = sys.ctx.player, T = sys.T, R = atk.radius;
  const dx = pl.coreX - e.x, dy = pl.coreY - e.y;
  if (dx * dx + dy * dy <= R * R) sys.hurtPlayer(e, atk.damage, 'explosion');
  const dmg = atk.enemyDamage * sys.ctx.floor.hpMult;           // absolute damage × floor hpMult (mechanic §0)
  sys.system.queryCircle(e.x, e.y, R, (o) => { if (o !== e) sys.ctx.combat.damageEnemy(o, dmg, { element: null, source: 'enemy', canCrit: false, canReact: false, canStatus: false, knock: null }); });
  sys.ctx.fx.explosion(e.x, e.y, R, { hostile: true, element: 'fire' });
  const big = R >= T('bigExplosionRadiusPx');
  sys.ctx.fx.shake(big ? T('bigExplosionShakePx') : T('explosionShakePx'), big ? T('bigExplosionShakeMs') : T('explosionShakeMs'));
  sys.fire(big ? 'explode_big' : 'explode_small');
  sys.flashDecals(e);
}
defineEffect('attack', 'self_destruct', {
  begin(sys, e, atk) {
    const d = sys.decal(e, 'circle', true);
    if (d) { d.r = atk.radius; d.heavy = isHeavy(atk); }
  },
  update(sys, e, atk, p) { const d = e.ai.dec[0]; if (d) { d.x = e.x; d.y = e.y; d.p = p; d.locked = e.ai.locked; } },
  release(sys, e, atk) {
    explode(sys, e, atk);
    e.ai.exploded = true;
    sys.system.kill(e, 'self_destruct');            // no coins (rules.enemies.selfDestructDropsCoins false)
    return 0;
  },
  /** Killed mid-windup with explodeIfKilledDuringWindup: detonate on the kill step (coins still drop). */
  onKilledInWindup(sys, e, atk) { if (atk.explodeIfKilledDuringWindup && !e.ai.exploded) { e.ai.exploded = true; explode(sys, e, atk); return true; } return false; },
});

// ------------------------------------------------------------------ hazard
defineEffect('attack', 'hazard', {
  begin(sys, e, atk) {
    const ai = e.ai, pl = sys.ctx.player, w = sys.ctx.world, rules = sys.rules.enemies;
    const px = pl.coreX, py = pl.coreY;
    let n = 0;
    const put = (x, y) => { if (n < ai.pts.length / 2) { ai.pts[n * 2] = x; ai.pts[n * 2 + 1] = y; n++; } };
    if (atk.placement === 'cross') {
      const o = rules.hazardCrossOffsetPx;
      put(px, py); put(px + o, py); put(px - o, py); put(px, py + o); put(px, py - o);
    } else {                                           // player+random: 1 at the player + (count−1) random ≥ spacing apart
      put(px, py);
      const opt = sys.hazOpt; opt.flyer = false; opt.from = null; opt.minDist = 0; opt.maxDist = 0; opt.wallClear = 0;
      let guard = 0;
      while (n < atk.count && guard++ < 40) {
        const c = w.randomWalkable(sys.rng, opt);
        if (!c) break;
        let ok = true;
        for (let i = 0; i < n; i++) { const dx = c.x - ai.pts[i * 2], dy = c.y - ai.pts[i * 2 + 1]; if (dx * dx + dy * dy < rules.hazardMinSpacingPx * rules.hazardMinSpacingPx) { ok = false; break; } }
        if (ok) put(c.x, c.y);
      }
    }
    ai.ptsN = Math.min(n, atk.count);
    for (let i = 0; i < ai.ptsN; i++) {
      const d = sys.decal(e, 'hazardMark', true);
      if (d) { d.x = ai.pts[i * 2]; d.y = ai.pts[i * 2 + 1]; d.r = atk.radius; d.rune = atk.placement === 'cross'; }
    }
  },
  update(sys, e, atk, p) {
    const ai = e.ai;
    for (let i = 0; i < ai.decN; i++) {
      const d = ai.dec[i]; if (!d) continue;
      d.p = p; d.locked = ai.locked; d.rot = (d.age / 1000) * 90 * DEG;
    }
    // element particles rising inside each mark, 1 per 150 ms per mark (cosmetic, fx stream)
    if (((sys.ctx.time.step) % 9) === 0) {
      const look = HAZARD_LOOK[atk.element] || HAZARD_LOOK.poison;
      for (let i = 0; i < ai.ptsN; i++) sys.ctx.fx.particles(look.particle, ai.pts[i * 2] + sys.fxRng.float(-atk.radius * 0.6, atk.radius * 0.6), ai.pts[i * 2 + 1], 1, { color: look.inner, speed: 6, lifeMs: 500 });
    }
  },
  release(sys, e, atk) {
    const ai = e.ai;
    for (let i = 0; i < ai.ptsN; i++) sys.system.addHazard(ai.pts[i * 2], ai.pts[i * 2 + 1], atk, e);
    sys.removeDecals(e);
    const look = HAZARD_LOOK[atk.element] || HAZARD_LOOK.poison;
    sys.fire(look.cue);
    return 0;
  },
});

// ------------------------------------------------------------------ sequence (runs its named steps back to back; EnemySystem drives it)
defineEffect('attack', 'sequence', {
  isSequence: true,
  begin() {}, release() { return 0; },
});

export const ELEMENT_HUE = EL_HUE;
