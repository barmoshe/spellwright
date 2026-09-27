// sim/AutoAim.js — touch auto-fire target (feel-spec §verb-2b touch-aim; mobile-touch-spec §3.3).
//
// Runs once per sim step when the Intent's aimSource is 'auto' (device 'touch', touchFire 'auto', no aim-stick
// override). It picks a target and writes aim + castHeld into the Intent:
//   1. candidates = living, hittable (not spawning) enemies inside the camera view, within `autoFireRangePx`,
//      with line of sight from the wand tip (World.hasLos);
//   2. (user decision, v2: NO crate fallback) crates are broken with the aim stick — the override path;
//   3. nearest wins, with stickiness: keep the current target until it dies / leaves the set, switching only
//      when another is closer than `touchRetargetRatio` × the current distance (no flicker between equals);
//   4. no candidate → no cast (no mana into empty rooms);
//   5. lead (v2, plan Addendum 2): aim at pos + clampLen(vel × (dist / shotSpeed) × `autoFireLeadFactor`,
//      `autoAimLeadCapPx`); shotSpeed = the MEAN composed speed of the equipped wand's bolt/boomerang shots over its
//      preview cycle (orbit/mine excluded; cached, invalidated on wand change). Never lead a teleport: a target in a
//      `blink` windup, or one that moved > 1 tile in a step, is aimed at directly and its velocity sample is ignored
//      for `autoAimTeleportIgnoreMs`.
// `target` is exposed for the HUD's corner-tick marker (shape, not colour).

import { TILE } from '../config.js';
import { EV, listen } from '../core/events.js';
import { wandKeywords } from '../spells/keywords.js';

export class AutoAim {
  constructor(ctx) {
    this.ctx = ctx;
    this.target = null;           // { kind: 'enemy', e, uid, x, y, w, h }
    this._last = new Map();       // uid → {x, y} (velocity estimate)
    this._speed = null;           // cached mean bolt speed of the equipped wand (null = recompute)
    this._ignoreUntil = new Map(); // uid → sim ms until which velocity samples are ignored (teleports)
    if (ctx.bus && ctx.scene) {
      const inval = () => { this._speed = null; this._pierce = null; };
      listen(ctx.scene, ctx.bus, EV.WAND_CHANGED, inval);
      listen(ctx.scene, ctx.bus, EV.WAND_ACTIVE, inval);
    }
  }

  /** Does the equipped wand pierce (keywords.js; cached with the bolt speed)? */
  _pierces() {
    if (this._pierce == null || this._speed === null) {
      try { this._pierce = !!wandKeywords(this.ctx.run, this.ctx.run.activeWand).pierce; } catch (e) { this._pierce = false; }
    }
    return this._pierce;
  }

  /** Mean composed speed of the equipped wand's bolt / boomerang shots over one preview cycle (px/s). */
  meanBoltSpeed() {
    if (this._speed !== null) return this._speed;
    let sum = 0, n = 0;
    try {
      const run = this.ctx.run, pv = run.preview(run.activeWand);
      for (const c of (pv && pv.casts) || []) for (const sh of c.shots || []) {
        const b = sh.behavior && sh.behavior.type;
        if ((b === 'bolt' || b === 'boomerang') && sh.stats && sh.stats.speed > 0) { sum += sh.stats.speed; n++; }
      }
    } catch (e) { /* no preview available: fall back below */ }
    this._speed = n ? sum / n : (this.ctx.shots.lastPlayerSpeed || 0);
    return this._speed;
  }

  get T() { return this.ctx.T; }

  /** Resolve an 'auto' Intent in place. dt = one sim step (ms). */
  apply(it, dt) {
    const ctx = this.ctx, p = ctx.player, T = this.T;
    if (!p || !ctx.world) { this.target = null; it.castHeld = false; return; }
    const v = ctx.cam.gate || ctx.cam.view, tipX = p.coreX, tipY = p.coreY;   // below the touch HUD band (aspect-ratio-spec §3.1)
    const range = T('autoFireRangePx', 200);
    const onScreen = (x, y) => x >= v.x && x <= v.x + v.w && y >= v.y && y <= v.y + v.h;
    const cands = [];
    ctx.enemies.forEachAlive((e) => {
      if (!e.hittable) return;
      const d = Math.hypot(e.x - tipX, e.y - tipY);
      if (d > range || !onScreen(e.x, e.y)) return;
      if (!ctx.world.hasLos(tipX, tipY, e.x, e.y)) return;
      cands.push({ kind: 'enemy', e, uid: e.uid, x: e.x, y: e.y, d, w: 12, h: e.headOffset || 12 });
    });
    // feel-spec touch-aim: skip an enemy whose shield front faces the player while an unshielded candidate exists
    // (a pierce wand shatters shields, so it may keep them)
    const dfn = ctx.combat && ctx.combat.defences;
    if (dfn && cands.length > 1 && !this._pierces()) {
      const open = cands.filter((c) => !dfn.shieldFaces(c.e, tipX, tipY));
      if (open.length && open.length < cands.length) { cands.length = 0; cands.push(...open); }
    }
        // stickiness
    const cur = this.target && cands.find((c) => c.uid === this.target.uid);
    let pick = null;
    if (cands.length) {
      let best = cands[0];
      for (const c of cands) if (c.d < best.d) best = c;
      pick = cur && best !== cur && !(best.d < T('touchRetargetRatio', 0.7) * cur.d) ? cur : best;
    }
    if (!pick) { this.target = null; this._last.clear(); it.castHeld = false; return; }
    // lead
    let ax = pick.x, ay = pick.y;
    {
      const prev = this._last.get(pick.uid);
      const speed = this.meanBoltSpeed();
      const now = ctx.time ? ctx.time.ms : 0;
      const ai = pick.e && pick.e.ai;
      const blinking = !!(ai && ai.impl && ai.impl.key === 'blink');
      const jumped = prev && Math.hypot(pick.x - prev.x, pick.y - prev.y) > TILE;
      if (blinking || jumped) this._ignoreUntil.set(pick.uid, now + T('autoAimTeleportIgnoreMs', 200));
      const ignore = now < (this._ignoreUntil.get(pick.uid) || 0);
      if (prev && speed > 0 && !ignore) {
        const vx = (pick.x - prev.x) * (1000 / dt), vy = (pick.y - prev.y) * (1000 / dt);
        const k = (pick.d / speed) * T('autoFireLeadFactor', 0.6);
        let lx = vx * k, ly = vy * k;
        const cap = T('autoAimLeadCapPx', 36), m = Math.hypot(lx, ly);
        if (m > cap) { lx *= cap / m; ly *= cap / m; }
        ax += lx; ay += ly;
      }
      this._last.clear();
      this._last.set(pick.uid, { x: pick.x, y: pick.y });
    }
    const dx = ax - tipX, dy = ay - tipY, m = Math.hypot(dx, dy) || 1;
    it.aimX = dx / m; it.aimY = dy / m;
    it.castHeld = true;
    this.target = pick;
  }

  clear() { this.target = null; this._last.clear(); }
}
