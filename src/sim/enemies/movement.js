// sim/enemies/movement.js — mechanic-spec §9.1 movement keys, each implemented ONCE and registered in the
// effect registry (architecture §6): chaser · kiter · swarm · stationary · drifter.
//
// Hook: step(e, sys, dt) writes the desired velocity (px/s, already × chill slowFactor) into e.ai.mvx/mvy.
// EnemySystem adds the knockback channel and hands the sum to the Arcade body. Gameplay randomness only
// from ctx.rng.ai. No allocation per step (the flow-field sampler returns a shared object).

import { defineEffect } from '../../effects/registry.js';
import { TAU } from './tokens.js';

function setVel(e, dx, dy, speed) { e.ai.mvx = dx * speed; e.ai.mvy = dy * speed; }

/** Direction toward the player: straight line when the path is clear on this actor's mask, else flow field. */
function seek(e, sys, sign) {
  const p = sys.ctx.player, w = sys.ctx.world;
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
  const out = sys.dir;
  if (sign > 0 && w.raycast(e.x, e.y, p.x, p.y, e.flying ? 'all' : 'ground') >= d - 1) { out.x = dx / d; out.y = dy / d; out.ok = true; return out; }
  const f = sys.flow.sample(e.x, e.y, e.flying, sign);
  if (f.ok) { out.x = f.x; out.y = f.y; out.ok = true; return out; }
  if (sign < 0) { out.x = -dx / d; out.y = -dy / d; out.ok = true; return out; }
  out.x = dx / d; out.y = dy / d; out.ok = true;
  return out;
}

/** True if a step of `ahead` px along (dx, dy) would enter a blocked cell on this actor's mask. */
function blockedAhead(e, sys, dx, dy, ahead) {
  const w = sys.ctx.world, x = e.x + dx * ahead, y = e.y + dy * ahead;
  return e.flying ? w.blocksShots(x, y) : w.blocksGround(x, y);
}

defineEffect('movement', 'chaser', {
  step(e, sys) {
    const p = sys.ctx.player;
    const stop = e.def.movement && e.def.movement.stopRange;
    const dx = p.x - e.x, dy = p.y - e.y;
    if (stop && dx * dx + dy * dy <= stop * stop) { setVel(e, 0, 0, 0); return; }
    const d = seek(e, sys, 1);
    setVel(e, d.x, d.y, e.speed * sys.slow(e));
  },
});

defineEffect('movement', 'kiter', {
  step(e, sys, dt) {
    const ai = e.ai, m = e.def.movement, p = sys.ctx.player;
    const dx = p.x - e.x, dy = p.y - e.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = e.speed * sys.slow(e);
    if (dist < m.minRange && ai.fleeMs < 1000) {           // inside minRange: flow-field inverse, max 1 s
      ai.fleeMs += dt;
      const d = seek(e, sys, -1);
      setVel(e, d.x, d.y, speed);
      return;
    }
    if (dist >= m.minRange) ai.fleeMs = 0;
    if (dist > m.maxRange) {
      const d = seek(e, sys, 1);
      setVel(e, d.x, d.y, speed);
      return;
    }
    // between: strafe perpendicular, flipping every kiterStrafeFlipMs (and off walls)
    ai.strafeMs -= dt;
    if (ai.strafeMs <= 0) { ai.strafeDir = -ai.strafeDir; ai.strafeMs = sys.rules.enemies.kiterStrafeFlipMs; }
    let sx = (-dy / dist) * ai.strafeDir, sy = (dx / dist) * ai.strafeDir;
    if (blockedAhead(e, sys, sx, sy, e.r + 4)) { ai.strafeDir = -ai.strafeDir; sx = -sx; sy = -sy; ai.strafeMs = sys.rules.enemies.kiterStrafeFlipMs; }
    setVel(e, sx, sy, speed);
  },
});

defineEffect('movement', 'swarm', {
  step(e, sys, dt) {
    const ai = e.ai, m = e.def.movement, p = sys.ctx.player;
    const slow = sys.slow(e);
    if (ai.retreatMs > 0) {                                 // after contact: flee straight away
      ai.retreatMs -= dt;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      setVel(e, dx / d, dy / d, e.speed * (m.retreatSpeedMult ?? 0.8) * slow);
      return;
    }
    const d = seek(e, sys, 1);
    ai.wobbleT += dt;
    // perpendicular sinusoidal wobble: velocity of an offset A·sin(2πt/P)
    const w = (TAU / m.wobblePeriodMs) * 1000;
    const wob = m.wobbleAmpPx * w * Math.cos(ai.wobblePhase + (ai.wobbleT / m.wobblePeriodMs) * TAU);
    let vx = d.x * e.speed + -d.y * wob, vy = d.y * e.speed + d.x * wob;
    const mag = Math.sqrt(vx * vx + vy * vy), cap = e.speed * 1.3;
    if (mag > cap) { vx *= cap / mag; vy *= cap / mag; }
    e.ai.mvx = vx * slow; e.ai.mvy = vy * slow;
  },
});

defineEffect('movement', 'stationary', {
  step(e) { e.ai.mvx = 0; e.ai.mvy = 0; },
});

defineEffect('movement', 'drifter', {
  step(e, sys, dt) {
    const ai = e.ai;
    ai.driftMs -= dt;
    let dx = Math.cos(ai.driftAng), dy = Math.sin(ai.driftAng);
    if (ai.driftMs <= 0 || blockedAhead(e, sys, dx, dy, e.r + 4)) {
      ai.driftAng = sys.rng.float(0, TAU);
      ai.driftMs = sys.rules.enemies.drifterTurnMs;
      dx = Math.cos(ai.driftAng); dy = Math.sin(ai.driftAng);
    }
    setVel(e, dx, dy, e.speed * sys.slow(e));
  },
});
