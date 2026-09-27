// sim/Effects.js — mechanic-spec §6.1 projectile-effect vocabulary, each key implemented ONCE and
// registered in the effect registry (architecture §6): explode · chain · split · zone · pull · zap ·
// teleport_caster. The shot's damage, element, statusChance, crit and knockback are inherited unless
// the spec states otherwise. Also the ZoneSystem (maxZones, first tick immediately).

import Phaser from '../../lib/phaser.esm.min.js';
import { DEPTH } from '../config.js';
import { defineEffect, getEffect, hasEffect } from '../effects/registry.js';
import { composeShot } from '../spells/stats.js';

const ELEMENT_TINT = { arcane: 0xcfc0ff, fire: 0xee8e2e, frost: 0xcae6f5, shock: 0xfacb3e, poison: 0x97da3f };

/** Dispatch one effect entry {type, ...params} at (x, y) for `shot` (a Shots.js shot or a source-like object). */
export function applyEffect(ctx, entry, shot, x, y, hitEnemy) {
  const impl = getEffect('effect', entry.type);
  if (impl.apply) impl.apply(ctx, entry, shot, x, y, hitEnemy);
}

defineEffect('effect', 'explode', {
  apply(ctx, ef, s, x, y) {
    ctx.combat.explodeAt(x, y, ef.radius, s.damage * (ef.damageMult ?? 1),
      { element: s.element, statusChance: s.statusChance, isCrit: s.isCrit, knockback: s.knockback, source: 'explode' });
  },
});

defineEffect('effect', 'chain', {
  // From the enemy just hit, jump to the nearest enemy not yet in this chain within `range` (ignores walls).
  // Chain hits do NOT fire onHit (no recursion) and apply no knockback.
  apply(ctx, ef, s, x, y, hit) {
    if (!hit) return;
    const chained = new Set([hit.uid]);
    let from = hit;
    for (let j = 0; j < (ef.jumps | 0); j++) {
      const next = ctx.enemies.nearest(from.x, from.y, ef.range, chained);
      if (!next) break;
      chained.add(next.uid);
      ctx.fx.bolt(from.x, from.y - 4, next.x, next.y - 4, { color: ELEMENT_TINT.shock, ms: 120 });
      ctx.combat.hitEnemy(next, s.damage * ef.damageMult, { element: s.element, statusChance: s.statusChance, isCrit: s.isCrit, source: 'chain', x: next.x, y: next.y });
      from = next;
    }
    ctx.mixer.fire('chain_zap');
  },
});

defineEffect('effect', 'split', {
  // `count` children spread over `arcDeg` centred on the current heading (count 1 → same heading). Children copy
  // the final stats with damage × damageMult and lifetime × childLifetimeMult, inherit the parent's hit list,
  // strip every split and any payload (children never split), and roll their own crit.
  apply(ctx, ef, s, x, y) {
    if (s.noSplit) return;
    const n = ef.count | 0;
    const rules = ctx.rules;
    for (let k = 0; k < n; k++) {
      const off = n === 1 ? 0 : -ef.arcDeg / 2 + (k * ef.arcDeg) / (n - 1);
      const critRoll = ctx.rng.spell.next() < (s.critTotal ?? rules.crit.baseChance);
      const spec = {
        cardId: s.cardId, behavior: { type: 'bolt' }, element: s.element, isCrit: critRoll, critTotal: s.critTotal,
        stats: { damage: s.damage * ef.damageMult, speed: s.speed, lifetimeMs: ctx.shots.lifeOf(s) * rules.casting.childLifetimeMult,
          radius: s.r, spreadDeg: 0, pierce: 0, bounce: 0, homing: 0, knockback: s.knockback, statusChance: s.statusChance, critChance: 0 },
        onHit: (s.onHit || []).filter((e) => e.type !== 'split'), onExpire: (s.onExpire || []).filter((e) => e.type !== 'split'),
        onTick: null, angleOffset: off, spreadRoll: 0, payload: null, trigger: null,
      };
      ctx.shots.spawnSpec(spec, x, y, s.heading, { noSplit: true, hits: s.hits });
    }
  },
});

defineEffect('effect', 'zone', {
  apply(ctx, ef, s, x, y) {
    ctx.zones.add({ x, y, radius: ef.radius, durationMs: ef.durationMs, tickMs: ef.tickMs, damage: s.damage * ef.damageMult,
      element: s.element, statusChance: s.statusChance, isCrit: s.isCrit });
  },
});

defineEffect('effect', 'pull', {
  // Enemies inside receive a velocity impulse toward the centre of strength × (1 − kbResist) (knockback channel).
  apply(ctx, ef, s, x, y) {
    ctx.enemies.queryCircle(x, y, ef.radius, (e) => {
      const dx = x - e.x, dy = y - e.y, d = Math.hypot(dx, dy) || 1;
      ctx.combat.knockEnemy(e, dx / d, dy / d, ef.strength);
    });
    if ((ctx.time.step & 3) === 0) ctx.fx.ring(x, y, ef.radius, { r0: ef.radius, grow: true, ms: 200, color: 0xcfc0ff, alpha: 0.25 });
  },
});

defineEffect('effect', 'zap', {
  // The nearest maxTargets enemies inside the radius take damage × damageMult and roll status.
  apply(ctx, ef, s, x, y) {
    const cands = [];
    ctx.enemies.queryCircle(x, y, ef.radius, (e) => cands.push(e));
    cands.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
    for (const e of cands.slice(0, ef.maxTargets | 0)) {
      ctx.fx.bolt(x, y, e.x, e.y - 4, { color: ELEMENT_TINT[s.element] || 0xfacb3e, ms: 90 });
      ctx.combat.hitEnemy(e, s.damage * ef.damageMult, { element: s.element, statusChance: s.statusChance, isCrit: s.isCrit, source: 'zap', x: e.x, y: e.y });
    }
    if (cands.length) ctx.mixer.fire('chain_zap');
  },
});

defineEffect('effect', 'teleport_caster', {
  // Move the player to the point, or the nearest walkable tile centre within teleportSearchTiles; else no-op. No i-frames.
  apply(ctx, ef, s, x, y) {
    const w = ctx.world;
    let dest = !w.blocksGround(x, y) ? { x, y } : w.nearestWalkable(x, y, ctx.rules.casting.teleportSearchTiles);
    if (!dest) return;
    ctx.fx.flipbook('fx.blink_puff', ctx.player.coreX, ctx.player.coreY, {});
    ctx.player.teleport(dest.x, dest.y);
    ctx.fx.flipbook('fx.blink_puff', dest.x, dest.y - 8, {});
    ctx.mixer.fire('blink');
  },
});

// ======================================================================================================
// Zones (mechanic-spec §6.1 zone): stationary area; every tickMs (first tick immediately) each enemy inside
// takes damage × damageMult and rolls status. No knockback. Max rules.casting.maxZones (oldest removed).
// ======================================================================================================
export class ZoneSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.zones = [];
    this.g = ctx.scene.add.graphics().setDepth(DEPTH.decals + 1);
    this.gAdd = ctx.scene.add.graphics().setDepth(DEPTH.decals + 1).setBlendMode(Phaser.BlendModes.ADD);
  }
  add(z) {
    if (this.zones.length >= this.ctx.rules.casting.maxZones) this.zones.shift();
    z.t = 0; z.tick = 0;
    this.zones.push(z);
    this.ctx.mixer.fire('zone_open', { x: z.x });
  }
  step(dt) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick += z.tickMs;
        this.ctx.enemies.queryCircle(z.x, z.y, z.radius, (e) => {
          this.ctx.combat.hitEnemy(e, z.damage, { element: z.element, statusChance: z.statusChance, isCrit: z.isCrit, source: 'zone', x: e.x, y: e.y });
        });
      }
      z.t += dt;
      if (z.t >= z.durationMs) this.zones.splice(i, 1);
    }
  }
  render() {
    // Player zones use only their element rim — never the hostile pink band (style-guide §4.2).
    const g = this.g, ga = this.gAdd; g.clear(); ga.clear();
    for (const z of this.zones) {
      const col = ELEMENT_TINT[z.element] || 0x97da3f;
      const fade = z.t > z.durationMs - 400 ? (z.durationMs - z.t) / 400 : 1;
      ga.fillStyle(col, 0.18 * fade).fillCircle(Math.round(z.x), Math.round(z.y), z.radius);
      g.lineStyle(1, col, 0.8 * fade).strokeCircle(Math.round(z.x), Math.round(z.y), z.radius);
    }
  }
  clear() { this.zones.length = 0; this.g.clear(); this.gAdd.clear(); }
  destroy() { this.g.destroy(); this.gAdd.destroy(); }
}

/** Relic `spawn_spell` (mechanic-spec §7): the spell's BASE shot(s) with relic shot_stats only, no wand, no mods; × floor hpMult. */
export function spawnRelicSpell(ctx, spellId, pattern, x, y) {
  const card = ctx.cat.cards[spellId];
  if (!card) return;
  const run = ctx.run;
  const n = pattern && pattern.type === 'ring' ? pattern.count | 0 : 1;
  let aim = 0;
  if (n === 1) { const t = ctx.enemies.nearest(x, y, 400, null); aim = t ? Math.atan2(t.y - y, t.x - x) * 180 / Math.PI : ctx.rng.fx.float(0, 360); }
  for (let k = 0; k < n; k++) {
    const c = composeShot(card, [], { wand: null, rules: ctx.rules, relicShotStats: run.relicShotStats, effectParams: run.effectParams, rng: ctx.rng.spell });
    c.stats.damage *= ctx.floor.hpMult;
    const spec = { cardId: card.id, behavior: card.behavior, element: c.element, isCrit: c.isCrit, critTotal: c.critTotal, stats: c.stats,
      onHit: c.onHit, onExpire: c.onExpire, onTick: c.onTick, angleOffset: n > 1 ? (360 / n) * k : 0, spreadRoll: 0, payload: null, trigger: null };
    ctx.shots.spawnSpec(spec, x, y, aim, {});
  }
}

export { hasEffect };
